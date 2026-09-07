/**
 * Keycloak Auth Provider
 *
 * Implementation of IAuthProvider for Keycloak
 */

import { CacheService } from '@package/redis';
import KeycloakConnect from 'keycloak-connect';

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError
} from '../errors';
import { BaseAuthProvider } from './base-auth-provider';
import { KeycloakErrorMapper } from '../errors/keycloak-error.mapper';

import type { IAuthProvider } from './auth-provider.interface';
import type { KeycloakAuthProviderOptions } from './factory.types';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo,
  RequestContext
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';

/**
 * Keycloak auth provider implementation with distributed Redis caching
 */
export class KeycloakAuthProvider extends BaseAuthProvider implements IAuthProvider {
  private keycloakConnect: InstanceType<typeof KeycloakConnect>;
  private config: KeycloakAuthProviderOptions;
  private cacheService: CacheService;

  // Cache TTL for authorization detection (5 minutes)
  private readonly AUTHZ_DETECTION_CACHE_TTL = 5 * 60 * 1000;
  private readonly ADMIN_TOKEN_CACHE_TTL_MULTIPLIER = 0.8;

  constructor(options: KeycloakAuthProviderOptions, cacheService?: CacheService) {
    const name = options.name ?? 'keycloak';
    super(name, 'keycloak', options);
    this.config = options;
    this.cacheService = cacheService ?? new CacheService();

    // Initialize Keycloak Connect
    this.keycloakConnect = new KeycloakConnect(
      {},
      {
        'auth-server-url': options.authServerUrl,
        'confidential-port': 0,
        realm: options.realm,
        'bearer-only': false,
        'ssl-required': 'external' as const,
        resource: options.clientId,
        ...(options.clientSecret ? { secret: options.clientSecret } : {}),
        ...(options.publicKey ? { 'public-key': options.publicKey } : {}),
        ...(options.publicKeyUrl ? { 'public-key-url': options.publicKeyUrl } : {})
      }
    );
  }

  /**
   * Authenticate user with credentials
   *
   * Makes a direct OAuth2 authorization grant request to Keycloak's token endpoint
   * to obtain access, refresh, and ID tokens.
   *
   * @param credentials - User credentials (username, password, tenantId)
   * @returns Authentication result with tokens
   * @throws AuthenticationError if authentication fails
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    const startTime = Date.now();
    const tenantId = credentials.tenantId ?? this.config.realm;

    try {
      // Build token endpoint URL
      const tokenEndpoint = `${this.config.authServerUrl}/realms/${tenantId}/protocol/openid-connect/token`;

      // Prepare form data for OAuth2 password grant
      const formData = new URLSearchParams({
        grant_type: 'password',
        client_id: this.config.clientId,
        username: credentials.username,
        password: credentials.password
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Make request to Keycloak token endpoint
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          'Keycloak authentication failed'
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        id_token: string;
        expires_in: number;
        refresh_expires_in: number;
      };

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordAuthenticate(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
        refreshExpiresIn: data.refresh_expires_in
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordAuthenticate(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      // Re-throw mapped errors
      if (
        error instanceof AuthenticationError ||
        error instanceof TokenValidationError ||
        error instanceof InvalidAuthProviderConfigError
      ) {
        throw error;
      }

      // Map fetch/network errors
      throw KeycloakErrorMapper.fromFetchError(error, 'Failed to authenticate with Keycloak');
    }
  }

  /**
   * Validate an access token
   *
   * Validates the token using Keycloak Connect's grant manager which performs:
   * - Signature verification using Keycloak's public key
   * - Token expiration checking
   * - Issuer validation
   * - Token replay attack prevention (when requestContext provided)
   *
   * Optionally performs token introspection for additional validation.
   *
   * @param token - JWT access token
   * @param requestContext - Optional request context for replay attack prevention
   * @returns Token validation result with user info if valid
   */
  // eslint-disable-next-line complexity
  async validateToken(
    token: string,
    requestContext?: RequestContext
  ): Promise<TokenValidationResult> {
    const startTime = Date.now();

    try {
      // Decode token first to check blacklist and replay attacks
      const decoded = this.decodeJwt(token);
      const tokenId = decoded['jti'] as string | undefined;
      const tenantId = (decoded['tenant_id'] as string) ?? this.config.realm;
      const userId = decoded['sub'] as string;
      const exp = decoded['exp'] as number | undefined;

      // CRITICAL: Check if token is blacklisted in Redis
      if (tokenId && tenantId) {
        try {
          const { TokenService } = await import('../services/token.service');
          const tokenService = new TokenService();

          if (await tokenService.isAccessTokenBlacklisted(tokenId, tenantId)) {
            const duration = Date.now() - startTime;
            this.recordValidateToken(this.buildAttributes('Token revoked'), duration);
            return {
              valid: false,
              error: 'Token has been revoked'
            };
          }
        } catch {
          // Ignore blacklist errors - continue with validation
        }
      }

      // CRITICAL: Check for token replay attack if request context provided
      if (tokenId && tenantId && userId && exp) {
        try {
          const { TokenUsageTrackingService } =
            await import('../services/token-usage-tracking.service');
          const trackingService = new TokenUsageTrackingService(this.cacheService);

          const usageCheck = await trackingService.checkTokenUsage(
            tokenId,
            tenantId,
            userId,
            requestContext,
            exp
          );

          if (!usageCheck.isValid) {
            const duration = Date.now() - startTime;
            const alertMessage = usageCheck.securityAlert?.message ?? 'Token replay detected';
            this.recordValidateToken(this.buildAttributes('Token replay detected'), duration);

            // Log security alert for monitoring
            if (usageCheck.securityAlert) {
              // In production, this should be sent to a security monitoring service
              console.warn('[Security Alert]', JSON.stringify(usageCheck.securityAlert));
            }

            return {
              valid: false,
              error: alertMessage
            };
          }
        } catch {
          // Ignore replay detection errors - continue with validation
        }
      }

      // Use Keycloak Connect's grant manager to validate the token
      // This performs signature verification, expiration check, and issuer validation
      const isValid = await this.keycloakConnect.grantManager.validateAccessToken(token);

      if (!isValid) {
        const duration = Date.now() - startTime;
        this.recordValidateToken(this.buildAttributes('Token validation failed'), duration);
        return {
          valid: false,
          error: 'Token validation failed'
        };
      }

      // Check expiration manually for more detailed error reporting
      if (exp) {
        const now = Math.floor(Date.now() / 1000);
        if (now > exp) {
          const duration = Date.now() - startTime;
          this.recordValidateToken(this.buildAttributes('Token expired'), duration);
          return {
            valid: false,
            error: 'Token expired'
          };
        }
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordValidateToken(this.buildAttributes(undefined), duration);

      const result: TokenValidationResult = {
        valid: true,
        userId,
        tenantId:
          (decoded['tenant_id'] as string) ?? (decoded['azp'] as string) ?? this.config.realm
      };
      if (exp !== undefined) {
        result.exp = exp;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordValidateToken(this.buildAttributes(errorMessage), duration);

      return {
        valid: false,
        error: errorMessage
      };
    }
  }

  /**
   * Refresh an access token using a refresh token
   *
   * Makes a request to Keycloak's token endpoint with grant_type=refresh_token
   * to obtain new access and refresh tokens (token rotation).
   *
   * @param refreshToken - Refresh token
   * @returns Token refresh result with new tokens
   * @throws TokenValidationError if refresh fails
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const startTime = Date.now();

    try {
      // Build token endpoint URL
      const tokenEndpoint = `${this.config.authServerUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

      // Prepare form data for OAuth2 refresh token grant
      const formData = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: refreshToken
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Make request to Keycloak token endpoint
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          'Keycloak token refresh failed'
        );
        // Ensure we throw TokenValidationError for consistency
        if (error instanceof TokenValidationError) {
          throw error;
        }
        throw new TokenValidationError(error.message, error);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        id_token: string;
        expires_in: number;
        refresh_expires_in?: number;
      };

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordRefreshToken(this.buildAttributes(undefined), duration);

      // Check if refresh token was rotated
      const rotated = data.refresh_token !== undefined && data.refresh_token !== refreshToken;

      const result: TokenRefreshResult = {
        accessToken: data.access_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
        rotated
      };
      if (data.refresh_token !== undefined) {
        result.refreshToken = data.refresh_token;
      }
      if (data.refresh_expires_in !== undefined) {
        result.refreshExpiresIn = data.refresh_expires_in;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordRefreshToken(this.buildAttributes(errorMessage), duration);

      if (error instanceof TokenValidationError) {
        throw error;
      }
      throw new TokenValidationError('Failed to refresh token with Keycloak', error);
    }
  }

  /**
   * Logout user and invalidate tokens
   *
   * Performs logout by:
   * 1. Calling Keycloak's logout endpoint to revoke the refresh token
   * 2. Optionally blacklisting the access token in Redis for immediate revocation
   *
   * @param refreshToken - Refresh token to revoke
   * @param accessToken - Access token to blacklist (optional)
   * @throws AuthenticationError if logout fails
   */
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Build logout endpoint URL
      const logoutEndpoint = `${this.config.authServerUrl}/realms/${this.config.realm}/protocol/openid-connect/logout`;

      // Prepare form data for logout
      const formData = new URLSearchParams({
        client_id: this.config.clientId,
        refresh_token: refreshToken
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Make request to Keycloak logout endpoint
      const response = await fetch(logoutEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(response.status, body, 'Keycloak logout failed');
      }

      // Optionally blacklist the access token for immediate revocation
      if (accessToken) {
        try {
          const decoded = this.decodeJwt(accessToken);
          const tokenId = decoded['jti'] as string | undefined;
          const exp = decoded['exp'] as number | undefined;

          if (tokenId && exp) {
            const { TokenService } = await import('../services/token.service');
            const tokenService = new TokenService();

            // Calculate remaining TTL for the access token
            const now = Math.floor(Date.now() / 1000);
            const ttl = Math.max(0, exp - now);

            // Blacklist the access token in Redis
            await tokenService.blacklistAccessToken(tokenId, this.config.realm, ttl);
          }
        } catch {
          // Ignore blacklist errors - logout was still successful
        }
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordLogout(this.buildAttributes(undefined), duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordLogout(this.buildAttributes(errorMessage), duration);

      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Failed to logout from Keycloak', error);
    }
  }

  /**
   * Get user information by user ID
   *
   * Fetches user details from Keycloak's Admin REST API.
   * Requires admin credentials with proper permissions.
   *
   * @param userId - User ID in Keycloak
   * @param tenantId - Tenant ID (realm name)
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      // Build Admin REST API URL
      const userEndpoint = `${this.config.authServerUrl}/admin/realms/${tenantId}/users/${userId}`;

      // Make request to Keycloak Admin REST API
      const response = await fetch(userEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.getAdminToken()}`
        },
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          `Failed to get user info for '${userId}'`
        );
      }

      const data = (await response.json()) as {
        id: string;
        username: string;
        email: string;
        firstName?: string;
        lastName?: string;
        emailVerified?: boolean;
        attributes?: Record<string, unknown>;
        realmRoles?: string[];
        clientRoles?: Record<string, string[]>;
      };

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetUserInfo(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      const result: UserInfo = {
        userId: data.id,
        username: data.username,
        email: data.email,
        roles: data.realmRoles ?? [],
        permissions: [], // Permissions are fetched separately
        tenantId
      };
      if (data.firstName !== undefined) {
        result.givenName = data.firstName;
      }
      if (data.lastName !== undefined) {
        result.familyName = data.lastName;
      }
      if (data.firstName && data.lastName) {
        result.name = `${data.firstName} ${data.lastName}`;
      } else if (data.username) {
        result.name = data.username;
      }
      if (data.emailVerified !== undefined) {
        result.emailVerified = data.emailVerified;
      }
      if (data.attributes !== undefined) {
        result.attributes = data.attributes as Record<string, unknown>;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetUserInfo(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      if (error instanceof UserInfoRetrievalError) {
        throw error;
      }
      throw new UserInfoRetrievalError('Failed to get user info from Keycloak', error);
    }
  }

  /**
   * Get user information from access token
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      const decoded = this.decodeJwt(token);

      const result: UserInfo = {
        userId: decoded['sub'] as string,
        username: String(decoded['preferred_username'] ?? decoded['sub']),
        email: String(decoded['email'] ?? ''),
        roles: (decoded['roles'] as string[]) ?? [],
        permissions: (decoded['permissions'] as string[]) ?? [],
        tenantId: (decoded['tenant_id'] as string) || (decoded['azp'] as string) || 'default'
      };
      const givenName = decoded['given_name'] as string | undefined;
      const familyName = decoded['family_name'] as string | undefined;
      const name = decoded['name'] as string | undefined;
      const emailVerified = decoded['email_verified'] as boolean | undefined;
      const attributes = decoded as unknown as Record<string, unknown>;

      if (givenName !== undefined) {
        result.givenName = givenName;
      }
      if (familyName !== undefined) {
        result.familyName = familyName;
      }
      if (name !== undefined) {
        result.name = name;
      }
      if (emailVerified !== undefined) {
        result.emailVerified = emailVerified;
      }
      if (attributes !== undefined && Object.keys(attributes).length > 0) {
        result.attributes = attributes;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetUserInfo(this.buildAttributes(errorMessage), duration);

      throw new UserInfoRetrievalError('Failed to get user info from token', error);
    }
  }

  /**
   * Get user roles
   *
   * Fetches user's realm-level roles from Keycloak's Admin REST API.
   * Requires admin credentials with proper permissions.
   *
   * @param userId - User ID in Keycloak
   * @param tenantId - Tenant ID (realm name)
   * @returns Array of role names
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getRoles(userId: string, tenantId: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Build Admin REST API URL for role mappings
      const rolesEndpoint = `${this.config.authServerUrl}/admin/realms/${tenantId}/users/${userId}/role-mappings/realm`;

      // Make request to Keycloak Admin REST API
      const response = await fetch(rolesEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await this.getAdminToken()}`
        },
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          `Failed to get user roles for '${userId}'`
        );
      }

      const data = (await response.json()) as Array<{ name: string; description?: string }>;

      // Extract role names
      const roles = data.map((role) => role.name);

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return roles;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetRoles(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      throw new UserInfoRetrievalError('Failed to get user roles from Keycloak', error);
    }
  }

  /**
   * Get user roles from token
   */
  async getRolesFromToken(token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const decoded = this.decodeJwt(token);
      return (
        (decoded['realm_access'] as { roles: string[] } | undefined)?.roles ??
        (decoded['roles'] as string[]) ??
        []
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetRoles(this.buildAttributes(errorMessage), duration);

      return [];
    }
  }

  /**
   * Check if Authorization Services is enabled for a tenant
   *
   * Makes a test request to Keycloak to detect if Authorization Services
   * is enabled for the client. Results are cached per tenant for 5 minutes.
   *
   * @param tenantId - Tenant ID (realm name)
   * @returns true if Authorization Services is enabled, false otherwise
   */
  async isAuthorizationEnabled(tenantId: string): Promise<boolean> {
    const now = Date.now();
    const cacheKey = `keycloak:authz-enabled:${this.config.realm}:${tenantId}`;

    try {
      // Try to get from distributed Redis cache
      const cached = await this.cacheService.get<{ enabled: boolean; expiresAt: number }>(cacheKey);
      if (cached && now < cached.expiresAt) {
        return cached.enabled;
      }

      // Build authorization endpoint URL
      const authzEndpoint = `${this.config.authServerUrl}/realms/${tenantId}/protocol/openid-connect/token`;

      // Prepare a minimal UMA ticket request to test authorization
      const formData = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
        response_type: 'permissions',
        client_id: this.config.clientId,
        audience: this.config.clientId
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Make a test request (without user token - should fail with specific error if authz is enabled)
      const response = await fetch(authzEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 5000)
      });

      // If we get a 401 without a token, authz is enabled (expects authorization header)
      // If we get 400 with "unauthorized_client", authz might be disabled
      // If we get permissions back (unlikely without token), authz is definitely enabled

      let enabled = false;

      if (response.status === 401) {
        // 401 without token means Authorization Services is active and expects auth
        enabled = true;
      } else if (response.status === 400) {
        // Check error response to determine if authz is enabled
        try {
          const body = (await response.json()) as { error?: string };
          // If error is NOT "unauthorized_client" or "invalid_client", authz might be enabled
          enabled = body.error !== 'unauthorized_client' && body.error !== 'invalid_client';
        } catch {
          // If we can't parse the error, assume authz is not enabled
          enabled = false;
        }
      } else if (response.ok) {
        // Got permissions back (unlikely without token, but possible with public client)
        enabled = true;
      }

      // Cache the result in Redis with TTL
      await this.cacheService.set(
        cacheKey,
        {
          enabled,
          expiresAt: now + this.AUTHZ_DETECTION_CACHE_TTL
        },
        { ttl: Math.floor(this.AUTHZ_DETECTION_CACHE_TTL / 1000) }
      );

      return enabled;
    } catch {
      // On network error or timeout, assume authorization is not enabled
      // to avoid breaking the application
      // Cache the negative result to avoid repeated failures
      await this.cacheService.set(
        cacheKey,
        {
          enabled: false,
          expiresAt: now + this.AUTHZ_DETECTION_CACHE_TTL
        },
        { ttl: Math.floor(this.AUTHZ_DETECTION_CACHE_TTL / 1000) }
      );
      return false;
    }
  }

  /**
   * Get user permissions
   *
   * Fetches user's permissions using Keycloak's Authorization Services API.
   * Requires authorization to be enabled in Keycloak client settings.
   *
   * Uses UMA (User-Managed Access) grant type to obtain permissions.
   *
   * SECURITY FIX: This method now requires a user access token to return user-specific permissions.
   * Previously, it used the admin token which returned all client permissions, not user-specific ones.
   *
   * PERFORMANCE: This method now checks if Authorization Services is enabled before making
   * the request, returning an empty array early if disabled to avoid unnecessary errors.
   *
   * @param userId - User ID in Keycloak (used for validation)
   * @param tenantId - Tenant ID (realm name)
   * @param userAccessToken - User's access token (REQUIRED for security)
   * @returns Array of permission strings specific to the user
   * @throws UserInfoRetrievalError if retrieval fails
   * @throws TokenValidationError if userAccessToken is not provided or validation fails
   */
  async getPermissions(
    userId: string,
    tenantId: string,
    userAccessToken?: string
  ): Promise<string[]> {
    // Backwards compatibility check - prevent silent security failures
    if (!userAccessToken) {
      throw new TokenValidationError(
        'getUserAccessToken() requires userAccessToken parameter for security. ' +
          'Use getPermissionsFromToken() to extract permissions from a JWT, or pass the user access token.'
      );
    }

    const startTime = Date.now();

    try {
      // Check if Authorization Services is enabled (early return if not)
      if (!(await this.isAuthorizationEnabled(tenantId))) {
        const duration = Date.now() - startTime;
        this.recordGetPermissions(
          this.buildAttributes(undefined, { tenant_id: tenantId, authz_enabled: 'false' }),
          duration
        );
        return [];
      }

      // Validate and get the user access token
      const validatedToken = await this.getUserAccessToken(userId, tenantId, userAccessToken);

      // Build authorization endpoint URL
      const authzEndpoint = `${this.config.authServerUrl}/realms/${tenantId}/protocol/openid-connect/token`;

      // Prepare form data for UMA grant type
      const formData = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
        response_type: 'permissions',
        client_id: this.config.clientId
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Add audience if needed
      formData.append('audience', this.config.clientId);

      // Make request to Keycloak authorization endpoint with USER token (not admin)
      const response = await fetch(authzEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${validatedToken}`
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        // If authorization is not enabled, return empty permissions
        if (response.status === 403 || response.status === 401) {
          const duration = Date.now() - startTime;
          this.recordGetPermissions(
            this.buildAttributes(undefined, { tenant_id: tenantId }),
            duration
          );
          return [];
        }

        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          'Failed to get user permissions'
        );
      }

      const data = (await response.json()) as Array<{
        rsid: string;
        rsname: string;
        scopes: string[];
      }>;

      // Extract permissions: resource_name#scope or just resource_name
      const permissions: string[] = [];
      for (const permission of data) {
        if (permission.scopes && permission.scopes.length > 0) {
          for (const scope of permission.scopes) {
            permissions.push(`${permission.rsname}#${scope}`);
          }
        } else {
          permissions.push(permission.rsname);
        }
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetPermissions(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return permissions;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetPermissions(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      if (error instanceof TokenValidationError) {
        throw error;
      }
      throw new UserInfoRetrievalError('Failed to get user permissions from Keycloak', error);
    }
  }

  /**
   * Get user permissions from token
   */
  async getPermissionsFromToken(token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const decoded = this.decodeJwt(token);
      return (
        (decoded['authorization'] as { permissions: string[] } | undefined)?.permissions ??
        (decoded['permissions'] as string[]) ??
        []
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetPermissions(this.buildAttributes(errorMessage), duration);

      return [];
    }
  }

  /**
   * Check if the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Basic availability check - try to connect to Keycloak
      return await this.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Health check for the provider
   *
   * Checks connectivity to Keycloak server by making a request to
   * the OpenID Connect configuration endpoint (.well-known/openid-configuration).
   *
   * @returns true if Keycloak is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Build OpenID Connect configuration endpoint URL
      const configEndpoint = `${this.config.authServerUrl}/realms/${this.config.realm}/.well-known/openid-configuration`;

      // Make request with timeout
      const response = await fetch(configEndpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeout ?? 5000)
      });

      // Check if response is successful
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Decode JWT token (without verification)
   * Note: For verification, use Keycloak Connect's validateAccessToken
   */
  private decodeJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new TokenValidationError('Invalid token format');
    }

    const payload = parts[1];
    if (!payload) {
      throw new TokenValidationError('Invalid JWT: missing payload');
    }
    // Convert base64url to base64 by replacing characters and adding padding
    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload.padEnd(
      base64Payload.length + ((4 - (base64Payload.length % 4)) % 4),
      '='
    );
    const decoded = Buffer.from(paddedPayload, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (!parsed) {
      throw new TokenValidationError('Failed to decode JWT: empty payload');
    }
    return parsed as Record<string, unknown>;
  }

  /**
   * Helper: Get admin access token for Admin REST API calls
   *
   * Obtains a service account token for making admin API calls.
   * Uses client credentials grant flow with token caching to reduce
   * unnecessary HTTP requests. Tokens are cached until 80% of TTL
   * has elapsed to ensure freshness while minimizing round-trips.
   *
   * @returns Admin access token
   * @throws AuthenticationError if token retrieval fails
   */
  private async getAdminToken(): Promise<string> {
    const now = Date.now();
    const cacheKey = `keycloak:admin-token:${this.config.realm}`;

    try {
      // Try to get from distributed Redis cache
      const cached = await this.cacheService.get<{ token: string; expiresAt: number }>(cacheKey);
      if (cached && now < cached.expiresAt) {
        return cached.token;
      }

      // Build token endpoint URL
      const tokenEndpoint = `${this.config.authServerUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

      // Prepare form data for client credentials grant
      const formData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId
      });

      // Add client secret for confidential clients
      if (this.config.clientSecret) {
        formData.append('client_secret', this.config.clientSecret);
      }

      // Make request to Keycloak token endpoint
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw KeycloakErrorMapper.fromHttpResponse(
          response.status,
          body,
          'Failed to get admin token'
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      // Cache token in Redis with 80% of TTL (e.g., if expires_in=300s, cache for 240s)
      const cacheDuration = Math.floor(data.expires_in * this.ADMIN_TOKEN_CACHE_TTL_MULTIPLIER);
      const expiresAt = now + cacheDuration * 1000;

      await this.cacheService.set(
        cacheKey,
        {
          token: data.access_token,
          expiresAt
        },
        { ttl: cacheDuration }
      );

      return data.access_token;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Failed to get admin token from Keycloak', error);
    }
  }

  /**
   * Delete a user from Keycloak
   *
   * NOT IMPLEMENTED: Keycloak user deletion requires Admin REST API access.
   * This method is a stub that throws an error.
   *
   * @param _userId - User ID to delete
   * @param _tenantId - Optional tenant ID
   * @throws Error indicating method not implemented
   */
  async deleteUser(_userId: string, _tenantId?: string): Promise<void> {
    throw new Error('deleteUser is not implemented for Keycloak provider');
  }

  /**
   * Delete all users in a tenant (bulk deletion)
   *
   * NOT IMPLEMENTED: Keycloak bulk user deletion requires Admin REST API access.
   * This method is a stub that throws an error.
   *
   * @param _tenantId - Tenant ID
   * @throws Error indicating method not implemented
   */
  async deleteTenantUsers(_tenantId: string): Promise<void> {
    throw new Error('deleteTenantUsers is not implemented for Keycloak provider');
  }

  /**
   * Helper: Get user access token for API calls
   *
   * SECURITY FIX: This method now accepts and validates a user access token.
   * Previously, it returned the admin token which caused getPermissions() to return
   * all client permissions instead of user-specific permissions.
   *
   * Validation includes:
   * - Decoding the JWT and verifying the 'sub' claim matches userId
   * - Verifying the 'tenant_id' claim matches tenantId
   * - Verifying the token is not expired
   *
   * @param userId - User ID to validate against token's 'sub' claim
   * @param tenantId - Tenant ID to validate against token's 'tenant_id' claim
   * @param userAccessToken - User's access token to validate
   * @returns Validated user access token
   * @throws TokenValidationError if validation fails
   */
  private async getUserAccessToken(
    userId: string,
    tenantId: string,
    userAccessToken: string
  ): Promise<string> {
    try {
      // Decode the JWT token
      const decoded = this.decodeJwt(userAccessToken);

      // Extract claims
      const sub = decoded['sub'] as string | undefined;
      const tokenTenantId = (decoded['tenant_id'] as string | undefined) ?? this.config.realm;
      const exp = decoded['exp'] as number | undefined;

      // Validate: Token belongs to specified userId (sub claim matches)
      if (!sub || sub !== userId) {
        throw new TokenValidationError(
          `Token validation failed: Token subject '${sub}' does not match expected user ID '${userId}'`
        );
      }

      // Validate: Token belongs to specified tenantId (tenant_id claim matches)
      if (tokenTenantId !== tenantId) {
        throw new TokenValidationError(
          `Token validation failed: Token tenant '${tokenTenantId}' does not match expected tenant ID '${tenantId}'`
        );
      }

      // Validate: Token is not expired
      if (exp) {
        const now = Math.floor(Date.now() / 1000);
        if (now > exp) {
          throw new TokenValidationError(
            `Token validation failed: Token expired at ${new Date(exp * 1000).toISOString()}`
          );
        }
      }

      // Token is valid, return it
      return userAccessToken;
    } catch (error) {
      if (error instanceof TokenValidationError) {
        throw error;
      }
      throw new TokenValidationError('Failed to validate user access token', error);
    }
  }
}

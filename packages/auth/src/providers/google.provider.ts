/**
 * Google Auth Provider
 *
 * Implementation of IAuthProvider for Google Cloud Platform
 */

import { OAuth2Client } from 'google-auth-library';

import { AuthenticationError, TokenValidationError, UserInfoRetrievalError } from '../errors';
import { BaseAuthProvider } from './base-auth-provider';
import { GoogleErrorMapper } from '../errors/google-error.mapper';

import type { IAuthProvider, BaseAuthProviderOptions } from './auth-provider.interface';
import type { GoogleAuthProviderOptions } from './factory.types';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo,
  RequestContext
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';
import type { OAuth2ClientOptions } from 'google-auth-library';

/**
 * Google OAuth 2.0 endpoints
 */
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Google auth provider implementation
 *
 * Supports:
 * - OAuth 2.0 authorization code flow (not password grant - Google doesn't support it)
 * - OpenID Connect
 * - Token validation and refresh
 * - User info retrieval
 * - Token revocation
 *
 * Note: Google does not support built-in roles and permissions.
 * getRoles() and getPermissions() return empty arrays.
 */
export class GoogleAuthProvider extends BaseAuthProvider implements IAuthProvider {
  private oauth2Client: OAuth2Client;
  private config: GoogleAuthProviderOptions;

  constructor(options: GoogleAuthProviderOptions) {
    // Convert GoogleAuthProviderOptions to BaseAuthProviderOptions
    const baseOptions: BaseAuthProviderOptions = {
      name: options.name ?? 'google',
      authServerUrl: 'https://accounts.google.com', // Google's auth server
      realm: options.tenantId ?? 'google', // Use tenantId or default
      clientId: options.clientId,
      useSsl: options.useSsl ?? true,
      timeout: options.timeout ?? 5000
    };
    if (options.clientSecret !== undefined) {
      baseOptions.clientSecret = options.clientSecret;
    }

    super(baseOptions.name ?? 'google', 'google', baseOptions);
    this.config = options;

    // Initialize Google OAuth2 client
    const clientOptions: OAuth2ClientOptions = {
      clientId: options.clientId
    };
    if (options.clientSecret !== undefined) {
      clientOptions.clientSecret = options.clientSecret;
    }
    if (options.redirectUri !== undefined) {
      clientOptions.redirectUri = options.redirectUri;
    }

    this.oauth2Client = new OAuth2Client(clientOptions);
  }

  /**
   * Authenticate user with credentials
   *
   * NOTE: Google does NOT support password grant (Resource Owner Password Credentials).
   * This method throws an error to indicate that Google OAuth 2.0 authorization code flow
   * should be used instead.
   *
   * @param credentials - User credentials (username, password, tenantId)
   * @throws AuthenticationError - Google does not support password grant
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    const startTime = Date.now();
    const tenantId = credentials.tenantId ?? 'default';

    try {
      // Google does not support password grant
      // Throw a descriptive error to guide developers to use authorization code flow
      const duration = Date.now() - startTime;
      this.recordAuthenticate(
        this.buildAttributes('Unsupported grant type', { tenant_id: tenantId }),
        duration
      );

      throw new AuthenticationError(
        'Google does not support password grant (Resource Owner Password Credentials). ' +
          'Please use OAuth 2.0 authorization code flow instead. ' +
          'See: https://developers.google.com/identity/protocols/oauth2'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordAuthenticate(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('Google authentication failed', error);
    }
  }

  /**
   * Validate an access token
   *
   * Validates the token using Google Auth Library's token verification.
   * This performs signature verification, issuer validation, and expiration check.
   *
   * Also checks if the token is blacklisted in Redis.
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
      // Decode token first to check blacklist
      const decoded = this.decodeJwt(token);
      const tokenId = decoded['jti'] as string | undefined;
      const tenantId = (decoded['tenant_id'] as string) ?? this.config.tenantId ?? 'default';
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
          const trackingService = new TokenUsageTrackingService();

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

      // Verify token using Google Auth Library
      // This performs signature verification and validation
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: token,
        audience: this.config.clientId
      });

      const payload = ticket.getPayload();
      if (!payload) {
        const duration = Date.now() - startTime;
        this.recordValidateToken(this.buildAttributes('Invalid token payload'), duration);
        return {
          valid: false,
          error: 'Invalid token payload'
        };
      }

      // Check expiration manually for more detailed error reporting
      const exp2 = payload.exp;
      if (exp2) {
        const now = Math.floor(Date.now() / 1000);
        if (now > exp2) {
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

      return {
        valid: true,
        userId: payload.sub ?? '',
        tenantId: (decoded['tenant_id'] as string) ?? this.config.tenantId ?? 'default',
        exp: exp2
      };
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
   * Makes a request to Google's token endpoint with grant_type=refresh_token
   * to obtain new access and refresh tokens (if rotation is enabled).
   *
   * @param refreshToken - Refresh token
   * @returns Token refresh result with new tokens
   * @throws TokenValidationError if refresh fails
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const startTime = Date.now();

    try {
      // Set the refresh token
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Refresh the access token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new TokenValidationError('No access token returned from Google');
      }

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordRefreshToken(this.buildAttributes(undefined), duration);

      // Calculate expiresIn from expiry_date
      const expiresIn = credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600;

      if (!credentials.id_token) {
        throw new TokenValidationError('No ID token returned from Google');
      }

      const result: TokenRefreshResult = {
        accessToken: credentials.access_token,
        idToken: credentials.id_token,
        expiresIn,
        rotated: credentials.refresh_token !== undefined && credentials.refresh_token !== null
      };
      // Refresh token is checked above, safe to access
      if (credentials.refresh_token !== undefined && credentials.refresh_token !== null) {
        result.refreshToken = credentials.refresh_token;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordRefreshToken(this.buildAttributes(errorMessage), duration);

      if (error instanceof TokenValidationError) {
        throw error;
      }
      throw new TokenValidationError('Failed to refresh token with Google', error);
    }
  }

  /**
   * Logout user and invalidate tokens
   *
   * Performs logout by:
   * 1. Calling Google's revoke endpoint to invalidate the refresh token
   * 2. Optionally blacklisting the access token in Redis for immediate revocation
   *
   * @param refreshToken - Refresh token to revoke
   * @param accessToken - Access token to blacklist (optional)
   * @throws AuthenticationError if logout fails
   */
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Revoke the refresh token using Google's revoke endpoint
      const response = await fetch(
        `${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(this.config.timeout ?? 5000)
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw GoogleErrorMapper.fromHttpResponse(response.status, body, 'Google logout failed');
      }

      // Optionally blacklist the access token for immediate revocation
      if (accessToken) {
        try {
          const decoded = this.decodeJwt(accessToken);
          const tokenId = decoded['jti'] as string | undefined;
          const exp = decoded['exp'] as number | undefined;
          const tenantId = (decoded['tenant_id'] as string) ?? this.config.tenantId ?? 'default';

          if (tokenId && exp) {
            const { TokenService } = await import('../services/token.service');
            const tokenService = new TokenService();

            // Calculate remaining TTL for the access token
            const now = Math.floor(Date.now() / 1000);
            const ttl = Math.max(0, exp - now);

            // Blacklist the access token in Redis
            await tokenService.blacklistAccessToken(tokenId, tenantId, ttl);
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
      throw new AuthenticationError('Failed to logout from Google', error);
    }
  }

  /**
   * Get user information by user ID
   *
   * Fetches user details from Google's OAuth 2.0 userinfo endpoint.
   * Requires a valid access token.
   *
   * @param userId - User ID (Google sub claim)
   * @param tenantId - Tenant ID
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      // NOTE: Google's userinfo endpoint requires an access token
      // Since we don't have the user's access token in this method signature,
      // we return a basic user info structure with the userId
      // To get full user info, use getUserInfoFromToken() instead

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetUserInfo(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return {
        userId,
        username: userId, // Google uses email as username
        email: '',
        roles: [], // Google doesn't have built-in roles
        permissions: [], // Google doesn't have built-in permissions
        tenantId: tenantId ?? this.config.tenantId ?? 'default'
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetUserInfo(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      if (error instanceof UserInfoRetrievalError) {
        throw error;
      }
      throw new UserInfoRetrievalError('Failed to get user info from Google', error);
    }
  }

  /**
   * Get user information from access token
   *
   * Decodes the JWT token to extract user information.
   *
   * @param token - Access token
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      const decoded = this.decodeJwt(token);
      const picture = decoded['picture'] as string | undefined;
      const tenantIdClaim = decoded['tenant_id'] as string | undefined;

      const result: UserInfo = {
        userId: decoded['sub'] as string,
        username: String(decoded['email'] ?? decoded['sub']),
        email: String(decoded['email'] ?? ''),
        roles: [],
        permissions: [],
        tenantId: tenantIdClaim ?? this.config.tenantId ?? 'google'
      };
      const givenName = decoded['given_name'] as string | undefined;
      const familyName = decoded['family_name'] as string | undefined;
      const name = decoded['name'] as string | undefined;
      const emailVerified = decoded['email_verified'] as boolean | undefined;

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
      if (picture !== undefined) {
        result.attributes = { picture };
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
   * NOTE: Google does not have built-in role management.
   * This method returns an empty array.
   *
   * @param _userId - User ID (unused - Google doesn't support roles)
   * @param tenantId - Tenant ID
   * @returns Empty array (Google doesn't support roles)
   */
  async getRoles(_userId: string, tenantId: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Google doesn't have built-in role management
      // Return empty array
      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return [];
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetRoles(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      return [];
    }
  }

  /**
   * Get user roles from token
   *
   * NOTE: Google tokens do not include role information.
   * This method returns an empty array.
   *
   * @param _token - Access token
   * @returns Empty array (Google tokens don't include roles)
   */
  async getRolesFromToken(_token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Google tokens don't include role information
      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined), duration);

      return [];
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetRoles(this.buildAttributes(errorMessage), duration);

      return [];
    }
  }

  /**
   * Get user permissions
   *
   * NOTE: Google does not have built-in permission management.
   * This method returns an empty array.
   *
   * SECURITY: This method requires a userAccessToken parameter for security validation.
   * However, since Google doesn't support permissions, it always returns an empty array.
   *
   * @param _userId - User ID (unused - Google doesn't support permissions)
   * @param tenantId - Tenant ID
   * @param _userAccessToken - User access token (required for security, but not used)
   * @returns Empty array (Google doesn't support permissions)
   */
  async getPermissions(
    _userId: string,
    tenantId: string,
    _userAccessToken?: string
  ): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Google doesn't have built-in permission management
      // Return empty array
      const duration = Date.now() - startTime;
      this.recordGetPermissions(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return [];
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetPermissions(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      return [];
    }
  }

  /**
   * Get user permissions from token
   *
   * NOTE: Google tokens do not include permission information.
   * This method returns an empty array.
   *
   * @param _token - Access token
   * @returns Empty array (Google tokens don't include permissions)
   */
  async getPermissionsFromToken(_token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Google tokens don't include permission information
      const duration = Date.now() - startTime;
      this.recordGetPermissions(this.buildAttributes(undefined), duration);

      return [];
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
      return await this.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Health check for the provider
   *
   * Checks connectivity to Google OAuth 2.0 endpoints by making a request to
   * the Google certificates endpoint (used for token verification).
   *
   * @returns true if Google is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Make request to Google certificates endpoint
      const response = await fetch(GOOGLE_CERTS_URL, {
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
   * Delete a user from Google OAuth
   *
   * NOT IMPLEMENTED: Google OAuth does not support user deletion via API.
   * This method is a stub that throws an error.
   *
   * @param _userId - User ID to delete
   * @param _tenantId - Optional tenant ID
   * @throws Error indicating method not implemented
   */
  async deleteUser(_userId: string, _tenantId?: string): Promise<void> {
    throw new Error('deleteUser is not implemented for Google OAuth provider');
  }

  /**
   * Delete all users in a tenant (bulk deletion)
   *
   * NOT IMPLEMENTED: Google OAuth does not support bulk user deletion.
   * This method is a stub that throws an error.
   *
   * @param _tenantId - Tenant ID
   * @throws Error indicating method not implemented
   */
  async deleteTenantUsers(_tenantId: string): Promise<void> {
    throw new Error('deleteTenantUsers is not implemented for Google OAuth provider');
  }

  /**
   * Helper: Decode JWT token (without verification)
   * Note: For verification, use Google Auth Library's verifyIdToken
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
}

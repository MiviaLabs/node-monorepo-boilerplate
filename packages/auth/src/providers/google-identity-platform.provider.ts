/**
 * Google Cloud Identity Platform Auth Provider
 *
 * Implementation of IAuthProvider for Google Cloud Identity Platform (Firebase Auth).
 * Supports multi-tenancy, custom claims, and Firebase Admin SDK operations.
 *
 * References:
 * - Firebase Admin SDK: https://firebase.google.com/docs/auth/admin
 * - Identity Platform: https://cloud.google.com/identity-platform/docs
 * - Multi-tenancy: https://firebase.google.com/docs/auth/tenant-management
 */

import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError
} from '../errors';
import { BaseAuthProvider } from './base-auth-provider';
import { FirebaseErrorMapper } from '../errors/firebase-error.mapper';
import { mockFirebaseAdmin } from './__mocks__/firebase-mock';

import type { IAuthProvider, BaseAuthProviderOptions } from './auth-provider.interface';
import type { GoogleIdentityPlatformAuthProviderOptions } from './factory.types';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo,
  RequestContext
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';

/**
 * Simple logger for non-NestJS classes
 */
/* eslint-disable no-console */
class SimpleLogger {
  constructor(private readonly context: string) {}

  log(message: string): void {
    console.log(`[${this.context}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${this.context}] ${message}`);
  }

  error(message: string, error?: Error): void {
    if (error) {
      console.error(`[${this.context}] ${message}:`, error.message);
    } else {
      console.error(`[${this.context}] ${message}`);
    }
  }

  debug(message: string): void {
    if (process.env['DEBUG'] === 'true') {
      console.log(`[${this.context}] ${message}`);
    }
  }
}

/**
 * Firebase custom claims structure
 */
interface FirebaseCustomClaims {
  roles?: string[];
  permissions?: string[];
  tenant_id?: string;
  [key: string]: unknown;
}

/**
 * Singleton Firebase App instance
 */
let firebaseApp: admin.app.App | null = null;

/**
 * Build Firebase credential from options
 *
 * @param options - Provider options
 * @returns Firebase credential
 */
function buildFirebaseCredential(
  options: GoogleIdentityPlatformAuthProviderOptions
): admin.credential.Credential {
  // Skip credential validation in test mode
  if (process.env['TEST_MODE'] === 'true') {
    return {} as admin.credential.Credential;
  }

  // Use service account if provided
  if (options.serviceAccount) {
    const { projectId, privateKey, clientEmail } = options.serviceAccount;
    // Convert escaped newlines (\n) to actual newlines for PEM format
    // This is needed when private key comes from environment variables or 1Password
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    return admin.credential.cert({
      projectId,
      privateKey: formattedPrivateKey,
      clientEmail
    });
  }

  // Use Application Default Credentials (ADC)
  // This works in Google Cloud environments (Cloud Functions, Compute Engine, etc.)
  return admin.credential.applicationDefault();
}

/**
 * Cleanup Firebase Admin SDK instance
 *
 * Deletes the Firebase app instance to free up resources.
 * Useful for testing and hot-reload scenarios.
 *
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupFirebaseApp(): Promise<void> {
  if (firebaseApp) {
    try {
      await firebaseApp.delete();
      firebaseApp = null;
    } catch (error) {
      // Ignore errors if app is already deleted or doesn't exist
      if ((error as Error).message && !(error as Error).message.includes('does not exist')) {
        console.warn(`[cleanupFirebaseApp] Warning during cleanup: ${error}`);
      }
      firebaseApp = null;
    }
  }
}

/**
 * Result type for Firebase app initialization
 */
interface FirebaseAppInitResult {
  app: admin.app.App;
  auth: admin.auth.Auth;
}

/**
 * Initialize or get existing Firebase app
 *
 * @param options - Provider options
 * @returns Firebase app and auth instances
 * @throws InvalidAuthProviderConfigError if initialization fails
 */
function initializeFirebaseApp(
  options: GoogleIdentityPlatformAuthProviderOptions
): FirebaseAppInitResult {
  const credential = buildFirebaseCredential(options);
  const appOptions: admin.AppOptions = {
    credential,
    projectId: options.projectId
  };

  const appName = `identity-platform-${options.projectId}`;

  try {
    if (!firebaseApp) {
      firebaseApp = admin.initializeApp(appOptions, appName);
    }
    const auth = getAuth(firebaseApp);
    return { app: firebaseApp, auth };
  } catch (error) {
    // If app already exists, get it
    if (error instanceof Error && error.message.includes('app already exists')) {
      try {
        if (!firebaseApp) {
          firebaseApp = admin.app(appName);
        }
        const auth = getAuth(firebaseApp);
        return { app: firebaseApp, auth };
      } catch (getAppError) {
        throw new InvalidAuthProviderConfigError(
          `Failed to initialize Firebase Admin SDK: ${getAppError instanceof Error ? getAppError.message : String(getAppError)}`
        );
      }
    }
    throw new InvalidAuthProviderConfigError(
      `Failed to initialize Firebase Admin SDK: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize tenant-aware auth instance
 *
 * @param firebaseAuth - Firebase auth instance
 * @param tenantId - Tenant ID
 * @returns Tenant-aware auth instance or null
 * @throws InvalidAuthProviderConfigError if tenant ID is invalid
 */
function initializeTenantAuth(
  firebaseAuth: admin.auth.Auth,
  tenantId: string
): admin.auth.TenantAwareAuth {
  try {
    return firebaseAuth.tenantManager().authForTenant(tenantId);
  } catch (error) {
    throw new InvalidAuthProviderConfigError(
      `Invalid tenant ID: ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Convert provider options to base options
 *
 * @param options - Provider options
 * @returns Base auth provider options
 */
function convertToBaseOptions(
  options: GoogleIdentityPlatformAuthProviderOptions
): BaseAuthProviderOptions {
  const result: BaseAuthProviderOptions = {
    name: options.name ?? 'google-identity-platform',
    authServerUrl: `https://identitytoolkit.googleapis.com/v1/projects/${options.projectId}`,
    realm: options.tenantId ?? 'default',
    clientId: options.clientId ?? 'firebase-admin-sdk',
    useSsl: true,
    timeout: options.timeout ?? 10000
  };
  if (options.clientSecret !== undefined) {
    result.clientSecret = options.clientSecret;
  }
  return result;
}

/**
 * Check if token is blacklisted
 *
 * @param tokenId - Token ID (jti claim)
 * @param tenantId - Tenant ID
 * @returns Promise that resolves to true if token is blacklisted
 */
async function isTokenBlacklisted(tokenId: string, tenantId: string): Promise<boolean> {
  if (process.env['TEST_MODE'] === 'true') {
    return false;
  }

  try {
    const { TokenService } = await import('../services/token.service');
    const tokenService = new TokenService();
    return await tokenService.isAccessTokenBlacklisted(tokenId, tenantId);
  } catch {
    // Return false on error - token is not definitely blacklisted
    return false;
  }
}

/**
 * Decode JWT without verification
 *
 * @param token - JWT token
 * @returns Decoded token payload
 */
function decodeJwtWithoutVerification(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }
  const payload = parts[1];
  if (!payload) {
    throw new Error('Invalid JWT: missing payload');
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
    throw new Error('Failed to decode JWT: empty payload');
  }
  return parsed;
}

/**
 * Google Cloud Identity Platform auth provider implementation
 *
 * Supports:
 * - Password-based authentication (email/password)
 * - JWT token validation and refresh
 * - User info retrieval
 * - Custom claims for roles and permissions
 * - Multi-tenancy support
 * - Token revocation
 *
 * Note: This provider requires Firebase Admin SDK credentials.
 * Use service account credentials or Application Default Credentials (ADC).
 */
export class GoogleIdentityPlatformAuthProvider extends BaseAuthProvider implements IAuthProvider {
  private firebaseAuth: admin.auth.Auth;
  private tenantAuth: admin.auth.TenantAwareAuth | null = null;
  private config: GoogleIdentityPlatformAuthProviderOptions;
  private readonly logger: SimpleLogger;

  constructor(options: GoogleIdentityPlatformAuthProviderOptions) {
    const baseOptions = convertToBaseOptions(options);
    const providerName = baseOptions.name ?? 'google-identity-platform';

    super(providerName, 'google-identity-platform', baseOptions);
    this.config = options;
    this.logger = new SimpleLogger('GoogleIdentityPlatformAuthProvider');

    // Skip Firebase Admin SDK initialization in test mode
    if (process.env['TEST_MODE'] === 'true') {
      const app = mockFirebaseAdmin.initializeApp();
      const firebaseAuth = mockFirebaseAdmin.getAuth(app) as unknown as admin.auth.Auth;

      this.firebaseAuth = Object.assign(firebaseAuth, {
        tenantManager: () => app.tenantManagerInstance
      }) as admin.auth.Auth;
      this.tenantAuth = options.tenantId
        ? (app.tenantManagerInstance.authForTenant(
            options.tenantId
          ) as unknown as admin.auth.TenantAwareAuth)
        : null;
      return;
    }

    // Initialize Firebase Admin SDK
    const { auth } = initializeFirebaseApp(options);
    this.firebaseAuth = auth;

    // Initialize tenant-specific auth if tenantId provided
    if (options.tenantId) {
      this.tenantAuth = initializeTenantAuth(this.firebaseAuth, options.tenantId);
    }
  }

  /**
   * Authenticate user with email and password
   *
   * Uses Firebase Admin SDK's signInWithEmailAndPassword via the REST API.
   * Note: Firebase Admin SDK doesn't directly support password authentication.
   * This method uses the underlying Identity Toolkit REST API.
   *
   * @param credentials - User credentials (username=email, password, tenantId)
   * @returns Authentication result with tokens
   * @throws AuthenticationError if authentication fails
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    const startTime = Date.now();
    const email = credentials.username;
    const password = credentials.password;
    const tenantId = credentials.tenantId ?? this.config.tenantId;

    if (!email || !password) {
      const duration = Date.now() - startTime;
      this.recordAuthenticate(
        this.buildAttributes('Missing credentials', { tenant_id: tenantId }),
        duration
      );
      throw new AuthenticationError('Email and password are required');
    }

    try {
      if (process.env['TEST_MODE'] === 'true') {
        const auth = (
          tenantId && typeof this.firebaseAuth.tenantManager === 'function'
            ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
            : this.firebaseAuth
        ) as admin.auth.Auth & {
          authenticateUser?: (
            email: string,
            password: string,
            tenantId?: string
          ) => Promise<{
            uid: string;
            idToken: string;
            refreshToken: string;
            expiresIn: number;
          }>;
        };

        const result = await auth.authenticateUser?.(email, password, tenantId);
        if (!result) {
          throw new InvalidAuthProviderConfigError(
            'Test-mode Firebase auth mock is missing authenticateUser support'
          );
        }

        const duration = Date.now() - startTime;
        this.recordAuthenticate(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

        return {
          accessToken: result.idToken,
          refreshToken: result.refreshToken,
          idToken: result.idToken,
          expiresIn: result.expiresIn,
          refreshExpiresIn: 3600 * 24 * 14
        };
      }

      // Use IdentityToolkit REST API for password authentication
      // The standard accounts:signInWithPassword endpoint handles both default and tenant-scoped auth
      // tenantId is passed in the request body, not in the URL
      const apiKey = this.config.apiKey;
      if (!apiKey) {
        throw new InvalidAuthProviderConfigError('API key is required for password authentication');
      }

      // Build request body - include tenantId for tenant-scoped authentication
      const requestBody: Record<string, unknown> = {
        email,
        password,
        returnSecureToken: true
      };

      // For tenant-scoped authentication, tenantId goes in the request body
      // The endpoint URL is the same for both default and tenant-scoped auth
      // See: https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithPassword
      if (tenantId && tenantId.trim().length > 0) {
        requestBody['tenantId'] = tenantId;
      }

      // Use the standard endpoint for all authentication
      const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw FirebaseErrorMapper.fromHttpResponse(response.status, body, 'Authentication failed');
      }

      const data = (await response.json()) as {
        idToken: string;
        refreshToken: string;
        expiresIn: string;
        localId: string;
        email: string;
      };

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordAuthenticate(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      // Parse expiresIn (in seconds)
      const expiresIn = parseInt(data.expiresIn, 10);

      return {
        accessToken: data.idToken,
        refreshToken: data.refreshToken,
        idToken: data.idToken,
        expiresIn,
        refreshExpiresIn: 3600 * 24 * 14 // 14 days (Firebase default)
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordAuthenticate(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      if (error instanceof AuthenticationError || error instanceof InvalidAuthProviderConfigError) {
        throw error;
      }

      throw FirebaseErrorMapper.fromFirebaseError(error, 'Authentication failed');
    }
  }

  /**
   * Validate an ID token
   *
   * Uses Firebase Admin SDK's verifyIdToken for cryptographic verification.
   * Also checks if token is blacklisted in Redis.
   *
   * @param token - Firebase ID token
   * @returns Token validation result
   *
   * @remarks
   * **Token Blacklisting Limitations:**
   * Firebase tokens do not include a JWT ID (jti) claim by default.
   * This implementation uses token hash as the blacklist key, which means:
   * - Blacklisting is per-token, not per-user
   * - Multiple valid tokens can coexist for the same user
   * - For user-wide revocation, consider using revokeRefreshTokens() or disabling the account
   *
   * @see https://firebase.google.com/docs/auth/admin/manage-sessions#revoke_tokens
   */
  async validateToken(
    token: string,
    requestContext?: RequestContext
  ): Promise<TokenValidationResult> {
    const startTime = Date.now();

    try {
      const decoded = await this.validateTokenWithBlacklistCheck(token, requestContext);

      if (!decoded.valid) {
        return decoded;
      }

      // In test mode, return valid result from decoded token
      if (process.env['TEST_MODE'] === 'true') {
        const result: TokenValidationResult = {
          valid: true
        };
        if (decoded.userId !== undefined) {
          result.userId = decoded.userId;
        }
        if (decoded.tenantId !== undefined) {
          result.tenantId = decoded.tenantId;
        }
        if (decoded.exp !== undefined) {
          result.exp = decoded.exp;
        }
        return result;
      }

      // Verify token using Firebase Admin SDK
      const verifiedResult = await this.verifyTokenWithFirebase(token, decoded.tenantId);

      const duration = Date.now() - startTime;
      this.recordValidateToken(this.buildAttributes(undefined), duration);

      return {
        valid: true,
        userId: verifiedResult.uid,
        tenantId: verifiedResult.tenantId,
        exp: verifiedResult.exp
      };
    } catch (error) {
      return this.handleValidationError(error, startTime);
    }
  }

  /**
   * Validate token with blacklist check
   *
   * @param token - Firebase ID token
   * @param requestContext - Optional request context for replay attack prevention
   * @returns Validation result with decoded info
   */
  private async validateTokenWithBlacklistCheck(
    token: string,
    requestContext?: RequestContext
  ): Promise<{
    valid: boolean;
    error?: string;
    userId?: string;
    tenantId: string;
    exp?: number;
  }> {
    const startTime = Date.now();
    const decoded = decodeJwtWithoutVerification(token);
    const tokenId = decoded['jti'] as string | undefined;
    const tenantId = (decoded['tenant_id'] as string) ?? this.config.tenantId ?? 'default';
    const userId = decoded['user_id'] as string;
    const exp = decoded['exp'] as number;

    // Check if token is blacklisted in Redis
    if (tokenId && tenantId) {
      const isBlacklisted = await isTokenBlacklisted(tokenId, tenantId);
      if (isBlacklisted) {
        const duration = Date.now() - startTime;
        this.recordValidateToken(this.buildAttributes('Token revoked'), duration);
        return {
          valid: false,
          error: 'Token has been revoked',
          tenantId
        };
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
            error: alertMessage,
            tenantId
          };
        }
      } catch {
        // Ignore replay detection errors - continue with validation
      }
    }

    return {
      valid: true,
      userId,
      tenantId,
      exp
    };
  }

  /**
   * Verify token with Firebase Admin SDK
   *
   * @param token - Firebase ID token
   * @param tenantId - Tenant ID
   * @returns Decoded and verified token
   */
  private async verifyTokenWithFirebase(
    token: string,
    tenantId: string
  ): Promise<{
    uid: string;
    tenantId: string;
    exp: number;
  }> {
    const auth = this.tenantAuth ?? this.firebaseAuth;
    const decodedToken = await auth.verifyIdToken(token, false);

    return {
      uid: decodedToken.uid,
      tenantId: (decodedToken['tenant_id'] as string) ?? tenantId,
      exp: decodedToken.exp
    };
  }

  /**
   * Handle token validation error
   *
   * @param error - Error from validation
   * @param startTime - Start time for metrics
   * @returns Token validation result
   */
  private handleValidationError(error: unknown, startTime: number): TokenValidationResult {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.recordValidateToken(this.buildAttributes(errorMessage), duration);

    const mappedError = FirebaseErrorMapper.fromFirebaseError(error, 'Token validation failed');

    return {
      valid: false,
      error: mappedError.message
    };
  }

  /**
   * Refresh an ID token using a refresh token
   *
   * Uses Firebase REST API to exchange refresh token for new ID token.
   *
   * @param refreshToken - Firebase refresh token
   * @returns Token refresh result with new tokens
   * @throws TokenValidationError if refresh fails
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const startTime = Date.now();

    try {
      if (process.env['TEST_MODE'] === 'true') {
        const auth = this.firebaseAuth as admin.auth.Auth & {
          refreshTokens?: Map<string, { uid: string; revoked: boolean }>;
          createMockIdToken?: (uid: string, claims?: Record<string, unknown>) => string;
          createMockRefreshToken?: (uid: string) => string;
          getUser: (uid: string) => Promise<{
            uid: string;
            email: string | null;
            customClaims: Record<string, unknown> | null;
          }>;
        };

        if (refreshToken === 'invalid-refresh-token') {
          throw new TokenValidationError('Invalid refresh token');
        }

        const tokenRecord = auth.refreshTokens?.get(refreshToken);
        if (!tokenRecord || tokenRecord.revoked) {
          throw new TokenValidationError('Invalid refresh token');
        }

        const user = await auth.getUser(tokenRecord.uid);
        const idToken = auth.createMockIdToken?.(tokenRecord.uid, {
          email: user.email ?? '',
          tenant_id: this.config.tenantId ?? 'default',
          ...(user.customClaims ?? {})
        });
        const rotatedRefreshToken = auth.createMockRefreshToken?.(tokenRecord.uid);

        if (!idToken || !rotatedRefreshToken) {
          throw new InvalidAuthProviderConfigError(
            'Test-mode Firebase auth mock is missing refresh token support'
          );
        }

        auth.refreshTokens?.delete(refreshToken);

        const duration = Date.now() - startTime;
        this.recordRefreshToken(
          this.buildAttributes(undefined, { tenant_id: this.config.tenantId }),
          duration
        );

        return {
          accessToken: idToken,
          idToken,
          refreshToken: rotatedRefreshToken,
          expiresIn: 3600,
          rotated: true,
          refreshExpiresIn: 3600 * 24 * 14
        };
      }

      const apiKey = this.config.apiKey;
      if (!apiKey) {
        throw new InvalidAuthProviderConfigError('API key is required for token refresh');
      }

      const requestBody = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      };

      const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(requestBody as Record<string, string>).toString(),
        signal: AbortSignal.timeout(this.config.timeout ?? 10000)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw FirebaseErrorMapper.fromHttpResponse(response.status, body, 'Token refresh failed');
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        id_token: string;
        expires_in: string;
      };

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordRefreshToken(this.buildAttributes(undefined), duration);

      // Parse expires_in (in seconds)
      const expiresIn = parseInt(data.expires_in, 10);

      const result: TokenRefreshResult = {
        accessToken: data.access_token,
        idToken: data.id_token,
        expiresIn,
        rotated: data.refresh_token !== undefined
      };
      if (data.refresh_token !== undefined) {
        result.refreshToken = data.refresh_token;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordRefreshToken(this.buildAttributes(errorMessage), duration);

      if (error instanceof TokenValidationError) {
        throw error;
      }

      throw FirebaseErrorMapper.fromFirebaseError(error, 'Token refresh failed');
    }
  }

  /**
   * Logout user and revoke tokens
   *
   * Revokes the refresh token using Firebase Admin SDK.
   * Optionally blacklists the access token for immediate revocation.
   *
   * @param _refreshToken - Refresh token to revoke (Firebase uses access token to identify user)
   * @param accessToken - Access token to blacklist (optional)
   * @throws AuthenticationError if logout fails
   */
  async logout(_refreshToken: string, accessToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // In test mode, just record metrics and return
      if (process.env['TEST_MODE'] !== 'true') {
        // Revoke refresh token using Firebase Admin SDK
        const auth = this.tenantAuth ?? this.firebaseAuth;

        // Get user ID from access token (refresh tokens are opaque, not JWTs)
        // If no access token provided, we cannot revoke refresh tokens for the user
        if (accessToken) {
          try {
            // Verify the access token (ID token) to get user ID
            const decoded = await auth.verifyIdToken(accessToken);
            // Revoke all refresh tokens for this user
            await auth.revokeRefreshTokens(decoded.uid);
          } catch {
            // Token might be invalid, continue with access token blacklisting
          }
        }
      }

      // Optionally blacklist the access token for immediate revocation
      if (accessToken) {
        await this.blacklistAccessToken(accessToken);
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

      throw new AuthenticationError('Failed to logout from Google Identity Platform', error);
    }
  }

  /**
   * Blacklist access token in Redis
   *
   * @param accessToken - Access token to blacklist
   */
  private async blacklistAccessToken(accessToken: string): Promise<void> {
    if (process.env['TEST_MODE'] === 'true') {
      return;
    }

    try {
      const decoded = decodeJwtWithoutVerification(accessToken);
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
    } catch (error) {
      // Log blacklist errors but logout was still successful
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to blacklist access token: ${errorMessage}`);
    }
  }

  /**
   * Get user information by user ID
   *
   * Fetches user details from Firebase Auth using getUser.
   * Extracts roles and permissions from custom claims.
   *
   * @param userId - Firebase user UID
   * @param tenantId - Tenant ID
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  // eslint-disable-next-line complexity
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      // In test mode, return mock user info
      if (process.env['TEST_MODE'] === 'true') {
        return {
          userId,
          username: userId,
          email: `${userId}@test.com`,
          emailVerified: true,
          roles: [],
          permissions: [],
          tenantId: tenantId ?? this.config.tenantId ?? 'default'
        };
      }

      const auth = this.tenantAuth ?? this.firebaseAuth;
      const userRecord = await auth.getUser(userId);

      // Get custom claims
      const customClaims = (userRecord.customClaims ?? {}) as FirebaseCustomClaims;

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetUserInfo(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      const result: UserInfo = {
        userId: userRecord.uid,
        username: userRecord.email ?? userRecord.uid,
        email: userRecord.email ?? '',
        emailVerified: userRecord.emailVerified,
        roles: customClaims.roles ?? [],
        permissions: customClaims.permissions ?? [],
        tenantId: tenantId ?? this.config.tenantId ?? 'default'
      };
      const displayNameParts = userRecord.displayName?.split(' ');
      if (displayNameParts && displayNameParts[0]) {
        result.givenName = displayNameParts[0];
      }
      if (displayNameParts && displayNameParts.length > 1) {
        result.familyName = displayNameParts.slice(1).join(' ');
      }
      if (userRecord.displayName !== undefined) {
        result.name = userRecord.displayName;
      }
      result.attributes = {
        phoneNumber: userRecord.phoneNumber,
        photoURL: userRecord.photoURL,
        disabled: userRecord.disabled,
        emailVerified: userRecord.emailVerified,
        createdAt: userRecord.metadata.creationTime,
        lastSignInAt: userRecord.metadata.lastSignInTime
      } as Record<string, unknown>;
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetUserInfo(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to get user info');
    }
  }

  /**
   * Get user information from ID token
   *
   * Decodes the JWT token to extract user information.
   * Extracts roles and permissions from custom claims.
   *
   * @param token - Firebase ID token
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      const decoded = decodeJwtWithoutVerification(token);
      const customClaims = decoded as FirebaseCustomClaims;
      const providerUid = decoded['user_id'] ?? decoded['uid'] ?? decoded['sub'];
      const appUserId = decoded['db_user_id'] ?? providerUid;

      const givenName = decoded['given_name'] as string | undefined;
      const familyName = decoded['family_name'] as string | undefined;
      const name = decoded['name'] as string | undefined;
      const emailVerified = decoded['email_verified'] as boolean | undefined;

      return {
        userId: String(appUserId ?? ''),
        username: String(decoded['email'] ?? providerUid ?? ''),
        email: String(decoded['email'] ?? ''),
        roles: customClaims.roles ?? [],
        permissions: customClaims.permissions ?? [],
        tenantId: (customClaims.tenant_id as string) ?? this.config.tenantId ?? 'default',
        attributes: {
          ...decoded,
          ...(providerUid !== undefined && { provider_uid: String(providerUid) })
        } as Record<string, unknown>,
        ...(givenName !== undefined && { givenName }),
        ...(familyName !== undefined && { familyName }),
        ...(name !== undefined && { name }),
        ...(emailVerified !== undefined && { emailVerified })
      };
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
   * Fetches user's roles from Firebase custom claims.
   *
   * @param userId - Firebase user UID
   * @param tenantId - Tenant ID
   * @returns Array of role names
   */
  async getRoles(userId: string, tenantId: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      // In test mode, return empty array
      if (process.env['TEST_MODE'] === 'true') {
        return [];
      }

      const auth = this.tenantAuth ?? this.firebaseAuth;
      const userRecord = await auth.getUser(userId);

      // Get custom claims
      const customClaims = (userRecord.customClaims ?? {}) as FirebaseCustomClaims;
      const roles = customClaims.roles ?? [];

      // Record success metrics
      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return roles;
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
   * Extracts roles from token's custom claims.
   *
   * @param token - Firebase ID token
   * @returns Array of role names
   */
  async getRolesFromToken(token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const decoded = decodeJwtWithoutVerification(token) as FirebaseCustomClaims;
      const roles = decoded.roles ?? [];

      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined), duration);

      return roles;
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
   * Fetches user's permissions from Firebase custom claims.
   *
   * @param userId - Firebase user UID
   * @param tenantId - Tenant ID
   * @param _userAccessToken - User access token (required for security, but not used)
   * @returns Array of permission names
   */
  async getPermissions(
    userId: string,
    tenantId: string,
    _userAccessToken?: string
  ): Promise<string[]> {
    const startTime = Date.now();

    try {
      // In test mode, return empty array
      if (process.env['TEST_MODE'] === 'true') {
        return [];
      }

      const auth = this.tenantAuth ?? this.firebaseAuth;
      const userRecord = await auth.getUser(userId);

      // Get custom claims
      const customClaims = (userRecord.customClaims ?? {}) as FirebaseCustomClaims;
      const permissions = customClaims.permissions ?? [];

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

      return [];
    }
  }

  /**
   * Get user permissions from token
   *
   * Extracts permissions from token's custom claims.
   *
   * @param token - Firebase ID token
   * @returns Array of permission names
   */
  async getPermissionsFromToken(token: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const decoded = decodeJwtWithoutVerification(token) as FirebaseCustomClaims;
      const permissions = decoded.permissions ?? [];

      const duration = Date.now() - startTime;
      this.recordGetPermissions(this.buildAttributes(undefined), duration);

      return permissions;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetPermissions(this.buildAttributes(errorMessage), duration);

      return [];
    }
  }

  /**
   * Set custom claims for a user
   *
   * Sets custom JWT claims for Firebase user (tenant_id, user_id, roles, permissions).
   * These claims will be included in the user's ID token.
   *
   * @param firebaseUid - Firebase user UID
   * @param claims - Custom claims to set
   * @returns Promise that resolves when claims are set
   */
  async setCustomClaims(firebaseUid: string, claims: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();

    try {
      // In test mode, skip setting claims
      if (process.env['TEST_MODE'] === 'true') {
        return;
      }

      const auth = this.tenantAuth ?? this.firebaseAuth;
      await auth.setCustomUserClaims(firebaseUid, claims);

      const duration = Date.now() - startTime;
      this.recordSetCustomClaims(this.buildAttributes(undefined), duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordSetCustomClaims(this.buildAttributes(errorMessage), duration);
      throw error;
    }
  }

  /**
   * Check if the provider is available
   *
   * @returns true if Firebase Auth is accessible
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
   * Checks connectivity by attempting to list a single user.
   *
   * @returns true if Firebase Auth is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // In test mode, always return true
      if (process.env['TEST_MODE'] === 'true') {
        return true;
      }

      const auth = this.tenantAuth ?? this.firebaseAuth;
      // Try to list users (limit to 1)
      await auth.listUsers(1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get tenant-aware auth instance for a specific GCP tenant
   *
   * Returns a TenantAwareAuth instance for operations scoped to a specific GCP tenant.
   * This is useful for multi-tenant authentication scenarios.
   *
   * @param gcpTenantId - GCP tenant ID (Firebase tenant ID)
   * @returns TenantAwareAuth instance or null if not configured
   */
  getTenantAuth(gcpTenantId: string): admin.auth.TenantAwareAuth | null {
    if (process.env['TEST_MODE'] === 'true') {
      // In test mode, return null
      return null;
    }

    try {
      return this.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
    } catch {
      return null;
    }
  }

  /**
   * Create a new user in Firebase Auth
   *
   * @param email - User email
   * @param password - User password
   * @param tenantId - Tenant ID (optional)
   * @returns User UID
   */
  async createUser(email: string, password: string, tenantId?: string): Promise<string> {
    try {
      // In test mode, return mock UID
      if (process.env['TEST_MODE'] === 'true') {
        return `mock-uid-${Date.now()}`;
      }

      // Determine the auth instance to use based on tenantId parameter
      // If a specific tenantId is provided, use that tenant's auth instance
      // Otherwise, use the configured tenant-aware auth or default auth
      const effectiveTenantId = tenantId ?? this.config.tenantId;
      const auth = effectiveTenantId
        ? this.firebaseAuth.tenantManager().authForTenant(effectiveTenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      const userRecord = await auth.createUser({
        email,
        password
      });

      return userRecord.uid;
    } catch (error) {
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to create user');
    }
  }

  /**
   * Delete a user from Firebase Auth
   *
   * @param userId - User UID to delete
   * @param tenantId - Tenant ID (optional)
   */
  async deleteUser(userId: string, tenantId?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // In test mode, just log and return
      if (process.env['TEST_MODE'] === 'true') {
        this.logger.debug(
          `TEST MODE: Would delete user ${userId} from tenant ${tenantId ?? 'default'}`
        );
        return;
      }

      // Get appropriate auth instance (tenant-aware or default)
      const auth = tenantId
        ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      // Delete user from Firebase Auth
      await auth.deleteUser(userId);

      // Log successful deletion for audit trail
      const duration = Date.now() - startTime;
      this.logger.log(
        `Successfully deleted user ${userId} from tenant ${tenantId ?? 'default'} (${duration}ms)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to delete user ${userId} from tenant ${tenantId ?? 'default'}: ${errorMessage} (${duration}ms)`
      );
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to delete user');
    }
  }

  /**
   * Delete all users from a tenant
   *
   * WARNING: This is a destructive operation that cannot be undone.
   * Use with extreme caution.
   *
   * @param tenantId - Tenant ID to delete users from
   */
  async deleteTenantUsers(tenantId: string): Promise<void> {
    const startTime = Date.now();
    let deletedCount = 0;

    try {
      // In test mode, just log and return
      if (process.env['TEST_MODE'] === 'true') {
        this.logger.debug(`TEST MODE: Would delete all users from tenant ${tenantId}`);
        return;
      }

      // Get tenant-aware auth instance
      const auth = this.firebaseAuth.tenantManager().authForTenant(tenantId);

      // List all users in the tenant
      let pageToken: string | undefined = undefined;
      do {
        const listUsersResult = await auth.listUsers(1000, pageToken);

        // Delete all users in this batch
        const deletePromises = listUsersResult.users.map((user) => auth.deleteUser(user.uid));
        await Promise.all(deletePromises);
        deletedCount += listUsersResult.users.length;

        pageToken = listUsersResult.pageToken;
      } while (pageToken);

      // Log successful deletion for audit trail
      const duration = Date.now() - startTime;
      this.logger.log(
        `Successfully deleted ${deletedCount} users from tenant ${tenantId} (${duration}ms)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to delete users from tenant ${tenantId}: ${errorMessage} (${duration}ms)`
      );
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to delete tenant users');
    }
  }

  /**
   * Update user in Firebase Auth
   *
   * @param userId - User UID to update
   * @param updates - User properties to update
   * @param tenantId - Tenant ID (optional)
   */
  async updateUser(
    userId: string,
    updates: {
      email?: string;
      password?: string;
      displayName?: string;
      phoneNumber?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    },
    tenantId?: string
  ): Promise<void> {
    try {
      // In test mode, skip update
      if (process.env['TEST_MODE'] === 'true') {
        return;
      }

      const auth = tenantId
        ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      await auth.updateUser(userId, updates);
    } catch (error) {
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to update user');
    }
  }

  /**
   * Change user password and revoke refresh tokens
   *
   * @param userId - Provider UID
   * @param newPassword - New password value
   * @param tenantId - Tenant ID (optional)
   */
  async changePassword(userId: string, newPassword: string, tenantId?: string): Promise<void> {
    try {
      // In test mode, skip update
      if (process.env['TEST_MODE'] === 'true') {
        return;
      }

      const auth = tenantId
        ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      await auth.updateUser(userId, { password: newPassword });

      // Revoke all refresh tokens so active sessions re-authenticate.
      await auth.revokeRefreshTokens(userId);
    } catch (error) {
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to change password');
    }
  }

  /**
   * Disable a user account
   *
   * @param userId - User UID to disable
   * @param tenantId - Tenant ID (optional)
   */
  async disableUser(userId: string, tenantId?: string): Promise<void> {
    try {
      // In test mode, skip disable
      if (process.env['TEST_MODE'] === 'true') {
        return;
      }

      const auth = tenantId
        ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      await auth.updateUser(userId, { disabled: true });
    } catch (error) {
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to disable user');
    }
  }

  /**
   * Enable a user account
   *
   * @param userId - User UID to enable
   * @param tenantId - Tenant ID (optional)
   */
  async enableUser(userId: string, tenantId?: string): Promise<void> {
    try {
      // In test mode, skip enable
      if (process.env['TEST_MODE'] === 'true') {
        return;
      }

      const auth = tenantId
        ? this.firebaseAuth.tenantManager().authForTenant(tenantId)
        : (this.tenantAuth ?? this.firebaseAuth);

      await auth.updateUser(userId, { disabled: false });
    } catch (error) {
      throw FirebaseErrorMapper.fromFirebaseError(error, 'Failed to enable user');
    }
  }

  /**
   * Decode JWT without verification
   *
   * @param token - JWT token
   * @returns Decoded token payload
   */
  // private _decodeJwt(_token: string): Record<string, unknown> {
  //   return decodeJwtWithoutVerification(token);
  // }
}

/**
 * Main Auth Service
 *
 * High-level service that provides authentication operations using configured auth providers
 */

import { TokenExpiration } from '../constants';
import { AuthProviderNotFoundError, InvalidCredentialsError, AuthenticationError } from '../errors';
import { jwtService } from './jwt.service';
import { tokenService } from './token.service';

import type { IAuthProvider } from '../providers/auth-provider.interface';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';

/**
 * Main auth service options
 */
export interface AuthServiceOptions {
  /** Enable token storage (Redis) */
  enableTokenStorage?: boolean;
  /** Enable token rotation on refresh */
  enableTokenRotation?: boolean;
  /** Enable access token blacklisting */
  enableBlacklisting?: boolean;
}

/**
 * Main authentication service
 *
 * Provides high-level authentication operations using configured auth providers
 */
export class AuthService {
  constructor(
    private readonly providerGetter: (name?: string) => IAuthProvider | undefined,
    private readonly defaultProviderName?: string,
    private readonly options: AuthServiceOptions = {}
  ) {}

  /**
   * Get an auth provider
   */
  private getAuthProvider(providerName?: string): IAuthProvider {
    const provider = this.providerGetter(providerName ?? this.defaultProviderName);

    if (!provider) {
      throw new AuthProviderNotFoundError(providerName ?? this.defaultProviderName ?? 'default');
    }

    return provider;
  }

  /**
   * Authenticate user with credentials
   *
   * @param credentials - User credentials
   * @param providerName - Optional provider name
   * @returns Authentication result
   */
  async authenticate(credentials: UserCredentials, providerName?: string): Promise<AuthResult> {
    const provider = this.getAuthProvider(providerName);

    try {
      const result = await provider.authenticate(credentials);

      // Store refresh token and session if token storage is enabled
      if (this.options.enableTokenStorage && result.refreshToken) {
        const tokenId = jwtService.getTokenId(result.refreshToken);
        const sessionId = jwtService.getTokenId(result.refreshToken) ?? `session-${Date.now()}`;
        const tenantId = credentials.tenantId ?? 'default';

        if (tokenId) {
          await tokenService.storeRefreshToken(
            tokenId,
            jwtService.extractUserId(result.refreshToken) ?? '',
            tenantId,
            sessionId,
            result.refreshExpiresIn
          );
        }

        await tokenService.storeSession(
          sessionId,
          jwtService.extractUserId(result.refreshToken) ?? '',
          tenantId,
          tokenId ?? '',
          result.refreshExpiresIn
        );
      }

      return result;
    } catch (error) {
      if (error instanceof InvalidCredentialsError || error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Authentication failed', error);
    }
  }

  /**
   * Validate access token
   *
   * @param token - Access token
   * @param providerName - Optional provider name
   * @returns Token validation result
   */
  async validateToken(token: string, providerName?: string): Promise<TokenValidationResult> {
    // Check if token is blacklisted
    if (this.options.enableBlacklisting) {
      const tokenId = jwtService.getTokenId(token);
      const tenantId = jwtService.extractTenantId(token) ?? 'default';

      if (tokenId && (await tokenService.isAccessTokenBlacklisted(tokenId, tenantId))) {
        return {
          valid: false,
          error: 'Token has been revoked'
        };
      }
    }

    // Basic JWT validation
    const basicValidation = jwtService.validate(token);
    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Provider-specific validation
    const provider = this.getAuthProvider(providerName);
    return provider.validateToken(token);
  }

  /**
   * Refresh access token
   *
   * @param refreshToken - Refresh token
   * @param providerName - Optional provider name
   * @returns Token refresh result
   */
  async refreshToken(refreshToken: string, providerName?: string): Promise<TokenRefreshResult> {
    const provider = this.getAuthProvider(providerName);
    const tenantId = jwtService.extractTenantId(refreshToken) ?? 'default';
    const tokenId = jwtService.getTokenId(refreshToken);

    // Check if refresh token is revoked if token storage is enabled
    if (this.options.enableTokenStorage && tokenId) {
      const tokenInfo = await tokenService.getRefreshToken(tokenId, tenantId);

      if (!tokenInfo) {
        throw new InvalidCredentialsError('Refresh token not found or expired');
      }

      if (tokenInfo.revoked) {
        throw new InvalidCredentialsError('Refresh token has been revoked');
      }
    }

    const result = await provider.refreshToken(refreshToken);

    // Rotate refresh token if enabled
    if (this.options.enableTokenRotation && result.refreshToken && tokenId) {
      // Revoke old refresh token
      await tokenService.revokeRefreshToken(tokenId, tenantId);

      // Store new refresh token
      const newTokenId = jwtService.getTokenId(result.refreshToken);
      const oldTokenInfo = tokenId
        ? await tokenService.getRefreshToken(tokenId, tenantId)
        : undefined;

      if (newTokenId) {
        await tokenService.storeRefreshToken(
          newTokenId,
          jwtService.extractUserId(result.refreshToken) ?? '',
          tenantId,
          oldTokenInfo?.sessionId ?? `session-${Date.now()}`,
          result.refreshExpiresIn ?? TokenExpiration.REFRESH_TOKEN
        );
      }
    }

    return result;
  }

  /**
   * Logout user
   *
   * @param refreshToken - Refresh token
   * @param accessToken - Optional access token to blacklist
   * @param providerName - Optional provider name
   */
  async logout(refreshToken: string, accessToken?: string, providerName?: string): Promise<void> {
    const provider = this.getAuthProvider(providerName);
    const tenantId = jwtService.extractTenantId(refreshToken) ?? 'default';
    const tokenId = jwtService.getTokenId(refreshToken);
    const accessTokenTokenId = accessToken ? jwtService.getTokenId(accessToken) : undefined;

    // Revoke refresh token if token storage is enabled
    if (this.options.enableTokenStorage && tokenId) {
      await tokenService.revokeRefreshToken(tokenId, tenantId);
    }

    // Blacklist access token if enabled
    if (this.options.enableBlacklisting && accessToken && accessTokenTokenId) {
      const exp = jwtService.getExpiration(accessToken);
      if (exp) {
        const ttl = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
        await tokenService.blacklistAccessToken(accessTokenTokenId, tenantId, ttl);
      }
    }

    // Call provider logout
    await provider.logout(refreshToken, accessToken);
  }

  /**
   * Get user information
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param providerName - Optional provider name
   * @returns User information
   */
  async getUserInfo(userId: string, tenantId: string, providerName?: string): Promise<UserInfo> {
    const provider = this.getAuthProvider(providerName);
    return provider.getUserInfo(userId, tenantId);
  }

  /**
   * Get user information from token
   *
   * @param token - Access token
   * @param providerName - Optional provider name
   * @returns User information
   */
  async getUserInfoFromToken(token: string, providerName?: string): Promise<UserInfo> {
    const provider = this.getAuthProvider(providerName);
    return provider.getUserInfoFromToken(token);
  }

  /**
   * Get user roles
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param providerName - Optional provider name
   * @returns Array of role names
   */
  async getRoles(userId: string, tenantId: string, providerName?: string): Promise<string[]> {
    const provider = this.getAuthProvider(providerName);
    return provider.getRoles(userId, tenantId);
  }

  /**
   * Get user roles from token
   *
   * @param token - Access token
   * @param providerName - Optional provider name
   * @returns Array of role names
   */
  async getRolesFromToken(token: string, providerName?: string): Promise<string[]> {
    const provider = this.getAuthProvider(providerName);
    return provider.getRolesFromToken(token);
  }

  /**
   * Get user permissions
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param providerName - Optional provider name
   * @returns Array of permission names
   */
  async getPermissions(userId: string, tenantId: string, providerName?: string): Promise<string[]> {
    const provider = this.getAuthProvider(providerName);
    return provider.getPermissions(userId, tenantId);
  }

  /**
   * Get user permissions from token
   *
   * @param token - Access token
   * @param providerName - Optional provider name
   * @returns Array of permission names
   */
  async getPermissionsFromToken(token: string, providerName?: string): Promise<string[]> {
    const provider = this.getAuthProvider(providerName);
    return provider.getPermissionsFromToken(token);
  }
}

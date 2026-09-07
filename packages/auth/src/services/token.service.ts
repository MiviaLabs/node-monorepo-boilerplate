/**
 * Token Service
 *
 * Handles token storage, refresh token rotation, and token blacklisting using Redis
 */

import { Injectable, Optional, Scope } from '@nestjs/common';
import { CacheService } from '@package/redis';

import { RedisKeyPrefix, TokenExpiration } from '../constants';
import { SessionNotFoundError, TokenOperationError } from '../errors';

import type { RefreshTokenInfo, SessionInfo } from '../types/auth.types';

/**
 * Token Service for managing refresh tokens and sessions in Redis
 *
 * Injectable service for NestJS DI. Provides methods to store, retrieve,
 * revoke, and manage refresh tokens and user sessions with Redis backing.
 *
 * @example Injecting TokenService in a NestJS service
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { TokenService } from '@package/auth';
 *
 * @Injectable()
 * export class AuthService {
 *   constructor(private readonly tokenService: TokenService) {}
 *
 *   async createSession(userId: string, tenantId: string) {
 *     const tokenId = crypto.randomUUID();
 *     const sessionId = crypto.randomUUID();
 *
 *     await this.tokenService.storeRefreshToken(
 *       tokenId, userId, tenantId, sessionId, 7 * 24 * 60 * 60
 *     );
 *     await this.tokenService.storeSession(
 *       sessionId, userId, tenantId, tokenId, 7 * 24 * 60 * 60
 *     );
 *
 *     return { tokenId, sessionId };
 *   }
 * }
 * ```
 *
 * @example Token refresh flow with rotation
 * ```typescript
 * async refreshTokens(oldTokenId: string, tenantId: string) {
 *   const tokenInfo = await this.tokenService.getRefreshToken(oldTokenId, tenantId);
 *   if (!tokenInfo || tokenInfo.revoked) {
 *     throw new UnauthorizedException('Invalid refresh token');
 *   }
 *
 *   // Revoke old token (rotation)
 *   await this.tokenService.revokeRefreshToken(oldTokenId, tenantId);
 *
 *   // Issue new tokens
 *   const newTokenId = crypto.randomUUID();
 *   await this.tokenService.storeRefreshToken(
 *     newTokenId, tokenInfo.userId, tenantId, tokenInfo.sessionId
 *   );
 *
 *   return { tokenId: newTokenId };
 * }
 * ```
 */
@Injectable({ scope: Scope.DEFAULT })
export class TokenService {
  private cache: CacheService;

  constructor(@Optional() cache?: CacheService) {
    this.cache = cache ?? new CacheService();
  }
  /**
   * Store refresh token in Redis
   *
   * Stores the token with two keys:
   * 1. Primary key: {prefix}:{tenantId}:{tokenId} - for fast lookup with tenantId
   * 2. Lookup key: {prefix}:token-id:{tokenId} - for lookup by tokenId only
   *
   * @param tokenId - Token ID (jti claim)
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param sessionId - Session ID
   * @param expiresIn - Expiration time in seconds
   *
   * @example Storing a refresh token after login
   * ```typescript
   * const tokenId = crypto.randomUUID();
   * const sessionId = crypto.randomUUID();
   *
   * await tokenService.storeRefreshToken(
   *   tokenId,
   *   'user-123',
   *   'tenant-456',
   *   sessionId,
   *   7 * 24 * 60 * 60  // 7 days
   * );
   * ```
   */
  async storeRefreshToken(
    tokenId: string,
    userId: string,
    tenantId: string,
    sessionId: string,
    expiresIn: number = TokenExpiration.REFRESH_TOKEN
  ): Promise<void> {
    try {
      const key = this.getRefreshTokenKey(tokenId, tenantId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiresIn * 1000);

      const tokenInfo: RefreshTokenInfo = {
        tokenId,
        userId,
        tenantId,
        sessionId,
        expiresAt,
        revoked: false
      };

      // Store with tenant-specific key (primary)
      await this.cache.set(key, JSON.stringify(tokenInfo), { ttl: expiresIn });

      // Also store with token-ID-only key for lookup when tenantId is unknown
      const tokenIdKey = this.getRefreshTokenByIdKey(tokenId);
      await this.cache.set(tokenIdKey, JSON.stringify(tokenInfo), { ttl: expiresIn });
    } catch (error) {
      throw new TokenOperationError(
        'store-refresh-token',
        'Failed to store refresh token in Redis',
        error
      );
    }
  }

  /**
   * Get refresh token info from Redis
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID (optional for lookup by tokenId only)
   * @returns Refresh token info or undefined
   *
   * @example Retrieving refresh token for validation
   * ```typescript
   * const tokenInfo = await tokenService.getRefreshToken(tokenId, tenantId);
   *
   * if (!tokenInfo) {
   *   throw new UnauthorizedException('Token not found');
   * }
   *
   * if (tokenInfo.revoked) {
   *   throw new UnauthorizedException('Token has been revoked');
   * }
   *
   * // Token is valid, proceed with refresh
   * ```
   */
  async getRefreshToken(tokenId: string, tenantId?: string): Promise<RefreshTokenInfo | undefined> {
    try {
      // If tenantId is provided, use it directly
      if (tenantId) {
        const key = this.getRefreshTokenKey(tokenId, tenantId);
        // CacheService.get already JSON-parses the stored value
        const tokenInfo = await this.cache.get<RefreshTokenInfo>(key);

        if (!tokenInfo) {
          return undefined;
        }

        return tokenInfo;
      }

      // If no tenantId provided, scan for the token (less efficient but works)
      // This is a fallback for when we only have the tokenId
      const scanPattern = `${RedisKeyPrefix.REFRESH_TOKEN_TOKEN_ID}:${tokenId}`;
      const tokenInfo = await this.cache.get<RefreshTokenInfo>(scanPattern);

      if (!tokenInfo) {
        return undefined;
      }

      return tokenInfo;
    } catch (error) {
      throw new TokenOperationError(
        'get-refresh-token',
        'Failed to retrieve refresh token from Redis',
        error
      );
    }
  }

  /**
   * Revoke refresh token
   *
   * Marks the token as revoked without deleting it. The token remains in Redis
   * until its original expiration time, allowing detection of revoked tokens.
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID
   *
   * @example Revoking token during logout
   * ```typescript
   * async logout(tokenId: string, tenantId: string) {
   *   await tokenService.revokeRefreshToken(tokenId, tenantId);
   *   // Token is now marked as revoked
   * }
   * ```
   *
   * @example Token rotation (revoke old, issue new)
   * ```typescript
   * async rotateToken(oldTokenId: string, tenantId: string, userId: string, sessionId: string) {
   *   // Revoke old token
   *   await tokenService.revokeRefreshToken(oldTokenId, tenantId);
   *
   *   // Issue new token
   *   const newTokenId = crypto.randomUUID();
   *   await tokenService.storeRefreshToken(newTokenId, userId, tenantId, sessionId);
   *
   *   return newTokenId;
   * }
   * ```
   */
  async revokeRefreshToken(tokenId: string, tenantId: string): Promise<void> {
    try {
      const key = this.getRefreshTokenKey(tokenId, tenantId);
      // CacheService.get already JSON-parses the stored value
      const tokenInfo = await this.cache.get<RefreshTokenInfo>(key);

      if (tokenInfo) {
        tokenInfo.revoked = true;

        // Calculate remaining TTL from expiresAt to prevent cache bloat
        const expiresAt = new Date(tokenInfo.expiresAt);
        const remainingTtl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

        // Only store if there's remaining TTL (token not yet expired)
        if (remainingTtl > 0) {
          await this.cache.set(key, JSON.stringify(tokenInfo), { ttl: remainingTtl });

          // Also update the token-ID-only key with same TTL
          const tokenIdKey = this.getRefreshTokenByIdKey(tokenId);
          await this.cache.set(tokenIdKey, JSON.stringify(tokenInfo), { ttl: remainingTtl });
        } else {
          // Token already expired, just delete both keys
          await this.cache.delete(key);
          const tokenIdKey = this.getRefreshTokenByIdKey(tokenId);
          await this.cache.delete(tokenIdKey);
        }
      }
    } catch (error) {
      throw new TokenOperationError(
        'revoke-refresh-token',
        'Failed to revoke refresh token',
        error
      );
    }
  }

  /**
   * Delete refresh token
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID
   */
  async deleteRefreshToken(tokenId: string, tenantId: string): Promise<void> {
    try {
      const key = this.getRefreshTokenKey(tokenId, tenantId);
      await this.cache.delete(key);

      // Also delete the token-ID-only key
      const tokenIdKey = this.getRefreshTokenByIdKey(tokenId);
      await this.cache.delete(tokenIdKey);
    } catch (error) {
      throw new TokenOperationError(
        'delete-refresh-token',
        'Failed to delete refresh token from Redis',
        error
      );
    }
  }

  /**
   * Store session in Redis
   *
   * @param sessionId - Session ID
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param tokenId - Token ID (jti claim)
   * @param expiresIn - Expiration time in seconds
   */
  async storeSession(
    sessionId: string,
    userId: string,
    tenantId: string,
    tokenId: string,
    expiresIn: number = TokenExpiration.REFRESH_TOKEN
  ): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId, tenantId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiresIn * 1000);

      const sessionInfo: SessionInfo = {
        sessionId,
        userId,
        tenantId,
        tokenId,
        createdAt: now,
        expiresAt,
        lastActivity: now,
        active: true
      };

      await this.cache.set(key, JSON.stringify(sessionInfo), { ttl: expiresIn });
    } catch (error) {
      throw new TokenOperationError('store-session', 'Failed to store session in Redis', error);
    }
  }

  /**
   * Get session from Redis
   *
   * @param sessionId - Session ID
   * @param tenantId - Tenant ID
   * @returns Session info
   * @throws {SessionNotFoundError} When session not found
   *
   * @example Retrieving session for validation
   * ```typescript
   * try {
   *   const session = await tokenService.getSession(sessionId, tenantId);
   *
   *   if (!session.active) {
   *     throw new UnauthorizedException('Session has been invalidated');
   *   }
   *
   *   return session;
   * } catch (error) {
   *   if (error instanceof SessionNotFoundError) {
   *     throw new UnauthorizedException('Session expired');
   *   }
   *   throw error;
   * }
   * ```
   */
  async getSession(sessionId: string, tenantId: string): Promise<SessionInfo> {
    try {
      const key = this.getSessionKey(sessionId, tenantId);
      // CacheService.get already JSON-parses the stored value
      const session = await this.cache.get<SessionInfo>(key);

      if (!session) {
        throw new SessionNotFoundError(sessionId);
      }

      return session;
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw error;
      }
      throw new TokenOperationError('get-session', 'Failed to retrieve session from Redis', error);
    }
  }

  /**
   * Update session activity timestamp.
   *
   * Updates the `lastActivity` timestamp on the session while preserving the original
   * expiration time. If the session has already expired (remainingTtl <= 0), the stale
   * session key is silently deleted from the cache and no update occurs.
   *
   * @remarks
   * Callers should be aware that this method does not provide feedback when a session
   * has expired and been cleaned up. If the session no longer exists after calling this
   * method, it may have been expired and deleted. Use {@link getSession} to verify
   * session state if needed.
   *
   * @param sessionId - Session ID
   * @param tenantId - Tenant ID
   */
  async updateSessionActivity(sessionId: string, tenantId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId, tenantId);
      // CacheService.get already JSON-parses the stored value
      const session = await this.cache.get<SessionInfo>(key);

      if (session) {
        session.lastActivity = new Date();

        // Calculate remaining TTL from expiresAt to preserve original expiration
        const expiresAt = new Date(session.expiresAt);
        const remainingTtl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

        // Only update if session hasn't expired
        if (remainingTtl > 0) {
          await this.cache.set(key, JSON.stringify(session), { ttl: remainingTtl });
        } else {
          // Session has expired, clean up the stale key
          await this.cache.delete(key);
        }
      }
    } catch (error) {
      throw new TokenOperationError(
        'update-session-activity',
        'Failed to update session activity',
        error
      );
    }
  }

  /**
   * Invalidate session by marking it as inactive.
   *
   * Sets the session's `active` flag to false while preserving the original expiration time.
   * If the session has already expired (remainingTtl <= 0), the stale session key is
   * silently deleted from the cache instead of being updated.
   *
   * @remarks
   * This method succeeds silently regardless of whether the session existed or was already
   * expired. If you need to verify the session was actually invalidated, use {@link getSession}
   * afterward to check its state.
   *
   * @param sessionId - Session ID
   * @param tenantId - Tenant ID
   */
  async invalidateSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId, tenantId);
      // CacheService.get already JSON-parses the stored value
      const session = await this.cache.get<SessionInfo>(key);

      if (session) {
        session.active = false;

        // Calculate remaining TTL from expiresAt to preserve original expiration
        const expiresAt = new Date(session.expiresAt);
        const remainingTtl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

        // Only update if session hasn't expired
        if (remainingTtl > 0) {
          await this.cache.set(key, JSON.stringify(session), { ttl: remainingTtl });
        } else {
          // Session already expired, just delete it
          await this.cache.delete(key);
        }
      }
    } catch (error) {
      throw new TokenOperationError('invalidate-session', 'Failed to invalidate session', error);
    }
  }

  /**
   * Delete session
   *
   * @param sessionId - Session ID
   * @param tenantId - Tenant ID
   */
  async deleteSession(sessionId: string, tenantId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId, tenantId);
      await this.cache.delete(key);
    } catch (error) {
      throw new TokenOperationError('delete-session', 'Failed to delete session from Redis', error);
    }
  }

  /**
   * Blacklist access token
   *
   * Add an access token to the blacklist. Used to immediately invalidate tokens
   * before their natural expiration (e.g., on logout or password change).
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID
   * @param expiresIn - Expiration time in seconds (should match token's remaining TTL)
   *
   * @example Blacklisting token on logout
   * ```typescript
   * async logout(jwtService: JwtService, tokenService: TokenService, token: string) {
   *   const tokenId = jwtService.getTokenId(token);
   *   const tenantId = jwtService.extractTenantId(token);
   *   const expiration = jwtService.getExpiration(token);
   *
   *   if (tokenId && tenantId && expiration) {
   *     const remainingTtl = Math.floor((expiration.getTime() - Date.now()) / 1000);
   *     await tokenService.blacklistAccessToken(tokenId, tenantId, remainingTtl);
   *   }
   * }
   * ```
   */
  async blacklistAccessToken(tokenId: string, tenantId: string, expiresIn: number): Promise<void> {
    try {
      const key = this.getBlacklistKey(tokenId, tenantId);
      await this.cache.set(key, '1', { ttl: expiresIn });
    } catch (error) {
      throw new TokenOperationError(
        'blacklist-token',
        'Failed to blacklist access token in Redis',
        error
      );
    }
  }

  /**
   * Check if access token is blacklisted
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID
   * @returns True if token is blacklisted
   *
   * @example Checking blacklist in authentication middleware
   * ```typescript
   * async validateToken(token: string) {
   *   const tokenId = jwtService.getTokenId(token);
   *   const tenantId = jwtService.extractTenantId(token);
   *
   *   if (tokenId && tenantId) {
   *     const isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, tenantId);
   *     if (isBlacklisted) {
   *       throw new UnauthorizedException('Token has been revoked');
   *     }
   *   }
   *
   *   // Continue with normal validation
   * }
   * ```
   */
  async isAccessTokenBlacklisted(tokenId: string, tenantId: string): Promise<boolean> {
    try {
      const key = this.getBlacklistKey(tokenId, tenantId);
      const result = await this.cache.get<string>(key);
      return result !== null;
    } catch {
      return false; // Assume not blacklisted on error
    }
  }

  /**
   * Generate Redis key for refresh token
   */
  private getRefreshTokenKey(tokenId: string, tenantId: string): string {
    return `${RedisKeyPrefix.REFRESH_TOKEN}:${tenantId}:${tokenId}`;
  }

  /**
   * Generate Redis key for refresh token lookup by tokenId only
   */
  private getRefreshTokenByIdKey(tokenId: string): string {
    return `${RedisKeyPrefix.REFRESH_TOKEN_TOKEN_ID}:${tokenId}`;
  }

  /**
   * Generate Redis key for session
   */
  private getSessionKey(sessionId: string, tenantId: string): string {
    return `${RedisKeyPrefix.SESSION}:${tenantId}:${sessionId}`;
  }

  /**
   * Generate Redis key for blacklisted access token
   */
  private getBlacklistKey(tokenId: string, tenantId: string): string {
    return `${RedisKeyPrefix.ACCESS_TOKEN_BLACKLIST}:${tenantId}:${tokenId}`;
  }
}

/**
 * @deprecated Use dependency injection instead. Global singleton will be removed in future versions.
 * For backward compatibility only - prefer injecting TokenService via constructor.
 */
export const tokenService = new TokenService();

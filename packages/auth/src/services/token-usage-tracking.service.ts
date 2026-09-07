/**
 * Token Usage Tracking Service
 *
 * Tracks token usage to prevent replay attacks.
 * Records IP address, user-agent, and usage timestamps.
 */

import { Injectable, Scope } from '@nestjs/common';
import { CacheService } from '@package/redis';

import { SecurityAlertType, SecurityAlertSeverity } from '../types/auth.types';

import type { TokenUsage, RequestContext, SecurityAlert } from '../types/auth.types';

/**
 * Cache service interface for TokenUsageTrackingService constructor
 *
 * Export this type alias for stable type references when instantiating
 * TokenUsageTrackingService with dependency injection or manual construction.
 */
export type TokenUsageTrackingCacheService = CacheService;

/**
 * Redis key prefix for token usage tracking
 */
const TOKEN_USAGE_PREFIX = 'auth:token-usage';

/**
 * Token Usage Tracking Service
 *
 * Tracks the first use of each token and detects replay attacks
 * when the same token is used from different contexts (IP, user-agent).
 */
@Injectable({ scope: Scope.DEFAULT })
export class TokenUsageTrackingService {
  private cache: CacheService;

  constructor(cache?: CacheService) {
    this.cache = cache ?? new CacheService();
  }

  /**
   * Check if token has been used before and detect replay attacks
   *
   * @param tokenId - Token ID (jti claim)
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param requestContext - Current request context
   * @param tokenExpiresAt - Token expiration timestamp (seconds)
   * @returns Object with isValid flag and optional securityAlert
   */
  async checkTokenUsage(
    tokenId: string,
    tenantId: string,
    userId: string,
    requestContext: RequestContext | undefined,
    tokenExpiresAt: number
  ): Promise<{ isValid: boolean; securityAlert?: SecurityAlert }> {
    // If no request context provided, skip replay detection
    // (backward compatibility for calls without context)
    if (!requestContext || (!requestContext.ip && !requestContext.userAgent)) {
      // Still record the token as used to prevent basic replay
      await this.recordFirstUse(tokenId, tenantId, userId, requestContext, tokenExpiresAt);
      return { isValid: true };
    }

    const key = this.getUsageKey(tokenId, tenantId);
    const existing = await this.cache.get<TokenUsage>(key);

    if (!existing) {
      // First use - record it
      await this.recordFirstUse(tokenId, tenantId, userId, requestContext, tokenExpiresAt);
      return { isValid: true };
    }

    // Token has been used before - check for replay attack
    return this.detectReplayAttack(existing, requestContext, tokenId, tenantId, userId);
  }

  /**
   * Record first use of a token
   */
  private async recordFirstUse(
    tokenId: string,
    tenantId: string,
    userId: string,
    requestContext: RequestContext | undefined,
    tokenExpiresAt: number
  ): Promise<void> {
    const key = this.getUsageKey(tokenId, tenantId);
    const now = Date.now();
    const ttl = Math.max(0, tokenExpiresAt - Math.floor(now / 1000));

    const usage: TokenUsage = {
      tokenId,
      tenantId,
      userId,
      ip: requestContext?.ip ?? null,
      userAgent: requestContext?.userAgent ?? null,
      firstUsedAt: now,
      useCount: 1,
      lastUsedAt: now
    };

    await this.cache.set(key, usage, { ttl });
  }

  /**
   * Detect replay attack by comparing current context with original usage
   */
  private detectReplayAttack(
    existing: TokenUsage,
    currentContext: RequestContext,
    tokenId: string,
    tenantId: string,
    userId: string
  ): { isValid: boolean; securityAlert?: SecurityAlert } {
    const currentIp = currentContext.ip ?? null;
    const currentUserAgent = currentContext.userAgent ?? null;
    const now = Date.now();

    // Check if context differs (potential replay attack)
    const ipDiffers = existing.ip !== null && currentIp !== null && existing.ip !== currentIp;
    const userAgentDiffers =
      existing.userAgent !== null &&
      currentUserAgent !== null &&
      existing.userAgent !== currentUserAgent;

    if (ipDiffers || userAgentDiffers) {
      // Definite replay attack - different IP or user-agent
      const alert: SecurityAlert = {
        type: SecurityAlertType.TOKEN_REPLAY,
        severity: ipDiffers ? SecurityAlertSeverity.CRITICAL : SecurityAlertSeverity.HIGH,
        tenantId,
        userId,
        tokenId,
        message: ipDiffers
          ? `Token replay detected: IP address changed from ${existing.ip} to ${currentIp}`
          : `Token replay detected: User-Agent changed`,
        originalContext: {
          ip: existing.ip,
          userAgent: existing.userAgent,
          firstUsedAt: existing.firstUsedAt
        },
        currentContext: {
          ip: currentIp,
          userAgent: currentUserAgent,
          timestamp: now
        },
        timestamp: now
      };

      return { isValid: false, securityAlert: alert };
    }

    // Same context - allow but log (might be legitimate retry)
    // Increment use count and update last used timestamp
    const updatedUsage: TokenUsage = {
      ...existing,
      useCount: existing.useCount + 1,
      lastUsedAt: now
    };

    const key = this.getUsageKey(tokenId, tenantId);
    const ttl = Math.max(0, existing.firstUsedAt + 3600000 - now); // Max 1 hour from first use
    this.cache.set(key, updatedUsage, { ttl }).catch(() => {
      // Ignore update failures - non-critical
    });

    return { isValid: true };
  }

  /**
   * Get token usage information
   *
   * @param tokenId - Token ID
   * @param tenantId - Tenant ID
   * @returns Token usage info or undefined
   */
  async getTokenUsage(tokenId: string, tenantId: string): Promise<TokenUsage | undefined> {
    const key = this.getUsageKey(tokenId, tenantId);
    const result = await this.cache.get<TokenUsage>(key);
    return result ?? undefined;
  }

  /**
   * Clear token usage (for testing or manual cleanup)
   *
   * @param tokenId - Token ID
   * @param tenantId - Tenant ID
   */
  async clearTokenUsage(tokenId: string, tenantId: string): Promise<void> {
    const key = this.getUsageKey(tokenId, tenantId);
    await this.cache.delete(key);
  }

  /**
   * Build Redis key for token usage
   */
  private getUsageKey(tokenId: string, tenantId: string): string {
    return `${TOKEN_USAGE_PREFIX}:${tenantId}:${tokenId}`;
  }
}

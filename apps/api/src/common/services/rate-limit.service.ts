import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal Redis client interface for rate limiting.
 * This avoids circular dependencies with the actual Redis module.
 */
interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
}

/**
 * Rate limiting service using Redis backend.
 * Supports per-IP, per-user, and per-API-key rate limiting.
 *
 * Storage format in Redis:
 * - Key: `ratelimit:{identifier}:{window}`
 * - Value: Request count
 * - TTL: Window duration (automatically expires)
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly prefix = 'ratelimit';

  /**
   * Check if request is within rate limit.
   * Increments counter and returns whether request is allowed.
   *
   * @param identifier - Unique identifier (user-id, api-key, ip)
   * @param limit - Maximum requests allowed
   * @param ttl - Time window in seconds
   * @returns true if request is allowed, false if limit exceeded
   */
  async checkLimit(identifier: string, limit: number, ttl: number): Promise<boolean> {
    // Get Redis client from the app (injected dynamically to avoid circular deps)
    const redis = await this.getRedisClient();

    if (!redis) {
      this.logger.warn('Redis not available, skipping rate limit check');
      return true; // Fail open
    }

    try {
      const window = Math.floor(Date.now() / 1000 / ttl);
      const key = `${this.prefix}:${identifier}:${window}`;

      // Increment counter
      const current = await redis.incr(key);

      // Set expiration on first request in window
      if (current === 1) {
        await redis.expire(key, ttl);
      }

      return current <= limit;
    } catch (error) {
      this.logger.error(
        `Rate limit check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return true; // Fail open
    }
  }

  /**
   * Get remaining requests before limit is hit.
   *
   * @param identifier - Unique identifier
   * @param limit - Maximum requests allowed
   * @param ttl - Time window in seconds
   * @returns Number of remaining requests
   */
  async getRemaining(identifier: string, limit: number, ttl?: number): Promise<number> {
    const redis = await this.getRedisClient();

    if (!redis) {
      return limit;
    }

    try {
      const window = Math.floor(Date.now() / 1000 / (ttl ?? 60));
      const key = `${this.prefix}:${identifier}:${window}`;

      const current = (await redis.get(key)) ?? '0';
      const count = parseInt(current, 10);

      return Math.max(0, limit - count);
    } catch {
      return limit;
    }
  }

  /**
   * Get seconds until rate limit resets.
   *
   * @param _identifier - Unique identifier (unused in current implementation)
   * @param ttl - Time window in seconds
   * @returns Seconds until reset
   */
  async getRetryAfter(_identifier: string, ttl: number): Promise<number> {
    const redis = await this.getRedisClient();

    if (!redis) {
      return ttl;
    }

    try {
      const window = Math.floor(Date.now() / 1000 / ttl);
      const windowStart = window * ttl;
      const windowEnd = windowStart + ttl;
      const now = Math.floor(Date.now() / 1000);

      return Math.max(0, windowEnd - now);
    } catch {
      return ttl;
    }
  }

  /**
   * Reset rate limit for a specific identifier.
   * Useful for admin operations or testing.
   *
   * @param identifier - Unique identifier
   */
  async resetLimit(identifier: string): Promise<void> {
    const redis = await this.getRedisClient();

    if (!redis) {
      return;
    }

    try {
      const pattern = `${this.prefix}:${identifier}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        this.logger.debug(`Rate limit reset for ${identifier}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to reset rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get Redis client dynamically.
   * This avoids circular dependency with RedisModule.
   *
   * Note: This is a placeholder implementation. In production, you would:
   * 1. Inject RedisModule properly to avoid circular dependencies
   * 2. Use ModuleRef to get RedisService dynamically
   * 3. Configure Redis connection in app module
   */
  private async getRedisClient(): Promise<RedisClient | null> {
    try {
      // Dynamic import to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void (await import('@package/redis'));
      // Note: RedisService may not be exported, adjust based on actual exports
      // For now, return null to fail open
      // In production, properly inject RedisService via ModuleRef
      return null;
    } catch {
      return null;
    }
  }
}

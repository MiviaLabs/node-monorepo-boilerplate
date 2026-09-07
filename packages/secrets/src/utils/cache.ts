/**
 * Simple in-memory cache with TTL support
 *
 * Provides a lightweight caching mechanism for frequently accessed secrets.
 * Automatically expires entries based on TTL (time-to-live).
 */

/**
 * Cache entry with value and expiration time
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Expiration timestamp (milliseconds since epoch) */
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttl?: number;
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
}

/**
 * Simple in-memory cache with TTL support
 *
 * @example
 * ```typescript
 * const cache = new Cache<string>({ ttl: 60000 }); // 1 minute TTL
 * cache.set('key', 'value');
 * const value = cache.get('key'); // Returns 'value'
 * ```
 */
export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly ttl: number;
  private readonly maxSize: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.ttl = options.ttl ?? 300000; // 5 minutes default
    this.maxSize = options.maxSize ?? 1000;

    // Periodic cleanup of expired entries (every minute)
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);

    // Do not keep the process alive just for cache maintenance.
    this.cleanupTimer.unref?.();
  }

  /**
   * Set a value in the cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: string, value: T): void {
    // Remove oldest entry if max size exceeded
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Calculate expiration time
    const expiresAt = Date.now() + this.ttl;

    // Store value with expiration
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Get a value from the cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Check if a key exists in the cache and is not expired
   *
   * @param key - Cache key
   * @returns True if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a value from the cache
   *
   * @param key - Cache key
   * @returns True if key was deleted, false if it didn't exist
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache
   *
   * @returns Number of entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries from the cache
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Destroy the cache and stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   *
   * @returns Object with cache statistics
   */
  getStats(): { size: number; ttl: number; maxSize: number } {
    return {
      size: this.cache.size,
      ttl: this.ttl,
      maxSize: this.maxSize
    };
  }
}

/**
 * Create a cache key with a prefix
 *
 * @param prefix - Key prefix (e.g., 'secret', 'encryption')
 * @param key - Cache key
 * @returns Formatted cache key
 *
 * @example
 * ```typescript
 * const key = createCacheKey('secret', 'my-secret');
 * // Returns: 'secret:my-secret'
 * ```
 */
export function createCacheKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

/**
 * Parse a cache key to extract the prefix and key
 *
 * @param cacheKey - Cache key to parse
 * @returns Object with prefix and key
 *
 * @example
 * ```typescript
 * const { prefix, key } = parseCacheKey('secret:my-secret');
 * // Returns: { prefix: 'secret', key: 'my-secret' }
 * ```
 */
export function parseCacheKey(cacheKey: string): { prefix: string; key: string } {
  const separatorIndex = cacheKey.indexOf(':');
  if (separatorIndex === -1) {
    return { prefix: '', key: cacheKey };
  }

  return {
    prefix: cacheKey.substring(0, separatorIndex),
    key: cacheKey.substring(separatorIndex + 1)
  };
}

import { randomUUID } from 'node:crypto';
import { getRedisClient } from './client';
import { traceCacheOperation } from './telemetry';

/**
 * Cache operation options
 */
export interface CacheOptions {
  /**
   * Time to live in seconds
   */
  ttl?: number;
}

/**
 * Distributed lock options
 */
export interface LockOptions {
  /**
   * Lock timeout in seconds (default: 10)
   * If lock cannot be acquired within this time, returns null
   */
  timeout?: number;

  /**
   * Lock expiry in seconds (default: 30)
   * Auto-releases lock after this time to prevent deadlocks
   */
  expiry?: number;

  /**
   * Retry interval in milliseconds (default: 100)
   * How long to wait between retry attempts
   */
  retryInterval?: number;
}

/**
 * Redis cache service for storing and retrieving data
 *
 * Provides a high-level caching interface with support for:
 * - Automatic JSON serialization/deserialization
 * - TTL-based expiration
 * - Pattern-based invalidation
 * - Get-or-set (cache-aside) pattern
 * - Counter operations
 *
 * @example
 * ```typescript
 * const cache = new CacheService();
 *
 * // Set with TTL
 * await cache.set('user:123', { id: 123, name: 'John' }, { ttl: 300 });
 *
 * // Get
 * const user = await cache.get<{ id: number; name: string }>('user:123');
 *
 * // Cache-aside pattern
 * const value = await cache.getOrSet('expensive:calc', async () => {
 *   return await performExpensiveCalculation();
 * }, { ttl: 600 });
 * ```
 */
export class CacheService {
  private client = getRedisClient();

  /**
   * Retrieves a value from the cache
   *
   * @param key - Cache key
   * @returns Cached value or null if not found
   *
   * @example
   * ```typescript
   * const user = await cache.get<UserType>('user:123');
   * if (user) {
   *   console.log('Cached user:', user);
   * }
   * ```
   */
  async get<T>(key: string): Promise<T | null> {
    return traceCacheOperation('get', key, async () => {
      const value = await this.client.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    });
  }

  /**
   * Stores a value in the cache
   *
   * @param key - Cache key
   * @param value - Value to store (will be JSON serialized if not a string)
   * @param options - Optional cache options (TTL)
   *
   * @example
   * ```typescript
   * await cache.set('user:123', { id: 123, name: 'John' }, { ttl: 300 });
   * ```
   */
  async set(key: string, value: unknown, options?: CacheOptions): Promise<void> {
    return traceCacheOperation('set', key, async () => {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (options?.ttl) {
        await this.client.setex(key, options.ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    });
  }

  /**
   * Deletes a single key from the cache
   *
   * @param key - Cache key to delete
   *
   * @example
   * ```typescript
   * await cache.delete('user:123');
   * ```
   */
  async delete(key: string): Promise<void> {
    return traceCacheOperation('delete', key, async () => {
      await this.client.del(key);
    });
  }

  /**
   * Deletes multiple keys from the cache
   *
   * @param keys - Array of cache keys to delete
   *
   * @example
   * ```typescript
   * await cache.deleteMultiple(['user:123', 'user:456', 'user:789']);
   * ```
   */
  async deleteMultiple(keys: string[]): Promise<void> {
    return traceCacheOperation('deleteMultiple', undefined, async () => {
      if (keys.length === 0) return;
      await this.client.del(...keys);
    });
  }

  /**
   * Reads a monotonically increasing version counter used for domain-scoped cache invalidation.
   *
   * Missing or malformed counters resolve to 0 so versioned cache keys are stable on first read.
   */
  async getVersion(key: string): Promise<string> {
    return traceCacheOperation('getVersion', key, async () => {
      const existing = await this.client.get(key);
      if (existing) {
        return existing;
      }

      const initialVersion = randomUUID();
      const result = await this.client.set(key, initialVersion, 'NX');
      if (result === 'OK') {
        return initialVersion;
      }

      const concurrentValue = await this.client.get(key);
      return concurrentValue ?? initialVersion;
    });
  }

  /**
   * Bumps a domain-scoped cache version counter.
   *
   * This is the preferred invalidation primitive for hot-path caches because it avoids wildcard scans.
   */
  async bumpVersion(key: string): Promise<string> {
    return traceCacheOperation('bumpVersion', key, async () => {
      const nextVersion = randomUUID();
      await this.client.set(key, nextVersion);
      return nextVersion;
    });
  }

  /**
   * Invalidates all keys matching a pattern
   *
   * BUG-005: Uses SCAN command instead of KEYS to avoid blocking O(N) operation
   * KEYS command blocks Redis server for large keysets - SCAN iterates incrementally
   *
   * @param pattern - Redis key pattern (supports * and ? wildcards)
   *
   * @example
   * ```typescript
   * // Invalidate all user cache entries
   * await cache.invalidatePattern('user:*');
   *
   * // Invalidate all temp keys
   * await cache.invalidatePattern('temp:*');
   * ```
   */
  async invalidatePattern(pattern: string): Promise<void> {
    let cursor = 0;
    const count = 100; // SCAN batch size

    // BUG-005: Use SCAN for incremental iteration instead of blocking KEYS
    // KEYS command blocks Redis server for large keysets - SCAN iterates incrementally
    // Type assertion for ioredis scan result compatibility
    do {
      const [nextCursor, matchedKeys] = (await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        count
      )) as unknown as [string, string[]];

      cursor = Number(nextCursor);

      if (matchedKeys.length > 0) {
        await this.client.del(...matchedKeys);
      }
    } while (cursor !== 0);
  }

  /**
   * Checks if a key exists in the cache
   *
   * @param key - Cache key to check
   * @returns true if key exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await cache.exists('user:123')) {
   *   console.log('User is cached');
   * }
   * ```
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Implements the cache-aside pattern
   *
   * Returns cached value if present, otherwise executes the factory function,
   * caches the result, and returns it.
   *
   * @param key - Cache key
   * @param factory - Function that generates the value to cache
   * @param options - Optional cache options (TTL)
   * @returns Cached or newly generated value
   *
   * @example
   * ```typescript
   * const user = await cache.getOrSet('user:123', async () => {
   *   return await db.users.findUnique({ where: { id: 123 } });
   * }, { ttl: 300 });
   * ```
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Increments a numeric counter in the cache
   *
   * @param key - Counter key
   * @param by - Amount to increment by (default: 1)
   * @returns New counter value
   *
   * @example
   * ```typescript
   * const views = await cache.increment('page:home:views');
   * const newCount = await cache.increment('counter', 5);
   * ```
   */
  async increment(key: string, by: number = 1): Promise<number> {
    return this.client.incrby(key, by);
  }

  /**
   * Sets a TTL on an existing key
   *
   * @param key - Cache key
   * @param ttl - Time to live in seconds
   *
   * @example
   * ```typescript
   * await cache.expire('user:123', 600); // Expire in 10 minutes
   * ```
   */
  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl);
  }

  /**
   * Gets the remaining TTL of a key
   *
   * @param key - Cache key
   * @returns Remaining TTL in seconds, -1 if key has no expiry, -2 if key doesn't exist
   *
   * @example
   * ```typescript
   * const ttl = await cache.ttl('user:123');
   * if (ttl > 0) {
   *   console.log(`Key expires in ${ttl} seconds`);
   * }
   * ```
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Acquire a distributed lock
   *
   * Uses Redis SET NX (set if not exists) for distributed locking.
   * Returns null if lock cannot be acquired within timeout.
   *
   * @param lockKey - Lock key (e.g., 'lock:register:email@example.com')
   * @param options - Lock options (timeout, expiry, retryInterval)
   * @returns Lock value if acquired, null otherwise
   *
   * @example
   * ```typescript
   * const lockValue = await cache.acquireLock('lock:user:123', { expiry: 30 });
   * if (lockValue) {
   *   try {
   *     // Critical section
   *     await createUser();
   *   } finally {
   *     await cache.releaseLock('lock:user:123', lockValue);
   *   }
   * }
   * ```
   */
  async acquireLock(lockKey: string, options: LockOptions = {}): Promise<string | null> {
    const timeout = options.timeout ?? 10;
    const expiry = options.expiry ?? 30;
    const retryInterval = options.retryInterval ?? 100;

    // BUG-001: Use UUID for guaranteed unique lock values
    // Date.now() + Math.random() is not collision-safe
    const lockValue = randomUUID();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout * 1000) {
      // Try to acquire lock using SET NX (set if not exists)
      // Note: Using ioredis set with options object for NX and EX
      const result = await this.client.set(lockKey, lockValue, 'EX', expiry, 'NX');

      if (result === 'OK') {
        return lockValue;
      }

      // Lock not acquired, wait before retry
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }

    // Timeout reached, lock not acquired
    return null;
  }

  /**
   * Release a distributed lock
   *
   * Only releases the lock if the lock value matches (prevents releasing others' locks).
   * Uses Lua script for atomic check-and-delete.
   *
   * @param lockKey - Lock key
   * @param lockValue - Lock value returned from acquireLock
   * @returns true if lock was released, false otherwise
   *
   * @example
   * ```typescript
   * const lockValue = await cache.acquireLock('lock:user:123');
   * try {
   *   await doCriticalWork();
   * } finally {
   *   await cache.releaseLock('lock:user:123', lockValue);
   * }
   * ```
   */
  async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    const evalFn = (this.client as { eval?: (...args: unknown[]) => Promise<unknown> }).eval;

    if (typeof evalFn !== 'function') {
      const currentValue = await this.client.get(lockKey);
      if (currentValue === lockValue) {
        await this.client.del(lockKey);
        return;
      }

      throw new Error(
        `Lock release failed: value mismatch for key "${lockKey}". ` +
          'This may indicate the lock expired and was acquired by another process.'
      );
    }

    // BUG-001: Throw error if lock release fails (value mismatch)
    // Lua script for atomic check-and-delete
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await evalFn.call(this.client, luaScript, 1, lockKey, lockValue);
    if (result !== 1) {
      throw new Error(
        `Lock release failed: value mismatch for key "${lockKey}". ` +
          'This may indicate the lock expired and was acquired by another process.'
      );
    }
  }

  /**
   * Execute a function with distributed locking
   *
   * Acquires lock, executes function, releases lock (even if function throws).
   * Returns null if lock cannot be acquired.
   *
   * @param lockKey - Lock key
   * @param fn - Function to execute while holding lock
   * @param options - Lock options
   * @returns Result of function or null if lock not acquired
   *
   * @example
   * ```typescript
   * const result = await cache.withLock('lock:user:123', async () => {
   *   return await createOrganization();
   * }, { expiry: 30 });
   * ```
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T | null> {
    const lockValue = await this.acquireLock(lockKey, options);

    if (!lockValue) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }
}

/**
 * @deprecated Use NestJS dependency injection instead. Import CacheService from redis.module.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly cache: CacheService) {}
 * }
 * ```
 */
export const cacheService = new CacheService();

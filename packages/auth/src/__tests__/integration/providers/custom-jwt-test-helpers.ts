/**
 * Shared test helpers for Custom JWT Auth Provider integration tests
 *
 * Provides MockCacheService, test constants, and setup utilities.
 */

import { TokenService } from '../../../services/token.service';

/**
 * In-memory cache implementation for testing
 * Simulates Redis behavior with TTL support and time control
 */
export class MockCacheService {
  private store: Map<string, { value: string; expiresAt: number | null }> = new Map();
  private currentTime: number | null = null;

  /**
   * Get current time (uses internal clock if set, otherwise Date.now())
   */
  now(): number {
    return this.currentTime ?? Date.now();
  }

  /**
   * Set the internal clock to a specific timestamp
   * Use this for deterministic time-based testing
   */
  setNow(timestamp: number): void {
    this.currentTime = timestamp;
  }

  /**
   * Advance the internal clock by the specified milliseconds.
   *
   * If `setNow()` was not previously called, this method will implicitly
   * initialize `currentTime` to `Date.now()` before advancing. For deterministic
   * testing, call `setNow()` first to control the initial timestamp.
   *
   * @param ms - Milliseconds to advance the clock by
   */
  advanceTime(ms: number): void {
    if (this.currentTime === null) {
      this.currentTime = Date.now();
    }
    this.currentTime += ms;
  }

  /**
   * Reset to using real time
   */
  resetTime(): void {
    this.currentTime = null;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check TTL expiration using internal clock
    if (entry.expiresAt !== null && this.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async set(key: string, value: unknown, options?: { ttl?: number }): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const expiresAt = options?.ttl ? this.now() + options.ttl * 1000 : null;
    this.store.set(key, { value: stringValue, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Test helper methods
  clear(): void {
    this.store.clear();
    this.currentTime = null;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && this.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get raw cache entry bypassing TTL checks (for test assertions only)
   *
   * Unlike `get()`, this method returns the raw stored object without checking
   * expiration. Use this to inspect cache internals in tests (e.g., verifying
   * TTL was set correctly). Use `get()` for TTL-checked value retrieval.
   *
   * @returns Raw entry with `{ value: string; expiresAt: number | null }` or undefined
   */
  getEntry(key: string): { value: string; expiresAt: number | null } | undefined {
    return this.store.get(key);
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

// Test constants
export const TEST_JWT_SECRET = 'test-secret-key-for-integration-tests-minimum-32-chars';
export const TEST_TENANT_A = '550e8400-e29b-41d4-a716-446655440001';
export const TEST_TENANT_B = '550e8400-e29b-41d4-a716-446655440002';
export const TEST_USER_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export const TEST_USER_ID_2 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

// Type alias for TokenService cache parameter
export type TokenServiceCacheParam = ConstructorParameters<typeof TokenService>[0];

/**
 * Create a configured TokenService with MockCacheService
 */
export function createTokenServiceWithMockCache(): {
  mockCache: MockCacheService;
  tokenService: TokenService;
} {
  const mockCache = new MockCacheService();
  const tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  return { mockCache, tokenService };
}

/**
 * Inject a cache failure for keys matching a specific pattern.
 *
 * Temporarily overrides the cache's `get` method to throw an error when
 * the key includes the specified pattern. Returns a restore function that
 * must be called to restore the original behavior.
 *
 * @param cache - The MockCacheService instance to inject the failure into
 * @param keyPattern - The pattern to match against cache keys (uses string.includes)
 * @param error - The error to throw when a matching key is accessed
 * @returns A restore function that restores the original cache.get behavior
 *
 * @example
 * ```typescript
 * const restore = injectCacheFailure(
 *   mockCache,
 *   'failing-token-id',
 *   new Error('Simulated cache failure')
 * );
 * try {
 *   // ... run test operations that should fail for matching keys
 * } finally {
 *   restore();
 * }
 * ```
 */
export function injectCacheFailure(
  cache: MockCacheService,
  keyPattern: string,
  error: Error
): () => void {
  const originalGet = cache.get.bind(cache);

  cache.get = async function <T>(key: string): Promise<T | null> {
    if (key.includes(keyPattern)) {
      throw error;
    }
    return originalGet<T>(key);
  };

  return () => {
    cache.get = originalGet;
  };
}

/**
 * Mock Cache Service for testing
 *
 * This mock prevents Redis connections during testing by providing
 * in-memory implementations of CacheService methods.
 */

/**
 * Mock CacheService class
 */
export class MockCacheService {
  private storage = new Map<string, { value: string; expiry?: number }>();

  /**
   * Set a value in the mock cache
   */
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const expiry = options?.ttl ? Date.now() + options.ttl * 1000 : undefined;
    this.storage.set(key, { value: String(value), expiry });
  }

  /**
   * Get a value from the mock cache
   */
  async get<T>(key: string): Promise<T | null> {
    const item = this.storage.get(key);
    if (!item) {
      return null;
    }

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.storage.delete(key);
      return null;
    }

    return item.value as T;
  }

  /**
   * Delete a value from the mock cache
   */
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * Clear all values from the mock cache
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Check if a key exists in the mock cache
   */
  async exists(key: string): Promise<boolean> {
    const item = this.storage.get(key);
    if (!item) {
      return false;
    }

    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.storage.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all mock data (useful for test cleanup)
   */
  clearMock(): void {
    this.storage.clear();
  }
}

/**
 * Export a singleton instance
 */
export const cacheService = new MockCacheService();

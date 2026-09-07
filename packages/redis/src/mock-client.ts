/**
 * Mock Redis client for testing
 *
 * Simulates Redis operations without external dependencies.
 */

import { MockProvider, type MockProviderOptions } from '@package/core';

/**
 * Mock Redis client options
 */
export interface MockRedisClientOptions extends MockProviderOptions {
  /** Initial data to populate the mock with */
  initialData?: Record<string, string>;
  /** Maximum memory size (in MB) */
  maxMemory?: number;
}

/**
 * Mock Redis client for testing
 *
 * Simulates a Redis client with in-memory storage.
 * Supports latency simulation, failure rates, and health management.
 *
 * @example
 * ```typescript
 * const mock = new MockRedisClient({
 *   latency: 10,
 *   failureRate: 0.05,
 *   initialData: { 'key': 'value' },
 * });
 *
 * await mock.set('test-key', 'test-value');
 * const value = await mock.get('test-key');
 * ```
 */
export class MockRedisClient extends MockProvider {
  private readonly data: Map<string, { value: string; expiry?: number }>;

  constructor(options: MockRedisClientOptions = {}) {
    super(options);
    this.data = new Map();

    // Initialize with data
    if (options.initialData) {
      for (const [key, value] of Object.entries(options.initialData)) {
        this.data.set(key, { value });
      }
    }
  }

  /**
   * Get provider name
   */
  protected getProviderName(): string {
    return 'MockRedisClient';
  }

  /**
   * Validate configuration
   */
  protected validateConfig(): void {
    // No specific validation needed for mock
  }

  /**
   * Get a value
   */
  async get(key: string): Promise<string | null> {
    return this.executeOperation('get', async () => {
      const entry = this.data.get(key);
      if (!entry) return null;

      // Check expiry
      if (entry.expiry && Date.now() > entry.expiry) {
        this.data.delete(key);
        return null;
      }

      return entry.value;
    });
  }

  /**
   * Set a value
   */
  async set(key: string, value: string): Promise<void> {
    return this.executeOperation('set', async () => {
      this.data.set(key, { value });
    });
  }

  /**
   * Set a value with expiry
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    return this.executeOperation('setex', async () => {
      const expiry = Date.now() + seconds * 1000;
      this.data.set(key, { value, expiry });
    });
  }

  /**
   * Delete a key
   */
  async del(...keys: string[]): Promise<number> {
    return this.executeOperation('del', async () => {
      let count = 0;
      for (const key of keys) {
        if (this.data.delete(key)) count++;
      }
      return count;
    });
  }

  /**
   * Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    return this.executeOperation('exists', async () => {
      let count = 0;
      for (const key of keys) {
        const entry = this.data.get(key);
        if (entry) {
          // Check expiry
          if (!entry.expiry || Date.now() <= entry.expiry) {
            count++;
          }
        }
      }
      return count;
    });
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.executeOperation('keys', async () => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(this.data.keys()).filter((key) => regex.test(key));
    });
  }

  /**
   * Increment a value
   */
  async incrby(key: string, value: number): Promise<number> {
    return this.executeOperation('incrby', async () => {
      const entry = this.data.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const newValue = current + value;
      this.data.set(key, { value: newValue.toString() });
      return newValue;
    });
  }

  /**
   * Decrement a value
   */
  async decrby(key: string, value: number): Promise<number> {
    return this.executeOperation('decrby', async () => {
      const entry = this.data.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const newValue = current - value;
      this.data.set(key, { value: newValue.toString() });
      return newValue;
    });
  }

  /**
   * Set expiry on a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.executeOperation('expire', async () => {
      const entry = this.data.get(key);
      if (!entry) return 0;

      const expiry = Date.now() + seconds * 1000;
      entry.expiry = expiry;
      return 1;
    });
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    return this.executeOperation('ttl', async () => {
      const entry = this.data.get(key);
      if (!entry) return -2;

      if (!entry.expiry) return -1;

      const remaining = Math.floor((entry.expiry - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    });
  }

  /**
   * Flush all data
   */
  async flushall(): Promise<void> {
    return this.executeOperation('flushall', async () => {
      this.data.clear();
    });
  }

  /**
   * Get all data (for testing)
   */
  getAllData(): Record<string, string> {
    const result: Record<string, string> = {};
    const now = Date.now();

    for (const [key, entry] of this.data.entries()) {
      // Skip expired entries
      if (!entry.expiry || now <= entry.expiry) {
        result[key] = entry.value;
      }
    }

    return result;
  }

  /**
   * Clear all data (for testing)
   */
  clearData(): void {
    this.data.clear();
  }

  /**
   * Get data size (for testing)
   */
  size(): number {
    const now = Date.now();
    let count = 0;

    for (const entry of this.data.values()) {
      if (!entry.expiry || now <= entry.expiry) {
        count++;
      }
    }

    return count;
  }
}

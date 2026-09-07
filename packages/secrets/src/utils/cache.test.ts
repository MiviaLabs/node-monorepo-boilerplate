/**
 * Unit tests for Cache utility
 */

import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { Cache, createCacheKey, parseCacheKey } from './cache';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>({ ttl: 1000, maxSize: 5 });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.get('key1'), 'value1');
    });

    it('should return undefined for non-existent keys', () => {
      assert.strictEqual(cache.get('non-existent'), undefined);
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      assert.strictEqual(cache.get('key1'), 'value2');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortLivedCache = new Cache<string>({ ttl: 100 }); // 100ms TTL
      shortLivedCache.set('key1', 'value1');
      assert.strictEqual(shortLivedCache.get('key1'), 'value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.strictEqual(shortLivedCache.get('key1'), undefined);

      shortLivedCache.destroy();
    });

    it('should not expire entries before TTL', async () => {
      const cache = new Cache<string>({ ttl: 500 }); // 500ms TTL
      cache.set('key1', 'value1');

      // Wait less than TTL
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(cache.get('key1'), 'value1');

      cache.destroy();
    });
  });

  describe('max size', () => {
    it('should evict oldest entries when max size is exceeded', () => {
      const smallCache = new Cache<string>({ ttl: 1000, maxSize: 3 });
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      assert.strictEqual(smallCache.size, 3);

      // Adding a 4th key should evict the first
      smallCache.set('key4', 'value4');
      assert.strictEqual(smallCache.size, 3);
      assert.strictEqual(smallCache.get('key1'), undefined);
      assert.strictEqual(smallCache.get('key4'), 'value4');

      smallCache.destroy();
    });

    it('should not evict entries when updating existing keys', () => {
      const smallCache = new Cache<string>({ ttl: 1000, maxSize: 3 });
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Update existing key
      smallCache.set('key1', 'value1-updated');
      assert.strictEqual(smallCache.size, 3);
      assert.strictEqual(smallCache.get('key1'), 'value1-updated');

      smallCache.destroy();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.has('key1'), true);
    });

    it('should return false for non-existent keys', () => {
      assert.strictEqual(cache.has('non-existent'), false);
    });

    it('should return false for expired keys', async () => {
      const shortLivedCache = new Cache<string>({ ttl: 100 });
      shortLivedCache.set('key1', 'value1');
      assert.strictEqual(shortLivedCache.has('key1'), true);

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.strictEqual(shortLivedCache.has('key1'), false);

      shortLivedCache.destroy();
    });
  });

  describe('delete', () => {
    it('should delete existing keys', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.delete('key1'), true);
      assert.strictEqual(cache.get('key1'), undefined);
    });

    it('should return false for non-existent keys', () => {
      assert.strictEqual(cache.delete('non-existent'), false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      assert.strictEqual(cache.size, 2);

      cache.clear();
      assert.strictEqual(cache.size, 0);
      assert.strictEqual(cache.get('key1'), undefined);
      assert.strictEqual(cache.get('key2'), undefined);
    });
  });

  describe('size', () => {
    it('should return the number of entries', () => {
      assert.strictEqual(cache.size, 0);
      cache.set('key1', 'value1');
      assert.strictEqual(cache.size, 1);
      cache.set('key2', 'value2');
      assert.strictEqual(cache.size, 2);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = cache.getStats();
      assert.strictEqual(typeof stats.size, 'number');
      assert.strictEqual(typeof stats.ttl, 'number');
      assert.strictEqual(typeof stats.maxSize, 'number');
      assert.strictEqual(stats.ttl, 1000);
      assert.strictEqual(stats.maxSize, 5);
    });
  });

  describe('destroy', () => {
    it('should clear all entries and stop cleanup timer', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      assert.strictEqual(cache.size, 2);

      cache.destroy();
      assert.strictEqual(cache.size, 0);
    });
  });

  describe('complex types', () => {
    it('should store complex objects', () => {
      interface TestData {
        name: string;
        value: number;
      }
      const objCache = new Cache<TestData>({ ttl: 1000 });
      const testData: TestData = { name: 'test', value: 42 };

      objCache.set('obj', testData);
      const retrieved = objCache.get('obj');
      assert.deepStrictEqual(retrieved, testData);

      objCache.destroy();
    });

    it('should store arrays', () => {
      const arrayCache = new Cache<number[]>({ ttl: 1000 });
      const testArray = [1, 2, 3, 4, 5];

      arrayCache.set('arr', testArray);
      const retrieved = arrayCache.get('arr');
      assert.deepStrictEqual(retrieved, testArray);

      arrayCache.destroy();
    });
  });
});

describe('createCacheKey', () => {
  it('should create cache key with prefix', () => {
    const key = createCacheKey('secret', 'my-secret');
    assert.strictEqual(key, 'secret:my-secret');
  });

  it('should handle keys with colons', () => {
    const key = createCacheKey('secret', 'my:secret');
    assert.strictEqual(key, 'secret:my:secret');
  });
});

describe('parseCacheKey', () => {
  it('should parse cache key with prefix', () => {
    const { prefix, key } = parseCacheKey('secret:my-secret');
    assert.strictEqual(prefix, 'secret');
    assert.strictEqual(key, 'my-secret');
  });

  it('should handle keys without prefix', () => {
    const { prefix, key } = parseCacheKey('my-secret');
    assert.strictEqual(prefix, '');
    assert.strictEqual(key, 'my-secret');
  });

  it('should handle keys with multiple colons', () => {
    const { prefix, key } = parseCacheKey('secret:my:secret:value');
    assert.strictEqual(prefix, 'secret');
    assert.strictEqual(key, 'my:secret:value');
  });
});

describe('createCacheKey and parseCacheKey roundtrip', () => {
  it('should roundtrip correctly', () => {
    const originalPrefix = 'secret';
    const originalKey = 'my-secret';

    const cacheKey = createCacheKey(originalPrefix, originalKey);
    const { prefix, key } = parseCacheKey(cacheKey);

    assert.strictEqual(prefix, originalPrefix);
    assert.strictEqual(key, originalKey);
  });
});

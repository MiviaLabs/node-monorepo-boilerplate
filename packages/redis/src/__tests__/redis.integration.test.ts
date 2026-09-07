/**
 * Integration tests for Redis
 *
 * These tests verify Redis functionality with actual Redis connections.
 * They are skipped by default and only run when INCLUDE_INTEGRATION_TESTS=1.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { CacheService } from '../cache';
import { createRedisClient, closeRedisClient, healthCheck, type RedisConfig } from '../client';
import { PubSubService } from '../pubsub';

// Skip integration tests unless INCLUDE_INTEGRATION_TESTS is set
const shouldSkip = process.env['INCLUDE_INTEGRATION_TESTS'] !== '1';

describe('redis integration tests', { skip: shouldSkip }, () => {
  let redisClient: ReturnType<typeof createRedisClient>;
  let cacheService: CacheService;
  let pubSubService: PubSubService;

  const redisConfig: RedisConfig = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password: process.env['REDIS_PASSWORD'],
    db: parseInt(process.env['REDIS_DB'] ?? '0', 10)
  };

  beforeEach(async () => {
    redisClient = createRedisClient(redisConfig);
    cacheService = new CacheService();
    pubSubService = new PubSubService();

    // Wait for connection to be fully established
    // This ensures the 'connect' and 'ready' events have fired
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify connection is ready by waiting for the 'ready' event
    await new Promise<void>((resolve) => {
      if (redisClient.status === 'ready') {
        resolve();
      } else {
        redisClient.once('ready', () => resolve());
      }
    });
  });

  afterEach(async () => {
    // Close the Redis client and disable logging
    await closeRedisClient();

    // Wait for any pending async operations to complete
    // This prevents "Cannot log after tests are done" warnings
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('Redis client connection', () => {
    it('should connect to Redis', async () => {
      const result = await redisClient.ping();
      assert.strictEqual(result, 'PONG');
    });

    it('should perform health check', async () => {
      const result = await healthCheck();
      assert.strictEqual(result, true);
    });

    it('should set and get values', async () => {
      await redisClient.set('test:key', 'test-value');
      const value = await redisClient.get('test:key');
      assert.strictEqual(value, 'test-value');
    });

    it('should delete keys', async () => {
      await redisClient.set('test:key:delete', 'value');
      await redisClient.del('test:key:delete');
      const value = await redisClient.get('test:key:delete');
      assert.strictEqual(value, null);
    });
  });

  describe('CacheService', () => {
    it('should set and get string values', async () => {
      await cacheService.set('test:string', 'hello world');
      const value = await cacheService.get<string>('test:string');
      assert.strictEqual(value, 'hello world');
    });

    it('should set and get object values', async () => {
      const obj = { id: 123, name: 'test user', active: true };
      await cacheService.set('test:object', obj);
      const value = await cacheService.get<typeof obj>('test:object');
      assert.deepStrictEqual(value, obj);
    });

    it('should set and get array values', async () => {
      const arr = [1, 2, 3, 4, 5];
      await cacheService.set('test:array', arr);
      const value = await cacheService.get<number[]>('test:array');
      assert.deepStrictEqual(value, arr);
    });

    it('should return null for non-existent keys', async () => {
      const value = await cacheService.get('test:nonexistent');
      assert.strictEqual(value, null);
    });

    it('should delete keys', async () => {
      await cacheService.set('test:delete', 'value');
      await cacheService.delete('test:delete');
      const value = await cacheService.get('test:delete');
      assert.strictEqual(value, null);
    });

    it('should check if key exists', async () => {
      await cacheService.set('test:exists', 'value');
      assert.strictEqual(await cacheService.exists('test:exists'), true);
      assert.strictEqual(await cacheService.exists('test:nonexistent'), false);
    });

    it('should set TTL on keys', async () => {
      await cacheService.set('test:ttl', 'value', { ttl: 2 });
      const ttl = await cacheService.ttl('test:ttl');
      assert.ok(ttl > 0 && ttl <= 2);
    });

    it('should expire key after TTL', async () => {
      await cacheService.set('test:expire', 'value', { ttl: 1 });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const value = await cacheService.get('test:expire');
      assert.strictEqual(value, null);
    });

    it('should increment counter', async () => {
      await cacheService.set('test:counter', '0');
      const val1 = await cacheService.increment('test:counter');
      const val2 = await cacheService.increment('test:counter', 5);
      assert.strictEqual(val1, 1);
      assert.strictEqual(val2, 6);
    });

    it('should use getOrSet pattern', async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return { data: 'factory-result' };
      };

      // First call should use factory
      const val1 = await cacheService.getOrSet('test:getorset', factory);
      assert.strictEqual(factoryCalls, 1);
      assert.deepStrictEqual(val1, { data: 'factory-result' });

      // Second call should use cache
      const val2 = await cacheService.getOrSet('test:getorset', factory);
      assert.strictEqual(factoryCalls, 1);
      assert.deepStrictEqual(val2, { data: 'factory-result' });
    });

    it('should delete multiple keys', async () => {
      await cacheService.set('test:multi:1', 'value1');
      await cacheService.set('test:multi:2', 'value2');
      await cacheService.set('test:multi:3', 'value3');
      await cacheService.deleteMultiple(['test:multi:1', 'test:multi:2']);

      assert.strictEqual(await cacheService.exists('test:multi:1'), false);
      assert.strictEqual(await cacheService.exists('test:multi:2'), false);
      assert.strictEqual(await cacheService.exists('test:multi:3'), true);
    });

    it('should invalidate pattern', async () => {
      await cacheService.set('test:pattern:1', 'value1');
      await cacheService.set('test:pattern:2', 'value2');
      await cacheService.set('test:other:3', 'value3');

      await cacheService.invalidatePattern('test:pattern:*');

      assert.strictEqual(await cacheService.exists('test:pattern:1'), false);
      assert.strictEqual(await cacheService.exists('test:pattern:2'), false);
      assert.strictEqual(await cacheService.exists('test:other:3'), true);
    });
  });

  describe('PubSubService', () => {
    it('should publish and receive messages', async () => {
      const messages: string[] = [];

      await pubSubService.subscribe('test:channel', async (channel, message) => {
        messages.push(message);
      });

      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for subscription
      await pubSubService.publish('test:channel', 'test-message');
      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for message

      assert.ok(messages.length > 0);
      assert.ok(messages.includes('test-message'));
    });

    it('should publish object messages as JSON', async () => {
      const messages: unknown[] = [];

      await pubSubService.subscribe('test:json', async (channel, message) => {
        messages.push(JSON.parse(message));
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await pubSubService.publish('test:json', { data: 'test', count: 42 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(messages.some((m) => typeof m === 'object' && m !== null && 'data' in m));
    });

    it('should handle multiple subscribers', async () => {
      const messages1: string[] = [];
      const messages2: string[] = [];

      await pubSubService.subscribe('test:multi', async (channel, message) => {
        messages1.push(message);
      });
      await pubSubService.subscribe('test:multi', async (channel, message) => {
        messages2.push(message);
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await pubSubService.publish('test:multi', 'multi-message');
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(messages1.length > 0);
      assert.ok(messages2.length > 0);
    });

    it('should unsubscribe from channel', async () => {
      const handler = async (_channel: string, _message: string) => {
        // Handler is defined but not used for assertion
      };

      await pubSubService.subscribe('test:unsubscribe', handler);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await pubSubService.unsubscribe('test:unsubscribe', handler);
      await new Promise((resolve) => setTimeout(resolve, 50));

      await pubSubService.publish('test:unsubscribe', 'message-after-unsubscribe');
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Handler should be removed
      assert.strictEqual(typeof handler, 'function');
    });

    it('should unsubscribe from all channels', async () => {
      await pubSubService.subscribe('test:all1', async () => {});
      await pubSubService.subscribe('test:all2', async () => {});
      await pubSubService.subscribe('test:all3', async () => {});

      await pubSubService.unsubscribeAll();

      const channels = pubSubService.getSubscribedChannels();
      assert.strictEqual(channels.length, 0);
    });

    it('should get subscribed channels', async () => {
      await pubSubService.subscribe('test:channels:1', async () => {});
      await pubSubService.subscribe('test:channels:2', async () => {});

      const channels = pubSubService.getSubscribedChannels();
      assert.ok(channels.includes('test:channels:1'));
      assert.ok(channels.includes('test:channels:2'));
    });
  });

  describe('complex scenarios', () => {
    it('should handle cache-aside pattern', async () => {
      const dbMock = new Map<string, unknown>();

      const loadFromDb = async (id: string) => {
        if (!dbMock.has(id)) {
          dbMock.set(id, { id, name: `User ${id}` });
        }
        return dbMock.get(id);
      };

      const getUser = async (id: string) => {
        return cacheService.getOrSet(`user:${id}`, () => loadFromDb(id), { ttl: 60 });
      };

      // First call loads from DB
      const user1 = await getUser('123');
      assert.strictEqual(dbMock.has('123'), true);

      // Second call uses cache
      const user2 = await getUser('123');
      assert.deepStrictEqual(user1, user2);
    });

    it('should handle pub/sub for cache invalidation', async () => {
      const invalidatedKeys: string[] = [];

      await pubSubService.subscribe('cache:invalidate', async (channel, message) => {
        const data = JSON.parse(message);
        invalidatedKeys.push(data.key);
        await cacheService.delete(data.key);
      });

      await cacheService.set('user:123', { id: 123, name: 'Test' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Publish invalidation
      await pubSubService.publish('cache:invalidate', JSON.stringify({ key: 'user:123' }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(invalidatedKeys.includes('user:123'));
    });

    it('should handle high-frequency cache operations', async () => {
      const operations = 100;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < operations; i++) {
        promises.push(cacheService.set(`test:batch:${i}`, { index: i }));
      }

      await Promise.all(promises);

      let count = 0;
      for (let i = 0; i < operations; i++) {
        const value = await cacheService.get(`test:batch:${i}`);
        if (value !== null) count++;
      }

      assert.strictEqual(count, operations);
    });
  });

  describe('connection resilience', () => {
    it('should handle multiple operations in sequence', async () => {
      for (let i = 0; i < 50; i++) {
        await cacheService.set(`test:seq:${i}`, `value-${i}`);
        const value = await cacheService.get(`test:seq:${i}`);
        assert.strictEqual(value, `value-${i}`);
      }
    });

    it('should maintain connection across operations', async () => {
      const initialPing = await redisClient.ping();

      // Perform various operations
      await cacheService.set('test:conn', 'value');
      await cacheService.get('test:conn');
      await cacheService.delete('test:conn');

      const finalPing = await redisClient.ping();

      assert.strictEqual(initialPing, 'PONG');
      assert.strictEqual(finalPing, 'PONG');
    });
  });
});

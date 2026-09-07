/**
 * Unit tests for client.ts
 *
 * These tests verify client exports and types without actually
 * connecting to Redis. For integration tests with real Redis, see the
 * integration test suite.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  createRedisClient,
  getRedisClient,
  closeRedisClient,
  healthCheck,
  type RedisConfig
} from '../client';

describe('client', () => {
  describe('exports', () => {
    it('should export createRedisClient function', () => {
      assert.strictEqual(typeof createRedisClient, 'function');
    });

    it('should export getRedisClient function', () => {
      assert.strictEqual(typeof getRedisClient, 'function');
    });

    it('should export closeRedisClient function', () => {
      assert.strictEqual(typeof closeRedisClient, 'function');
    });

    it('should export healthCheck function', () => {
      assert.strictEqual(typeof healthCheck, 'function');
    });

    it('should export RedisConfig type', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379
      };
      assert.strictEqual(config.host, 'localhost');
      assert.strictEqual(config.port, 6379);
    });
  });

  describe('RedisConfig', () => {
    it('should accept minimal config', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379
      };

      assert.strictEqual(config.host, 'localhost');
      assert.strictEqual(config.port, 6379);
    });

    it('should accept all optional config properties', () => {
      const config: RedisConfig = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        db: 2,
        maxRetriesPerRequest: 5,
        retryStrategy: (times: number) => times * 100
      };

      assert.strictEqual(config.host, 'redis.example.com');
      assert.strictEqual(config.port, 6380);
      assert.strictEqual(config.password, 'secret');
      assert.strictEqual(config.db, 2);
      assert.strictEqual(config.maxRetriesPerRequest, 5);
      assert.strictEqual(typeof config.retryStrategy, 'function');
    });

    it('should accept config with undefined optional properties', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: undefined,
        maxRetriesPerRequest: undefined,
        retryStrategy: undefined
      };

      assert.strictEqual(config.host, 'localhost');
      assert.strictEqual(config.port, 6379);
    });
  });

  describe('function signatures', () => {
    it('should have createRedisClient with correct signature', () => {
      // createRedisClient(config: RedisConfig): RedisClientType
      assert.strictEqual(typeof createRedisClient, 'function');
    });

    it('should have getRedisClient with correct signature', () => {
      // getRedisClient(): RedisClientType
      assert.strictEqual(typeof getRedisClient, 'function');
    });

    it('should have closeRedisClient with correct signature', () => {
      // closeRedisClient(): Promise<void>
      assert.strictEqual(typeof closeRedisClient, 'function');
    });

    it('should have healthCheck with correct signature', () => {
      // healthCheck(): Promise<boolean>
      assert.strictEqual(typeof healthCheck, 'function');
    });
  });

  describe('retry strategy type', () => {
    it('should accept retry strategy that returns number', () => {
      const strategy: (times: number) => number | undefined = (times: number) => {
        return Math.min(times * 100, 2000);
      };
      assert.strictEqual(typeof strategy, 'function');
    });

    it('should accept retry strategy that returns undefined', () => {
      const strategy: (times: number) => number | undefined = () => {
        return undefined;
      };
      assert.strictEqual(typeof strategy, 'function');
    });
  });

  describe('type definitions', () => {
    it('should have correct type for RedisConfig', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
        password: 'secret',
        db: 0,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => times * 50
      };
      assert.ok(config);
    });

    it('should allow partial RedisConfig', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379
      };
      assert.ok(config);
    });
  });

  describe('mock sorted sets', () => {
    it('supports zadd, zrange, zremrangebyscore, and zrem in TEST_MODE', async () => {
      const client = getRedisClient() as unknown as {
        del: (...keys: string[]) => Promise<number>;
        zadd: (key: string, score: number, member: string) => Promise<number>;
        zrange: (key: string, start: number, stop: number) => Promise<string[]>;
        zremrangebyscore: (
          key: string,
          min: string | number,
          max: string | number
        ) => Promise<number>;
        zrem: (key: string, ...members: string[]) => Promise<number>;
      };
      const key = 'test:sorted-set';

      await client.del(key);
      await client.zadd(key, 20, 'session-b');
      await client.zadd(key, 10, 'session-a');

      assert.deepStrictEqual(await client.zrange(key, 0, -1), ['session-a', 'session-b']);

      assert.strictEqual(await client.zremrangebyscore(key, '-inf', 15), 1);
      assert.deepStrictEqual(await client.zrange(key, 0, -1), ['session-b']);

      assert.strictEqual(await client.zrem(key, 'session-b'), 1);
      assert.deepStrictEqual(await client.zrange(key, 0, -1), []);
    });
  });
});

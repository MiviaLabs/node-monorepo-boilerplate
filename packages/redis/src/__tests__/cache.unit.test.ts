/**
 * Unit tests for cache.ts
 *
 * These tests verify CacheService exports and types without actually
 * connecting to Redis. For integration tests with real Redis, see the
 * integration test suite.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { CacheService, type CacheOptions } from '../cache';

describe('cache', () => {
  describe('exports', () => {
    it('should export CacheService class', () => {
      assert.strictEqual(typeof CacheService, 'function');
    });

    it('should export CacheOptions type', () => {
      const options: CacheOptions = { ttl: 60 };
      assert.strictEqual(options.ttl, 60);
    });
  });

  describe('CacheService', () => {
    it('should be instantiable', () => {
      // Note: We don't actually use the instance to avoid Redis connection
      // We just verify the class can be constructed (which creates MockRedis internally)
      const service = new CacheService();
      assert.ok(service);
      assert.strictEqual(typeof service.get, 'function');
      assert.strictEqual(typeof service.set, 'function');
      assert.strictEqual(typeof service.delete, 'function');
      assert.strictEqual(typeof service.deleteMultiple, 'function');
      assert.strictEqual(typeof service.getVersion, 'function');
      assert.strictEqual(typeof service.bumpVersion, 'function');
      assert.strictEqual(typeof service.invalidatePattern, 'function');
      assert.strictEqual(typeof service.exists, 'function');
      assert.strictEqual(typeof service.getOrSet, 'function');
      assert.strictEqual(typeof service.increment, 'function');
      assert.strictEqual(typeof service.expire, 'function');
      assert.strictEqual(typeof service.ttl, 'function');
    });

    it('should have all required methods', () => {
      const service = new CacheService();
      const methods: Array<keyof CacheService> = [
        'get',
        'set',
        'delete',
        'deleteMultiple',
        'getVersion',
        'bumpVersion',
        'invalidatePattern',
        'exists',
        'getOrSet',
        'increment',
        'expire',
        'ttl',
        'acquireLock',
        'releaseLock',
        'withLock'
      ];

      for (const method of methods) {
        assert.strictEqual(typeof service[method], 'function');
      }
    });
  });

  describe('CacheOptions', () => {
    it('should accept ttl option', () => {
      const options: CacheOptions = { ttl: 60 };
      assert.strictEqual(options.ttl, 60);
    });

    it('should accept undefined options', () => {
      const options: CacheOptions | undefined = undefined;
      assert.strictEqual(options, undefined);
    });

    it('should handle zero ttl', () => {
      const options: CacheOptions = { ttl: 0 };
      assert.strictEqual(options.ttl, 0);
    });

    it('should handle negative ttl', () => {
      const options: CacheOptions = { ttl: -1 };
      assert.strictEqual(options.ttl, -1);
    });
  });

  describe('type definitions', () => {
    it('should have correct type for CacheService', () => {
      const service: CacheService = new CacheService();
      assert.ok(service);
    });

    it('should have correct type for CacheOptions', () => {
      const options: CacheOptions = { ttl: 60 };
      assert.ok(options);
    });
  });

  describe('distributed locks', () => {
    it('should acquire and release a lock in test mode', async () => {
      const service = new CacheService();

      const lockValue = await service.acquireLock('lock:test', { timeout: 1, expiry: 5 });
      assert.ok(lockValue);
      assert.equal(typeof lockValue, 'string');

      await service.releaseLock('lock:test', lockValue);
      assert.equal(await service.exists('lock:test'), false);
    });

    it('should honor NX semantics for repeated lock acquisition', async () => {
      const service = new CacheService();

      const firstLock = await service.acquireLock('lock:nx', { timeout: 1, expiry: 5 });
      const secondLock = await service.acquireLock('lock:nx', {
        timeout: 0,
        expiry: 5,
        retryInterval: 1
      });

      assert.ok(firstLock);
      assert.equal(secondLock, null);

      await service.releaseLock('lock:nx', firstLock as string);
    });

    it('should execute withLock and release the key afterwards', async () => {
      const service = new CacheService();

      const result = await service.withLock(
        'lock:with-lock',
        async () => {
          assert.equal(await service.exists('lock:with-lock'), true);
          return 'done';
        },
        { timeout: 1, expiry: 5 }
      );

      assert.equal(result, 'done');
      assert.equal(await service.exists('lock:with-lock'), false);
    });
  });

  describe('invalidatePattern', () => {
    it('should delete keys matching a pattern in TEST_MODE mock client', async () => {
      const service = new CacheService();

      await service.set('test:scan:a', 'value-a');
      await service.set('test:scan:b', 'value-b');
      await service.set('test:scan:c', 'value-c');
      await service.set('test:other:keep', 'value-keep');

      // Must not throw - MockRedis must implement scan()
      await service.invalidatePattern('test:scan:*');

      assert.equal(await service.exists('test:scan:a'), false);
      assert.equal(await service.exists('test:scan:b'), false);
      assert.equal(await service.exists('test:scan:c'), false);
      assert.equal(await service.exists('test:other:keep'), true);
    });
  });
});

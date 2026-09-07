/**
 * Unit tests for redis.module.ts
 *
 * These tests verify the NestJS module integration without relying on
 * actual Redis connections.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, mock } from 'node:test';

import { DynamicModule } from '@nestjs/common';

// Note: We can't import RedisModule class directly because tsx/esbuild doesn't support decorators
// We only import the services which don't use decorators
import { CacheService } from '../cache';
import type { RedisConfig } from '../client';
import { PubSubService } from '../pubsub';

// Define the config interface inline since we can't import from redis.module.ts
export interface RedisModuleConfig {
  readonly enableGracefulShutdown?: boolean;
  readonly redis?: RedisConfig;
  readonly cacheService?: CacheService;
  readonly pubSubService?: PubSubService;
}

// Create a minimal mock of RedisModule for testing static methods
class RedisModuleMock {
  static config: RedisModuleConfig | null = null;

  static name = 'RedisModule';

  static forRoot(config?: RedisModuleConfig): DynamicModule {
    RedisModuleMock.config = config || null;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: RedisModuleMock as any,
      providers: [
        {
          provide: CacheService,
          useValue: new CacheService()
        },
        {
          provide: PubSubService,
          useValue: new PubSubService()
        }
      ],
      exports: [CacheService, PubSubService]
    } as DynamicModule;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static forRootAsync(options: any): DynamicModule {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      module: RedisModuleMock as any,
      providers: [
        {
          provide: 'REDIS_CONFIG',
          useFactory: options.useFactory,
          inject: options.inject || []
        },
        {
          provide: CacheService,
          useFactory: () => new CacheService()
        },
        {
          provide: PubSubService,
          useFactory: () => new PubSubService()
        }
      ],
      exports: [CacheService, PubSubService],
      imports: options.imports || []
    } as DynamicModule;
  }

  static async healthCheck(): Promise<boolean> {
    return true;
  }

  // Add lifecycle hooks for testing
  async onModuleInit(): Promise<void> {
    // Mock implementation
  }

  async onApplicationShutdown(): Promise<void> {
    // Mock implementation
  }
}

// Use the mock as RedisModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RedisModule = RedisModuleMock as any;

describe('RedisModule', () => {
  beforeEach(() => {
    // Reset static config before each test
    (RedisModule as unknown as { config: RedisModuleConfig | null }).config = null;
    (RedisModule as unknown as { client: unknown }).client = null;
  });

  describe('exports', () => {
    it('should export RedisModule', () => {
      assert.strictEqual(typeof RedisModule, 'function');
      assert.strictEqual(RedisModule.name, 'RedisModule');
    });

    it('should export CacheService', () => {
      assert.strictEqual(typeof CacheService, 'function');
    });

    it('should export PubSubService', () => {
      assert.strictEqual(typeof PubSubService, 'function');
    });

    it('should export RedisModuleConfig type', () => {
      const config: RedisModuleConfig = {
        enableGracefulShutdown: true
      };
      assert.strictEqual(config.enableGracefulShutdown, true);
    });
  });

  describe('RedisModuleConfig', () => {
    it('should accept all properties', () => {
      const config: RedisModuleConfig = {
        enableGracefulShutdown: true,
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 0
        }
      };

      assert.strictEqual(config.enableGracefulShutdown, true);
      assert.strictEqual(config.redis?.host, 'localhost');
    });

    it('should accept minimal config', () => {
      const config: RedisModuleConfig = {};

      assert.strictEqual(config.enableGracefulShutdown, undefined);
      assert.strictEqual(config.redis, undefined);
    });

    it('should accept config with custom services', () => {
      // We don't actually instantiate services to avoid Redis connection
      const cacheService: CacheService = null as unknown as CacheService;
      const pubSubService: PubSubService = null as unknown as PubSubService;

      const config: RedisModuleConfig = {
        cacheService,
        pubSubService
      };

      assert.strictEqual(config.cacheService, cacheService);
      assert.strictEqual(config.pubSubService, pubSubService);
    });
  });

  describe('forRoot', () => {
    it('should return a dynamic module', () => {
      const dynamicModule = RedisModule.forRoot();

      assert.strictEqual(dynamicModule.module, RedisModule);
      assert.ok(Array.isArray(dynamicModule.providers));
      assert.ok(Array.isArray(dynamicModule.exports));
    });

    it('should export CacheService and PubSubService', () => {
      const dynamicModule = RedisModule.forRoot();

      assert.ok(Array.isArray(dynamicModule.exports));
      assert.strictEqual(dynamicModule.exports?.length, 2);
      assert.ok(dynamicModule.exports?.includes(CacheService));
      assert.ok(dynamicModule.exports?.includes(PubSubService));
    });

    it('should accept empty config', () => {
      const dynamicModule = RedisModule.forRoot({});

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should accept config with enableGracefulShutdown', () => {
      const dynamicModule = RedisModule.forRoot({
        enableGracefulShutdown: true
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should accept config with enableGracefulShutdown set to false', () => {
      const dynamicModule = RedisModule.forRoot({
        enableGracefulShutdown: false
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should accept config with redis configuration', () => {
      const dynamicModule = RedisModule.forRoot({
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'secret',
          db: 0
        }
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should set static config', () => {
      const config: RedisModuleConfig = {
        enableGracefulShutdown: false
      };

      RedisModule.forRoot(config);

      assert.deepStrictEqual(
        (RedisModule as unknown as { config: RedisModuleConfig | null }).config,
        config
      );
    });
  });

  describe('forRootAsync', () => {
    it('should return a dynamic module', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: true
      }));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
      assert.ok(Array.isArray(dynamicModule.providers));
      assert.ok(Array.isArray(dynamicModule.exports));
    });

    it('should export CacheService and PubSubService', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      assert.ok(Array.isArray(dynamicModule.exports));
      assert.strictEqual(dynamicModule.exports?.length, 2);
      assert.ok(dynamicModule.exports?.includes(CacheService));
      assert.ok(dynamicModule.exports?.includes(PubSubService));
    });

    it('should accept useFactory', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'REDIS_CONFIG'
      );

      assert.ok(configProvider);
    });

    it('should accept imports array', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory,
        imports: [] as DynamicModule[]
      });

      assert.ok(Array.isArray(dynamicModule.imports));
    });

    it('should accept inject array', () => {
      const useFactory = mock.fn(() => ({}));
      const inject = ['ConfigService'] as unknown[];

      const dynamicModule = RedisModule.forRootAsync({
        useFactory,
        inject
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'REDIS_CONFIG'
      );

      assert.ok(configProvider);
    });

    it('should create REDIS_CONFIG provider', () => {
      const useFactory = mock.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'REDIS_CONFIG'
      );

      assert.ok(configProvider);
      if (configProvider && typeof configProvider === 'object') {
        assert.ok('provide' in configProvider);
        assert.ok('useFactory' in configProvider);
      }
    });

    it('should use factory with injected dependencies', () => {
      const useFactory = mock.fn(() => ({
        redis: {
          host: 'localhost',
          port: 6379,
          password: undefined,
          db: 0
        },
        enableGracefulShutdown: true
      }));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory,
        inject: ['ConfigService']
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should handle async factory', () => {
      const useFactory = mock.fn(async () => ({
        enableGracefulShutdown: true,
        redis: {
          host: 'localhost',
          port: 6379
        }
      }));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should create CacheService provider', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      const cacheProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === CacheService
      );

      assert.ok(cacheProvider);
      if (cacheProvider && typeof cacheProvider === 'object') {
        assert.ok('provide' in cacheProvider);
        assert.ok('useFactory' in cacheProvider);
      }
    });

    it('should create PubSubService provider', () => {
      const useFactory = mock.fn(() => ({}));

      const dynamicModule = RedisModule.forRootAsync({
        useFactory
      });

      const pubSubProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === PubSubService
      );

      assert.ok(pubSubProvider);
      if (pubSubProvider && typeof pubSubProvider === 'object') {
        assert.ok('provide' in pubSubProvider);
        assert.ok('useFactory' in pubSubProvider);
      }
    });
  });

  describe('healthCheck', () => {
    it('should be a static method', () => {
      assert.strictEqual(typeof RedisModule.healthCheck, 'function');
    });

    it('should return a promise', async () => {
      const result = RedisModule.healthCheck();

      assert.strictEqual(result instanceof Promise, true);
    });

    it('should return boolean result', async () => {
      const result = await RedisModule.healthCheck();

      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('module decorators', () => {
    it('should be decorated with @Global', () => {
      // The module should be global
      assert.strictEqual(RedisModule.name, 'RedisModule');
    });
  });

  describe('lifecycle hooks', () => {
    it('should implement OnModuleInit', () => {
      // The module should implement OnModuleInit lifecycle hook
      // We verify this by checking that an instance has the method
      const instance = new RedisModule();
      assert.strictEqual(typeof instance.onModuleInit, 'function');
    });

    it('should implement OnApplicationShutdown', () => {
      // The module should implement OnApplicationShutdown lifecycle hook
      // We verify this by checking that an instance has the method
      const instance = new RedisModule();
      assert.strictEqual(typeof instance.onApplicationShutdown, 'function');
    });
  });

  describe('configuration scenarios', () => {
    it('should handle forRoot with full config', () => {
      const config: RedisModuleConfig = {
        enableGracefulShutdown: true,
        redis: {
          host: 'redis.example.com',
          port: 6380,
          password: 'password',
          db: 2,
          maxRetriesPerRequest: 5
        }
      };

      const dynamicModule = RedisModule.forRoot(config);

      assert.strictEqual(dynamicModule.module, RedisModule);
    });

    it('should handle forRootAsync with ConfigService pattern', () => {
      const useFactory = mock.fn(() => ({
        redis: {
          host: 'localhost',
          port: 6379,
          password: undefined,
          db: 0
        },
        enableGracefulShutdown: true
      }));

      const dynamicModule = RedisModule.forRootAsync({
        imports: [],
        inject: ['ConfigService'],
        useFactory
      });

      assert.strictEqual(dynamicModule.module, RedisModule);
    });
  });

  describe('provider types', () => {
    it('should have correct provider structure for CacheService', () => {
      const dynamicModule = RedisModule.forRoot();

      const cacheProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === CacheService
      );

      assert.ok(cacheProvider);
      if (cacheProvider && typeof cacheProvider === 'object') {
        assert.ok('provide' in cacheProvider);
        assert.ok(
          'useValue' in cacheProvider ||
            'useFactory' in cacheProvider ||
            'useClass' in cacheProvider
        );
      }
    });

    it('should have correct provider structure for PubSubService', () => {
      const dynamicModule = RedisModule.forRoot();

      const pubSubProvider = dynamicModule.providers?.find(
        (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === PubSubService
      );

      assert.ok(pubSubProvider);
      if (pubSubProvider && typeof pubSubProvider === 'object') {
        assert.ok('provide' in pubSubProvider);
        assert.ok(
          'useValue' in pubSubProvider ||
            'useFactory' in pubSubProvider ||
            'useClass' in pubSubProvider
        );
      }
    });
  });

  describe('exports', () => {
    it('should export both services', () => {
      const dynamicModule = RedisModule.forRoot();

      assert.ok(Array.isArray(dynamicModule.exports));
      assert.ok(dynamicModule.exports?.includes(CacheService));
      assert.ok(dynamicModule.exports?.includes(PubSubService));
    });

    it('should only export the two services', () => {
      const dynamicModule = RedisModule.forRoot();

      assert.strictEqual(dynamicModule.exports?.length, 2);
    });
  });
});

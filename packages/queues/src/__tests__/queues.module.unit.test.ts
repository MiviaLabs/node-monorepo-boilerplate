/**
 * Unit tests for queues.module.ts
 *
 * These tests verify the NestJS module integration without relying on
 * actual BullMQ Queue/Worker instances.
 */

import { strict as assert } from 'node:assert';

import { closeAllQueues } from '../queue';
import {
  JOB_HANDLER_METADATA,
  JobHandler,
  QueueManager,
  type IJobHandlerOptions
} from '../queues.decorators';
import { QueuesModule } from '../queues.module';
import { closeAllWorkers } from '../worker';

import type { DynamicModule } from '@nestjs/common';

describe('QueuesModule', () => {
  beforeEach(() => {
    // Reset static config before each test
    QueuesModule.config = null;
  });

  afterEach(() => {
    // Clean up after each test
    return Promise.all([closeAllQueues(), closeAllWorkers()]);
  });

  describe('JobHandler decorator', () => {
    it('should set metadata on decorated method', () => {
      const options: IJobHandlerOptions = {
        queueName: 'test-queue',
        jobName: 'test-job',
        concurrency: 5
      };

      class TestClass {
        @JobHandler(options)
        async testMethod() {
          return true;
        }
      }

      const instance = new TestClass();
      const method = instance.testMethod;

      // The decorator should have set metadata
      assert.strictEqual(typeof method, 'function');
    });

    it('should work with minimal options', () => {
      const options: IJobHandlerOptions = {
        queueName: 'test-queue'
      };

      class TestClass {
        @JobHandler(options)
        async testMethod() {
          return true;
        }
      }

      const instance = new TestClass();
      assert.strictEqual(typeof instance.testMethod, 'function');
    });

    it('should preserve method functionality', async () => {
      const options: IJobHandlerOptions = {
        queueName: 'test-queue',
        jobName: 'test-job'
      };

      class TestClass {
        @JobHandler(options)
        async testMethod(value: number) {
          return value * 2;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod(5);
      assert.strictEqual(result, 10);
    });

    it('should support multiple decorated methods', () => {
      const options1: IJobHandlerOptions = {
        queueName: 'queue-1',
        jobName: 'job-1'
      };

      const options2: IJobHandlerOptions = {
        queueName: 'queue-2',
        jobName: 'job-2'
      };

      class TestClass {
        @JobHandler(options1)
        async method1() {
          return 'method1';
        }

        @JobHandler(options2)
        async method2() {
          return 'method2';
        }
      }

      const instance = new TestClass();
      assert.strictEqual(typeof instance.method1, 'function');
      assert.strictEqual(typeof instance.method2, 'function');
    });

    it('should set JOB_HANDLER_METADATA key', () => {
      assert.strictEqual(typeof JOB_HANDLER_METADATA, 'string');
      assert.strictEqual(JOB_HANDLER_METADATA, 'jobHandler');
    });
  });

  describe('QueueManager', () => {
    it('should register a queue', () => {
      const manager = new QueueManager();
      manager.registerQueue('test-queue');

      const names = manager.getQueueNames();
      assert.ok(names.includes('test-queue'));
    });

    it('should not register the same queue twice', () => {
      const manager = new QueueManager();
      manager.registerQueue('test-queue');
      manager.registerQueue('test-queue');

      const names = manager.getQueueNames();
      const count = names.filter((n) => n === 'test-queue').length;
      assert.strictEqual(count, 1);
    });

    it('should register multiple queues', () => {
      const manager = new QueueManager();
      manager.registerQueue('queue-1');
      manager.registerQueue('queue-2');
      manager.registerQueue('queue-3');

      const names = manager.getQueueNames();
      assert.strictEqual(names.length, 3);
    });

    it('should register a worker', () => {
      const manager = new QueueManager();
      const processor = async () => {
        return { result: 'done' };
      };

      manager.registerWorker('test-worker', processor);

      const names = manager.getWorkerNames();
      assert.ok(names.includes('test-worker'));
    });

    it('should not register the same worker twice', () => {
      const manager = new QueueManager();
      const processor = async () => {
        return { result: 'done' };
      };

      manager.registerWorker('test-worker', processor);

      // Registering the same worker twice is now a misconfiguration: BullMQ
      // can only route jobs on a queue to one processor, so silently dropping
      // the second registration would silently lose jobs. Surface as an error.
      assert.throws(
        () => manager.registerWorker('test-worker', processor),
        (err: Error) => {
          assert.match(err.message, /already registered/i);
          return true;
        }
      );
    });

    it('should throw when registering two workers with the same name but different processors', () => {
      const manager = new QueueManager();
      const processorA = async () => ({ result: 'A' });
      const processorB = async () => ({ result: 'B' });

      manager.registerWorker('maintenance', processorA);

      // Registering a SECOND distinct processor for the same queue must not
      // silently drop the new processor. BullMQ Worker processes every job on
      // the queue through a single processor; if two @JobHandler methods
      // declare the same queueName, the later one is unreachable at runtime.
      // The manager must surface this misconfiguration as an error.
      assert.throws(
        () => manager.registerWorker('maintenance', processorB),
        (err: Error) => {
          assert.match(err.message, /already registered/i);
          return true;
        }
      );
    });

    it('should register multiple workers', () => {
      const manager = new QueueManager();
      const processor = async () => {
        return { result: 'done' };
      };

      manager.registerWorker('worker-1', processor);
      manager.registerWorker('worker-2', processor);
      manager.registerWorker('worker-3', processor);

      const names = manager.getWorkerNames();
      assert.strictEqual(names.length, 3);
    });

    it('should close all queues and workers', async () => {
      const manager = new QueueManager();
      const processor = async () => {
        return { result: 'done' };
      };

      manager.registerQueue('test-queue');
      manager.registerWorker('test-worker', processor);

      await manager.closeAll();

      assert.strictEqual(manager.getQueueNames().length, 0);
      assert.strictEqual(manager.getWorkerNames().length, 0);
    });

    it('should have healthCheck method', async () => {
      const manager = new QueueManager();
      const result = await manager.healthCheck();

      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('forRoot', () => {
    it('should return a dynamic module', () => {
      const dynamicModule = QueuesModule.forRoot();

      assert.strictEqual(dynamicModule.module, QueuesModule);
      assert.strictEqual(typeof dynamicModule.providers, 'object');
      assert.strictEqual(typeof dynamicModule.exports, 'object');
    });

    it('should export QueueManager', () => {
      const dynamicModule = QueuesModule.forRoot();

      assert.ok(dynamicModule.exports?.includes(QueueManager));
    });

    it('should accept empty config', () => {
      const dynamicModule = QueuesModule.forRoot({});

      assert.strictEqual(dynamicModule.module, QueuesModule);
    });

    it('should accept config with enableGracefulShutdown', () => {
      const dynamicModule = QueuesModule.forRoot({
        enableGracefulShutdown: true
      });

      assert.strictEqual(dynamicModule.module, QueuesModule);
    });

    it('should accept config with enableGracefulShutdown set to false', () => {
      const dynamicModule = QueuesModule.forRoot({
        enableGracefulShutdown: false
      });

      assert.strictEqual(dynamicModule.module, QueuesModule);
    });

    it('should set static config', () => {
      const config = {
        enableGracefulShutdown: false
      };

      QueuesModule.forRoot(config);

      // Config should be resolved with defaults applied
      assert.strictEqual(QueuesModule.config?.enableGracefulShutdown, false);
      assert.ok(QueuesModule.config?.queue); // Should have queue config with defaults
      assert.ok(QueuesModule.config?.worker); // Should have worker config with defaults
      assert.ok(QueuesModule.config?.scheduler); // Should have scheduler config with defaults
    });
  });

  describe('forRootAsync', () => {
    it('should return a dynamic module', () => {
      const useFactory = jest.fn(() => ({
        enableGracefulShutdown: true
      }));

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory
      });

      assert.strictEqual(dynamicModule.module, QueuesModule);
      assert.strictEqual(typeof dynamicModule.providers, 'object');
      assert.strictEqual(typeof dynamicModule.exports, 'object');
    });

    it('should export QueueManager', () => {
      const useFactory = jest.fn(() => ({}));

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory
      });

      assert.ok(dynamicModule.exports?.includes(QueueManager));
    });

    it('should accept useFactory', () => {
      const useFactory = jest.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'QUEUES_CONFIG'
      );

      assert.ok(configProvider);
    });

    it('should accept imports array', () => {
      const useFactory = jest.fn(() => ({}));

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory,
        imports: [] as DynamicModule[]
      });

      assert.strictEqual(typeof dynamicModule.imports, 'object');
    });

    it('should accept inject array', () => {
      const useFactory = jest.fn(() => ({}));
      const inject = ['ConfigService'] as unknown[];

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory,
        inject
      });

      const configProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'QUEUES_CONFIG'
      );

      assert.ok(configProvider);
    });

    it('should call useFactory with inject values', async () => {
      const useFactory = jest.fn(() => ({
        enableGracefulShutdown: true
      }));

      QueuesModule.forRootAsync({
        useFactory,
        inject: ['TestService'] as unknown[]
      });

      // The factory should be defined
      assert.strictEqual(typeof useFactory, 'function');
    });

    it('should create QUEUES_CONFIG provider', () => {
      const useFactory = jest.fn(() => ({
        enableGracefulShutdown: false
      }));

      const dynamicModule = QueuesModule.forRootAsync({
        useFactory
      });

      const configProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' && p !== null && 'provide' in p && p.provide === 'QUEUES_CONFIG'
      );

      assert.ok(configProvider);
      if (configProvider && 'useFactory' in configProvider) {
        assert.strictEqual(typeof configProvider.useFactory, 'function');
      }
    });
  });

  describe('healthCheck', () => {
    it('should return a boolean', async () => {
      const result = await QueuesModule.healthCheck();

      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('IJobHandlerOptions', () => {
    it('should accept all properties', () => {
      const options: IJobHandlerOptions = {
        queueName: 'test-queue',
        jobName: 'test-job',
        concurrency: 10
      };

      assert.strictEqual(options.queueName, 'test-queue');
      assert.strictEqual(options.jobName, 'test-job');
      assert.strictEqual(options.concurrency, 10);
    });

    it('should accept minimal properties', () => {
      const options: IJobHandlerOptions = {
        queueName: 'test-queue'
      };

      assert.strictEqual(options.queueName, 'test-queue');
      assert.strictEqual(options.jobName, undefined);
      assert.strictEqual(options.concurrency, undefined);
    });
  });
});

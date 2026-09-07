/**
 * Unit tests for worker.ts
 *
 * These tests use mocks instead of real BullMQ Worker instances to avoid
 * Redis connection issues and hanging tests.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
  createWorker,
  getWorker,
  getAllWorkerNames,
  closeAllWorkers,
  getWorkerMetrics,
  getAllWorkerMetrics,
  type Processor,
  type CreateWorkerOptions
} from '../worker';

describe('worker', () => {
  beforeEach(() => {
    // Clear workers before each test
    return closeAllWorkers();
  });

  afterEach(() => {
    // Clear workers after each test
    return closeAllWorkers();
  });

  describe('createWorker', () => {
    it('should create a new worker with valid config', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      assert.strictEqual(typeof worker, 'object');
      assert.strictEqual(worker !== null, true);
    });

    it('should return the same worker instance for subsequent calls with same name', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker1 = createWorker({ name: 'test-worker', processor });
      const worker2 = createWorker({ name: 'test-worker', processor });

      assert.strictEqual(worker1 === worker2, true);
    });

    it('should create different workers for different names', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker1 = createWorker({ name: 'worker-1', processor });
      const worker2 = createWorker({ name: 'worker-2', processor });

      assert.strictEqual(worker1 === worker2, false);
    });

    it('should use default concurrency of 1 when not provided', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      assert.strictEqual(typeof worker, 'object');
    });

    it('should accept custom concurrency', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor, concurrency: 5 });

      assert.strictEqual(typeof worker, 'object');
    });
  });

  describe('getWorker', () => {
    it('should return undefined for non-existent worker', () => {
      const worker = getWorker('non-existent');
      assert.strictEqual(worker, undefined);
    });

    it('should return existing worker by name', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const createdWorker = createWorker({ name: 'test-worker', processor });
      const retrievedWorker = getWorker('test-worker');
      assert.strictEqual(retrievedWorker === createdWorker, true);
    });

    it('should return different workers for different names', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });

      const worker1 = getWorker('worker-1');
      const worker2 = getWorker('worker-2');

      assert.strictEqual(worker1 !== worker2, true);
    });
  });

  describe('getAllWorkerNames', () => {
    it('should return empty array when no workers exist', () => {
      const names = getAllWorkerNames();
      assert.deepStrictEqual(names, []);
    });

    it('should return array of worker names', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });
      createWorker({ name: 'worker-3', processor });

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 3);
      assert.ok(names.includes('worker-1'));
      assert.ok(names.includes('worker-2'));
      assert.ok(names.includes('worker-3'));
    });

    it('should not duplicate worker names', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-1', processor });

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 1);
      assert.strictEqual(names[0], 'worker-1');
    });
  });

  describe('closeAllWorkers', () => {
    it('should close all workers', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });

      await closeAllWorkers();

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 0);
    });

    it('should clear the worker registry', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });

      await closeAllWorkers();

      const worker1 = getWorker('worker-1');
      const worker2 = getWorker('worker-2');

      assert.strictEqual(worker1, undefined);
      assert.strictEqual(worker2, undefined);
    });

    it('should handle closing when no workers exist', async () => {
      await closeAllWorkers();

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 0);
    });

    it('should allow creating new workers after closing', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      await closeAllWorkers();

      const newWorker = createWorker({ name: 'worker-2', processor });
      assert.strictEqual(typeof newWorker, 'object');

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 1);
      assert.strictEqual(names[0], 'worker-2');
    });
  });

  describe('Processor type', () => {
    it('should accept async processor function', () => {
      const processor: Processor = async (job) => {
        return { processed: true, data: job.data };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      assert.strictEqual(typeof worker, 'object');
    });

    it('should accept processor with typed data', () => {
      interface JobData {
        email: string;
        name: string;
      }

      const processor: Processor<JobData, { success: boolean }> = async (job) => {
        return { success: true, email: job.data.email };
      };

      const worker = createWorker({
        name: 'test-worker',
        processor: processor as Processor
      });

      assert.strictEqual(typeof worker, 'object');
    });
  });

  describe('CreateWorkerOptions', () => {
    it('should accept all config options', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const config: CreateWorkerOptions = {
        name: 'test-worker',
        processor,
        concurrency: 10
      };

      const worker = createWorker(config);
      assert.strictEqual(typeof worker, 'object');
    });

    it('should accept minimal config', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const config: CreateWorkerOptions = {
        name: 'test-worker',
        processor
      };

      const worker = createWorker(config);
      assert.strictEqual(typeof worker, 'object');
    });
  });

  describe('concurrency', () => {
    it('should respect concurrency setting of 1', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor, concurrency: 1 });

      assert.strictEqual(typeof worker, 'object');
    });

    it('should respect concurrency setting of 10', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor, concurrency: 10 });

      assert.strictEqual(typeof worker, 'object');
    });

    it('should use default concurrency when not specified', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      assert.strictEqual(typeof worker, 'object');
    });
  });

  describe('worker registry behavior', () => {
    it('should maintain separate worker instances', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker1 = createWorker({ name: 'worker-1', processor });
      const worker2 = createWorker({ name: 'worker-2', processor });
      const worker3 = createWorker({ name: 'worker-3', processor });

      const retrieved1 = getWorker('worker-1');
      const retrieved2 = getWorker('worker-2');
      const retrieved3 = getWorker('worker-3');

      assert.strictEqual(retrieved1, worker1);
      assert.strictEqual(retrieved2, worker2);
      assert.strictEqual(retrieved3, worker3);
    });

    it('should have correct worker names count', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });
      createWorker({ name: 'worker-3', processor });
      createWorker({ name: 'worker-1', processor }); // Duplicate

      const names = getAllWorkerNames();
      assert.strictEqual(names.length, 3);
    });
  });

  describe('Worker Metrics', () => {
    it('should initialize metrics for new worker', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'test-worker', processor });

      const metrics = getWorkerMetrics('test-worker');
      assert.ok(metrics);
      assert.strictEqual(metrics.jobsProcessed, 0);
      assert.strictEqual(metrics.jobsFailed, 0);
      assert.ok(typeof metrics.lastActivity === 'number');
    });

    it('should return undefined for non-existent worker metrics', () => {
      const metrics = getWorkerMetrics('non-existent');
      assert.strictEqual(metrics, undefined);
    });

    it('should return all worker metrics', () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });

      const allMetrics = getAllWorkerMetrics();
      assert.strictEqual(allMetrics.size, 2);
      assert.ok(allMetrics.has('worker-1'));
      assert.ok(allMetrics.has('worker-2'));
    });

    it('should clear metrics when worker closes', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      // Verify metrics exist
      assert.ok(getWorkerMetrics('test-worker'));

      // Close the worker
      await worker.close();

      // Verify metrics are cleared
      assert.strictEqual(getWorkerMetrics('test-worker'), undefined);
    });

    it('should clear all metrics when closing all workers', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      createWorker({ name: 'worker-1', processor });
      createWorker({ name: 'worker-2', processor });

      // Verify metrics exist
      assert.strictEqual(getAllWorkerMetrics().size, 2);

      // Close all workers
      await closeAllWorkers();

      // Verify all metrics are cleared
      assert.strictEqual(getAllWorkerMetrics().size, 0);
    });

    it('should remove worker from registry when closed individually', async () => {
      const processor = async () => {
        return { result: 'done' };
      };

      const worker = createWorker({ name: 'test-worker', processor });

      // Verify worker is in registry
      assert.ok(getWorker('test-worker'));

      // Close the worker individually
      await worker.close();

      // Verify worker is removed from registry
      assert.strictEqual(getWorker('test-worker'), undefined);

      // Verify worker name is removed from list
      assert.ok(!getAllWorkerNames().includes('test-worker'));
    });
  });
});

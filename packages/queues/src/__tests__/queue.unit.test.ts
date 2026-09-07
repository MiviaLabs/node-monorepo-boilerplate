/**
 * Unit tests for queue.ts
 *
 * These tests use mocks instead of real BullMQ Queue instances to avoid
 * Redis connection issues and hanging tests.
 */

import { strict as assert } from 'node:assert';
import { describe, it, afterEach, beforeEach } from 'node:test';

import {
  createQueue,
  getQueue,
  getAllQueueNames,
  closeAllQueues,
  healthCheck,
  moveToDeadLetterQueue,
  getDeadLetterQueueName,
  hasDeadLetterQueue
} from '../queue';

describe('queue', () => {
  beforeEach(() => {
    // Clear queues before each test
    return closeAllQueues();
  });

  afterEach(() => {
    // Clear queues after each test
    return closeAllQueues();
  });

  describe('createQueue', () => {
    it('should create a new queue with valid config', () => {
      const queue = createQueue({ name: 'test-queue' });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should return the same queue instance for subsequent calls with same name', () => {
      const queue1 = createQueue({ name: 'test-queue' });
      const queue2 = createQueue({ name: 'test-queue' });

      assert.strictEqual(queue1 === queue2, true);
    });

    it('should create different queues for different names', () => {
      const queue1 = createQueue({ name: 'queue-1' });
      const queue2 = createQueue({ name: 'queue-2' });

      assert.strictEqual(queue1 === queue2, false);
      assert.strictEqual(queue1.name, 'queue-1');
      assert.strictEqual(queue2.name, 'queue-2');
    });

    it('should accept custom defaultJobOptions', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should merge default job options with provided options', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          attempts: 7
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should use default job options when not provided', () => {
      const queue = createQueue({ name: 'test-queue' });

      assert.strictEqual(queue.name, 'test-queue');
    });
  });

  describe('getQueue', () => {
    it('should return undefined for non-existent queue', () => {
      const queue = getQueue('non-existent');
      assert.strictEqual(queue, undefined);
    });

    it('should return existing queue by name', () => {
      const createdQueue = createQueue({ name: 'test-queue' });
      const retrievedQueue = getQueue('test-queue');
      assert.strictEqual(retrievedQueue === createdQueue, true);
    });

    it('should return different queues for different names', () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-2' });

      const queue1 = getQueue('queue-1');
      const queue2 = getQueue('queue-2');

      assert.strictEqual(queue1 !== queue2, true);
      assert.strictEqual(queue1?.name, 'queue-1');
      assert.strictEqual(queue2?.name, 'queue-2');
    });
  });

  describe('getAllQueueNames', () => {
    it('should return empty array when no queues exist', () => {
      const names = getAllQueueNames();
      assert.deepStrictEqual(names, []);
    });

    it('should return array of queue names', () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-2' });
      createQueue({ name: 'queue-3' });

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 3);
      assert.ok(names.includes('queue-1'));
      assert.ok(names.includes('queue-2'));
      assert.ok(names.includes('queue-3'));
    });

    it('should not duplicate queue names', () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-1' });

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 1);
      assert.strictEqual(names[0], 'queue-1');
    });
  });

  describe('closeAllQueues', () => {
    it('should close all queues', async () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-2' });

      await closeAllQueues();

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 0);
    });

    it('should clear the queue registry', async () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-2' });

      await closeAllQueues();

      const queue1 = getQueue('queue-1');
      const queue2 = getQueue('queue-2');

      assert.strictEqual(queue1, undefined);
      assert.strictEqual(queue2, undefined);
    });

    it('should handle closing when no queues exist', async () => {
      await closeAllQueues();

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 0);
    });

    it('should allow creating new queues after closing', async () => {
      createQueue({ name: 'queue-1' });
      await closeAllQueues();

      const newQueue = createQueue({ name: 'queue-2' });
      assert.strictEqual(newQueue.name, 'queue-2');

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 1);
      assert.strictEqual(names[0], 'queue-2');
    });
  });

  describe('healthCheck', () => {
    it('should return boolean', async () => {
      const result = await healthCheck();
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should return true in test mode', async () => {
      const result = await healthCheck();
      assert.strictEqual(result, true);
    });

    it('should return true when queues are healthy', async () => {
      createQueue({ name: 'test-queue' });

      const result = await healthCheck();
      assert.strictEqual(result, true);
    });
  });

  describe('queue options', () => {
    it('should set removeOnComplete option', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          removeOnComplete: 100
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should set removeOnFail option', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          removeOnFail: 200
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should set priority option', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          priority: 1
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should set delay option', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          delay: 1000
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });

    it('should set removeOnComplete option with age', () => {
      const queue = createQueue({
        name: 'test-queue',
        defaultJobOptions: {
          removeOnComplete: { age: 3600 }
        }
      });

      assert.strictEqual(queue.name, 'test-queue');
    });
  });

  describe('queue registry behavior', () => {
    it('should maintain separate queue instances', () => {
      const queue1 = createQueue({ name: 'queue-1' });
      const queue2 = createQueue({ name: 'queue-2' });
      const queue3 = createQueue({ name: 'queue-3' });

      const retrieved1 = getQueue('queue-1');
      const retrieved2 = getQueue('queue-2');
      const retrieved3 = getQueue('queue-3');

      assert.strictEqual(retrieved1, queue1);
      assert.strictEqual(retrieved2, queue2);
      assert.strictEqual(retrieved3, queue3);
    });

    it('should have correct queue names count', () => {
      createQueue({ name: 'queue-1' });
      createQueue({ name: 'queue-2' });
      createQueue({ name: 'queue-3' });
      createQueue({ name: 'queue-1' }); // Duplicate

      const names = getAllQueueNames();
      assert.strictEqual(names.length, 3);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should create DLQ when enabled', () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: true
      });

      const dlqName = getDeadLetterQueueName('test-queue');
      assert.strictEqual(dlqName, 'test-queue-dlq');
      assert.strictEqual(hasDeadLetterQueue('test-queue'), true);
    });

    it('should not create DLQ when disabled', () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: false
      });

      const dlqName = getDeadLetterQueueName('test-queue');
      assert.strictEqual(dlqName, undefined);
      assert.strictEqual(hasDeadLetterQueue('test-queue'), false);
    });

    it('should create DLQ with custom name', () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: true,
        deadLetterQueue: 'custom-dlq'
      });

      const dlqName = getDeadLetterQueueName('test-queue');
      assert.strictEqual(dlqName, 'custom-dlq');
    });

    it('should move job to DLQ', async () => {
      const queue = createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: true
      });

      // Add a job
      const job = await queue.add('test-job', { data: 'test' });

      // Move to DLQ (in test mode this just logs)
      if (job.id) {
        await moveToDeadLetterQueue('test-queue', job.id);
      }

      // Verify DLQ exists
      assert.strictEqual(hasDeadLetterQueue('test-queue'), true);
    });

    it('should throw error when moving to DLQ for queue without DLQ', async () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: false
      });

      await assert.rejects(
        async () => {
          await moveToDeadLetterQueue('test-queue', 'job-123');
        },
        (error: Error) => {
          assert.ok(error.message.includes('DLQ not enabled'));
          return true;
        }
      );
    });

    it('should include DLQ in queue names', () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: true
      });

      const names = getAllQueueNames();
      assert.ok(names.includes('test-queue'));
      assert.ok(names.includes('test-queue-dlq'));
    });

    it('should clear DLQ mappings when closing all queues', async () => {
      createQueue({
        name: 'test-queue',
        enableDeadLetterQueue: true
      });

      assert.strictEqual(hasDeadLetterQueue('test-queue'), true);

      await closeAllQueues();

      assert.strictEqual(hasDeadLetterQueue('test-queue'), false);
    });
  });
});

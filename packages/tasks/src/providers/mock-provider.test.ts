/**
 * Unit tests for mock Cloud Tasks provider
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { QueueNotFoundError, QueueAlreadyExistsError, TaskNotFoundError } from '../errors';
import { MockCloudTasksProvider } from './mock-provider';

import type { CloudTasksConfig } from '../config';

describe('MockCloudTasksProvider', () => {
  let provider: MockCloudTasksProvider;
  let config: CloudTasksConfig;

  beforeEach(() => {
    config = {
      projectId: 'test-project',
      location: 'us-central1',
      testMode: true
    };
    provider = new MockCloudTasksProvider(config);
  });

  describe('createQueue', () => {
    it('should create a queue', async () => {
      const queue = await provider.createQueue('test-queue');

      assert.equal(queue.name, 'test-queue');
      assert.equal(queue.state, 'RUNNING');
      assert.equal(provider.getQueueCount(), 1);
    });

    it('should create a queue with options', async () => {
      const queue = await provider.createQueue('test-queue', {
        state: 'PAUSED',
        rateLimits: {
          maxRequestsPerSecond: 100
        }
      });

      assert.equal(queue.name, 'test-queue');
      assert.equal(queue.state, 'PAUSED');
      assert.equal(queue.rateLimits?.maxRequestsPerSecond, 100);
    });

    it('should throw when queue already exists', async () => {
      await provider.createQueue('test-queue');

      await assert.rejects(
        () => provider.createQueue('test-queue'),
        (error: Error) => {
          assert(error instanceof QueueAlreadyExistsError);
          assert.match(error.message, /test-queue/);
          return true;
        }
      );
    });
  });

  describe('deleteQueue', () => {
    it('should delete a queue', async () => {
      await provider.createQueue('test-queue');
      await provider.deleteQueue('test-queue');

      assert.equal(provider.getQueueCount(), 0);
    });

    it('should throw when queue does not exist', async () => {
      await assert.rejects(
        () => provider.deleteQueue('nonexistent'),
        (error: Error) => {
          assert(error instanceof QueueNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('getQueue', () => {
    it('should get a queue', async () => {
      await provider.createQueue('test-queue', {
        state: 'PAUSED'
      });

      const queue = await provider.getQueue('test-queue');

      assert.equal(queue.name, 'test-queue');
      assert.equal(queue.state, 'PAUSED');
    });

    it('should throw when queue does not exist', async () => {
      await assert.rejects(
        () => provider.getQueue('nonexistent'),
        (error: Error) => {
          assert(error instanceof QueueNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('listQueues', () => {
    it('should list all queues', async () => {
      await provider.createQueue('queue-1');
      await provider.createQueue('queue-2');
      await provider.createQueue('queue-3');

      const result = await provider.listQueues();

      assert.equal(result.queues.length, 3);
      assert.equal(result.queues[0].name, 'queue-1');
      assert.equal(result.queues[1].name, 'queue-2');
      assert.equal(result.queues[2].name, 'queue-3');
      assert.equal(result.nextPageToken, undefined);
    });

    it('should return empty array when no queues', async () => {
      const result = await provider.listQueues();

      assert.equal(result.queues.length, 0);
      assert.equal(result.nextPageToken, undefined);
    });

    it('should support pagination with pageSize', async () => {
      await provider.createQueue('queue-1');
      await provider.createQueue('queue-2');
      await provider.createQueue('queue-3');

      const page1 = await provider.listQueues({ pageSize: 2 });

      assert.equal(page1.queues.length, 2);
      assert.equal(page1.queues[0].name, 'queue-1');
      assert.equal(page1.queues[1].name, 'queue-2');
      assert.equal(page1.nextPageToken, '2');
    });

    it('should support pagination with pageToken', async () => {
      await provider.createQueue('queue-1');
      await provider.createQueue('queue-2');
      await provider.createQueue('queue-3');

      const page1 = await provider.listQueues({ pageSize: 2 });
      const page2 = await provider.listQueues({ pageSize: 2, pageToken: page1.nextPageToken });

      assert.equal(page2.queues.length, 1);
      assert.equal(page2.queues[0].name, 'queue-3');
      assert.equal(page2.nextPageToken, undefined);
    });

    it('should throw error for invalid pageToken', async () => {
      await provider.createQueue('queue-1');

      await assert.rejects(
        () => provider.listQueues({ pageToken: 'invalid' }),
        (error: Error) => {
          assert.equal(
            error.message,
            'Invalid task configuration: Invalid pageToken: "invalid". PageToken must be a numeric string representing the starting index.'
          );
          return true;
        }
      );
    });
  });

  describe('createHttpTask', () => {
    it('should create an HTTP task', async () => {
      await provider.createQueue('test-queue');

      const task = await provider.createHttpTask(
        'test-queue',
        {
          url: 'https://example.com/webhook',
          httpMethod: 'POST',
          body: '{"test":"data"}'
        },
        {
          priority: 1
        }
      );

      assert.match(task.name, /test-queue-\d+/);
      assert.equal(task.priority, 1);
      assert.equal(provider.getTaskCount('test-queue'), 1);
    });

    it('should throw when queue does not exist', async () => {
      await assert.rejects(
        () =>
          provider.createHttpTask('nonexistent', {
            url: 'https://example.com/webhook'
          }),
        (error: Error) => {
          assert(error instanceof QueueNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('createAppEngineTask', () => {
    it('should create an App Engine task', async () => {
      await provider.createQueue('test-queue');

      const task = await provider.createAppEngineTask(
        'test-queue',
        {
          relativeUri: '/api/webhook',
          httpMethod: 'POST'
        },
        {
          priority: 2
        }
      );

      assert.match(task.name, /test-queue-\d+/);
      assert.equal(task.priority, 2);
      assert.equal(provider.getTaskCount('test-queue'), 1);
    });

    it('should throw when queue does not exist', async () => {
      await assert.rejects(
        () =>
          provider.createAppEngineTask('nonexistent', {
            relativeUri: '/api/webhook'
          }),
        (error: Error) => {
          assert(error instanceof QueueNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      await provider.createQueue('test-queue');

      const task = await provider.createHttpTask('test-queue', {
        url: 'https://example.com/webhook'
      });

      await provider.deleteTask(task.name);

      assert.equal(provider.getTaskCount('test-queue'), 0);
    });

    it('should throw when task does not exist', async () => {
      await assert.rejects(
        () => provider.deleteTask('tasks/nonexistent'),
        (error: Error) => {
          assert(error instanceof TaskNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('getTask', () => {
    it('should get a task', async () => {
      await provider.createQueue('test-queue');

      const createdTask = await provider.createHttpTask(
        'test-queue',
        {
          url: 'https://example.com/webhook'
        },
        {
          priority: 3
        }
      );

      const task = await provider.getTask(createdTask.name);

      assert.equal(task.name, createdTask.name);
      assert.equal(task.priority, 3);
    });

    it('should throw when task does not exist', async () => {
      await assert.rejects(
        () => provider.getTask('tasks/nonexistent'),
        (error: Error) => {
          assert(error instanceof TaskNotFoundError);
          assert.match(error.message, /nonexistent/);
          return true;
        }
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true', async () => {
      const isHealthy = await provider.healthCheck();

      assert.equal(isHealthy, true);
    });
  });

  describe('clear', () => {
    it('should clear all queues and tasks', async () => {
      await provider.createQueue('queue-1');
      await provider.createQueue('queue-2');

      provider.clear();

      assert.equal(provider.getQueueCount(), 0);
    });
  });
});

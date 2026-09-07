/**
 * Integration tests for CloudTasksProvider
 *
 * These tests require a GCP Cloud Tasks emulator or real GCP credentials.
 * They are skipped by default and can be enabled by setting GCP_TASKS_EMULATOR=true.
 *
 * To run these tests:
 * 1. Start the Cloud Tasks emulator:
 *    gcloud beta emulators cloud-tasks start --host-port=localhost:9092
 *
 * 2. Set environment variables:
 *    export GCP_TASKS_EMULATOR=true
 *    export CLOUD_TASKS_PROJECT_ID=test-project
 *    export CLOUD_TASKS_LOCATION=us-central1
 *    export CLOUD_TASKS_HOST=localhost:9092
 *
 * 3. Run tests:
 *    pnpm test tasks
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { HttpMethod, InvalidTaskConfigError, QueueAlreadyExistsError } from '../config';
import { CloudTasksProvider } from './cloud-tasks.provider';

import type { CloudTasksConfig } from '../config';

describe('CloudTasksProvider (integration)', () => {
  // Only run integration tests if explicitly enabled
  const runIntegration = process.env.GCP_TASKS_EMULATOR === 'true';

  if (!runIntegration) {
    it('should be skipped - set GCP_TASKS_EMULATOR=true to run', { skip: true }, () => {
      // Integration tests skipped. Set GCP_TASKS_EMULATOR=true to run.
    });
    return;
  }

  let provider: CloudTasksProvider;
  const testQueueName = `test-queue-${Date.now()}`;

  before(() => {
    // Initialize provider with emulator config
    const config: CloudTasksConfig = {
      projectId: process.env.CLOUD_TASKS_PROJECT_ID || 'test-project',
      location: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
      timeout: 30000,
      maxRetries: 3,
      enableTracing: false,
      testMode: true
    };

    // Use emulator endpoint if specified
    if (process.env.CLOUD_TASKS_HOST) {
      config.apiEndpoint = `http://${process.env.CLOUD_TASKS_HOST}`;
    }

    provider = new CloudTasksProvider(config);
  });

  after(async () => {
    // Cleanup test queue
    try {
      await provider.deleteQueue(testQueueName);
    } catch {
      // Ignore if queue doesn't exist
    }
  });

  describe('createQueue', () => {
    it('should create a queue with valid name', async () => {
      const queueInfo = await provider.createQueue(testQueueName);

      assert.equal(queueInfo.name, testQueueName);
      assert.equal(queueInfo.state, 'RUNNING');
    });

    it('should throw InvalidTaskConfigError for invalid queue name', async () => {
      await assert.rejects(
        async () => {
          await provider.createQueue('Invalid-Queue-Name');
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Invalid queue name/);
          return true;
        }
      );
    });

    it('should throw QueueAlreadyExistsError when creating duplicate queue', async () => {
      await assert.rejects(
        async () => {
          await provider.createQueue(testQueueName);
        },
        (error: Error) => {
          assert(error instanceof QueueAlreadyExistsError);
          assert.match(error.message, /already exists/);
          return true;
        }
      );
    });

    it('should create a queue with rate limits', async () => {
      const queueName = `${testQueueName}-with-ratelimits`;
      const queueInfo = await provider.createQueue(queueName, {
        rateLimits: {
          maxRequestsPerSecond: 10,
          maxConcurrentDispatches: 5
        }
      });

      assert.equal(queueInfo.name, queueName);
      assert.equal(queueInfo.rateLimits?.maxRequestsPerSecond, 10);
      assert.equal(queueInfo.rateLimits?.maxConcurrentDispatches, 5);

      // Cleanup
      await provider.deleteQueue(queueName);
    });

    it('should create a queue with retry config', async () => {
      const queueName = `${testQueueName}-with-retry`;
      const queueInfo = await provider.createQueue(queueName, {
        retryConfig: {
          maxAttempts: 5,
          minBackoffInSeconds: 10,
          maxBackoffInSeconds: 600,
          maxRetryDurationInSeconds: 3600
        }
      });

      assert.equal(queueInfo.name, queueName);
      assert.equal(queueInfo.retryConfig?.maxAttempts, 5);
      assert.equal(queueInfo.retryConfig?.minBackoffInSeconds, 10);
      assert.equal(queueInfo.retryConfig?.maxBackoffInSeconds, 600);

      // Cleanup
      await provider.deleteQueue(queueName);
    });
  });

  describe('getQueue', () => {
    it('should get an existing queue', async () => {
      const queueInfo = await provider.getQueue(testQueueName);

      assert.equal(queueInfo.name, testQueueName);
      assert.equal(queueInfo.state, 'RUNNING');
    });
  });

  describe('listQueues', () => {
    it('should list all queues', async () => {
      const { queues } = await provider.listQueues();

      assert(Array.isArray(queues));
      assert(queues.length > 0);
      assert(queues.some((q) => q.name === testQueueName));
    });
  });

  describe('createHttpTask', () => {
    it('should create an HTTP task with valid config', async () => {
      const taskResult = await provider.createHttpTask(
        testQueueName,
        {
          url: 'https://httpbin.org/post',
          httpMethod: HttpMethod.POST,
          body: JSON.stringify({ test: 'data' }),
          headers: {
            'Content-Type': 'application/json'
          }
        },
        {
          priority: 5
        }
      );

      assert.equal(typeof taskResult.name, 'string');
      assert(taskResult.name.length > 0);
      assert.equal(taskResult.priority, 5);
    });

    it('should throw InvalidTaskConfigError for invalid URL', async () => {
      await assert.rejects(
        async () => {
          await provider.createHttpTask(testQueueName, {
            url: 'not-a-valid-url',
            httpMethod: HttpMethod.POST
          });
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Invalid URL/);
          return true;
        }
      );
    });

    it('should throw InvalidTaskConfigError for invalid HTTP method', async () => {
      await assert.rejects(
        async () => {
          await provider.createHttpTask(testQueueName, {
            url: 'https://httpbin.org/post',
            httpMethod: 'INVALID' as HttpMethod
          });
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Invalid HTTP method/);
          return true;
        }
      );
    });

    it('should throw InvalidTaskConfigError for priority out of range', async () => {
      await assert.rejects(
        async () => {
          await provider.createHttpTask(
            testQueueName,
            {
              url: 'https://httpbin.org/post',
              httpMethod: HttpMethod.POST
            },
            {
              priority: 15 // Invalid: must be 0-10
            }
          );
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Priority must be between 0 and 10/);
          return true;
        }
      );
    });

    it('should throw InvalidTaskConfigError for oversized header', async () => {
      // Create a header that exceeds 8KB
      const largeHeaderValue = 'x'.repeat(9 * 1024);

      await assert.rejects(
        async () => {
          await provider.createHttpTask(testQueueName, {
            url: 'https://httpbin.org/post',
            httpMethod: 'POST',
            headers: {
              'X-Large-Header': largeHeaderValue
            }
          });
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /exceeds 8KB limit/);
          return true;
        }
      );
    });

    it('should throw InvalidTaskConfigError for oversized total headers', async () => {
      // Create headers that exceed 100KB total
      const headers: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        headers[`X-Header-${i}`] = 'x'.repeat(6 * 1024); // ~6KB each
      }

      await assert.rejects(
        async () => {
          await provider.createHttpTask(testQueueName, {
            url: 'https://httpbin.org/post',
            httpMethod: 'POST',
            headers
          });
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Total headers size exceeds 100KB limit/);
          return true;
        }
      );
    });

    it('should throw InvalidTaskConfigError for invalid task name', async () => {
      await assert.rejects(
        async () => {
          await provider.createHttpTask(
            testQueueName,
            {
              url: 'https://httpbin.org/post',
              httpMethod: 'POST'
            },
            {
              name: `tasks/Invalid-Task-Name-${Date.now()}`
            }
          );
        },
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /Invalid task name/);
          return true;
        }
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      const isHealthy = await provider.healthCheck();

      assert.equal(isHealthy, true);
    });
  });

  describe('deleteQueue', () => {
    it('should delete an existing queue', async () => {
      const queueName = `${testQueueName}-to-delete`;
      await provider.createQueue(queueName);

      await provider.deleteQueue(queueName);

      // Verify queue is deleted
      await assert.rejects(
        async () => {
          await provider.getQueue(queueName);
        },
        (error: Error) => {
          assert(error instanceof Error);
          assert.match(error.message, /not found/);
          return true;
        }
      );
    });
  });
});

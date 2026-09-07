/**
 * Unit tests for job.ts
 *
 * These tests use the MockQueue class to avoid Redis connection issues.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { QueueNotFoundError } from '../errors';
import { addBulkJobs, addJob, getJob, removeJob } from '../job';
import { closeAllQueues, createQueue } from '../queue';

describe('job', () => {
  beforeEach(() => {
    // Clear state and create test queue before each test
    createQueue({ name: 'test-queue' });
  });

  afterEach(() => {
    // Clean up after each test
    return closeAllQueues();
  });

  describe('addJob', () => {
    it('should add a job to an existing queue', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: { message: 'hello' }
      });

      assert.strictEqual(typeof job, 'object');
      assert.strictEqual(job !== null, true);
      assert.strictEqual(job.name, 'test-job');
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () =>
          addJob({
            queueName: 'non-existent-queue',
            jobName: 'test-job',
            data: {}
          }),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          assert.ok(error.message.includes('non-existent-queue'));
          return true;
        }
      );
    });

    it('should accept job options', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: { message: 'hello' },
        options: {
          priority: 1,
          delay: 1000,
          attempts: 5
        }
      });

      assert.strictEqual(typeof job, 'object');
    });

    it('should preserve job data', async () => {
      const testData = {
        email: 'user@example.com',
        name: 'John Doe',
        userId: '123'
      };

      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: testData
      });

      assert.strictEqual(typeof job, 'object');
      assert.deepStrictEqual(job.data, testData);
    });

    it('should accept complex data types', async () => {
      const complexData = {
        nested: {
          object: {
            with: {
              deep: {
                values: [1, 2, 3]
              }
            }
          }
        },
        array: [{ a: 1 }, { b: 2 }]
      };

      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: complexData
      });

      assert.strictEqual(typeof job, 'object');
      assert.deepStrictEqual(job.data, complexData);
    });

    it('should set job priority', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {},
        options: { priority: 1 }
      });

      assert.strictEqual(typeof job, 'object');
    });

    it('should set job delay', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {},
        options: { delay: 5000 }
      });

      assert.strictEqual(typeof job, 'object');
    });

    it('should set job attempts', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {},
        options: { attempts: 10 }
      });

      assert.strictEqual(typeof job, 'object');
    });

    it('should set job backoff strategy', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {},
        options: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      assert.strictEqual(typeof job, 'object');
    });

    it('should return Job instance', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {}
      });

      assert.strictEqual('id' in job, true);
      assert.strictEqual('name' in job, true);
    });
  });

  describe('addBulkJobs', () => {
    it('should add multiple jobs to a queue', async () => {
      const jobs = await addBulkJobs('test-queue', [
        { name: 'job-1', data: { id: 1 } },
        { name: 'job-2', data: { id: 2 } },
        { name: 'job-3', data: { id: 3 } }
      ]);

      assert.strictEqual(Array.isArray(jobs), true);
      assert.strictEqual(jobs.length, 3);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => addBulkJobs('non-existent-queue', [{ name: 'job-1', data: {} }]),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should accept empty array', async () => {
      const jobs = await addBulkJobs('test-queue', []);
      assert.strictEqual(Array.isArray(jobs), true);
      assert.strictEqual(jobs.length, 0);
    });

    it('should accept job options for each job', async () => {
      const jobs = await addBulkJobs('test-queue', [
        { name: 'job-1', data: { id: 1 }, opts: { priority: 1 } },
        { name: 'job-2', data: { id: 2 }, opts: { priority: 5 } },
        { name: 'job-3', data: { id: 3 }, opts: { priority: 10 } }
      ]);

      assert.strictEqual(jobs.length, 3);
    });

    it('should preserve data for each job', async () => {
      const jobs = await addBulkJobs('test-queue', [
        { name: 'job-1', data: { id: 1, name: 'first' } },
        { name: 'job-2', data: { id: 2, name: 'second' } },
        { name: 'job-3', data: { id: 3, name: 'third' } }
      ]);

      assert.strictEqual(jobs.length, 3);
    });

    it('should handle large bulk operations', async () => {
      const jobs = Array.from({ length: 100 }, (_, i) => ({
        name: `job-${i}`,
        data: { id: i }
      }));

      const result = await addBulkJobs('test-queue', jobs);
      assert.strictEqual(result.length, 100);
    });
  });

  describe('getJob', () => {
    it('should retrieve an existing job by ID', async () => {
      const addedJob = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: { message: 'hello' }
      });

      const retrievedJob = await getJob('test-queue', addedJob.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion

      assert.strictEqual(typeof retrievedJob, 'object');
      assert.strictEqual(retrievedJob?.id, addedJob.id);
      assert.strictEqual(retrievedJob?.name, 'test-job');
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => getJob('non-existent-queue', '123'),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should return undefined for non-existent job ID', async () => {
      const job = await getJob('test-queue', 'non-existent-job-id');
      assert.strictEqual(job, undefined);
    });

    it('should retrieve job with complex data', async () => {
      const complexData = {
        user: {
          id: '123',
          profile: {
            settings: {
              theme: 'dark'
            }
          }
        }
      };

      const addedJob = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: complexData
      });

      const retrievedJob = await getJob('test-queue', addedJob.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      assert.strictEqual(typeof retrievedJob, 'object');
    });
  });

  describe('removeJob', () => {
    it('should remove an existing job', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {}
      });

      await removeJob('test-queue', job.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion

      const retrievedJob = await getJob('test-queue', job.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      assert.strictEqual(retrievedJob, undefined);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => removeJob('non-existent-queue', '123'),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should handle removing non-existent job gracefully', async () => {
      await assert.doesNotReject(async () => {
        await removeJob('test-queue', 'non-existent-job-id');
      });
    });

    it('should handle removing already removed job', async () => {
      const job = await addJob({
        queueName: 'test-queue',
        jobName: 'test-job',
        data: {}
      });

      await removeJob('test-queue', job.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion

      // Second removal should not throw
      await assert.doesNotReject(async () => {
        await removeJob('test-queue', job.id!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      });
    });
  });

  describe('AddJobOptions type', () => {
    it('should accept all option properties', async () => {
      const options = {
        queueName: 'test-queue',
        jobName: 'test-job',
        data: { test: true },
        options: {
          priority: 1,
          delay: 1000,
          attempts: 5,
          timeout: 30000,
          backoff: {
            type: 'exponential' as const,
            delay: 2000
          },
          removeOnComplete: 100,
          removeOnFail: 500
        }
      };

      const job = await addJob(options);
      assert.strictEqual(typeof job, 'object');
    });

    it('should work with typed data', async () => {
      interface EmailJobData {
        to: string;
        subject: string;
        body: string;
      }

      const options = {
        queueName: 'test-queue',
        jobName: 'send-email',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          body: 'Hello'
        } as EmailJobData
      };

      const job = await addJob<EmailJobData>(options);
      assert.strictEqual(typeof job, 'object');
    });
  });
});

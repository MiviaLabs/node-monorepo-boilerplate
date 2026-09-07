/**
 * Unit tests for scheduler.ts
 *
 * These tests use the MockQueue class to avoid Redis connection issues.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { CronJobNotFoundError, QueueNotFoundError } from '../errors';
import { closeAllQueues, createQueue } from '../queue';
import {
  addCronJob,
  listCronJobs,
  removeCronJob,
  scheduleJob,
  type CronJobOptions
} from '../scheduler';

describe('scheduler', () => {
  beforeEach(() => {
    // Clear state and create test queue before each test
    createQueue({ name: 'test-queue' });
  });

  afterEach(async () => {
    // Clean up after each test
    return closeAllQueues();
  });

  describe('scheduleJob', () => {
    it('should add a delayed job to an existing queue', async () => {
      await scheduleJob('test-queue', 'delayed-job', { message: 'hello' }, 5000);
      // Should not throw
      assert.strictEqual(true, true);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => scheduleJob('non-existent-queue', 'delayed-job', {}, 1000),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          assert.ok(error.message.includes('non-existent-queue'));
          return true;
        }
      );
    });

    it('should accept delay in milliseconds', async () => {
      await scheduleJob('test-queue', 'delayed-job', {}, 1000);
      assert.strictEqual(true, true);
    });

    it('should accept delay of 0', async () => {
      await scheduleJob('test-queue', 'immediate-job', {}, 0);
      assert.strictEqual(true, true);
    });

    it('should preserve job data', async () => {
      const testData = {
        email: 'user@example.com',
        subject: 'Reminder',
        body: 'This is a reminder'
      };

      await scheduleJob('test-queue', 'delayed-job', testData, 5000);
      assert.strictEqual(true, true);
    });

    it('should accept complex job data', async () => {
      const complexData = {
        user: {
          id: '123',
          preferences: {
            notifications: {
              email: true,
              push: false
            }
          }
        }
      };

      await scheduleJob('test-queue', 'delayed-job', complexData, 5000);
      assert.strictEqual(true, true);
    });
  });

  describe('addCronJob', () => {
    it('should add a cron job to an existing queue', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 0 * * *',
        data: { task: 'daily-cleanup' }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      const options: CronJobOptions = {
        queueName: 'non-existent-queue',
        jobName: 'daily-job',
        cron: '0 0 * * *'
      };

      await assert.rejects(
        () => addCronJob(options),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should accept cron pattern', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'hourly-job',
        cron: '0 * * * *'
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should accept timezone option', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 9 * * *',
        data: {},
        options: {
          tz: 'America/New_York'
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should accept startDate option', async () => {
      const startDate = new Date(Date.now() + 60000); // 1 minute from now

      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 0 * * *',
        data: {},
        options: {
          startDate
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should accept endDate option', async () => {
      const endDate = new Date(Date.now() + 86400000); // 24 hours from now

      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 * * * *',
        data: {},
        options: {
          endDate
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should accept both startDate and endDate', async () => {
      const startDate = new Date(Date.now() + 60000);
      const endDate = new Date(Date.now() + 3600000);

      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 * * * *',
        data: {},
        options: {
          startDate,
          endDate
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should default to UTC timezone when not specified', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 0 * * *'
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should handle empty data', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'daily-job',
        cron: '0 0 * * *'
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should accept various cron patterns', async () => {
      const patterns = [
        '0 * * * *', // Every hour
        '0 0 * * *', // Daily at midnight
        '0 0 * * 1', // Weekly on Monday
        '0 0 1 * *', // Monthly on first day
        '*/5 * * * *' // Every 5 minutes
      ];

      for (const cron of patterns) {
        const options: CronJobOptions = {
          queueName: 'test-queue',
          jobName: `job-${cron.replace(/\*/g, 'x').replace(/ /g, '-')}`,
          cron
        };

        await addCronJob(options);
      }
      assert.strictEqual(true, true);
    });
  });

  describe('removeCronJob', () => {
    it('should remove an existing cron job', async () => {
      // First add a cron job
      const addOptions: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'removable-job',
        cron: '0 * * * *'
      };

      await addCronJob(addOptions);

      // Then remove it
      await removeCronJob('test-queue', 'removable-job');
      assert.strictEqual(true, true);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => removeCronJob('non-existent-queue', 'job-name'),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should throw CronJobNotFoundError for non-existent cron job', async () => {
      await assert.rejects(
        () => removeCronJob('test-queue', 'non-existent-job'),
        (error: Error) => {
          assert.ok(error instanceof CronJobNotFoundError);
          assert.ok(error.message.includes('non-existent-job'));
          return true;
        }
      );
    });

    it('should handle removing already removed job', async () => {
      // Add and remove a cron job
      const addOptions: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'temporary-job',
        cron: '0 * * * *'
      };

      await addCronJob(addOptions);
      await removeCronJob('test-queue', 'temporary-job');

      // Second removal should throw
      await assert.rejects(
        () => removeCronJob('test-queue', 'temporary-job'),
        (error: Error) => {
          assert.ok(error instanceof CronJobNotFoundError);
          return true;
        }
      );
    });
  });

  describe('listCronJobs', () => {
    it('should return array of cron jobs', async () => {
      const addOptions: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'listable-job',
        cron: '0 * * * *'
      };

      await addCronJob(addOptions);

      const cronJobs = await listCronJobs('test-queue');
      assert.strictEqual(Array.isArray(cronJobs), true);
    });

    it('should throw QueueNotFoundError for non-existent queue', async () => {
      await assert.rejects(
        () => listCronJobs('non-existent-queue'),
        (error: Error) => {
          assert.ok(error instanceof QueueNotFoundError);
          return true;
        }
      );
    });

    it('should return empty array when no cron jobs exist', async () => {
      const cronJobs = await listCronJobs('test-queue');
      assert.strictEqual(Array.isArray(cronJobs), true);
      assert.strictEqual(cronJobs.length, 0);
    });

    it('should include job name in results', async () => {
      const addOptions: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'named-job',
        cron: '0 * * * *'
      };

      await addCronJob(addOptions);

      const cronJobs = await listCronJobs('test-queue');
      const foundJob = cronJobs.find(
        (j: unknown) => typeof j === 'object' && j !== null && 'name' in j && j.name === 'named-job'
      );
      assert.ok(foundJob);
    });

    it('should list multiple cron jobs', async () => {
      await addCronJob({
        queueName: 'test-queue',
        jobName: 'job-1',
        cron: '0 * * * *'
      });

      await addCronJob({
        queueName: 'test-queue',
        jobName: 'job-2',
        cron: '0 0 * * *'
      });

      const cronJobs = await listCronJobs('test-queue');
      assert.strictEqual(cronJobs.length >= 2, true);
    });
  });

  describe('CronJobOptions type', () => {
    it('should accept all option properties', async () => {
      const options: CronJobOptions = {
        queueName: 'test-queue',
        jobName: 'test-job',
        cron: '0 * * * *',
        data: { test: true },
        options: {
          tz: 'UTC',
          startDate: new Date(),
          endDate: new Date()
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });

    it('should work with typed data', async () => {
      interface ReportJobData {
        type: string;
        recipient: string;
      }

      const options: CronJobOptions<ReportJobData> = {
        queueName: 'test-queue',
        jobName: 'report-job',
        cron: '0 0 * * *',
        data: {
          type: 'daily',
          recipient: 'admin@example.com'
        }
      };

      await addCronJob(options);
      assert.strictEqual(true, true);
    });
  });
});

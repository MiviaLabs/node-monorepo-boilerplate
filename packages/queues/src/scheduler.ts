import { DEFAULT_SCHEDULER_CONFIG } from './config/defaults';
import { CronJobNotFoundError, QueueNotFoundError } from './errors';
import { getQueue, TEST_MODE } from './queue';

import type { IResolvedInfrastructureQueuesConfig } from './config/interfaces';

/**
 * Current configuration for scheduler
 * Set via setSchedulerConfig() to use resolved configuration
 */
let currentConfig: IResolvedInfrastructureQueuesConfig['scheduler'] | null = null;

/**
 * Set the scheduler configuration
 *
 * @param config - Resolved scheduler configuration
 */
export function setSchedulerConfig(config: IResolvedInfrastructureQueuesConfig['scheduler']): void {
  currentConfig = config;
}

/**
 * Get the current scheduler configuration (defaults or resolved)
 *
 * @returns Current scheduler configuration
 */
function getSchedulerConfig(): IResolvedInfrastructureQueuesConfig['scheduler'] {
  return currentConfig || DEFAULT_SCHEDULER_CONFIG;
}

/**
 * Schedule a delayed job
 *
 * Adds a job to the queue that will only be processed after the specified delay.
 * Useful for scheduled reminders, timed actions, and deferred processing.
 *
 * Common delay values (in milliseconds):
 * - 30 seconds: `30 * 1000`
 * - 5 minutes: `5 * 60 * 1000`
 * - 1 hour: `60 * 60 * 1000`
 * - 24 hours: `24 * 60 * 60 * 1000`
 *
 * @param queueName - Name of the queue
 * @param jobName - Name/type of the job
 * @param data - Job data payload
 * @param delay - Delay in milliseconds before the job is processed
 * @returns Promise that resolves when the job is scheduled
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example Basic delayed job (tenant-aware)
 * ```typescript
 * // Schedule a reminder in 5 minutes
 * await scheduleJob(
 *   'emails',
 *   'reminder',
 *   { tenantId: 'org-abc', userId: 'user-123', message: 'Meeting in 5 minutes' },
 *   5 * 60 * 1000  // 5 minutes
 * );
 * ```
 *
 * @example Delayed welcome email after signup
 * ```typescript
 * // Send welcome email 30 seconds after user signs up
 * // Prefer passing userId only; fetch PII in processor to minimize exposure
 * await scheduleJob(
 *   'emails',
 *   'send-welcome',
 *   {
 *     tenantId: 'tenant-456',
 *     userId: newUser.id,
 *   },
 *   30 * 1000  // 30 seconds
 * );
 * ```
 *
 * @example Scheduled retry after external service failure
 * ```typescript
 * // Retry webhook delivery after 1 hour
 * try {
 *   await deliverWebhook(tenantId, webhookUrl, payload);
 * } catch (error) {
 *   // External service unavailable, retry later
 *   await scheduleJob(
 *     'webhooks',
 *     'retry-delivery',
 *     {
 *       tenantId,
 *       webhookUrl,
 *       payload,
 *       attemptNumber: 1,
 *     },
 *     60 * 60 * 1000  // 1 hour
 *   );
 * }
 * ```
 *
 * @example Scheduled cleanup tasks
 * ```typescript
 * // Schedule session cleanup 24 hours after creation
 * await scheduleJob(
 *   'maintenance',
 *   'cleanup-session',
 *   { tenantId: 'tenant-123', sessionId: session.id },
 *   24 * 60 * 60 * 1000  // 24 hours
 * );
 * ```
 */
export async function scheduleJob<T = unknown>(
  queueName: string,
  jobName: string,
  data: T,
  delay: number
): Promise<void> {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  await queue.add(jobName, data, { delay });
}

/**
 * Options for creating a cron job.
 *
 * Common cron patterns:
 * - `'* * * * *'` - Every minute
 * - `'0 * * * *'` - Every hour (at minute 0)
 * - `'0 0 * * *'` - Daily at midnight
 * - `'0 9 * * 1-5'` - Weekdays at 9am
 * - `'0 0 * * 0'` - Weekly on Sunday at midnight
 * - `'0 0 1 * *'` - Monthly on the 1st at midnight
 *
 * Pattern format: `minute hour day-of-month month day-of-week`
 */
export interface ICronJobOptions<T = unknown> {
  /**
   * Name of the queue
   */
  queueName: string;

  /**
   * Name/type of the job
   */
  jobName: string;

  /**
   * Cron pattern (e.g., '0 0 * * *' for daily at midnight)
   */
  cron: string;

  /**
   * Job data payload
   */
  data?: T;

  /**
   * Additional options
   */
  options?: {
    /**
     * Timezone for the cron schedule
     * @default 'UTC' (or configured default)
     */
    tz?: string;

    /**
     * Start date for the cron job
     */
    startDate?: Date;

    /**
     * End date for the cron job
     */
    endDate?: Date;
  };
}

/**
 * Backwards-compatible alias for ICronJobOptions.
 * @deprecated Use ICronJobOptions instead. Will be removed in v2.0.0.
 */
export type CronJobOptions<T = unknown> = ICronJobOptions<T>;

/**
 * Add a recurring cron job
 *
 * Creates a job that runs on a schedule defined by a cron expression.
 * The job is automatically added to the queue at each scheduled time.
 *
 * **Cron Expression Format:** `minute hour day-of-month month day-of-week`
 *
 * Common patterns:
 * - `'* * * * *'` - Every minute
 * - `'0 * * * *'` - Every hour (at minute 0)
 * - `'0 0 * * *'` - Daily at midnight
 * - `'0 9 * * 1-5'` - Weekdays at 9am
 * - `'0 0 * * 0'` - Weekly on Sunday at midnight
 * - `'0 0 1 * *'` - Monthly on the 1st at midnight
 *
 * @param options - Cron job options
 * @returns Promise that resolves when the cron job is added
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example Daily report at midnight UTC (tenant-aware)
 * ```typescript
 * // Generate daily analytics report for a tenant
 * await addCronJob({
 *   queueName: 'reports',
 *   jobName: 'daily-analytics',
 *   cron: '0 0 * * *',  // Midnight UTC
 *   data: {
 *     tenantId: 'tenant-123',
 *     reportType: 'analytics',
 *     period: 'daily',
 *   },
 * });
 * ```
 *
 * @example Weekday reminders in a specific timezone
 * ```typescript
 * // Send standup reminder every weekday at 9am Eastern
 * await addCronJob({
 *   queueName: 'notifications',
 *   jobName: 'standup-reminder',
 *   cron: '0 9 * * 1-5',  // Mon-Fri at 9:00
 *   data: {
 *     tenantId: 'tenant-456',
 *     teamId: 'team-abc',
 *     message: 'Daily standup in 15 minutes!',
 *   },
 *   options: { tz: 'America/New_York' },
 * });
 * ```
 *
 * @example Monthly billing with date range
 * ```typescript
 * // Process monthly billing on the 1st of each month
 * await addCronJob({
 *   queueName: 'billing',
 *   jobName: 'process-monthly',
 *   cron: '0 2 1 * *',  // 1st of month at 2am
 *   data: {
 *     tenantId: 'tenant-789',
 *     billingType: 'monthly',
 *   },
 *   options: {
 *     tz: 'UTC',
 *     // Only run for the next year
 *     startDate: new Date('2024-01-01'),
 *     endDate: new Date('2024-12-31'),
 *   },
 * });
 * ```
 *
 * @example Database maintenance every Sunday
 * ```typescript
 * // Weekly database vacuum/analyze on Sunday at 3am
 * await addCronJob({
 *   queueName: 'maintenance',
 *   jobName: 'database-optimize',
 *   cron: '0 3 * * 0',  // Sunday at 3am
 *   data: {
 *     tenantId: 'system',
 *     operations: ['vacuum', 'analyze', 'reindex'],
 *   },
 * });
 * ```
 *
 * @example Hourly cache refresh
 * ```typescript
 * // Refresh tenant cache every hour at minute 15
 * await addCronJob({
 *   queueName: 'cache',
 *   jobName: 'refresh-tenant-cache',
 *   cron: '15 * * * *',  // Every hour at :15
 *   data: {
 *     tenantId: 'tenant-abc',
 *     cacheKeys: ['users', 'permissions', 'settings'],
 *   },
 * });
 * ```
 */
export async function addCronJob<T = unknown>(options: ICronJobOptions<T>): Promise<void> {
  const { queueName, jobName, cron, data, options: cronOptions } = options;
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  const schedulerConfig = getSchedulerConfig();
  const repeat = {
    pattern: cron,
    tz: cronOptions?.tz ?? schedulerConfig.defaultTimezone,
    startDate: cronOptions?.startDate,
    endDate: cronOptions?.endDate
  };

  // In test mode, use the MockQueue's addRepeatable method directly
  if (TEST_MODE && 'addRepeatable' in queue) {
    (
      queue as unknown as { addRepeatable: (name: string, data: T, repeat: unknown) => void }
    ).addRepeatable(jobName, data ?? ({} as T), repeat);
  } else {
    await queue.add(jobName, data ?? ({} as T), { repeat });
  }
}

/**
 * Remove a recurring cron job
 *
 * @param queueName - Name of the queue
 * @param jobName - Name of the cron job to remove
 * @returns Promise that resolves when the cron job is removed
 * @throws {QueueNotFoundError} If the queue doesn't exist
 * @throws {CronJobNotFoundError} If the cron job doesn't exist
 *
 * @example
 * ```typescript
 * await removeCronJob('reports', 'daily-report');
 * ```
 */
export async function removeCronJob(queueName: string, jobName: string): Promise<void> {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  const repeatableJobs = await queue.getRepeatableJobs();
  const job = repeatableJobs.find((j) => j.name === jobName);

  if (!job) {
    throw new CronJobNotFoundError(queueName, jobName);
  }

  await queue.removeRepeatableByKey(job.key);
}

/**
 * List all cron jobs for a queue
 *
 * @param queueName - Name of the queue
 * @returns Promise that resolves to array of repeatable jobs
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example
 * ```typescript
 * const cronJobs = await listCronJobs('reports');
 * console.log('Cron jobs:', cronJobs);
 * // Output: [{ name: 'daily-report', pattern: '0 0 * * *', ... }]
 * ```
 */
export async function listCronJobs(queueName: string) {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  return queue.getRepeatableJobs();
}

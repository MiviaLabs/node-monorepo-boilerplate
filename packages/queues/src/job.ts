import { Job, JobsOptions } from 'bullmq';

import { QueueNotFoundError } from './errors';
import { getQueue } from './queue';

/**
 * Options for adding a job to a queue
 */
export interface AddJobOptions<T = unknown> {
  /**
   * Name of the queue to add the job to
   */
  queueName: string;

  /**
   * Name/type of the job
   */
  jobName: string;

  /**
   * Job data payload
   */
  data: T;

  /**
   * Additional job options
   */
  options?: JobsOptions;
}

/**
 * Add a job to a queue
 *
 * Adds a single job to the specified queue for background processing.
 * Jobs are processed by workers registered with matching queue names.
 *
 * @param options - Job options including queue name, job name, data, and options
 * @returns Promise that resolves to the created Job
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example Basic job creation (tenant-aware)
 * ```typescript
 * // Add a simple job with tenant context in data payload
 * await addJob({
 *   queueName: 'emails',
 *   jobName: 'send-welcome',
 *   data: { tenantId: 'tenant-123', userId: '123', templateId: 'welcome-v2' },
 * });
 * ```
 *
 * @example Idempotent job with custom jobId (tenant-scoped)
 * ```typescript
 * // Use jobId to prevent duplicate jobs (idempotency)
 * // If a job with this ID already exists, it won't be duplicated
 * const tenantId = 'tenant-123';
 * const orderId = 'order-456';
 * await addJob({
 *   queueName: 'payments',
 *   jobName: 'process-payment',
 *   data: { tenantId, orderId, amount: 99.99 },
 *   options: {
 *     jobId: `payment-${tenantId}-${orderId}`, // Tenant-scoped idempotency
 *   },
 * });
 * ```
 *
 * @example Priority job ordering (tenant-aware)
 * ```typescript
 * // Higher priority jobs (lower number) are processed first
 * // Priority 1 = highest, default is no priority
 * const tenantId = 'tenant-123';
 * await addJob({
 *   queueName: 'notifications',
 *   jobName: 'send-alert',
 *   data: { tenantId, type: 'security', message: 'Login from new device' },
 *   options: {
 *     priority: 1, // High priority - processed before lower priority jobs
 *   },
 * });
 *
 * await addJob({
 *   queueName: 'notifications',
 *   jobName: 'send-newsletter',
 *   data: { tenantId, campaignId: 'summer-sale' },
 *   options: {
 *     priority: 10, // Low priority - processed after higher priority jobs
 *   },
 * });
 * ```
 *
 * @example Per-job retry override (tenant-aware)
 * ```typescript
 * // Override default retry settings for specific jobs
 * await addJob({
 *   queueName: 'webhooks',
 *   jobName: 'deliver-webhook',
 *   data: {
 *     tenantId: 'tenant-123',
 *     url: 'https://api.example.com/hook',
 *     payload: { event: 'user.created' },
 *   },
 *   options: {
 *     attempts: 5, // Retry up to 5 times (overrides queue default of 3)
 *     backoff: {
 *       type: 'exponential', // 'exponential' or 'fixed'
 *       delay: 2000, // Start with 2 second delay, doubles each retry
 *     },
 *   },
 * });
 * ```
 */
export async function addJob<T = unknown>(options: AddJobOptions<T>): Promise<Job<T>> {
  const { queueName, jobName, data, options: jobOptions } = options;
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  return queue.add(jobName, data, jobOptions);
}

/**
 * Add multiple jobs to a queue in bulk
 *
 * Efficiently adds multiple jobs atomically to a queue. This is significantly
 * more performant than calling addJob() multiple times as it uses a single
 * Redis pipeline operation.
 *
 * @param queueName - Name of the queue
 * @param jobs - Array of jobs to add
 * @returns Promise that resolves to array of created Jobs
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example Basic batch job creation (tenant-aware)
 * ```typescript
 * // Add multiple jobs of the same type with tenant context
 * const tenantId = 'tenant-123';
 * const userIds = ['user-1', 'user-2', 'user-3'];
 * await addBulkJobs('emails', userIds.map(userId => ({
 *   name: 'send-welcome',
 *   data: { tenantId, userId },
 * })));
 * ```
 *
 * @example Mixed job types with different options (tenant-aware)
 * ```typescript
 * // Each job can have different options (priority, delay, etc.)
 * const tenantId = 'tenant-123';
 * await addBulkJobs('notifications', [
 *   {
 *     name: 'send-sms',
 *     data: { tenantId, userId: 'user-456', message: 'Your order shipped!' },
 *     opts: { priority: 1 }, // High priority
 *   },
 *   {
 *     name: 'send-email',
 *     data: { tenantId, userId: 'user-456', template: 'order-shipped' },
 *     opts: { priority: 5 }, // Medium priority
 *   },
 *   {
 *     name: 'send-push',
 *     data: { tenantId, userId: 'user-456', title: 'Order Update' },
 *     opts: { priority: 10 }, // Low priority
 *   },
 * ]);
 * ```
 *
 * @example Batch with idempotent job IDs (tenant-scoped)
 * ```typescript
 * // Use jobId for each job to ensure idempotency per tenant
 * const tenantId = 'tenant-123';
 * const orders = await getOrdersToProcess(tenantId);
 * await addBulkJobs('order-processing', orders.map(order => ({
 *   name: 'process-order',
 *   data: { tenantId, orderId: order.id, items: order.items },
 *   opts: {
 *     jobId: `process-order-${tenantId}-${order.id}`, // Tenant-scoped idempotency
 *   },
 * })));
 * ```
 *
 * @example High-volume batch processing (tenant-aware)
 * ```typescript
 * // Process large datasets in chunks to avoid memory issues
 * const BATCH_SIZE = 1000;
 * const tenantId = 'tenant-123';
 * const campaignId = 'monthly-update';
 * const allUsers = await getAllUsersForNewsletter(tenantId);
 *
 * for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
 *   const batch = allUsers.slice(i, i + BATCH_SIZE);
 *   await addBulkJobs('newsletters', batch.map(user => ({
 *     name: 'send-newsletter',
 *     data: { tenantId, userId: user.id, campaignId },
 *     opts: { jobId: `newsletter-${tenantId}-${user.id}-${campaignId}` },
 *   })));
 * }
 * ```
 */
export async function addBulkJobs<T = unknown>(
  queueName: string,
  jobs: Array<{ name: string; data: T; opts?: JobsOptions }>
): Promise<Job<T>[]> {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  return queue.addBulk(jobs);
}

/**
 * Get a job by ID from a queue
 *
 * @param queueName - Name of the queue
 * @param jobId - ID of the job
 * @returns Promise that resolves to the Job or undefined if not found
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example
 * ```typescript
 * const job = await getJob('emails', '123');
 * if (job) {
 *   console.log('Job state:', await job.getState());
 * }
 * ```
 */
export async function getJob<T = unknown>(
  queueName: string,
  jobId: string
): Promise<Job<T> | undefined> {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  return queue.getJob(jobId);
}

/**
 * Remove a job from a queue
 *
 * @param queueName - Name of the queue
 * @param jobId - ID of the job to remove
 * @returns Promise that resolves when the job is removed
 * @throws {QueueNotFoundError} If the queue doesn't exist
 *
 * @example
 * ```typescript
 * await removeJob('emails', '123');
 * ```
 */
export async function removeJob(queueName: string, jobId: string): Promise<void> {
  const queue = getQueue(queueName);
  if (!queue) {
    throw new QueueNotFoundError(queueName);
  }

  const job = await queue.getJob(jobId);
  if (job) {
    await job.remove();
  }
}

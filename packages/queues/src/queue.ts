import { logger, redactJsonString, redactObject } from '@package/observability';
import { Queue, QueueOptions, JobsOptions } from 'bullmq';

import { DEFAULT_QUEUE_CONFIG } from './config/defaults';
import { InvalidQueueConfigError, JobNotFoundError, QueueNotFoundError } from './errors';

import type { IResolvedInfrastructureQueuesConfig } from './config/interfaces';

/**
 * Safely extracts error properties without exposing credentials.
 *
 * Filters out properties that may contain sensitive connection information
 * such as passwords, connection strings, or authentication tokens.
 *
 * @param error - The error object to sanitize
 * @returns A sanitized object safe for logging/error messages
 */
function sanitizeErrorForLogging(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { type: 'null_or_undefined' };
  }

  if (typeof error !== 'object') {
    return { type: typeof error, value: String(error) };
  }

  const sanitized: Record<string, unknown> = {};
  const errorObj = error as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(errorObj)) {
    const value = errorObj[key];

    // Redact connection URLs
    if (typeof value === 'string' && value.includes('://')) {
      sanitized[key] = '[REDACTED_URL]';
    } else if (key === 'message' && typeof value === 'string') {
      // Keep error message but sanitize any embedded JSON and plain-text PII
      // Patterns for common PII in plain text
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
      const phoneRegex = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
      const ssnRegex = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;

      // First sanitize any embedded JSON, then redact plain-text PII
      let msg = redactJsonString(value);
      msg = msg.replace(emailRegex, '[REDACTED_EMAIL]');
      msg = msg.replace(phoneRegex, '[REDACTED_PHONE]');
      msg = msg.replace(ssnRegex, '[REDACTED_SSN]');
      sanitized[key] = msg;
    } else if (key === 'name' && typeof value === 'string') {
      sanitized[key] = value;
    } else if (key === 'stack' && typeof value === 'string') {
      // Keep stack trace but redact URLs within it
      sanitized[key] = value.replace(/[a-z]+:\/\/[^\s]+/gi, '[REDACTED_URL]');
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects using redactObject
      sanitized[key] = redactObject(value as Record<string, unknown>);
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitized[key] = value;
    } else {
      sanitized[key] = '[object]';
    }
  }

  return sanitized;
}

let redisHealthCheckFn: (() => Promise<boolean>) | null = null;

type BullMqRedisConnection = {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
};

function getBullMqRedisConnection(): BullMqRedisConnection {
  return {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number.parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    db: Number.parseInt(process.env['REDIS_DB'] ?? '0', 10),
    username: process.env['REDIS_USER'],
    password: process.env['REDIS_PASSWORD'],
    // BullMQ requires null to avoid request retry limits on blocking operations.
    maxRetriesPerRequest: null
  };
}

async function getRedisHealthCheck() {
  if (!redisHealthCheckFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redis = require('@package/redis');
    redisHealthCheckFn = redis.healthCheck;
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return redisHealthCheckFn!();
}

/**
 * Test mode flag to bypass actual Redis connections
 */
export const TEST_MODE = process.env['NODE_ENV'] === 'test' || process.env['TEST_MODE'] === 'true';

/**
 * Current configuration for queues
 * Set via setQueueConfig() to use resolved configuration
 */
let currentConfig: IResolvedInfrastructureQueuesConfig['queue'] | null = null;

/**
 * Set the queue configuration
 *
 * @param config - Resolved queue configuration
 */
export function setQueueConfig(config: IResolvedInfrastructureQueuesConfig['queue']): void {
  currentConfig = config;
}

/**
 * Get the current queue configuration (defaults or resolved)
 *
 * @returns Current queue configuration
 */
function getQueueConfig(): IResolvedInfrastructureQueuesConfig['queue'] {
  return currentConfig || DEFAULT_QUEUE_CONFIG;
}

/**
 * Mock Queue class for testing
 */
class MockQueue {
  name: string;
  opts: QueueOptions & { connection?: QueueOptions['connection'] };
  private jobs = new Map<
    string,
    { id: string; name: string; data: unknown; queueName: string; remove: () => Promise<void> }
  >();
  private repeatableJobs = new Map<string, Record<string, unknown>>();

  constructor(name: string, opts: QueueOptions & { connection?: QueueOptions['connection'] }) {
    this.name = name;
    this.opts = opts;
  }

  async close(): Promise<void> {
    // Mock close implementation
  }

  async add(name: string, data: unknown, _opts?: JobsOptions) {
    const job = {
      id: `mock-job-${Date.now()}-${Math.random()}`,
      name,
      data,
      queueName: this.name,
      remove: async () => {
        this.jobs.delete(job.id);
      }
    };
    this.jobs.set(job.id, job);
    return job as unknown as ReturnType<Queue['add']>;
  }

  async addBulk(jobs: Array<{ name: string; data: unknown }>) {
    return jobs.map((job) => {
      const newJob = {
        id: `mock-job-${Date.now()}-${Math.random()}`,
        name: job.name,
        data: job.data,
        queueName: this.name,
        remove: async () => {
          this.jobs.delete(newJob.id);
        }
      };
      this.jobs.set(newJob.id, newJob);
      return newJob;
    });
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId);
  }

  async getRepeatableJobs() {
    return Array.from(this.repeatableJobs.values());
  }

  async removeRepeatableByKey(key: string) {
    this.repeatableJobs.delete(key);
  }

  async getJobCountByTypes(..._types: string[]) {
    return 0;
  }

  addRepeatable(name: string, _data: unknown, repeat: JobsOptions['repeat']) {
    if (!repeat) return;
    const key = `${name}:${JSON.stringify(repeat)}`;
    const job = { name, key, pattern: repeat.pattern, ...repeat };
    this.repeatableJobs.set(key, job);
  }
}

/**
 * Configuration for creating a queue instance
 */
export interface ICreateQueueOptions {
  /**
   * Unique name for the queue
   */
  name: string;

  /**
   * Default options for jobs added to this queue
   */
  defaultJobOptions?: QueueOptions['defaultJobOptions'];

  /**
   * Redis connection options
   * If not provided, uses the default Redis client from redis
   */
  connection?: QueueOptions['connection'];

  /**
   * Enable dead letter queue for failed jobs
   * When enabled, failed jobs will be moved to a DLQ instead of being removed
   * @default false
   */
  enableDeadLetterQueue?: boolean;

  /**
   * Custom dead letter queue name
   * If not provided, uses '{queueName}-dlq' pattern
   */
  deadLetterQueue?: string;
}

/**
 * Backward compatibility alias for ICreateQueueOptions.
 * @deprecated Use ICreateQueueOptions instead.
 */
export type CreateQueueOptions = ICreateQueueOptions;

/**
 * Internal registry of all created queues
 */
const queues = new Map<string, Queue>();

/**
 * Registry of DLQ mappings - maps queue name to its DLQ name
 */
const dlqMappings = new Map<string, string>();

/**
 * Create a new BullMQ queue or return an existing one with the same name
 *
 * Creates a queue with configured retry behavior, job retention, and optional
 * Dead Letter Queue. The queue must be created before adding jobs.
 *
 * @param config - Queue configuration
 * @returns BullMQ Queue instance
 *
 * @example Basic queue creation
 * ```typescript
 * // Create a simple queue with default settings
 * const emailQueue = createQueue({ name: 'emails' });
 * ```
 *
 * @example Queue with custom retry settings
 * ```typescript
 * // Override default retry behavior
 * const paymentQueue = createQueue({
 *   name: 'payments',
 *   defaultJobOptions: {
 *     attempts: 5,  // Retry 5 times
 *     backoff: {
 *       type: 'exponential',
 *       delay: 2000,  // Start at 2s, then 4s, 8s, 16s, 32s
 *     },
 *   },
 * });
 * ```
 *
 * @example Queue with Dead Letter Queue enabled
 * ```typescript
 * // Enable DLQ for failed job inspection and recovery
 * const criticalQueue = createQueue({
 *   name: 'critical-operations',
 *   enableDeadLetterQueue: true,  // Creates 'critical-operations-dlq'
 * });
 *
 * // Jobs that fail all retries are moved to DLQ automatically
 * // DLQ jobs contain metadata for debugging (see IDlqJobData):
 * // {
 * //   originalJobId: 'job-123',
 * //   originalData: { tenantId: 'tenant-456', orderId: 'order-789', ... },
 * //   failedReason: 'Connection timeout',
 * //   stacktrace: ['Error: ...', ...],
 * //   attemptsMade: 3,
 * //   failedAt: 1699999999999
 * // }
 * ```
 *
 * @example Queue with custom DLQ name
 * ```typescript
 * // Use a custom DLQ name instead of '{queueName}-dlq'
 * const webhookQueue = createQueue({
 *   name: 'webhooks',
 *   enableDeadLetterQueue: true,
 *   deadLetterQueue: 'webhook-failures',  // Custom DLQ name
 * });
 * ```
 *
 * @example Configuration via environment variables
 * ```bash
 * # Enable DLQ globally for all queues
 * QUEUE_ENABLE_DEAD_LETTER_QUEUE=true
 * QUEUE_DEAD_LETTER_QUEUE_SUFFIX=-dlq
 *
 * # Retry settings (apply to all queues unless overridden)
 * QUEUE_DEFAULT_JOB_ATTEMPTS=3
 * QUEUE_DEFAULT_JOB_BACKOFF_TYPE=exponential
 * QUEUE_DEFAULT_JOB_BACKOFF_DELAY=1000
 * ```
 */
export function createQueue(config: ICreateQueueOptions): Queue {
  const existingQueue = queues.get(config.name);
  if (existingQueue) {
    return existingQueue;
  }

  const enableDLQ = config.enableDeadLetterQueue ?? getQueueConfig().enableDeadLetterQueue;
  const dlqName =
    config.deadLetterQueue ?? `${config.name}${getQueueConfig().deadLetterQueueSuffix}`;

  // In test mode, use MockQueue directly without calling getRedisClient
  if (TEST_MODE) {
    const queueConfig = getQueueConfig();
    const queueOptions = {
      defaultJobOptions: {
        removeOnComplete: {
          count: queueConfig.removeOnCompleteCount,
          age: queueConfig.removeOnCompleteAge
        },
        // When DLQ is enabled, don't remove failed jobs automatically
        removeOnFail: enableDLQ
          ? 0
          : {
              count: queueConfig.removeOnFailCount,
              age: queueConfig.removeOnFailAge
            },
        attempts: queueConfig.defaultJobAttempts,
        backoff: {
          type: queueConfig.defaultJobBackoffType,
          delay: queueConfig.defaultJobBackoffDelay
        },
        ...config.defaultJobOptions
      }
    } as QueueOptions & { connection?: QueueOptions['connection'] };

    if (config.connection) {
      queueOptions.connection = config.connection;
    }

    const queue = new MockQueue(config.name, queueOptions) as unknown as Queue;
    queues.set(config.name, queue);

    // Create DLQ if enabled
    if (enableDLQ) {
      const dlqOptions = {
        defaultJobOptions: {
          removeOnComplete: {
            count: queueConfig.removeOnCompleteCount,
            age: queueConfig.removeOnCompleteAge
          },
          removeOnFail: {
            count: queueConfig.removeOnFailCount,
            age: queueConfig.removeOnFailAge
          }
        }
      } as QueueOptions & { connection?: QueueOptions['connection'] };

      if (config.connection) {
        dlqOptions.connection = config.connection;
      }

      const dlq = new MockQueue(dlqName, dlqOptions) as unknown as Queue;
      queues.set(dlqName, dlq);
      // Register DLQ mapping
      dlqMappings.set(config.name, dlqName);
    }

    return queue;
  }

  // Production mode: use real BullMQ Queue
  const queueConfig = getQueueConfig();
  const queueOptions: QueueOptions = {
    connection: config.connection ?? getBullMqRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: {
        count: queueConfig.removeOnCompleteCount,
        age: queueConfig.removeOnCompleteAge
      },
      // When DLQ is enabled, don't remove failed jobs automatically
      removeOnFail: enableDLQ
        ? 0
        : {
            count: queueConfig.removeOnFailCount,
            age: queueConfig.removeOnFailAge
          },
      attempts: queueConfig.defaultJobAttempts,
      backoff: {
        type: queueConfig.defaultJobBackoffType,
        delay: queueConfig.defaultJobBackoffDelay
      },
      ...config.defaultJobOptions
    }
  };

  const queue = new Queue(config.name, queueOptions);

  queues.set(config.name, queue);

  // Create DLQ if enabled
  if (enableDLQ) {
    const dlq = new Queue(dlqName, {
      connection: config.connection ?? getBullMqRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          count: queueConfig.removeOnCompleteCount,
          age: queueConfig.removeOnCompleteAge
        },
        removeOnFail: {
          count: queueConfig.removeOnFailCount,
          age: queueConfig.removeOnFailAge
        }
      }
    });
    queues.set(dlqName, dlq);
    // Register DLQ mapping
    dlqMappings.set(config.name, dlqName);
  }

  return queue;
}

/**
 * Get an existing queue by name
 *
 * @param name - Queue name
 * @returns Queue instance or undefined if not found
 */
export function getQueue(name: string): Queue | undefined {
  return queues.get(name);
}

/**
 * Get all registered queue names
 *
 * @returns Array of queue names
 */
export function getAllQueueNames(): string[] {
  return Array.from(queues.keys());
}

/**
 * Close all queues and clear the registry
 *
 * @returns Promise that resolves when all queues are closed
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((queue) => queue.close());
  await Promise.all(closePromises);
  queues.clear();
  dlqMappings.clear();
}

/**
 * Metadata structure for jobs moved to the Dead Letter Queue.
 *
 * Contains comprehensive debugging information for failed job inspection
 * and potential recovery. The `originalData` field preserves the complete
 * job payload including tenant context for proper isolation.
 *
 * @example Inspecting DLQ job metadata
 * ```typescript
 * const dlqJob = await dlq.getJob(jobId);
 * const metadata: IDlqJobData = dlqJob.data;
 * console.log(`Tenant: ${metadata.originalData.tenantId}`);
 * console.log(`Failed: ${metadata.failedReason}`);
 * ```
 */
export interface IDlqJobData<T = unknown> {
  /**
   * Original job ID for tracking and correlation
   */
  originalJobId: string;

  /**
   * Original job payload (includes tenantId for multi-tenant isolation)
   */
  originalData: T;

  /**
   * Human-readable reason why the job failed
   */
  failedReason: string;

  /**
   * Full error stack trace for debugging
   */
  stacktrace: string[];

  /**
   * Number of retry attempts made before failure
   */
  attemptsMade: number;

  /**
   * Unix timestamp (milliseconds) when the job was moved to DLQ
   */
  failedAt: number;
}

/**
 * Move a failed job to its Dead Letter Queue
 *
 * Moves a job to the DLQ for later inspection, debugging, and potential
 * reprocessing. This preserves all job metadata including the failure reason.
 *
 * **When to use:**
 * - Automatically: Configure in worker's `failed` event handler
 * - Manually: For jobs that need human intervention
 *
 * **DLQ Job Metadata:**
 * The moved job contains comprehensive debugging information.
 * See {@link IDlqJobData} for the complete structure.
 *
 * @param queueName - The name of the queue the job belongs to
 * @param jobId - The ID of the failed job
 * @returns Promise that resolves when the job is moved to DLQ
 * @throws {InvalidQueueConfigError} When DLQ is not enabled or has invalid configuration for the queue
 * @throws {QueueNotFoundError} When the specified queue or its DLQ does not exist in the registry
 * @throws {JobNotFoundError} When the job with the given ID cannot be found in the queue
 *
 * @example Manual move in worker failed handler
 * ```typescript
 * const worker = createWorker({
 *   name: 'payments',
 *   processor: async (job) => { ... },
 * });
 *
 * worker.on('failed', async (job, err) => {
 *   // Move to DLQ after all retries exhausted
 *   if (job && job.attemptsMade >= job.opts.attempts) {
 *     await moveToDeadLetterQueue('payments', job.id);
 *     logger.error(`Job ${job.id} moved to DLQ: ${err.message}`);
 *   }
 * });
 * ```
 *
 * @example Inspecting DLQ jobs for debugging
 * ```typescript
 * // Get the DLQ for a queue
 * const dlqName = getDeadLetterQueueName('payments');
 * if (dlqName) {
 *   const dlq = getQueue(dlqName);
 *   const failedJobs = await dlq.getJobs(['waiting', 'active']);
 *
 *   for (const job of failedJobs) {
 *     console.log(`Failed job: ${job.data.originalJobId}`);
 *     console.log(`Reason: ${job.data.failedReason}`);
 *     console.log(`Attempts: ${job.data.attemptsMade}`);
 *     console.log(`Stack: ${job.data.stacktrace?.join('\n')}`);
 *   }
 * }
 * ```
 *
 * @example Reprocessing DLQ jobs after fixing the issue
 * ```typescript
 * const dlqName = getDeadLetterQueueName('payments');
 * const dlq = getQueue(dlqName);
 * const originalQueue = getQueue('payments');
 *
 * // Get all DLQ jobs
 * const dlqJobs = await dlq.getJobs(['waiting']);
 *
 * for (const dlqJob of dlqJobs) {
 *   // Re-add to original queue with original data
 *   await originalQueue.add(dlqJob.name, dlqJob.data.originalData, {
 *     jobId: `retry-${dlqJob.data.originalJobId}`,
 *   });
 *
 *   // Remove from DLQ
 *   await dlqJob.remove();
 * }
 * ```
 */
export async function moveToDeadLetterQueue(queueName: string, jobId: string): Promise<void> {
  const dlqName = dlqMappings.get(queueName);
  if (!dlqName) {
    throw new InvalidQueueConfigError(`DLQ not enabled for queue: ${queueName}`);
  }

  const queue = queues.get(queueName);
  const dlq = queues.get(dlqName);

  if (!queue || !dlq) {
    throw new QueueNotFoundError(`${queueName} or ${dlqName}`);
  }

  // In test mode, simulate the move
  if (TEST_MODE) {
    logger.info(`Moving job to DLQ in test mode`, { queueName, jobId, dlqName });
    return;
  }

  // Get the failed job
  const job = await queue.getJob(jobId);
  if (!job) {
    throw new JobNotFoundError(queueName, jobId);
  }

  // Copy job data to DLQ with metadata, normalizing values to match IDlqJobData
  const dlqJobData: IDlqJobData = {
    originalJobId: jobId,
    originalData: job.data,
    failedReason: job.failedReason ?? 'Unknown failure',
    stacktrace: job.stacktrace ?? [],
    attemptsMade: job.attemptsMade ?? 0,
    failedAt: Date.now()
  };

  await dlq.add(job.name, dlqJobData, {
    jobId: `${jobId}-dlq`
  });

  // Remove the original job
  await job.remove();

  logger.info(`Job moved to DLQ`, {
    originalQueue: queueName,
    dlqName,
    jobId,
    jobName: job.name,
    attemptsMade: job.attemptsMade,
    hasFailedReason: !!job.failedReason
  });
}

/**
 * Get the Dead Letter Queue name for a given queue
 *
 * Returns the DLQ name if DLQ is enabled for the queue, otherwise undefined.
 * The DLQ name follows the pattern `{queueName}{suffix}` where suffix
 * defaults to `-dlq`.
 *
 * @param queueName - The name of the queue
 * @returns The DLQ name or undefined if DLQ is not enabled
 *
 * @example Check and access DLQ
 * ```typescript
 * const dlqName = getDeadLetterQueueName('payments');
 *
 * if (dlqName) {
 *   // DLQ is enabled, access it
 *   const dlq = getQueue(dlqName);
 *   const failedCount = await dlq.getJobCounts('waiting', 'active');
 *   console.log(`DLQ has ${failedCount.waiting} jobs waiting for inspection`);
 * } else {
 *   console.log('DLQ is not enabled for this queue');
 * }
 * ```
 *
 * @example DLQ naming convention
 * ```typescript
 * // Default suffix: -dlq
 * // Queue: 'emails'        → DLQ: 'emails-dlq'
 * // Queue: 'payments'      → DLQ: 'payments-dlq'
 * // Queue: 'notifications' → DLQ: 'notifications-dlq'
 *
 * // Custom suffix via QUEUE_DEAD_LETTER_QUEUE_SUFFIX=.failed
 * // Queue: 'emails' → DLQ: 'emails.failed'
 * ```
 */
export function getDeadLetterQueueName(queueName: string): string | undefined {
  return dlqMappings.get(queueName);
}

/**
 * Check if a queue has Dead Letter Queue enabled
 *
 * Use this to conditionally handle DLQ operations.
 *
 * @param queueName - The name of the queue
 * @returns True if DLQ is enabled for the queue
 *
 * @example Conditional DLQ handling
 * ```typescript
 * async function handleFailedJob(queueName: string, jobId: string): Promise<void> {
 *   if (hasDeadLetterQueue(queueName)) {
 *     // Move to DLQ for later inspection
 *     await moveToDeadLetterQueue(queueName, jobId);
 *     logger.info(`Job ${jobId} moved to DLQ for inspection`);
 *   } else {
 *     // Just log the failure
 *     logger.error(`Job ${jobId} failed permanently (no DLQ configured)`);
 *   }
 * }
 * ```
 *
 * @example Enable DLQ via environment variable
 * ```bash
 * # Enable DLQ globally for all queues
 * QUEUE_ENABLE_DEAD_LETTER_QUEUE=true
 *
 * # Or enable per-queue when creating:
 * # createQueue({ name: 'critical', enableDeadLetterQueue: true })
 * ```
 */
export function hasDeadLetterQueue(queueName: string): boolean {
  return dlqMappings.has(queueName);
}

/**
 * Health check for all queues and workers
 *
 * @returns Promise that resolves to true if all queues and workers are healthy
 */
export async function healthCheck(): Promise<boolean> {
  // In test mode, always return true without checking Redis
  if (TEST_MODE) {
    return true;
  }

  try {
    // Check Redis connection first
    const redisHealthy = await getRedisHealthCheck();
    if (!redisHealthy) {
      logger.warn('Queue health check failed: Redis unhealthy');
      return false;
    }

    // Check if we can access queues
    for (const queue of queues.values()) {
      // Try to get queue metadata - this will fail if Redis is disconnected
      await queue.getJobCountByTypes('waiting', 'active', 'completed', 'failed');
    }

    // Check worker health
    // Lazy import worker functions to avoid circular dependency
    const { getAllWorkerMetrics, getWorkerConfig } = await import('./worker');
    const workerMetrics = getAllWorkerMetrics();
    const workerConfig = getWorkerConfig();

    // Stalled interval threshold (2x the stalled interval)
    const stalledThreshold = workerConfig.stalledInterval * 2;
    const now = Date.now();

    for (const [workerName, metrics] of workerMetrics.entries()) {
      const timeSinceLastActivity = now - metrics.lastActivity;

      // Only check for stalls if the worker has processed at least one job
      // Idle workers (no jobs processed) should not be flagged as stalled
      if (metrics.jobsProcessed > 0 || metrics.jobsFailed > 0) {
        // If no activity for more than 2x stalled interval, worker might be stalled
        if (timeSinceLastActivity > stalledThreshold) {
          logger.warn('Worker health check failed: stalled worker detected', {
            workerName,
            timeSinceLastActivity,
            stalledThreshold,
            lastActivity: new Date(metrics.lastActivity).toISOString(),
            jobsProcessed: metrics.jobsProcessed,
            jobsFailed: metrics.jobsFailed
          });
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    logger.error('Queue health check failed', sanitizeErrorForLogging(error));
    return false;
  }
}

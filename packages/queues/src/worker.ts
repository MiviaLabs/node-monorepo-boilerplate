import { logger } from '@package/observability';
import { Worker, Job, WorkerOptions } from 'bullmq';

import { DEFAULT_WORKER_CONFIG } from './config/defaults';
import type { IResolvedInfrastructureQueuesConfig } from './config/interfaces';
import { TEST_MODE } from './queue';

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

/**
 * Current configuration for workers
 * Set via setWorkerConfig() to use resolved configuration
 */
let currentConfig: IResolvedInfrastructureQueuesConfig['worker'] | null = null;

/**
 * Set the worker configuration
 *
 * @param config - Resolved worker configuration
 */
export function setWorkerConfig(config: IResolvedInfrastructureQueuesConfig['worker']): void {
  currentConfig = config;
}

/**
 * Get the current worker configuration (defaults or resolved)
 *
 * @returns Current worker configuration
 */
export function getWorkerConfig(): IResolvedInfrastructureQueuesConfig['worker'] {
  return currentConfig || DEFAULT_WORKER_CONFIG;
}

/**
 * Job processor function type
 *
 * @template T - Job data type
 * @template R - Result type
 */
export type Processor<T = unknown, R = unknown> = (job: Job<T>) => Promise<R>;

/**
 * Mock Worker class for testing
 */
class MockWorker {
  name: string;
  opts: WorkerOptions & { connection?: WorkerOptions['connection'] };
  private eventListeners = new Map<string, Array<(...args: unknown[]) => unknown>>();

  constructor(
    name: string,
    _processor: Processor,
    opts: WorkerOptions & { connection?: WorkerOptions['connection'] }
  ) {
    this.name = name;
    this.opts = opts;
  }

  async close(): Promise<void> {
    // Emit closed event before closing (matches BullMQ Worker behavior)
    const closedListeners = this.eventListeners.get('closed') || [];
    for (const listener of closedListeners) {
      await listener();
    }
    // Mock close implementation
  }

  on(event: string, listener: (...args: unknown[]) => unknown) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.eventListeners.get(event)!.push(listener);
  }

  async emit(event: string, ...args: unknown[]) {
    const listeners = this.eventListeners.get(event) || [];
    for (const listener of listeners) {
      await listener(...args);
    }
  }
}

/**
 * Configuration for creating a worker instance
 */
export interface CreateWorkerOptions {
  /**
   * Queue name to process jobs from
   */
  name: string;

  /**
   * Function to process jobs
   */
  processor: Processor;

  /**
   * Number of jobs to process concurrently
   * @default 1
   */
  concurrency?: number;

  /**
   * Redis connection options
   * If not provided, uses the default Redis client from redis
   */
  connection?: WorkerOptions['connection'];
}

/**
 * Internal registry of all created workers
 */
const workers = new Map<string, Worker>();

/**
 * Worker metrics tracking
 */
export interface WorkerMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  lastActivity: number;
}

const workerMetrics = new Map<string, WorkerMetrics>();

/**
 * Create a new BullMQ worker or return an existing one with the same name
 *
 * Creates a worker that processes jobs from the specified queue. Workers run
 * continuously, picking up jobs as they become available. Configure concurrency
 * to process multiple jobs simultaneously.
 *
 * @param config - Worker configuration
 * @returns BullMQ Worker instance
 *
 * @example Basic worker creation (tenant-aware)
 * ```typescript
 * // Create a simple worker with default concurrency (1)
 * const worker = createWorker({
 *   name: 'emails',
 *   processor: async (job) => {
 *     const { tenantId, userId, templateId } = job.data;
 *     await sendEmail(tenantId, userId, templateId);
 *   },
 * });
 * ```
 *
 * @example High-concurrency worker for throughput
 * ```typescript
 * // Process 10 jobs simultaneously for high-throughput queues
 * const notificationWorker = createWorker({
 *   name: 'notifications',
 *   concurrency: 10, // Process 10 jobs at once
 *   processor: async (job) => {
 *     const { tenantId, deviceToken, message } = job.data;
 *     await pushService.send(tenantId, deviceToken, message);
 *   },
 * });
 * ```
 *
 * @example Worker with typed job data and result
 * ```typescript
 * interface PaymentJobData {
 *   tenantId: string;
 *   orderId: string;
 *   amount: number;
 *   currency: string;
 * }
 *
 * interface PaymentResult {
 *   transactionId: string;
 *   status: 'completed' | 'failed';
 * }
 *
 * const paymentWorker = createWorker({
 *   name: 'payments',
 *   concurrency: 3,
 *   processor: async (job: Job<PaymentJobData>): Promise<PaymentResult> => {
 *     const { tenantId, orderId, amount, currency } = job.data;
 *
 *     // Process payment
 *     const result = await paymentGateway.charge(tenantId, { orderId, amount, currency });
 *
 *     return {
 *       transactionId: result.id,
 *       status: result.success ? 'completed' : 'failed',
 *     };
 *   },
 * });
 * ```
 *
 * @example Worker with event handlers for monitoring
 * ```typescript
 * const worker = createWorker({
 *   name: 'reports',
 *   concurrency: 2,
 *   processor: async (job) => {
 *     const { tenantId, reportType, params } = job.data;
 *     return await generateReport(tenantId, reportType, params);
 *   },
 * });
 *
 * // Monitor job lifecycle events
 * worker.on('completed', (job, result) => {
 *   logger.info(`Report job ${job.id} completed`, { result });
 * });
 *
 * worker.on('failed', (job, error) => {
 *   logger.error(`Report job ${job?.id} failed`, { error: error.message });
 * });
 *
 * worker.on('progress', (job, progress) => {
 *   logger.debug(`Report job ${job.id} progress: ${progress}%`);
 * });
 * ```
 *
 * @example Worker with DLQ integration
 * ```typescript
 * // Create queue with DLQ enabled
 * createQueue({ name: 'critical-ops', enableDeadLetterQueue: true });
 *
 * const worker = createWorker({
 *   name: 'critical-ops',
 *   processor: async (job) => {
 *     const { tenantId, operation, params } = job.data;
 *     await performCriticalOperation(tenantId, operation, params);
 *   },
 * });
 *
 * // Move exhausted jobs to DLQ for manual inspection
 * worker.on('failed', async (job, error) => {
 *   if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
 *     await moveToDeadLetterQueue('critical-ops', job.id!);
 *     logger.warn(`Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
 *   }
 * });
 * ```
 */
export function createWorker(config: CreateWorkerOptions): Worker {
  const existingWorker = workers.get(config.name);
  if (existingWorker) {
    return existingWorker;
  }

  // In test mode, use MockWorker directly without calling getRedisClient
  if (TEST_MODE) {
    const workerConfig = getWorkerConfig();
    const workerOptions = {
      concurrency: config.concurrency ?? workerConfig.defaultConcurrency,
      stalledInterval: workerConfig.stalledInterval,
      maxStalledCount: workerConfig.maxStalledCount
    } as WorkerOptions & { connection?: WorkerOptions['connection'] };

    if (config.connection) {
      workerOptions.connection = config.connection;
    }

    const worker = new MockWorker(
      config.name,
      config.processor,
      workerOptions
    ) as unknown as Worker;

    // Initialize metrics for this worker
    workerMetrics.set(config.name, {
      jobsProcessed: 0,
      jobsFailed: 0,
      lastActivity: Date.now()
    });

    worker.on('completed', () => {
      const metrics = workerMetrics.get(config.name);
      if (metrics) {
        metrics.jobsProcessed++;
        metrics.lastActivity = Date.now();
      }
    });

    worker.on('failed', (job, err) => {
      const metrics = workerMetrics.get(config.name);
      if (metrics) {
        metrics.jobsFailed++;
        metrics.lastActivity = Date.now();
      }

      logger.error('Job failed', err, {
        jobId: job?.id,
        queueName: job?.queueName,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        failedReason: job?.failedReason
      });
    });

    // Clean up metrics when worker closes to prevent memory leaks
    worker.on('closed', () => {
      workerMetrics.delete(config.name);
      workers.delete(config.name);
    });

    workers.set(config.name, worker);
    return worker;
  }

  // Production mode: use real BullMQ Worker
  const workerConfig = getWorkerConfig();
  const worker = new Worker(config.name, config.processor, {
    connection: config.connection ?? getBullMqRedisConnection(),
    concurrency: config.concurrency ?? workerConfig.defaultConcurrency,
    stalledInterval: workerConfig.stalledInterval,
    maxStalledCount: workerConfig.maxStalledCount
  });

  // Initialize metrics for this worker
  workerMetrics.set(config.name, {
    jobsProcessed: 0,
    jobsFailed: 0,
    lastActivity: Date.now()
  });

  worker.on('completed', () => {
    const metrics = workerMetrics.get(config.name);
    if (metrics) {
      metrics.jobsProcessed++;
      metrics.lastActivity = Date.now();
    }
  });

  worker.on('failed', (job, err) => {
    const metrics = workerMetrics.get(config.name);
    if (metrics) {
      metrics.jobsFailed++;
      metrics.lastActivity = Date.now();
    }

    logger.error('Job failed', err, {
      jobId: job?.id,
      queueName: job?.queueName,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      failedReason: job?.failedReason
    });
  });

  // Clean up metrics when worker closes to prevent memory leaks
  worker.on('closed', () => {
    workerMetrics.delete(config.name);
    workers.delete(config.name);
  });

  workers.set(config.name, worker);
  return worker;
}

/**
 * Get an existing worker by name
 *
 * @param name - Worker/queue name
 * @returns Worker instance or undefined if not found
 */
export function getWorker(name: string): Worker | undefined {
  return workers.get(name);
}

/**
 * Get all registered worker names
 *
 * @returns Array of worker names
 */
export function getAllWorkerNames(): string[] {
  return Array.from(workers.keys());
}

/**
 * Close all workers and clear the registry
 *
 * @returns Promise that resolves when all workers are closed
 */
export async function closeAllWorkers(): Promise<void> {
  const closePromises = Array.from(workers.values()).map((worker) => worker.close());
  await Promise.all(closePromises);
  workers.clear();
  workerMetrics.clear();
}

/**
 * Get metrics for a specific worker
 *
 * @param name - Worker name
 * @returns Worker metrics or undefined if not found
 */
export function getWorkerMetrics(name: string): WorkerMetrics | undefined {
  return workerMetrics.get(name);
}

/**
 * Get metrics for all workers
 *
 * @returns Map of worker names to their metrics
 */
export function getAllWorkerMetrics(): Map<string, WorkerMetrics> {
  return new Map(workerMetrics);
}

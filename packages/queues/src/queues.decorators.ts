/**
 * Job handler decorator and QueueManager exports
 *
 * This file contains exports that don't require NestJS parameter decorators,
 * making them testable with tsx/esbuild which doesn't support parameter decorators.
 */

import { createQueue, closeAllQueues, healthCheck as queueHealthCheck } from './queue';
import { createWorker, closeAllWorkers, type Processor } from './worker';

/**
 * Job handler decorator metadata key
 */
export const JOB_HANDLER_METADATA = 'jobHandler';

/**
 * Job handler decorator options
 *
 * Configuration options for the `@JobHandler` decorator that registers a method
 * as a background job processor.
 *
 * @example Basic options
 * ```typescript
 * @JobHandler({
 *   queueName: 'emails',     // Required: Queue to listen on
 *   jobName: 'send-welcome', // Optional: Specific job type (defaults to method name)
 *   concurrency: 5,          // Optional: Process 5 jobs simultaneously
 * })
 * ```
 */
export interface IJobHandlerOptions {
  /**
   * Queue name for this job handler
   *
   * The handler will process jobs added to this queue. The queue must be created
   * before jobs can be processed (either via `createQueue()` or automatically
   * via `QueuesModule`).
   */
  queueName: string;

  /**
   * Job name/type this handler processes
   *
   * If specified, the handler only processes jobs with this exact name.
   * If omitted, defaults to the decorated method name.
   *
   * @default Method name
   */
  jobName?: string;

  /**
   * Concurrency level for this handler
   *
   * Number of jobs to process simultaneously. Higher values increase throughput
   * but also increase memory usage and database connections.
   *
   * @default 1
   */
  concurrency?: number;
}

/**
 * Job handler decorator
 *
 * @param options - Job handler configuration options
 * @returns Method decorator that registers the method as a BullMQ worker
 *
 * Marks a method as a background job handler. The `QueuesModule` automatically
 * discovers decorated methods and registers them as BullMQ workers.
 *
 * **How it works:**
 * 1. Decorator stores metadata on the method via `Reflect.defineMetadata`
 * 2. `QueuesModule.onModuleInit()` scans all providers for decorated methods
 * 3. For each decorated method, it creates a queue and worker automatically
 * 4. When jobs are added to the queue, the decorated method processes them
 *
 * @example Basic handler with typed job data (tenant-aware)
 * ```typescript
 * // Define the job data interface for type safety with tenant context
 * interface WelcomeEmailJobData {
 *   tenantId: string;
 *   userId: string;
 *   templateId: string;
 * }
 *
 * @Injectable()
 * export class EmailHandler {
 *   constructor(private readonly emailService: EmailService) {}
 *
 *   @JobHandler({ queueName: 'emails', jobName: 'send-welcome' })
 *   async handleWelcomeEmail(job: Job<WelcomeEmailJobData>): Promise<void> {
 *     const { tenantId, userId, templateId } = job.data;
 *     await this.emailService.sendWelcome(tenantId, userId, templateId);
 *   }
 * }
 * ```
 *
 * @example Handler with return value (tenant-aware)
 * ```typescript
 * interface ProcessPaymentData {
 *   tenantId: string;
 *   orderId: string;
 *   amount: number;
 *   currency: string;
 * }
 *
 * interface ProcessPaymentResult {
 *   success: boolean;
 *   transactionId?: string;
 *   error?: string;
 * }
 *
 * @Injectable()
 * export class PaymentHandler {
 *   @JobHandler({ queueName: 'payments', jobName: 'process-payment' })
 *   async handle(job: Job<ProcessPaymentData>): Promise<ProcessPaymentResult> {
 *     const { tenantId, orderId, amount, currency } = job.data;
 *     try {
 *       const transaction = await this.paymentService.charge(tenantId, { orderId, amount, currency });
 *       return { success: true, transactionId: transaction.id };
 *     } catch (error) {
 *       return { success: false, error: error.message };
 *     }
 *   }
 * }
 * ```
 *
 * @example High-concurrency handler (tenant-aware)
 * ```typescript
 * interface PushNotificationData {
 *   tenantId: string;
 *   deviceToken: string;
 *   message: string;
 * }
 *
 * @Injectable()
 * export class NotificationHandler {
 *   @JobHandler({
 *     queueName: 'notifications',
 *     jobName: 'send-push',
 *     concurrency: 10, // Process 10 notifications simultaneously
 *   })
 *   async handlePushNotification(job: Job<PushNotificationData>): Promise<void> {
 *     const { tenantId, deviceToken, message } = job.data;
 *     await this.pushService.send(tenantId, deviceToken, message);
 *   }
 * }
 * ```
 *
 * @example Production pattern with OnModuleInit (tenant-scoped maintenance job)
 * ```typescript
 * interface PurgeJobData {
 *   tenantId: string; // Required: scope purge to specific tenant
 *   retentionDays: number;
 *   dryRun: boolean;
 *   batchSize: number;
 * }
 *
 * @Injectable()
 * export class PurgeSoftDeletedAccountsHandler {
 *   private readonly logger = new Logger(PurgeSoftDeletedAccountsHandler.name);
 *
 *   constructor(
 *     private readonly authRepository: AuthRepository,
 *     private readonly db: NodePgDatabase,
 *   ) {}
 *
 *   @JobHandler({
 *     queueName: 'maintenance',
 *     jobName: 'purge-soft-deleted-accounts',
 *   })
 *   async handle(job: Job<PurgeJobData>): Promise<{
 *     success: boolean;
 *     totalPurged: number;
 *     errors: string[];
 *   }> {
 *     const { tenantId, retentionDays, dryRun, batchSize } = job.data;
 *     this.logger.log(`Starting purge for tenant=${tenantId}: retentionDays=${retentionDays}, dryRun=${dryRun}`);
 *
 *     let totalPurged = 0;
 *     const errors: string[] = [];
 *
 *     const expiredUsers = await this.authRepository.findExpiredSoftDeleted(tenantId, retentionDays);
 *
 *     for (const user of expiredUsers) {
 *       try {
 *         if (!dryRun) {
 *           await this.db.transaction(async (tx) => {
 *             await this.authRepository.hardDeletePermanently(tenantId, user.id);
 *           });
 *         }
 *         totalPurged++;
 *       } catch (error) {
 *         errors.push(`Failed to purge user ${user.id}: ${error.message}`);
 *       }
 *     }
 *
 *     return { success: true, totalPurged, errors };
 *   }
 * }
 * ```
 */
export const JobHandler = (options: IJobHandlerOptions): MethodDecorator => {
  return (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // Handle cases where descriptor might be undefined (e.g., in test environments)
    if (descriptor && descriptor.value) {
      Reflect.defineMetadata(JOB_HANDLER_METADATA, { ...options, propertyKey }, descriptor.value);
    }
    return descriptor;
  };
};

/**
 * Queue manager for managing queues and workers
 */
export class QueueManager {
  private registeredQueues = new Set<string>();
  private registeredWorkers = new Set<string>();

  /**
   * Register a queue
   *
   * Uses idempotency to prevent duplicate queue creation.
   * The createQueue function already returns existing queues
   * with the same name, so we only track registration.
   *
   * @param name - Queue name to register
   */
  registerQueue(name: string): void {
    if (!this.registeredQueues.has(name)) {
      createQueue({ name });
      this.registeredQueues.add(name);
    }
  }

  /**
   * Register a worker
   *
   * Uses idempotency to prevent duplicate worker creation.
   * The createWorker function already returns existing workers
   * with the same name, so we only track registration.
   *
   * @param name - Worker name to register
   * @param processor - Job processor function
   * @param concurrency - Number of concurrent jobs to process (default: 1)
   */
  registerWorker(name: string, processor: Processor, concurrency = 1): void {
    if (this.registeredWorkers.has(name)) {
      throw new Error(
        `Worker for queue "${name}" is already registered. ` +
          `A BullMQ worker can only process jobs on a single queue with one processor; ` +
          `if multiple @JobHandler methods declare the same queueName, the second handler will never receive jobs. ` +
          `Use a different queueName per job handler, or route the work through a single handler that dispatches by job name.`
      );
    }
    createWorker({ name, processor, concurrency });
    this.registeredWorkers.add(name);
  }

  /**
   * Get all registered queue names
   *
   * @returns Array of registered queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.registeredQueues);
  }

  /**
   * Get all registered worker names
   *
   * @returns Array of registered worker names
   */
  getWorkerNames(): string[] {
    return Array.from(this.registeredWorkers);
  }

  /**
   * Close all queues and workers
   *
   * @returns Promise that resolves when all queues and workers are closed
   */
  async closeAll(): Promise<void> {
    await closeAllWorkers();
    await closeAllQueues();
    this.registeredQueues.clear();
    this.registeredWorkers.clear();
  }

  /**
   * Health check for all queues
   *
   * @returns Promise resolving to true if all queues are healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    return queueHealthCheck();
  }
}

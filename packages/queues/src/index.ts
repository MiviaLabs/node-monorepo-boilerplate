/**
 * @package/queues
 *
 * Enterprise-grade job queue abstraction supporting multiple providers (BullMQ, Google Cloud Tasks,
 * Google Pub/Sub) with unified API, automatic retries, dead letter queues, cron scheduling, and
 * comprehensive OpenTelemetry observability. Built for multi-tenant architectures with tenant-aware
 * job processing and isolation.
 *
 * ## Features
 *
 * - **Queue Management**: Create and manage queues with {@link createQueue}, configure retry behavior,
 *   job retention, and optional Dead Letter Queues (DLQ) for failed job inspection
 * - **Worker Processing**: Process jobs concurrently with {@link createWorker}, automatic metrics
 *   tracking, and graceful shutdown support
 * - **Job Operations**: Add jobs with {@link addJob}, bulk operations with {@link addBulkJobs},
 *   priority ordering, and idempotency via custom job IDs
 * - **Scheduling**: Delayed jobs with {@link scheduleJob} and cron-based recurring jobs with
 *   {@link addCronJob} supporting timezone configuration
 * - **Provider Abstraction**: Unified {@link IQueueProvider} interface with adapters for BullMQ,
 *   Cloud Tasks, and Pub/Sub via {@link createQueueProvider}
 * - **Dead Letter Queues**: Automatic DLQ support with {@link moveToDeadLetterQueue} for failed job
 *   recovery and debugging via {@link IDlqJobData} metadata
 * - **NestJS Integration**: {@link QueuesModule} with `@JobHandler` decorator for automatic worker
 *   registration and dependency injection
 * - **OpenTelemetry**: Full tracing with {@link traceJobExecution}, metrics for job counts and
 *   durations, and span attributes for distributed tracing
 * - **Error Handling**: Typed errors including {@link QueueNotFoundError}, {@link JobNotFoundError},
 *   {@link CronJobNotFoundError}, and {@link JobProcessingError}
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           @package/queues                              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
 * │  │  Producer   │    │   Queue     │    │   Worker    │                 │
 * │  │  (addJob)   │───▶│  (BullMQ)   │───▶│ (processor) │                 │
 * │  └─────────────┘    └─────────────┘    └─────────────┘                 │
 * │        │                  │                  │                         │
 * │        │                  ▼                  │                         │
 * │        │           ┌─────────────┐           │                         │
 * │        │           │     DLQ     │◀──────────┤ (on failure)            │
 * │        │           │ (optional)  │           │                         │
 * │        │           └─────────────┘           │                         │
 * │        │                                     │                         │
 * │        ▼                                     ▼                         │
 * │  ┌─────────────────────────────────────────────────────────┐           │
 * │  │               OpenTelemetry (tracing + metrics)         │           │
 * │  └─────────────────────────────────────────────────────────┘           │
 * │                                                                         │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                        Provider Abstraction                            │
 * │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
 * │  │   BullMQ    │    │ Cloud Tasks │    │   Pub/Sub   │                 │
 * │  │  (Redis)    │    │   (GCP)     │    │   (GCP)     │                 │
 * │  └─────────────┘    └─────────────┘    └─────────────┘                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Module Setup (NestJS)
 *
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { QueuesModule } from '@package/queues';
 *
 * @Module({
 *   imports: [
 *     QueuesModule.forRoot({
 *       enableGracefulShutdown: true,
 *       queue: {
 *         defaultJobAttempts: 3,
 *         defaultJobBackoffDelay: 1000,
 *         enableDeadLetterQueue: true,
 *       },
 *       worker: {
 *         defaultConcurrency: 5,
 *       },
 *       scheduler: {
 *         defaultTimezone: 'UTC',
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## Usage Examples
 *
 * ### Creating Queues and Workers
 *
 * ```typescript
 * import {
 *   createQueue,
 *   createWorker,
 *   addJob,
 *   addBulkJobs,
 * } from '@package/queues';
 *
 * // Create a queue with DLQ enabled
 * const emailQueue = createQueue({
 *   name: 'emails',
 *   enableDeadLetterQueue: true,
 *   defaultJobOptions: {
 *     attempts: 5,
 *     backoff: { type: 'exponential', delay: 2000 },
 *   },
 * });
 *
 * // Create a worker to process jobs
 * const emailWorker = createWorker({
 *   name: 'emails',
 *   concurrency: 10,
 *   processor: async (job) => {
 *     const { tenantId, userId, templateId } = job.data;
 *     await sendEmail(tenantId, userId, templateId);
 *   },
 * });
 *
 * // Add a single job with tenant context
 * await addJob({
 *   queueName: 'emails',
 *   jobName: 'send-welcome',
 *   data: { tenantId: 'tenant-123', userId: 'user-456', templateId: 'welcome' },
 * });
 *
 * // Add jobs in bulk for efficiency
 * await addBulkJobs('emails', [
 *   { name: 'send-reminder', data: { tenantId: 'tenant-123', userId: 'user-1' } },
 *   { name: 'send-reminder', data: { tenantId: 'tenant-123', userId: 'user-2' } },
 * ]);
 * ```
 *
 * ### Scheduling Jobs
 *
 * ```typescript
 * import { scheduleJob, addCronJob, removeCronJob } from '@package/queues';
 *
 * // Schedule a delayed job (5 minutes from now)
 * await scheduleJob('emails', 'follow-up', { tenantId: 'tenant-123', userId: 'user-456' }, 5 * 60 * 1000);
 *
 * // Add a recurring cron job (daily at midnight UTC)
 * await addCronJob({
 *   queueName: 'reports',
 *   jobName: 'daily-summary',
 *   cron: '0 0 * * *',
 *   data: { tenantId: 'tenant-123', reportType: 'daily' },
 *   options: { tz: 'America/New_York' },
 * });
 *
 * // Remove a cron job when no longer needed
 * await removeCronJob('reports', 'daily-summary');
 * ```
 *
 * ### Using the Provider Abstraction
 *
 * ```typescript
 * import { createQueueProvider, IQueueProvider } from '@package/queues';
 *
 * // Create provider based on environment (QUEUE_PROVIDER env var)
 * const provider: IQueueProvider = createQueueProvider();
 *
 * // Publish a message
 * const messageId = await provider.publish('my-queue', { tenantId: 'tenant-123', action: 'process' });
 *
 * // Subscribe to messages
 * await provider.subscribe('my-queue', async (message) => {
 *   const data = JSON.parse(message.data.toString());
 *   await processMessage(data);
 *   await message.ack();
 * });
 * ```
 *
 * ### NestJS Decorator-Based Workers
 *
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { JobHandler, QueueManager, addJob } from '@package/queues';
 * import type { Job } from 'bullmq';
 *
 * @Injectable()
 * export class EmailService {
 *   constructor(private readonly queueManager: QueueManager) {}
 *
 *   async sendWelcomeEmail(tenantId: string, userId: string): Promise<void> {
 *     await addJob({
 *       queueName: 'emails',
 *       jobName: 'send-welcome',
 *       data: { tenantId, userId },
 *     });
 *   }
 *
 *   @JobHandler({ queueName: 'emails', jobName: 'send-welcome', concurrency: 5 })
 *   async handleWelcomeEmail(job: Job): Promise<void> {
 *     const { tenantId, userId } = job.data;
 *     await this.emailClient.send(tenantId, userId, 'welcome');
 *   }
 * }
 * ```
 *
 * @see {@link createQueue} for queue creation with DLQ support
 * @see {@link createWorker} for job processing with concurrency control
 * @see {@link addJob} for adding jobs with priority and retry options
 * @see {@link scheduleJob} for delayed job execution
 * @see {@link addCronJob} for recurring scheduled jobs
 * @see {@link IQueueProvider} for the unified provider interface
 * @see {@link QueuesModule} for NestJS integration
 *
 * Related packages:
 * - `@package/pubsub` - Event-driven pub/sub messaging
 * - `@package/tasks` - Google Cloud Tasks integration
 * - `@package/observability` - Telemetry and logging utilities
 *
 * @packageDocumentation
 */

// ====================================================================
// Core functionality
// ====================================================================
export * from './queue';
export * from './worker';
export * from './job';
export * from './scheduler';

// ====================================================================
// Error types
// ====================================================================
export * from './errors';

// ====================================================================
// Configuration
// ====================================================================
export * from './config';

// ====================================================================
// Constants
// ====================================================================
export * from './constants';

// ====================================================================
// OpenTelemetry
// ====================================================================
export * from './telemetry';

// ====================================================================
// Providers (Unified Queue Abstraction)
// ====================================================================
export * from './providers';

// ====================================================================
// NestJS Module
// ====================================================================
export * from './queues.module';

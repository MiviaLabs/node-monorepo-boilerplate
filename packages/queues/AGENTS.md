# @package/queues

Enterprise-grade background job queue abstraction supporting BullMQ (Redis), Google Cloud Tasks, and Google Cloud Pub/Sub with automatic retries, dead-letter queues, cron scheduling, and OpenTelemetry observability.

## Purpose

This package provides a unified background processing and job queue abstraction across multiple infrastructure backends. It features automatic exponential backoff retries, dead-letter queue (DLQ) isolation, distributed cron scheduling, OpenTelemetry tracing, and multi-tenant job isolation.

## Structure

```text
src/
├── config/                 # Configuration resolution
│   ├── defaults.ts         # Default configuration values
│   ├── interfaces.ts       # Configuration interfaces
│   ├── provider-config.ts  # Provider-specific config
│   ├── provider-resolver.ts # Provider detection
│   └── config-resolver.ts  # Configuration merging
├── providers/              # Queue provider adapters
│   ├── bullmq.adapter.ts   # BullMQ (Redis) adapter
│   ├── cloud-tasks.adapter.ts # Google Cloud Tasks adapter
│   ├── pubsub.adapter.ts   # Google Pub/Sub adapter
│   ├── provider-factory.ts # Provider factory
│   └── queue-provider.interface.ts # Provider interface
├── __tests__/              # Unit tests
├── queue.ts                # Queue management (createQueue, getQueue)
├── worker.ts               # Worker management (createWorker)
├── job.ts                  # Job operations (addJob, addBulkJobs)
├── scheduler.ts            # Scheduling (scheduleJob, addCronJob)
├── errors.ts               # Typed error classes
├── telemetry.ts            # OpenTelemetry tracing
├── queues.decorators.ts    # NestJS decorators (@JobHandler)
├── queues.module.ts        # NestJS module (QueuesModule)
└── index.ts
```

## Usage

```typescript
import {
  QueuesModule,
  createQueue,
  createWorker,
  addJob,
  scheduleJob,
  addCronJob,
  QueueManager,
  JobHandler
} from '@package/queues';

// NestJS module setup
@Module({
  imports: [
    QueuesModule.forRoot({
      enableGracefulShutdown: true,
      queue: {
        defaultJobAttempts: 3,
        enableDeadLetterQueue: true
      },
      worker: {
        defaultConcurrency: 5
      }
    })
  ]
})
export class AppModule {}

// Create queue and worker manually
const emailQueue = createQueue({
  name: 'emails',
  enableDeadLetterQueue: true
});

const emailWorker = createWorker({
  name: 'emails',
  concurrency: 10,
  processor: async (job) => {
    const { tenantId, userId } = job.data;
    await sendEmail(tenantId, userId);
  }
});

// Add jobs
await addJob({
  queueName: 'emails',
  jobName: 'send-welcome',
  data: { tenantId: 'tenant-123', userId: 'user-456' }
});

// NestJS decorator-based workers
@Injectable()
export class EmailService {
  @JobHandler({ queueName: 'emails', jobName: 'send-welcome', concurrency: 5 })
  async handleWelcomeEmail(job: Job): Promise<void> {
    await this.emailClient.send(job.data.tenantId, job.data.userId, 'welcome');
  }
}
```

## Key Exports

### Core Functions

- `createQueue` - Create a queue with DLQ support
- `createWorker` - Create a worker with concurrency control
- `addJob` - Add a single job to a queue
- `addBulkJobs` - Add multiple jobs efficiently
- `scheduleJob` - Schedule a delayed job
- `addCronJob` / `removeCronJob` - Manage recurring cron jobs

### NestJS Integration

- `QueuesModule` - Global NestJS module with `forRoot()` and `forRootAsync()`
- `QueueManager` - Injectable queue manager service
- `JobHandler` - Decorator for automatic worker registration

### Provider Abstraction

- `createQueueProvider` - Create provider based on environment
- `IQueueProvider` - Unified provider interface

### Error Types

- `QueueNotFoundError` - Queue does not exist
- `JobNotFoundError` - Job not found in queue
- `CronJobNotFoundError` - Cron job not found
- `JobProcessingError` - Job processing failed
- `PublishFailedError` - Message publish failed
- `SubscribeFailedError` - Subscription failed

### Telemetry

- `traceJobExecution` - OpenTelemetry tracing wrapper

## Dependencies

- `bullmq` - Redis-based job queue
- `@package/redis` - Redis connection management
- `@package/tasks` - Google Cloud Tasks integration
- `@package/pubsub` - Google Pub/Sub integration
- `@package/observability` - OpenTelemetry instrumentation
- `@package/core` - Base error types

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

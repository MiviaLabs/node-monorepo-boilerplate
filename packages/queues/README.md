# @package/queues

Enterprise-grade background job queue and scheduling abstraction supporting BullMQ (Redis), Google Cloud Tasks, and Google Cloud Pub/Sub with automatic retries, dead-letter queues, and OpenTelemetry tracing.

## Overview

`@package/queues` delivers a resilient, unified background job processing abstraction across multiple infrastructure backends. It supports BullMQ for Redis-based high-throughput queuing, Google Cloud Tasks for HTTP-target push queues, and Google Cloud Pub/Sub for distributed messaging. All providers feature automatic exponential backoff retries, dead-letter queues (DLQ), cron scheduling, multi-tenant isolation, and OpenTelemetry distributed tracing.

## Features

- **Multi-Provider Support** - Unified abstraction over BullMQ, Google Cloud Tasks, and Google Cloud Pub/Sub
- **Job Queues** - Create and manage typed job queues with functional and object-oriented APIs
- **Workers** - Concurrency-controlled workers with graceful shutdown and health monitoring
- **Schedulers** - Schedule delayed one-time jobs and recurring cron jobs with timezone support
- **Dead-Letter Queues (DLQ)** - Automatic isolation of poison-pill messages after retry exhaustion
- **NestJS Integration** - Dynamic `QueuesModule` with `@JobHandler()` decorator and DI injection
- **Observability** - Built-in OpenTelemetry span creation and context propagation
- **Multi-Tenancy** - Tenant-scoped job routing and isolation
- **Type-Safe** - Full TypeScript contracts with descriptive error hierarchies

## Installation

This package is part of the enterprise starter monorepo.

```bash
pnpm install @package/queues
```

## Quick Start

### Using the Functional API

```typescript
import { createQueue, createWorker, addJob } from '@package/queues';

// Create a queue
createQueue({
  name: 'emails'
});

// Add a job
await addJob({
  queueName: 'emails',
  jobName: 'send-welcome',
  data: {
    to: 'user@example.com',
    subject: 'Welcome!'
  }
});

// Process jobs
createWorker({
  name: 'emails',
  concurrency: 5,
  processor: async (job) => {
    await sendEmail(job.data.to, job.data.subject);
  }
});
```

### Using NestJS Module

```typescript
import { Module } from '@nestjs/common';
import { QueuesModule, JobHandler, addJob } from '@package/queues';

@Module({
  imports: [QueuesModule.forRoot()]
})
export class AppModule {}

@Injectable()
export class EmailService {
  async sendWelcomeEmail(to: string, name: string) {
    // Queue is auto-registered by @JobHandler decorator
    return addJob({
      queueName: 'emails',
      jobName: 'send-welcome',
      data: { to, name }
    });
  }

  @JobHandler({ queueName: 'emails', jobName: 'send-welcome' })
  async handleSendWelcomeEmail(job: Job) {
    await this.sendEmail(job.data.to, job.data.name);
  }
}
```

## Usage Examples

### Creating Queues

```typescript
import { createQueue } from '@package/queues';

const queue = createQueue({
  name: 'jobs',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});
```

### Adding Jobs

```typescript
import { addJob, addBulkJobs } from '@package/queues';

// Add single job
await addJob({
  queueName: 'jobs',
  jobName: 'process-data',
  data: { id: 123 },
  options: {
    priority: 1,
    delay: 5000
  }
});

// Add bulk jobs
await addBulkJobs('jobs', [
  { name: 'job1', data: { foo: 'bar' } },
  { name: 'job2', data: { baz: 'qux' } }
]);
```

### Creating Workers

```typescript
import { createWorker, type Processor } from '@package/queues';

const processor: Processor<{ email: string }> = async (job) => {
  await sendEmail(job.data.email);
  return { sent: true };
};

const worker = createWorker({
  name: 'jobs',
  concurrency: 5,
  processor
});
```

### Scheduling Jobs

```typescript
import { scheduleJob, addCronJob } from '@package/queues';

// Schedule delayed job
await scheduleJob('jobs', 'one-time', { data: '...' }, 60000);

// Schedule recurring job with cron
await addCronJob({
  queueName: 'jobs',
  jobName: 'daily-report',
  cron: '0 0 * * *', // Daily at midnight
  data: { type: 'daily' }
});

// Schedule with timezone
await addCronJob({
  queueName: 'jobs',
  jobName: 'weekday-reminder',
  cron: '0 9 * * 1-5', // 9am weekdays
  options: {
    tz: 'America/New_York'
  }
});
```

### Job Priorities

```typescript
// High priority (processed first)
await addJob({
  queueName: 'jobs',
  jobName: 'urgent',
  data: { ... },
  options: { priority: 1 },
});

// Normal priority
await addJob({
  queueName: 'jobs',
  jobName: 'normal',
  data: { ... },
  options: { priority: 5 },
});

// Low priority (processed last)
await addJob({
  queueName: 'jobs',
  jobName: 'low',
  data: { ... },
  options: { priority: 10 },
});
```

### Job Retries

```typescript
await addJob({
  queueName: 'jobs',
  jobName: 'flaky-job',
  data: { ... },
  options: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});
```

### Working with Jobs

```typescript
import { getJob, removeJob } from '@package/queues';

// Get job by ID
const job = await getJob('jobs', 'job-id');
if (job) {
  console.log('Job state:', await job.getState());
}

// Remove a job
await removeJob('jobs', 'job-id');
```

## NestJS Integration

### Using forRoot()

```typescript
import { Module } from '@nestjs/common';
import { QueuesModule } from '@package/queues';

@Module({
  imports: [
    QueuesModule.forRoot({
      enableGracefulShutdown: true
    })
  ]
})
export class AppModule {}
```

### Using forRootAsync()

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueuesModule } from '@package/queues';

@Module({
  imports: [
    QueuesModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        enableGracefulShutdown: config.get('QUEUES_GRACEFUL_SHUTDOWN') !== 'false'
      })
    })
  ]
})
export class AppModule {}
```

### Using @JobHandler Decorator

```typescript
import { Injectable } from '@nestjs/common';
import { JobHandler, addJob } from '@package/queues';

@Injectable()
export class ReportsService {
  // Queue a report generation job
  generateDailyReport() {
    return addJob({
      queueName: 'reports',
      jobName: 'daily-report',
      data: { date: new Date() }
    });
  }

  // This method will automatically be registered as a job processor
  @JobHandler({ queueName: 'reports', jobName: 'daily-report' })
  async handleDailyReport(job: Job) {
    const report = await this.generateReport(job.data.date);
    await this.emailReport(report);
  }
}
```

### Health Check

```typescript
import { Controller, Get } from '@nestjs/common';
import { QueuesModule } from '@package/queues';

@Controller('health')
export class HealthController {
  @Get()
  async healthCheck() {
    const isHealthy = await QueuesModule.healthCheck();
    return {
      status: isHealthy ? 'ok' : 'unhealthy',
      queues: isHealthy ? 'operational' : 'down'
    };
  }
}
```

## Error Handling

The package provides structured error types:

```typescript
import {
  QueueNotFoundError,
  WorkerNotFoundError,
  JobNotFoundError,
  CronJobNotFoundError,
  InvalidQueueConfigError,
  InvalidWorkerConfigError,
  JobProcessingError
} from '@package/queues';

try {
  await addJob({
    queueName: 'non-existent',
    jobName: 'test',
    data: {}
  });
} catch (error) {
  if (error instanceof QueueNotFoundError) {
    console.error('Queue not found:', error.message);
  }
}
```

## Configuration

### Environment Variables

```bash
# Redis connection (used by BullMQ via redis)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
REDIS_DB=1
```

### Queue Options

```typescript
import { createQueue } from '@package/queues';

createQueue({
  name: 'name',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});
```

### Worker Options

```typescript
import { createWorker } from '@package/queues';

createWorker({
  name: 'name',
  processor: async (job) => {
    return { result: 'success' };
  },
  concurrency: 10
});
```

## Queue Providers

This package supports multiple queue providers through a unified interface (`IQueueProvider`). The default provider is **BullMQ**, which uses Redis as the backend.

### Supported Providers

1. **BullMQ** (Default)
   - Uses Redis for job persistence and distributed state
   - Supports job retries, priority queues, delays, parent-child dependencies, and repeatable cron scheduling
   - Best for: High-throughput, low-latency background job execution

2. **Google Cloud Tasks**
   - Push queue model delivering HTTP tasks to designated endpoints
   - Offloads queue state and execution retries to Google Cloud managed infrastructure
   - Best for: Serverless architectures, long-running tasks, and rate-limited downstream APIs

3. **Google Cloud Pub/Sub**
   - Distributed messaging queue with subscription-based message delivery
   - Scalable event distribution across microservices
   - Best for: High-fanout asynchronous event processing

### Switching Providers

To use a different provider, set the environment variable:

```bash
# BullMQ (default)
QUEUE_PROVIDER=bullmq

# Google Cloud Tasks
QUEUE_PROVIDER=cloud-tasks

# Google Cloud Pub/Sub
QUEUE_PROVIDER=pubsub
```

Or configure programmatically:

```typescript
import { QueuesModule } from '@package/queues';

@Module({
  imports: [
    QueuesModule.forRoot({
      provider: 'bullmq', // 'bullmq' | 'cloud-tasks' | 'pubsub'
      queue: {
        defaultJobAttempts: 3
      }
    })
  ]
})
export class AppModule {}
```

### Provider-Specific Configuration

#### BullMQ Configuration

```typescript
QueuesModule.forRoot({
  provider: 'bullmq',
  queue: {
    defaultJobAttempts: 3,
    defaultBackoff: { type: 'exponential', delay: 1000 }
  },
  worker: {
    defaultConcurrency: 5
  }
});
```

#### Cloud Tasks Configuration

```typescript
QueuesModule.forRoot({
  provider: 'cloud-tasks',
  cloudTasks: {
    projectId: 'my-gcp-project',
    location: 'us-central1',
    httpBaseUrl: 'https://api.example.com/tasks'
  }
});
```

#### Pub/Sub Configuration

```typescript
QueuesModule.forRoot({
  provider: 'pubsub',
  pubsub: {
    projectId: 'my-gcp-project',
    subscriptionPrefix: 'my-app'
  }
});
```

## API Reference

### Queue Functions

#### `createQueue(config: ICreateQueueOptions): Queue`

Create a new queue or return an existing one.

```typescript
createQueue({
  name: 'queue-name',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }
});
```

#### `getQueue(name: string): Queue | undefined`

Get an existing queue by name.

#### `getAllQueueNames(): string[]`

Get all registered queue names.

#### `closeAllQueues(): Promise<void>`

Close all queues and clear the registry.

#### `healthCheck(): Promise<boolean>`

Health check for all queues.

### Worker Functions

#### `createWorker(config: CreateWorkerOptions): Worker`

Create a new worker or return an existing one.

```typescript
createWorker({
  name: 'queue-name',
  concurrency: 5,
  processor: async (job) => {
    return { result: 'done' };
  }
});
```

#### `getWorker(name: string): Worker | undefined`

Get an existing worker by name.

#### `getAllWorkerNames(): string[]`

Get all registered worker names.

#### `closeAllWorkers(): Promise<void>`

Close all workers and clear the registry.

### Job Functions

#### `addJob<T>(options: AddJobOptions<T>): Promise<Job<T>>`

Add a job to a queue.

```typescript
await addJob({
  queueName: 'emails',
  jobName: 'send-welcome',
  data: { to: 'user@example.com' },
  options: { priority: 1 }
});
```

#### `addBulkJobs<T>(queueName: string, jobs: Array<{ name: string; data: T; opts?: JobsOptions }>): Promise<Job<T>[]>`

Add multiple jobs to a queue.

#### `getJob<T>(queueName: string, jobId: string): Promise<Job<T> | undefined>`

Get a job by ID.

#### `removeJob(queueName: string, jobId: string): Promise<void>`

Remove a job from a queue.

### Scheduler Functions

#### `scheduleJob<T>(queueName: string, jobName: string, data: T, delay: number): Promise<void>`

Schedule a delayed job.

#### `addCronJob<T>(options: CronJobOptions<T>): Promise<void>`

Add a recurring cron job.

#### `removeCronJob(queueName: string, jobName: string): Promise<void>`

Remove a cron job.

#### `listCronJobs(queueName: string): Promise<RepeatableJob[]>`

List all cron jobs for a queue.

## Best Practices

1. **Job Idempotency** - Jobs should be safe to run multiple times
2. **Error Handling** - Always handle errors in job processors
3. **Monitoring** - Use Bull Board or similar for job monitoring
4. **Dead Letter Queue** - Review and retry failed jobs periodically
5. **Concurrency** - Set appropriate concurrency limits per worker
6. **Job Naming** - Use descriptive job names for debugging

## Building

```bash
pnpm nx build queues
```

## Running Tests

```bash
# Unit tests (no Redis required)
pnpm nx test queues

# Integration tests (requires Redis)
INCLUDE_INTEGRATION_TESTS=1 pnpm nx test queues
```

## Associated Packages

- `@package/redis` - Redis client (BullMQ uses Redis)
- `@package/observability` - Job metrics and logging

## Documentation

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Bull Board](https://github.com/felixmosh/bull-board) - UI for monitoring queues

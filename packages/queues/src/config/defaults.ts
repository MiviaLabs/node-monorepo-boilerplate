/**
 * Default configuration values for queues package
 *
 * These defaults are designed for production use with balanced
 * throughput, latency, and resource consumption.
 *
 * **Configuration Priority:**
 * 1. User-provided config (via `QueuesModule.forRoot()` or `createQueue()`)
 * 2. Environment variables (see each config for env var names)
 * 3. These default values
 *
 * @example Override via environment variables
 * ```bash
 * # .env file
 *
 * # Retry Strategy
 * QUEUE_DEFAULT_JOB_ATTEMPTS=5        # Retry 5 times instead of 3
 * QUEUE_DEFAULT_JOB_BACKOFF_TYPE=exponential  # 'exponential' or 'fixed'
 * QUEUE_DEFAULT_JOB_BACKOFF_DELAY=2000       # 2 seconds base delay
 *
 * # Job Retention
 * QUEUE_REMOVE_ON_COMPLETE_COUNT=500  # Keep fewer completed jobs
 * QUEUE_REMOVE_ON_COMPLETE_AGE=259200 # 3 days (in seconds)
 * QUEUE_REMOVE_ON_FAIL_COUNT=1000     # Keep fewer failed jobs
 * QUEUE_REMOVE_ON_FAIL_AGE=604800     # 7 days (in seconds)
 *
 * # Dead Letter Queue
 * QUEUE_ENABLE_DEAD_LETTER_QUEUE=true # Enable DLQ for failed job inspection
 * QUEUE_DEAD_LETTER_QUEUE_SUFFIX=-dlq # DLQ naming: {queueName}-dlq
 *
 * # Worker Settings
 * WORKER_DEFAULT_CONCURRENCY=5        # Process 5 jobs at once
 * WORKER_STALLED_INTERVAL=30000       # Check for stalled jobs every 30s
 * WORKER_MAX_STALLED_COUNT=2          # Allow 2 stalls before failing
 *
 * # Scheduler Settings
 * SCHEDULER_DEFAULT_TIMEZONE=America/New_York  # Default timezone for cron jobs
 * ```
 */

import type { IQueueConfig, IWorkerConfig, ISchedulerConfig } from './interfaces';
import { BackoffType } from './interfaces';

/**
 * Default queue configuration
 *
 * These values apply to all queues unless overridden.
 *
 * **Retry Defaults:**
 * - 3 attempts total (1 initial + 2 retries)
 * - Exponential backoff: 1s → 2s → 4s
 *
 * **Retention Defaults:**
 * - Keep 1,000 completed jobs for up to 7 days
 * - Keep 5,000 failed jobs for up to 30 days
 *
 * **Dead Letter Queue:**
 * - Disabled by default (set `QUEUE_ENABLE_DEAD_LETTER_QUEUE=true` to enable)
 * - DLQ name follows pattern: `{queueName}-dlq`
 *
 * @example Environment variables
 * ```bash
 * QUEUE_DEFAULT_JOB_ATTEMPTS=5
 * QUEUE_DEFAULT_JOB_BACKOFF_TYPE=exponential
 * QUEUE_DEFAULT_JOB_BACKOFF_DELAY=1000
 * QUEUE_REMOVE_ON_COMPLETE_COUNT=1000
 * QUEUE_REMOVE_ON_COMPLETE_AGE=604800
 * QUEUE_REMOVE_ON_FAIL_COUNT=5000
 * QUEUE_REMOVE_ON_FAIL_AGE=2592000
 * QUEUE_ENABLE_DEAD_LETTER_QUEUE=false
 * QUEUE_DEAD_LETTER_QUEUE_SUFFIX=-dlq
 * ```
 */
export const DEFAULT_QUEUE_CONFIG: Required<IQueueConfig> = {
  /** @env QUEUE_DEFAULT_JOB_ATTEMPTS */
  defaultJobAttempts: 3,
  /** @env QUEUE_DEFAULT_JOB_BACKOFF_TYPE */
  defaultJobBackoffType: BackoffType.Exponential,
  /** @env QUEUE_DEFAULT_JOB_BACKOFF_DELAY */
  defaultJobBackoffDelay: 1000,
  /** @env QUEUE_REMOVE_ON_COMPLETE_COUNT */
  removeOnCompleteCount: 1000,
  /** @env QUEUE_REMOVE_ON_COMPLETE_AGE (7 days in seconds) */
  removeOnCompleteAge: 7 * 24 * 3600,
  /** @env QUEUE_REMOVE_ON_FAIL_COUNT */
  removeOnFailCount: 5000,
  /** @env QUEUE_REMOVE_ON_FAIL_AGE (30 days in seconds) */
  removeOnFailAge: 30 * 24 * 3600,
  /** @env QUEUE_ENABLE_DEAD_LETTER_QUEUE */
  enableDeadLetterQueue: false,
  /** @env QUEUE_DEAD_LETTER_QUEUE_SUFFIX */
  deadLetterQueueSuffix: '-dlq'
};

/**
 * Default worker configuration
 *
 * Controls how workers process jobs from queues.
 *
 * **Concurrency:** Number of jobs processed simultaneously.
 * - Default: 1 (sequential processing)
 * - Increase for I/O-bound jobs (API calls, file operations)
 * - Keep low for CPU-bound jobs or memory-intensive processing
 *
 * **Stalled Job Detection:**
 * - `stalledInterval`: How often to check for stalled jobs (30s default)
 * - `maxStalledCount`: How many times a job can stall before failing
 *
 * @example Environment variables
 * ```bash
 * WORKER_DEFAULT_CONCURRENCY=5
 * WORKER_STALLED_INTERVAL=30000
 * WORKER_MAX_STALLED_COUNT=1
 * ```
 */
export const DEFAULT_WORKER_CONFIG: Required<IWorkerConfig> = {
  /** @env WORKER_DEFAULT_CONCURRENCY */
  defaultConcurrency: 1,
  /** @env WORKER_STALLED_INTERVAL (milliseconds) */
  stalledInterval: 30000,
  /** @env WORKER_MAX_STALLED_COUNT */
  maxStalledCount: 1
};

/**
 * Default scheduler configuration
 *
 * Controls cron job scheduling behavior.
 *
 * **Timezone:** All cron expressions use this timezone by default.
 * - Default: 'UTC' (recommended for consistency)
 * - Override per-job via `addCronJob({ options: { tz: 'America/New_York' } })`
 *
 * @example Environment variable
 * ```bash
 * SCHEDULER_DEFAULT_TIMEZONE=UTC
 * ```
 *
 * @example Common timezone values
 * ```typescript
 * // Server locations
 * 'UTC'                  // Coordinated Universal Time
 * 'America/New_York'     // US Eastern
 * 'America/Los_Angeles'  // US Pacific
 * 'Europe/London'        // UK
 * 'Asia/Tokyo'           // Japan
 * 'Asia/Dubai'           // UAE (Gulf Standard Time)
 * 'Asia/Riyadh'          // Saudi Arabia (Arabia Standard Time)
 * ```
 */
export const DEFAULT_SCHEDULER_CONFIG: Required<ISchedulerConfig> = {
  /** @env SCHEDULER_DEFAULT_TIMEZONE */
  defaultTimezone: 'UTC'
};

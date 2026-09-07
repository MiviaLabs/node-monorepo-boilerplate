/**
 * Configuration interfaces for queues package
 *
 * This module defines all configuration interfaces that allow users to override
 * default settings via input options, with environment variables as fallback.
 *
 * **Configuration Priority:**
 * 1. User-provided config (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

/**
 * Backoff type for retry strategy
 *
 * Determines how the delay between retry attempts is calculated when a job fails.
 *
 * @example Exponential backoff (recommended for most cases)
 * ```typescript
 * // Delays: 1s, 2s, 4s, 8s, 16s... (doubles each time)
 * // Best for: External API calls, network operations
 * // Why: Gives external services time to recover, reduces thundering herd
 * {
 *   attempts: 5,
 *   backoff: { type: 'exponential', delay: 1000 }
 * }
 * ```
 *
 * @example Fixed backoff
 * ```typescript
 * // Delays: 5s, 5s, 5s, 5s... (constant)
 * // Best for: Known transient failures, rate limiting
 * // Why: Predictable retry timing, useful when you know recovery time
 * {
 *   attempts: 3,
 *   backoff: { type: 'fixed', delay: 5000 }
 * }
 * ```
 */
export const enum BackoffType {
  /**
   * Exponential backoff - delay doubles with each retry attempt
   *
   * **Formula:** `delay * 2^(attemptNumber - 1)`
   *
   * With delay=1000ms:
   * - Attempt 1 fails → wait 1000ms
   * - Attempt 2 fails → wait 2000ms
   * - Attempt 3 fails → wait 4000ms
   * - Attempt 4 fails → wait 8000ms
   *
   * **Best for:**
   * - External API calls that may be rate limited
   * - Network operations with potential congestion
   * - Database connections during high load
   */
  Exponential = 'exponential',

  /**
   * Fixed backoff - constant delay between all retry attempts
   *
   * **Formula:** `delay` (constant)
   *
   * With delay=5000ms:
   * - Attempt 1 fails → wait 5000ms
   * - Attempt 2 fails → wait 5000ms
   * - Attempt 3 fails → wait 5000ms
   *
   * **Best for:**
   * - Known rate limits (e.g., API returns "retry after 5 seconds")
   * - Short-lived transient failures
   * - When you need predictable timing
   */
  Fixed = 'fixed'
}

/**
 * Queue configuration options
 *
 * Controls retry behavior, job retention, and dead letter queue settings.
 * All options can be set via code or environment variables.
 *
 * @example Programmatic configuration
 * ```typescript
 * QueuesModule.forRoot({
 *   queue: {
 *     defaultJobAttempts: 5,
 *     defaultJobBackoffType: BackoffType.Exponential,
 *     defaultJobBackoffDelay: 2000,
 *     enableDeadLetterQueue: true,
 *   },
 * });
 * ```
 *
 * @example Environment variable configuration
 * ```bash
 * # Retry settings
 * QUEUE_DEFAULT_JOB_ATTEMPTS=5
 * QUEUE_DEFAULT_JOB_BACKOFF_TYPE=exponential  # or 'fixed'
 * QUEUE_DEFAULT_JOB_BACKOFF_DELAY=2000
 *
 * # Job retention
 * QUEUE_REMOVE_ON_COMPLETE_COUNT=1000
 * QUEUE_REMOVE_ON_COMPLETE_AGE=604800  # 7 days in seconds
 * QUEUE_REMOVE_ON_FAIL_COUNT=5000
 * QUEUE_REMOVE_ON_FAIL_AGE=2592000     # 30 days in seconds
 *
 * # Dead letter queue
 * QUEUE_ENABLE_DEAD_LETTER_QUEUE=true
 * QUEUE_DEAD_LETTER_QUEUE_SUFFIX=-dlq
 * ```
 */
export interface IQueueConfig {
  /**
   * Default number of retry attempts for failed jobs
   *
   * When a job fails, it will be retried this many times before being
   * considered permanently failed. Can be overridden per-job.
   *
   * @default 3
   * @env QUEUE_DEFAULT_JOB_ATTEMPTS
   */
  defaultJobAttempts?: number;

  /**
   * Default backoff strategy type for retries
   *
   * - `exponential`: Delay doubles each retry (1s, 2s, 4s, 8s...)
   * - `fixed`: Constant delay between retries
   *
   * @default BackoffType.Exponential
   * @env QUEUE_DEFAULT_JOB_BACKOFF_TYPE (values: 'exponential' | 'fixed')
   */
  defaultJobBackoffType?: BackoffType;

  /**
   * Base delay in milliseconds for backoff calculation
   *
   * For exponential backoff, this is the initial delay that doubles.
   * For fixed backoff, this is the constant delay between attempts.
   *
   * @default 1000
   * @env QUEUE_DEFAULT_JOB_BACKOFF_DELAY
   */
  defaultJobBackoffDelay?: number;

  /**
   * Maximum number of completed jobs to retain
   *
   * Older completed jobs are removed when this limit is reached.
   * Set to 0 to remove all completed jobs immediately.
   *
   * @default 1000
   * @env QUEUE_REMOVE_ON_COMPLETE_COUNT
   */
  removeOnCompleteCount?: number;

  /**
   * Maximum age of completed jobs in seconds
   *
   * Completed jobs older than this are removed automatically.
   *
   * @default 604800 (7 days)
   * @env QUEUE_REMOVE_ON_COMPLETE_AGE
   */
  removeOnCompleteAge?: number;

  /**
   * Maximum number of failed jobs to retain
   *
   * Older failed jobs are removed when this limit is reached.
   * Note: When DLQ is enabled, failed jobs are moved there instead.
   *
   * @default 5000
   * @env QUEUE_REMOVE_ON_FAIL_COUNT
   */
  removeOnFailCount?: number;

  /**
   * Maximum age of failed jobs in seconds
   *
   * Failed jobs older than this are removed automatically.
   *
   * @default 2592000 (30 days)
   * @env QUEUE_REMOVE_ON_FAIL_AGE
   */
  removeOnFailAge?: number;

  /**
   * Enable Dead Letter Queue for permanently failed jobs
   *
   * When enabled, jobs that fail all retry attempts are moved to a
   * separate DLQ for inspection and manual processing instead of
   * being removed.
   *
   * @default false
   * @env QUEUE_ENABLE_DEAD_LETTER_QUEUE (values: 'true' | 'false')
   *
   * @see {@link moveToDeadLetterQueue} for moving jobs manually
   * @see {@link getDeadLetterQueueName} for getting DLQ name
   */
  enableDeadLetterQueue?: boolean;

  /**
   * Suffix appended to queue name to create DLQ name
   *
   * For queue 'emails', DLQ will be 'emails-dlq' by default.
   *
   * @default '-dlq'
   * @env QUEUE_DEAD_LETTER_QUEUE_SUFFIX
   */
  deadLetterQueueSuffix?: string;
}

/**
 * Worker configuration options
 */
export interface IWorkerConfig {
  /** Default concurrency (default: 1) */
  defaultConcurrency?: number;
  /** Stalled job check interval in ms (default: 30000) */
  stalledInterval?: number;
  /** Max stalled job count (default: 1) */
  maxStalledCount?: number;
}

/**
 * Scheduler configuration options
 */
export interface ISchedulerConfig {
  /** Default timezone for cron jobs (default: 'UTC') */
  defaultTimezone?: string;
}

/**
 * Environment variable name mappings
 *
 * Allows customization of environment variable names for different deployment scenarios.
 */
export interface IEnvironmentVariableNames {
  // Queue options
  queueDefaultJobAttempts?: string;
  queueDefaultJobBackoffType?: string;
  queueDefaultJobBackoffDelay?: string;
  queueRemoveOnCompleteCount?: string;
  queueRemoveOnCompleteAge?: string;
  queueRemoveOnFailCount?: string;
  queueRemoveOnFailAge?: string;
  queueEnableDeadLetterQueue?: string;
  queueDeadLetterQueueSuffix?: string;

  // Worker options
  workerDefaultConcurrency?: string;
  workerStalledInterval?: string;
  workerMaxStalledCount?: string;

  // Scheduler options
  schedulerDefaultTimezone?: string;
}

/**
 * Main configuration interface for queues package
 *
 * All configuration options are optional. If not provided, they will be
 * read from environment variables, or fall back to default values.
 */
export interface IInfrastructureQueuesConfig {
  /** Enable graceful shutdown on SIGTERM/SIGINT (default: true) */
  enableGracefulShutdown?: boolean;

  /** Queue configuration */
  queue?: IQueueConfig;

  /** Worker configuration */
  worker?: IWorkerConfig;

  /** Scheduler configuration */
  scheduler?: ISchedulerConfig;

  /** Custom environment variable names (optional) */
  envVarNames?: IEnvironmentVariableNames;
}

/**
 * Resolved configuration with all defaults applied
 *
 * This interface represents the final configuration after merging user options,
 * environment variables, and defaults.
 */
export interface IResolvedInfrastructureQueuesConfig {
  /** Enable graceful shutdown */
  enableGracefulShutdown: boolean;

  /** Queue configuration (with defaults) */
  queue: Required<IQueueConfig>;

  /** Worker configuration (with defaults) */
  worker: Required<IWorkerConfig>;

  /** Scheduler configuration (with defaults) */
  scheduler: Required<ISchedulerConfig>;
}

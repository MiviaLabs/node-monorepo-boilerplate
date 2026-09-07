/**
 * Configuration resolver for queues package
 *
 * Merges user configuration, environment variables, and defaults
 * to produce the final resolved configuration.
 *
 * Priority order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import { DEFAULT_QUEUE_CONFIG, DEFAULT_WORKER_CONFIG, DEFAULT_SCHEDULER_CONFIG } from './defaults';
import type {
  IInfrastructureQueuesConfig,
  IResolvedInfrastructureQueuesConfig,
  IEnvironmentVariableNames,
  IQueueConfig,
  IWorkerConfig,
  ISchedulerConfig
} from './interfaces';
import { BackoffType } from './interfaces';

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<IEnvironmentVariableNames> = {
  // Queue options
  queueDefaultJobAttempts: 'QUEUE_DEFAULT_JOB_ATTEMPTS',
  queueDefaultJobBackoffType: 'QUEUE_DEFAULT_JOB_BACKOFF_TYPE',
  queueDefaultJobBackoffDelay: 'QUEUE_DEFAULT_JOB_BACKOFF_DELAY',
  queueRemoveOnCompleteCount: 'QUEUE_REMOVE_ON_COMPLETE_COUNT',
  queueRemoveOnCompleteAge: 'QUEUE_REMOVE_ON_COMPLETE_AGE',
  queueRemoveOnFailCount: 'QUEUE_REMOVE_ON_FAIL_COUNT',
  queueRemoveOnFailAge: 'QUEUE_REMOVE_ON_FAIL_AGE',
  queueEnableDeadLetterQueue: 'QUEUE_ENABLE_DEAD_LETTER_QUEUE',
  queueDeadLetterQueueSuffix: 'QUEUE_DEAD_LETTER_QUEUE_SUFFIX',

  // Worker options
  workerDefaultConcurrency: 'WORKER_DEFAULT_CONCURRENCY',
  workerStalledInterval: 'WORKER_STALLED_INTERVAL',
  workerMaxStalledCount: 'WORKER_MAX_STALLED_COUNT',

  // Scheduler options
  schedulerDefaultTimezone: 'SCHEDULER_DEFAULT_TIMEZONE'
};

/**
 * Configuration resolver class
 */
export class ConfigResolver {
  constructor(
    private userConfig: IInfrastructureQueuesConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolve a configuration value with priority: user > env > default
   *
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional parser function for environment and user values
   * @returns Resolved value
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) {
      // Validate user-provided values using the parser if it's a number
      if (parser && typeof userValue === 'string') {
        return parser(userValue);
      }
      return userValue;
    }
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName];
      return parser ? parser(envValue) : (envValue as unknown as T);
    }
    return defaultValue;
  }

  /**
   * Parse string to boolean
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Parse string to number with validation
   */
  private parseNumber(value: string): number {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid number value: ${value}`);
    }
    return num;
  }

  /**
   * Parse string to number with range validation
   */
  private parseNumberWithRange(value: string, min: number, max?: number): number {
    const num = this.parseNumber(value);
    if (num < min) {
      throw new Error(`Value must be at least ${min}, got ${num}`);
    }
    if (max !== undefined && num > max) {
      throw new Error(`Value must be at most ${max}, got ${num}`);
    }
    return num;
  }

  /**
   * Parse string to BackoffType
   */
  private parseBackoffType(value: string): BackoffType {
    if (value === 'exponential' || value === 'fixed') {
      return value as BackoffType;
    }
    return BackoffType.Exponential;
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<IEnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Get queue configuration
   */
  getQueueConfig(): Required<IQueueConfig> {
    const envNames = this.getEnvVarNames();
    const userQueue = this.userConfig.queue || {};

    return {
      defaultJobAttempts: this.resolveValue(
        userQueue.defaultJobAttempts,
        envNames.queueDefaultJobAttempts,
        DEFAULT_QUEUE_CONFIG.defaultJobAttempts,
        (val) => this.parseNumberWithRange(val, 1)
      ),
      defaultJobBackoffType: this.resolveValue(
        userQueue.defaultJobBackoffType,
        envNames.queueDefaultJobBackoffType,
        DEFAULT_QUEUE_CONFIG.defaultJobBackoffType,
        this.parseBackoffType
      ),
      defaultJobBackoffDelay: this.resolveValue(
        userQueue.defaultJobBackoffDelay,
        envNames.queueDefaultJobBackoffDelay,
        DEFAULT_QUEUE_CONFIG.defaultJobBackoffDelay,
        (val) => this.parseNumberWithRange(val, 0)
      ),
      removeOnCompleteCount: this.resolveValue(
        userQueue.removeOnCompleteCount,
        envNames.queueRemoveOnCompleteCount,
        DEFAULT_QUEUE_CONFIG.removeOnCompleteCount,
        (val) => this.parseNumberWithRange(val, 0)
      ),
      removeOnCompleteAge: this.resolveValue(
        userQueue.removeOnCompleteAge,
        envNames.queueRemoveOnCompleteAge,
        DEFAULT_QUEUE_CONFIG.removeOnCompleteAge,
        (val) => this.parseNumberWithRange(val, 0)
      ),
      removeOnFailCount: this.resolveValue(
        userQueue.removeOnFailCount,
        envNames.queueRemoveOnFailCount,
        DEFAULT_QUEUE_CONFIG.removeOnFailCount,
        (val) => this.parseNumberWithRange(val, 0)
      ),
      removeOnFailAge: this.resolveValue(
        userQueue.removeOnFailAge,
        envNames.queueRemoveOnFailAge,
        DEFAULT_QUEUE_CONFIG.removeOnFailAge,
        (val) => this.parseNumberWithRange(val, 0)
      ),
      enableDeadLetterQueue: this.resolveValue(
        userQueue.enableDeadLetterQueue,
        envNames.queueEnableDeadLetterQueue,
        DEFAULT_QUEUE_CONFIG.enableDeadLetterQueue,
        this.parseBoolean
      ),
      deadLetterQueueSuffix: this.resolveValue(
        userQueue.deadLetterQueueSuffix,
        envNames.queueDeadLetterQueueSuffix,
        DEFAULT_QUEUE_CONFIG.deadLetterQueueSuffix
      )
    };
  }

  /**
   * Get worker configuration
   */
  getWorkerConfig(): Required<IWorkerConfig> {
    const envNames = this.getEnvVarNames();
    const userWorker = this.userConfig.worker || {};

    return {
      defaultConcurrency: this.resolveValue(
        userWorker.defaultConcurrency,
        envNames.workerDefaultConcurrency,
        DEFAULT_WORKER_CONFIG.defaultConcurrency,
        (val) => this.parseNumberWithRange(val, 1)
      ),
      stalledInterval: this.resolveValue(
        userWorker.stalledInterval,
        envNames.workerStalledInterval,
        DEFAULT_WORKER_CONFIG.stalledInterval,
        (val) => this.parseNumberWithRange(val, 1)
      ),
      maxStalledCount: this.resolveValue(
        userWorker.maxStalledCount,
        envNames.workerMaxStalledCount,
        DEFAULT_WORKER_CONFIG.maxStalledCount,
        (val) => this.parseNumberWithRange(val, 1)
      )
    };
  }

  /**
   * Get scheduler configuration
   */
  getSchedulerConfig(): Required<ISchedulerConfig> {
    const envNames = this.getEnvVarNames();
    const userScheduler = this.userConfig.scheduler || {};

    return {
      defaultTimezone: this.resolveValue(
        userScheduler.defaultTimezone,
        envNames.schedulerDefaultTimezone,
        DEFAULT_SCHEDULER_CONFIG.defaultTimezone
      )
    };
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): IResolvedInfrastructureQueuesConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    return {
      enableGracefulShutdown: this.userConfig.enableGracefulShutdown !== false,
      queue: this.getQueueConfig(),
      worker: this.getWorkerConfig(),
      scheduler: this.getSchedulerConfig()
    };
  }
}

/**
 * Resolve configuration from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/queues';
 *
 * const config = resolveConfig({
 *   queue: {
 *     defaultJobAttempts: 5,
 *     defaultJobBackoffDelay: 2000,
 *   },
 *   worker: {
 *     defaultConcurrency: 5,
 *   },
 * });
 * ```
 */
export function resolveConfig(
  userConfig: IInfrastructureQueuesConfig = {},
  env: NodeJS.ProcessEnv = process.env
): IResolvedInfrastructureQueuesConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

/**
 * Default configuration values for Cloud Tasks
 */

import { QueueState } from './interfaces';

import type {
  CloudTasksConfig,
  QueueOptions,
  TaskOptions,
  RetryConfig,
  RateLimits
} from './interfaces';

/**
 * Default retry configuration
 *
 * Standard retry settings for Cloud Tasks with exponential backoff.
 * These values provide a reasonable balance between reliability and resource usage.
 *
 * @example Using default retry config
 * ```typescript
 * const queueOptions: QueueOptions = {
 *   retryConfig: DEFAULT_RETRY_CONFIG,
 * };
 *
 * await provider.createQueue('my-queue', queueOptions);
 * ```
 *
 * @example Overriding specific retry values
 * ```typescript
 * const customRetry: RetryConfig = {
 *   ...DEFAULT_RETRY_CONFIG,
 *   maxAttempts: 10,          // Increase from default 3
 *   maxBackoffInSeconds: 300, // Reduce from default 600
 * };
 * ```
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  minBackoffInSeconds: 10,
  maxBackoffInSeconds: 600,
  maxRetryDurationInSeconds: 86400, // 1 day
  retryUntil: new Date(Date.now() + 86400000) // 1 day from now
};

/**
 * Default rate limits
 *
 * Standard rate limiting settings for Cloud Tasks queues.
 * These values allow high throughput while preventing resource exhaustion.
 *
 * @example Using default rate limits
 * ```typescript
 * const queueOptions: QueueOptions = {
 *   rateLimits: DEFAULT_RATE_LIMITS,
 * };
 *
 * await provider.createQueue('high-throughput-queue', queueOptions);
 * ```
 *
 * @example Creating a throttled queue
 * ```typescript
 * const throttledLimits: RateLimits = {
 *   ...DEFAULT_RATE_LIMITS,
 *   maxRequestsPerSecond: 10,       // Reduce from default 500
 *   maxConcurrentDispatches: 5,     // Reduce from default 1000
 * };
 * ```
 */
export const DEFAULT_RATE_LIMITS: Required<RateLimits> = {
  maxRequestsPerSecond: 500,
  maxConcurrentDispatches: 1000,
  maxBatchesPerSecond: 100
};

/**
 * Default queue options
 *
 * Standard queue configuration combining default rate limits and retry settings.
 * Use as a base and override specific values as needed.
 *
 * @example Creating a queue with default options
 * ```typescript
 * await provider.createQueue('my-queue', DEFAULT_QUEUE_OPTIONS);
 * ```
 *
 * @example Customizing queue options
 * ```typescript
 * const customOptions: QueueOptions = {
 *   ...DEFAULT_QUEUE_OPTIONS,
 *   description: 'Email notification queue',
 *   rateLimits: { maxRequestsPerSecond: 50 },
 * };
 *
 * await provider.createQueue('email-queue', customOptions);
 * ```
 */
export const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  description: 'Managed by @package/tasks',
  rateLimits: DEFAULT_RATE_LIMITS,
  retryConfig: DEFAULT_RETRY_CONFIG,
  state: QueueState.RUNNING
};

/**
 * Default task options
 *
 * Standard task configuration with reasonable defaults for dispatch deadline
 * and priority. Use as a base for task creation.
 *
 * @example Using default task options
 * ```typescript
 * const taskOptions: TaskOptions = {
 *   ...DEFAULT_TASK_OPTIONS,
 *   scheduleTime: new Date(Date.now() + 60000), // Add scheduling
 * };
 *
 * await provider.createHttpTask('my-queue', httpTarget, taskOptions);
 * ```
 *
 * @example Overriding task priority
 * ```typescript
 * const highPriorityTask: TaskOptions = {
 *   ...DEFAULT_TASK_OPTIONS,
 *   priority: 1, // Higher priority (0-10, lower = higher)
 * };
 * ```
 */
export const DEFAULT_TASK_OPTIONS: TaskOptions = {
  dispatchDeadline: 600, // 10 minutes
  priority: 5
};

/**
 * Default client configuration
 *
 * Standard Cloud Tasks client settings. These values are merged with
 * user-provided configuration by resolveConfig().
 *
 * @example Viewing default client settings
 * ```typescript
 * console.log(DEFAULT_CLIENT_CONFIG.timeout);     // 60000 (1 minute)
 * console.log(DEFAULT_CLIENT_CONFIG.maxRetries);  // 3
 * console.log(DEFAULT_CLIENT_CONFIG.enableTracing); // true
 * ```
 *
 * @example Using defaults in custom configuration
 * ```typescript
 * const config: CloudTasksConfig = {
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   timeout: DEFAULT_CLIENT_CONFIG.timeout,
 *   maxRetries: 5, // Override default
 * };
 * ```
 */
export const DEFAULT_CLIENT_CONFIG = {
  enableTracing: true,
  timeout: 60000, // 1 minute
  maxRetries: 3,
  testMode: false
} as const satisfies Partial<CloudTasksConfig>;

/**
 * Environment variable names
 *
 * Constants for all supported Cloud Tasks environment variables.
 * Used by resolveConfig() to read configuration from the environment.
 *
 * @example Setting required environment variables
 * ```bash
 * export CLOUD_TASKS_PROJECT_ID=my-project
 * export CLOUD_TASKS_LOCATION=us-central1
 * export CLOUD_TASKS_KEY_FILE=/path/to/service-account.json
 * ```
 *
 * @example Using ENV_VARS in code
 * ```typescript
 * // Read a specific environment variable
 * const projectId = process.env[ENV_VARS.PROJECT_ID];
 *
 * // Check if test mode is enabled
 * const isTestMode = process.env[ENV_VARS.TEST_MODE] === 'true';
 * ```
 *
 * @example All supported environment variables
 * ```typescript
 * // Required:
 * // - CLOUD_TASKS_PROJECT_ID: Google Cloud project ID
 * // - CLOUD_TASKS_LOCATION: Cloud Tasks region (e.g., 'us-central1')
 *
 * // Optional:
 * // - CLOUD_TASKS_QUEUE_NAME: Default queue name
 * // - CLOUD_TASKS_KEY_FILE: Path to service account JSON
 * // - CLOUD_TASKS_CLIENT_EMAIL: Service account email
 * // - CLOUD_TASKS_PRIVATE_KEY: Service account private key (not recommended)
 * // - CLOUD_TASKS_TIMEOUT: Connection timeout in ms
 * // - CLOUD_TASKS_MAX_RETRIES: Max API retry attempts
 * // - CLOUD_TASKS_ENABLE_TRACING: Enable OpenTelemetry tracing
 * // - TEST_MODE: Use mock provider for testing
 * ```
 */
export const ENV_VARS = {
  PROJECT_ID: 'CLOUD_TASKS_PROJECT_ID',
  LOCATION: 'CLOUD_TASKS_LOCATION',
  QUEUE_NAME: 'CLOUD_TASKS_QUEUE_NAME',
  KEY_FILE: 'CLOUD_TASKS_KEY_FILE',
  CLIENT_EMAIL: 'CLOUD_TASKS_CLIENT_EMAIL',
  PRIVATE_KEY: 'CLOUD_TASKS_PRIVATE_KEY',
  TIMEOUT: 'CLOUD_TASKS_TIMEOUT',
  MAX_RETRIES: 'CLOUD_TASKS_MAX_RETRIES',
  ENABLE_TRACING: 'CLOUD_TASKS_ENABLE_TRACING',
  TEST_MODE: 'TEST_MODE'
} as const;

/**
 * Default queue paths
 *
 * Standard queue names for different environments.
 * Use these constants to maintain consistent queue naming across the application.
 *
 * @example Using queue paths by environment
 * ```typescript
 * const queueName = process.env.NODE_ENV === 'production'
 *   ? QUEUE_PATHS.PRODUCTION
 *   : QUEUE_PATHS.DEVELOPMENT;
 *
 * await provider.createHttpTask(queueName, { url: 'https://api.example.com' });
 * ```
 *
 * @example Using test queue in tests
 * ```typescript
 * describe('TaskProcessor', () => {
 *   const mockProvider = createMockCloudTasksProvider();
 *
 *   beforeEach(async () => {
 *     await mockProvider.createQueue(QUEUE_PATHS.TEST);
 *   });
 * });
 * ```
 */
export const QUEUE_PATHS = {
  PRODUCTION: 'default-queue',
  DEVELOPMENT: 'dev-queue',
  TEST: 'test-queue'
} as const;

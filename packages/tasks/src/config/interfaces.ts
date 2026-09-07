/**
 * Configuration interfaces for Cloud Tasks
 */

/**
 * HTTP methods enum
 *
 * Provides strongly-typed constants for HTTP methods
 */
const enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS'
}

/**
 * Queue state enum
 *
 * Represents the possible states of a Cloud Tasks queue
 */
const enum QueueState {
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED'
}

/**
 * Retry configuration for tasks
 *
 * Configures how tasks should be retried on failure.
 * All time values are specified in seconds for simplicity.
 *
 * @example
 * ```typescript
 * const retryConfig: RetryConfig = {
 *   maxAttempts: 5,
 *   minBackoffInSeconds: 10,
 *   maxBackoffInSeconds: 600,
 *   maxRetryDurationInSeconds: 86400, // 1 day
 * };
 * ```
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Minimum time between retries in seconds */
  minBackoffInSeconds?: number;
  /** Maximum time between retries in seconds */
  maxBackoffInSeconds?: number;
  /** Maximum number of days to retry */
  maxRetryDurationInSeconds?: number;
  /** Retry until deadline or max attempts */
  retryUntil?: Date;
}

/**
 * Rate limits for queue
 *
 * Controls the rate at which tasks are dispatched from a queue.
 *
 * @example
 * ```typescript
 * const rateLimits: RateLimits = {
 *   maxRequestsPerSecond: 100,
 *   maxConcurrentDispatches: 50,
 * };
 * ```
 */
export interface RateLimits {
  /** Maximum requests per second */
  maxRequestsPerSecond?: number;
  /** Maximum concurrent dispatches */
  maxConcurrentDispatches?: number;
  /** Maximum batches per second */
  maxBatchesPerSecond?: number;
}

/**
 * HTTP target configuration
 *
 * Configuration for creating HTTP tasks that make web requests.
 *
 * @example
 * ```typescript
 * const httpTarget: HttpTargetOptions = {
 *   url: 'https://api.example.com/tasks',
 *   httpMethod: HttpMethod.POST,
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ data: 'value' }),
 * };
 * ```
 */
export interface HttpTargetOptions {
  /** Full URL path for the HTTP request */
  url: string;
  /** HTTP method (defaults to POST) */
  httpMethod?: HttpMethod;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT) */
  body?: string | Buffer;
  /** OIDC token configuration */
  oidcToken?: {
    serviceAccountEmail?: string;
    audience?: string;
  };
  /** OAuth token configuration */
  oauthToken?: {
    serviceAccountEmail?: string;
    scope?: string;
  };
}

/**
 * App Engine HTTP target configuration
 *
 * Configuration for creating tasks that target App Engine services.
 *
 * @example
 * ```typescript
 * const appEngineTarget: AppEngineHttpTargetOptions = {
 *   relativeUri: '/api/tasks/process',
 *   httpMethod: HttpMethod.POST,
 *   appEngineRouting: {
 *     service: 'worker',
 *     version: 'v1',
 *   },
 * };
 * ```
 */
export interface AppEngineHttpTargetOptions {
  /** App Engine application */
  appEngineRouting?: {
    service?: string;
    version?: string;
    instance?: string;
    host?: string;
  };
  /** HTTP method (defaults to POST) */
  httpMethod?: HttpMethod;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT) */
  body?: string | Buffer;
  /** Relative URL path */
  relativeUri?: string;
}

/**
 * Task creation options
 *
 * Configuration options when creating a new task.
 *
 * @example
 * ```typescript
 * const taskOptions: TaskOptions = {
 *   name: 'my-task',
 *   scheduleTime: new Date(Date.now() + 60000), // 1 minute from now
 *   dispatchDeadline: 300, // 5 minutes
 *   priority: 5, // Medium priority
 * };
 * ```
 */
export interface TaskOptions {
  /** Task name (optional, auto-generated if not provided) */
  name?: string;
  /** Schedule time for the task */
  scheduleTime?: Date;
  /** Dispatch deadline in seconds */
  dispatchDeadline?: number;
  /**
   * Priority (0-10, lower is higher priority)
   * 0 = highest priority, 10 = lowest priority
   */
  priority?: number;
  /** Task payload */
  payload?: string | Buffer;
  /** Retry configuration */
  retryConfig?: RetryConfig;
}

/**
 * Queue creation options
 *
 * Configuration options when creating a new queue.
 *
 * @example
 * ```typescript
 * const queueOptions: QueueOptions = {
 *   description: 'Queue for processing background jobs',
 *   state: QueueState.RUNNING,
 *   rateLimits: {
 *     maxRequestsPerSecond: 100,
 *   },
 * };
 * ```
 */
export interface QueueOptions {
  /** Queue description */
  description?: string;
  /** Rate limits */
  rateLimits?: RateLimits;
  /** Retry configuration */
  retryConfig?: RetryConfig;
  /** Queue state */
  state?: QueueState;
}

/**
 * Cloud Tasks client configuration
 *
 * Configuration for initializing the Cloud Tasks provider.
 *
 * @example
 * ```typescript
 * const config: CloudTasksConfig = {
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   queueName: 'my-queue',
 *   credentials: {
 *     keyFile: '/path/to/service-account.json',
 *   },
 *   enableTracing: true,
 * };
 * ```
 */
export interface CloudTasksConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Cloud Tasks location (e.g., 'us-central1') */
  location: string;
  /** Default queue name */
  queueName?: string;
  /** Queue creation options */
  queueOptions?: QueueOptions;
  /** Authentication credentials */
  credentials?: {
    /** Client email for service account */
    clientEmail?: string;
    /** Private key for service account */
    privateKey?: string;
    /** Path to credentials file */
    keyFile?: string;
  };
  /** Enable OpenTelemetry tracing */
  enableTracing?: boolean;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retries for API calls */
  maxRetries?: number;
  /** Test mode flag (uses mock provider) */
  testMode?: boolean;
  /** API endpoint for emulator support (e.g., 'http://localhost:9092') */
  apiEndpoint?: string;
}

// Re-export const enums for use in user code
export { HttpMethod, QueueState };

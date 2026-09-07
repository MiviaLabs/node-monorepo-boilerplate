/**
 * Google Cloud Tasks type definitions
 *
 * These types are extracted from the Google Cloud Tasks protobuf definitions
 * since they are not exported from the main package.
 *
 * NOTE: These types use Google SDK's Duration format and are intended for
 * internal use when mapping to/from the Google Cloud Tasks API.
 * For user-facing configuration, use the types from `config/interfaces.ts`
 * which use simpler second-based values.
 */

/**
 * Queue state enum for Google SDK
 *
 * Matches the Google Cloud Tasks API Queue.State enum
 */
export enum GoogleQueueState {
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED'
}

/**
 * HTTP methods enum for Google SDK
 *
 * Matches the Google Cloud Tasks API HttpMethod enum
 */
export enum GoogleHttpMethod {
  HTTP_METHOD_UNSPECIFIED = 'HTTP_METHOD_UNSPECIFIED',
  POST = 'POST',
  GET = 'GET',
  HEAD = 'HEAD',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS'
}

/**
 * Task view enum for Google SDK
 *
 * Matches the Google Cloud Tasks API Task.View enum
 */
export enum GoogleTaskView {
  VIEW_UNSPECIFIED = 'VIEW_UNSPECIFIED',
  BASIC = 'BASIC',
  FULL = 'FULL'
}

/**
 * Rate limits for a queue (Google SDK format)
 *
 * This is the Google SDK representation of rate limits.
 * For user-facing configuration, see config/interfaces.ts
 *
 * NOTE: Renamed to GoogleRateLimits to avoid collision with user-facing RateLimits
 * in config/interfaces.ts
 */
export interface GoogleRateLimits {
  maxRequestsPerSecond?: number;
  maxConcurrentDispatches?: number;
  maxBatchesPerSecond?: number;
}

/**
 * Retry configuration for a queue (Google SDK format)
 *
 * This is the Google SDK representation using Duration objects.
 * For user-facing configuration (simpler second-based values),
 * see config/interfaces.ts RetryConfig
 *
 * @example
 * // User-facing config (interfaces.ts):
 * { maxBackoffInSeconds: 600 }
 *
 * // Google SDK format (this file):
 * { maxBackoff: { seconds: 600, nanos: 0 } }
 *
 * NOTE: Renamed to GoogleRetryConfig to avoid collision with user-facing RetryConfig
 * in config/interfaces.ts
 */
export interface GoogleRetryConfig {
  maxAttempts?: number;
  minBackoff?: Duration;
  maxBackoff?: Duration;
  maxRetryDuration?: Duration;
  maxDoublings?: number;
}

/**
 * Duration representation (Google SDK format)
 *
 * Represents a span of time with second and nanosecond precision.
 * This matches Google's protobuf Duration format.
 */
export interface Duration {
  seconds?: string | number;
  nanos?: number;
}

/**
 * Stackdriver logging configuration
 */
export interface StackdriverLoggingConfig {
  samplingRatio?: number;
}

/**
 * Queue configuration (Google SDK format)
 *
 * Complete queue definition as returned by Google Cloud Tasks API.
 */
export interface Queue {
  name: string;
  state?: GoogleQueueState;
  rateLimits?: GoogleRateLimits;
  retryConfig?: GoogleRetryConfig;
  stackdriverLoggingConfig?: StackdriverLoggingConfig;
  appEngineRoutingOverride?: AppEngineRouting;
  purgeTime?: Timestamp;
}

/**
 * Task configuration (for creating tasks - only settable fields)
 *
 * Task definition for creating new tasks via the API.
 */
export interface Task {
  name?: string;
  scheduleTime?: Timestamp;
  dispatchDeadline?: Duration;
  priority?: string;
  httpRequest?: HttpRequest;
  appEngineHttpRequest?: AppEngineHttpRequest;
}

/**
 * Task result (from API responses - includes all fields)
 *
 * Complete task information as returned by the Google Cloud Tasks API.
 */
export interface TaskResult {
  name: string;
  dispatchCount?: number;
  responseCount?: number;
  lastAttempt?: Timestamp;
  firstAttempt?: Timestamp;
  scheduleTime?: Date;
  dispatchDeadline?: number;
  createTime?: Timestamp;
  view?: GoogleTaskView;
  priority?: number;
}

/**
 * Timestamp (Google SDK format)
 *
 * Represents a point in time with second and nanosecond precision.
 * This matches Google's protobuf Timestamp format.
 */
export interface Timestamp {
  seconds?: string | number;
  nanos?: number;
}

/**
 * OIDC token for HTTP tasks
 *
 * Configuration for OpenID Connect authentication.
 */
export interface OidcToken {
  serviceAccountEmail?: string;
  audience?: string;
}

/**
 * OAuth token for HTTP tasks
 *
 * Configuration for OAuth 2.0 authentication.
 */
export interface OAuthToken {
  serviceAccountEmail?: string;
  scope?: string;
}

/**
 * HTTP request for task
 *
 * Defines an HTTP task that will make a web request.
 */
export interface HttpRequest {
  url?: string;
  httpMethod?: GoogleHttpMethod;
  headers?: Record<string, string>;
  body?: Buffer;
  oidcToken?: OidcToken;
  oauthToken?: OAuthToken;
}

/**
 * App Engine routing
 *
 * Routing parameters for App Engine HTTP targets.
 */
export interface AppEngineRouting {
  service?: string;
  version?: string;
  instance?: string;
  host?: string;
}

/**
 * App Engine HTTP request for task
 *
 * Defines an App Engine HTTP task that targets an App Engine service.
 */
export interface AppEngineHttpRequest {
  appEngineRouting?: AppEngineRouting;
  httpMethod?: GoogleHttpMethod;
  headers?: Record<string, string>;
  body?: Buffer;
  relativeUri?: string;
}

/**
 * Create queue request
 */
export interface CreateQueueRequest {
  parent: string;
  queue: Queue;
}

/**
 * Delete queue request
 */
export interface DeleteQueueRequest {
  name: string;
}

/**
 * Get queue request
 */
export interface GetQueueRequest {
  name: string;
}

/**
 * List queues request
 */
export interface ListQueuesRequest {
  parent: string;
  filter?: string;
  pageSize?: number;
  pageToken?: string;
}

/**
 * List queues response
 */
export interface ListQueuesResponse {
  queues: Queue[];
  nextPageToken?: string;
}

/**
 * Create task request
 */
export interface CreateTaskRequest {
  parent: string;
  task: Task;
  responseView?: GoogleTaskView;
}

/**
 * Delete task request
 */
export interface DeleteTaskRequest {
  name: string;
}

/**
 * Get task request
 */
export interface GetTaskRequest {
  name: string;
  responseView?: GoogleTaskView;
}

/**
 * Get task response
 */
export interface GetTaskResponse {
  task: Task;
}

/**
 * Create task response
 */
export interface CreateTaskResponse {
  task: Task;
}

/**
 * Pause queue request
 */
export interface PauseQueueRequest {
  name: string;
}

/**
 * Resume queue request
 */
export interface ResumeQueueRequest {
  name: string;
}

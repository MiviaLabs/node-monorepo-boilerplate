/**
 * Google Cloud Tasks provider
 *
 * Provides functionality to interact with Google Cloud Tasks API.
 * This is the main implementation for creating queues and tasks.
 *
 * @example
 * ```typescript
 * const provider = new CloudTasksProvider({
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   credentials: { keyFile: '/path/to/service-account.json' },
 * });
 *
 * const queue = await provider.createQueue('my-queue');
 * await provider.createHttpTask('my-queue', {
 *   url: 'https://api.example.com/process',
 *   httpMethod: HttpMethod.POST,
 * });
 * ```
 */

import { randomUUID } from 'node:crypto';

import { CloudTasksClient } from '@google-cloud/tasks';
import { INFRASTRUCTURE_ATTRS, withSpan } from '@package/core';
import { Logger } from '@package/observability';

import { validateConfig, getQueuePath, getLocationPath } from '../config/config-resolver';
import {
  QueueNotFoundError,
  QueueAlreadyExistsError,
  TaskCreationFailedError,
  TaskNotFoundError,
  TaskRetrievalFailedError,
  InvalidTaskConfigError,
  QueueCreationFailedError,
  QueueDeletionFailedError,
  PermissionDeniedError,
  RateLimitExceededError
} from '../errors';

import type {
  HttpMethod,
  QueueState,
  CloudTasksConfig,
  QueueOptions,
  TaskOptions,
  HttpTargetOptions,
  AppEngineHttpTargetOptions,
  RetryConfig
} from '../config';
import type {
  Queue,
  Task,
  TaskResult,
  CreateQueueRequest,
  DeleteQueueRequest,
  GetQueueRequest,
  ListQueuesRequest,
  CreateTaskRequest,
  DeleteTaskRequest,
  GetTaskRequest,
  HttpRequest,
  AppEngineHttpRequest,
  Duration,
  GoogleRateLimits,
  GoogleRetryConfig,
  GoogleHttpMethod,
  GoogleQueueState
} from './google-tasks.types';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';

/**
 * gRPC Status Codes
 * @see https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 */
const GRPC_STATUS_CODE = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16
} as const;

/**
 * Valid HTTP methods for Cloud Tasks
 */
const VALID_HTTP_METHODS = new Set(['POST', 'GET', 'HEAD', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']);

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate HTTP method
 */
function isValidHttpMethod(method: string): boolean {
  return VALID_HTTP_METHODS.has(method);
}

/**
 * Validate queue name format
 * - Lowercase letters, numbers, hyphens, underscores only
 * - Must start with a letter
 * - Max 64 characters
 */
function isValidQueueName(name: string): boolean {
  const regex = /^[a-z][a-z0-9_-]{0,63}$/;
  return regex.test(name);
}

/**
 * Validate headers size limits
 * - Max 8KB per header
 * - Max 100KB total headers size
 */
function validateHeaders(headers?: Record<string, string>): void {
  if (!headers) return;

  const MAX_HEADER_SIZE = 8 * 1024; // 8KB
  const MAX_TOTAL_HEADERS_SIZE = 100 * 1024; // 100KB

  let totalSize = 0;
  for (const [key, value] of Object.entries(headers)) {
    const headerSize = key.length + value.length;
    if (headerSize > MAX_HEADER_SIZE) {
      throw new InvalidTaskConfigError(`Header "${key}" exceeds 8KB limit (${headerSize} bytes)`);
    }
    totalSize += headerSize;
  }

  if (totalSize > MAX_TOTAL_HEADERS_SIZE) {
    throw new InvalidTaskConfigError(`Total headers size exceeds 100KB limit (${totalSize} bytes)`);
  }
}

/**
 * Validate priority range
 * - Must be between 0 and 10 for Google Cloud Tasks
 */
function validatePriority(priority?: number): void {
  if (priority !== undefined && (priority < 0 || priority > 10)) {
    throw new InvalidTaskConfigError(`Priority must be between 0 and 10, got ${priority}`);
  }
}

/**
 * Convert user-facing HttpMethod to Google SDK GoogleHttpMethod
 * Throws an error if the method is not valid
 */
function toGoogleHttpMethod(method: HttpMethod | string): GoogleHttpMethod {
  // Validate the method is a valid HTTP method
  if (!isValidHttpMethod(method)) {
    throw new InvalidTaskConfigError(
      `Invalid HTTP method: ${method}. Must be one of: ${Array.from(VALID_HTTP_METHODS).join(', ')}`
    );
  }

  // After validation, we can safely cast since we know it's valid
  return method as unknown as GoogleHttpMethod;
}

/**
 * Convert user-facing QueueState to Google SDK GoogleQueueState
 */
function toGoogleQueueState(state: QueueState): GoogleQueueState {
  // Both enums have the same string values, so we can cast directly
  return state as unknown as GoogleQueueState;
}

/**
 * Queue info
 *
 * Simplified queue information returned from the provider.
 * Excludes internal Google SDK types and uses simple formats.
 */
export interface QueueInfo {
  /** Queue name (without full path) */
  name: string;
  /** Queue state */
  state: string;
  /** Rate limits */
  rateLimits?: {
    maxRequestsPerSecond?: number;
    maxConcurrentDispatches?: number;
    maxBatchesPerSecond?: number;
  };
  /** Retry configuration */
  retryConfig?: RetryConfig;
}

/**
 * List queues result
 *
 * Result of listing queues with pagination support.
 */
export interface ListQueuesResult {
  /** Array of queues */
  queues: QueueInfo[];
  /** Token for retrieving the next page (undefined if no more pages) */
  nextPageToken?: string;
}

/**
 * Cloud Tasks provider class
 *
 * Main provider for interacting with Google Cloud Tasks API.
 * Handles queue and task management with built-in error handling,
 * validation, and OpenTelemetry tracing.
 *
 * Implements OnModuleDestroy to ensure proper cleanup of resources.
 */
export class CloudTasksProvider implements OnModuleDestroy {
  private readonly client: CloudTasksClient;
  private readonly config: CloudTasksConfig;
  private readonly logger: Logger;
  private readonly providerName = 'CloudTasksProvider';

  /**
   * Create a new CloudTasksProvider instance
   *
   * Initializes the Google Cloud Tasks client with the provided configuration.
   *
   * @param config - Cloud Tasks configuration (project ID, location, credentials)
   * @throws {Error} If configuration validation fails
   *
   * @example
   * ```typescript
   * const provider = new CloudTasksProvider({
   *   projectId: 'my-project',
   *   location: 'us-central1',
   *   credentials: {
   *     keyFile: '/path/to/service-account.json',
   *   },
   * });
   * ```
   */
  constructor(config: CloudTasksConfig) {
    validateConfig(config);

    this.config = config;
    this.logger = new Logger();

    // Initialize Cloud Tasks client
    const clientOptions: {
      keyFile?: string;
      credentials?: { client_email: string; private_key: string };
      timeout?: number;
      maxRetries?: number;
      projectId?: string;
      apiEndpoint?: string;
    } = {};

    if (config.credentials) {
      if (config.credentials.keyFile) {
        clientOptions.keyFile = config.credentials.keyFile;
      } else if (config.credentials.clientEmail && config.credentials.privateKey) {
        clientOptions.credentials = {
          client_email: config.credentials.clientEmail,
          private_key: config.credentials.privateKey
        };
      }
    }

    if (config.timeout) {
      clientOptions.timeout = config.timeout;
    }

    if (config.maxRetries) {
      clientOptions.maxRetries = config.maxRetries;
    }

    if (config.apiEndpoint) {
      clientOptions.apiEndpoint = config.apiEndpoint;
    }

    this.client = new CloudTasksClient(clientOptions);

    // Sanitize sensitive information before logging
    const isProduction = process['env']['NODE_ENV'] === 'production';
    this.logger.info('CloudTasksProvider initialized', {
      projectId: this.sanitizeProjectId(config.projectId),
      location: config.location,
      apiEndpoint: config.apiEndpoint ?? 'default',
      timeout: config.timeout ?? 'default',
      maxRetries: config.maxRetries ?? 'default',
      // Only log verbose details in development
      ...(isProduction ? {} : { verbose: true })
    });
  }

  /**
   * Sanitize project ID for logging
   * Shows only first 4 and last 4 characters in production
   */
  private sanitizeProjectId(projectId: string): string {
    const isProduction = process['env']['NODE_ENV'] === 'production';
    if (!isProduction || projectId.length <= 8) {
      return projectId;
    }
    return `${projectId.slice(0, 4)}****${projectId.slice(-4)}`;
  }

  /**
   * Create a new queue
   *
   * Creates a new queue in Google Cloud Tasks.
   *
   * @param name - Queue name (must be valid Cloud Tasks queue name)
   * @param options - Optional queue configuration (rate limits, retry config, state)
   * @returns Promise resolving to the created queue information
   * @throws {InvalidTaskConfigError} If queue name is invalid
   * @throws {QueueAlreadyExistsError} If a queue with the same name exists
   * @throws {QueueCreationFailedError} If queue creation fails
   * @throws {PermissionDeniedError} If insufficient permissions
   *
   * @example
   * ```typescript
   * const queue = await provider.createQueue('my-queue', {
   *   state: QueueState.RUNNING,
   *   rateLimits: { maxRequestsPerSecond: 100 },
   *   retryConfig: { maxAttempts: 5, minBackoffInSeconds: 10 },
   * });
   * ```
   */
  async createQueue(name: string, options?: QueueOptions): Promise<QueueInfo> {
    return withSpan(
      `${this.providerName}.createQueue`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'createQueue',
          'queue.name': name
        });

        // Validate queue name format
        if (!isValidQueueName(name)) {
          throw new InvalidTaskConfigError(
            `Invalid queue name: "${name}". Queue names must start with a letter, contain only lowercase letters, numbers, hyphens, and underscores, and be max 64 characters.`
          );
        }

        try {
          const startTime = Date.now();
          const parent = getLocationPath(this.config);
          const queue: Queue = {
            name: `${parent}/queues/${name}`,
            ...this.buildQueueConfig(options)
          };

          const request: CreateQueueRequest = {
            parent,
            queue
          };

          // Google SDK returns a tuple: [queue, request, rawResponse]
          const response = await this.client.createQueue(request);
          const createdQueue = this.extractFirstElement<Queue>(response);

          if (!createdQueue) {
            throw new QueueCreationFailedError(name, {
              cause: new Error('No queue returned from Google Cloud Tasks API')
            });
          }

          const duration = Date.now() - startTime;
          this.logger.info(`Queue created: ${name}`, {
            queueName: name,
            durationMs: duration,
            hasRateLimits: !!options?.rateLimits,
            hasRetryConfig: !!options?.retryConfig
          });

          return this.mapQueueInfo(createdQueue as Queue);
        } catch (error: unknown) {
          if (this.isAlreadyExistsError(error)) {
            this.logger.warn(`Queue already exists: ${name}`, { error });
            throw new QueueAlreadyExistsError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            this.logger.error('Permission denied creating queue', { queueName: name, error });
            throw new PermissionDeniedError('Failed to create queue', { cause: error });
          }
          this.logger.error('Failed to create queue', { queueName: name, error });
          throw new QueueCreationFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Delete a queue
   *
   * Deletes a queue and all its tasks from Google Cloud Tasks.
   * This operation cannot be undone.
   *
   * @param name - Queue name to delete
   * @returns Promise that resolves when the queue is deleted
   * @throws {QueueNotFoundError} If the queue does not exist
   * @throws {QueueDeletionFailedError} If queue deletion fails
   * @throws {PermissionDeniedError} If insufficient permissions
   *
   * @example
   * ```typescript
   * await provider.deleteQueue('my-queue');
   * ```
   */
  async deleteQueue(name: string): Promise<void> {
    return withSpan(
      `${this.providerName}.deleteQueue`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'deleteQueue',
          'queue.name': name
        });

        try {
          const startTime = Date.now();
          const queuePath = getQueuePath(this.config, name);
          const request: DeleteQueueRequest = {
            name: queuePath
          };

          await this.client.deleteQueue(request);

          const duration = Date.now() - startTime;
          this.logger.info(`Queue deleted: ${name}`, {
            queueName: name,
            durationMs: duration
          });
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            this.logger.warn(`Queue not found for deletion: ${name}`, { error });
            throw new QueueNotFoundError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            this.logger.error('Permission denied deleting queue', { queueName: name, error });
            throw new PermissionDeniedError('Failed to delete queue', { cause: error });
          }
          this.logger.error('Failed to delete queue', { queueName: name, error });
          throw new QueueDeletionFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Get a queue
   *
   * Retrieves information about a specific queue.
   *
   * @param name - Queue name to retrieve
   * @returns Promise resolving to the queue information
   * @throws {QueueNotFoundError} If the queue does not exist
   *
   * @example
   * ```typescript
   * const queue = await provider.getQueue('my-queue');
   * console.log(queue.state, queue.rateLimits);
   * ```
   */
  async getQueue(name: string): Promise<QueueInfo> {
    return withSpan(
      `${this.providerName}.getQueue`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'getQueue',
          'queue.name': name
        });

        try {
          const startTime = Date.now();
          const queuePath = getQueuePath(this.config, name);
          const request: GetQueueRequest = {
            name: queuePath
          };

          const queue = this.extractFirstElement<Queue>(await this.client.getQueue(request));

          if (!queue) {
            throw new QueueNotFoundError(name, {
              cause: new Error('No queue returned from Google Cloud Tasks API')
            });
          }

          const duration = Date.now() - startTime;
          this.logger.debug(`Queue retrieved: ${name}`, {
            queueName: name,
            durationMs: duration
          });

          return this.mapQueueInfo(queue as Queue);
        } catch (error: unknown) {
          this.logger.error('Failed to get queue', { queueName: name, error });
          throw new QueueNotFoundError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * List all queues
   *
   * Lists all queues in the configured location with optional pagination support.
   *
   * @param options - Optional pagination parameters
   * @param options.pageSize - Maximum number of queues to return (default: all)
   * @param options.pageToken - Page token from previous listQueues call
   * @returns Promise resolving to list result with queues and pagination token
   * @throws {Error} If the API call fails
   *
   * @example
   * ```typescript
   * // List all queues
   * const { queues } = await provider.listQueues();
   *
   * // List with pagination
   * const { queues, nextPageToken } = await provider.listQueues({ pageSize: 50 });
   * if (nextPageToken) {
   *   const { queues: moreQueues } = await provider.listQueues({ pageToken: nextPageToken });
   * }
   * ```
   */
  async listQueues(options?: { pageSize?: number; pageToken?: string }): Promise<ListQueuesResult> {
    return withSpan(
      `${this.providerName}.listQueues`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'listQueues',
          'list.pageSize': options?.pageSize,
          'list.hasPageToken': !!options?.pageToken
        });

        try {
          const startTime = Date.now();
          const parent = getLocationPath(this.config);
          const request: ListQueuesRequest = {
            parent,
            ...(options?.pageSize !== undefined && { pageSize: options.pageSize }),
            ...(options?.pageToken !== undefined && { pageToken: options.pageToken })
          };

          const response = await this.client.listQueues(request);
          const listQueuesResponse = this.extractFirstElement<{
            queues?: Queue[];
            nextPageToken?: string;
          }>(response);

          if (!listQueuesResponse) {
            this.logger.warn('No response from Google Cloud Tasks API');
            return { queues: [] };
          }

          const queues = listQueuesResponse.queues ?? [];
          const nextPageToken = listQueuesResponse.nextPageToken;

          const duration = Date.now() - startTime;
          this.logger.debug('Queues listed', {
            count: queues.length,
            hasNextPage: !!nextPageToken,
            durationMs: duration
          });

          return {
            queues: queues.map((queue) => this.mapQueueInfo(queue as Queue)),
            ...(nextPageToken && { nextPageToken })
          };
        } catch (error: unknown) {
          this.logger.error('Failed to list queues', { error });
          throw error;
        }
      },
      {}
    );
  }

  /**
   * Create a task with HTTP target
   *
   * Creates a new HTTP task that will make a request to an external URL
   * when executed. Supports JSON payloads, custom headers, and scheduling.
   *
   * @param queueName - Name of the queue to add the task to
   * @param target - HTTP target configuration (URL, method, headers, body)
   * @param options - Optional task configuration (name, schedule time, priority)
   * @returns Promise resolving to the created task information
   * @throws {InvalidTaskConfigError} If URL or HTTP method is invalid
   * @throws {QueueNotFoundError} If the queue does not exist
   * @throws {RateLimitExceededError} If API rate limit is exceeded
   * @throws {TaskCreationFailedError} If task creation fails
   *
   * @example Creating an HTTP task with JSON payload
   * ```typescript
   * const task = await provider.createHttpTask('email-queue', {
   *   url: 'https://api.example.com/send-email',
   *   httpMethod: HttpMethod.POST,
   *   headers: {
   *     'Content-Type': 'application/json',
   *     'Authorization': 'Bearer token123',
   *   },
   *   body: JSON.stringify({ to: 'user@example.com', subject: 'Welcome!' }),
   * });
   * ```
   *
   * @example Creating a scheduled task with delay
   * ```typescript
   * const task = await provider.createHttpTask('notifications-queue', {
   *   url: 'https://api.example.com/notify',
   *   httpMethod: HttpMethod.POST,
   *   body: JSON.stringify({ userId: '123', message: 'Reminder' }),
   * }, {
   *   scheduleTime: new Date(Date.now() + 60000), // 1 minute delay
   *   priority: 3, // Higher priority (0-10, lower = higher)
   * });
   * ```
   *
   * @example Creating a task with OIDC authentication
   * ```typescript
   * const task = await provider.createHttpTask('secure-queue', {
   *   url: 'https://internal-api.example.com/process',
   *   httpMethod: HttpMethod.POST,
   *   oidcToken: {
   *     serviceAccountEmail: 'tasks@project.iam.gserviceaccount.com',
   *     audience: 'https://internal-api.example.com',
   *   },
   * });
   * ```
   */
  async createHttpTask(
    queueName: string,
    target: HttpTargetOptions,
    options?: TaskOptions
  ): Promise<TaskResult> {
    return withSpan(
      `${this.providerName}.createHttpTask`,
      // eslint-disable-next-line complexity
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'createHttpTask',
          'queue.name': queueName,
          'task.http_method': target.httpMethod ?? 'POST',
          'task.url': this.sanitizeUrl(target.url)
        });

        // Validate URL
        if (!target.url || !isValidUrl(target.url)) {
          throw new InvalidTaskConfigError('Invalid URL provided for HTTP task');
        }

        // Validate HTTP method
        const httpMethod = target.httpMethod ?? 'POST';
        if (!isValidHttpMethod(httpMethod)) {
          throw new InvalidTaskConfigError(
            `Invalid HTTP method: ${httpMethod}. Must be one of: ${Array.from(VALID_HTTP_METHODS).join(', ')}`
          );
        }

        // Validate headers size
        validateHeaders(target.headers);

        // Validate priority range
        validatePriority(options?.priority);

        // Validate task name format if provided
        if (options?.name) {
          const taskName = options.name.split('/').pop() ?? options.name;
          if (!isValidQueueName(taskName)) {
            throw new InvalidTaskConfigError(
              `Invalid task name: "${taskName}". Task names must start with a letter, contain only lowercase letters, numbers, hyphens, and underscores, and be max 64 characters.`
            );
          }
        }

        try {
          const startTime = Date.now();
          const queuePath = getQueuePath(this.config, queueName);

          const bodySize = target.body ? Buffer.byteLength(target.body) : 0;
          const headersCount = Object.keys(target.headers ?? {}).length;

          const httpRequest: HttpRequest = {
            url: target.url,
            httpMethod: toGoogleHttpMethod(httpMethod),
            ...(target.headers !== undefined && { headers: target.headers }),
            ...(target.body && { body: Buffer.from(target.body) }),
            ...(target.oidcToken && { oidcToken: target.oidcToken }),
            ...(target.oauthToken && { oauthToken: target.oauthToken })
          };

          const taskConfig = this.buildTaskConfig(options);
          const task: Task = {
            name: taskConfig.name ?? `tasks/${queueName}-${Date.now()}-${randomUUID()}`,
            httpRequest,
            ...(taskConfig.scheduleTime && { scheduleTime: taskConfig.scheduleTime }),
            ...(taskConfig.dispatchDeadline && { dispatchDeadline: taskConfig.dispatchDeadline }),
            ...(taskConfig.priority && { priority: taskConfig.priority })
          };

          const request: CreateTaskRequest = {
            parent: queuePath,
            task
          };

          // Google SDK returns a tuple: [task, request, rawResponse]
          const response = await this.client.createTask(request);
          const createdTask = this.extractFirstElement<Task>(response);

          if (!createdTask) {
            throw new TaskCreationFailedError(queueName, {
              cause: new Error('No task returned from Google Cloud Tasks API')
            });
          }

          const duration = Date.now() - startTime;
          this.logger.info(`HTTP task created in queue: ${queueName}`, {
            queueName,
            taskName: createdTask?.name,
            httpMethod,
            durationMs: duration,
            bodySize,
            headersCount,
            hasScheduleTime: !!taskConfig.scheduleTime,
            priority: taskConfig.priority
          });

          return this.mapTaskResult(createdTask as Task);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            this.logger.error('Queue not found when creating HTTP task', { queueName, error });
            throw new QueueNotFoundError(queueName, { cause: error });
          }
          if (this.isRateLimitError(error)) {
            this.logger.warn('Rate limit exceeded when creating HTTP task', { queueName, error });
            throw new RateLimitExceededError({ cause: error });
          }
          this.logger.error('Failed to create HTTP task', { queueName, error });
          throw new TaskCreationFailedError(queueName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Create a task with App Engine HTTP target
   *
   * Creates a new task that targets an App Engine service. Useful for
   * internal task processing within the same Google Cloud project.
   *
   * @param queueName - Name of the queue to add the task to
   * @param target - App Engine HTTP target configuration
   * @param options - Optional task configuration (name, schedule time, priority)
   * @returns Promise resolving to the created task information
   * @throws {InvalidTaskConfigError} If relativeUri or HTTP method is invalid
   * @throws {QueueNotFoundError} If the queue does not exist
   * @throws {RateLimitExceededError} If API rate limit is exceeded
   * @throws {TaskCreationFailedError} If task creation fails
   *
   * @example Creating an App Engine task
   * ```typescript
   * const task = await provider.createAppEngineTask('worker-queue', {
   *   relativeUri: '/api/tasks/process-job',
   *   httpMethod: HttpMethod.POST,
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ jobId: '12345', type: 'export' }),
   * });
   * ```
   *
   * @example Targeting a specific App Engine service and version
   * ```typescript
   * const task = await provider.createAppEngineTask('background-queue', {
   *   relativeUri: '/api/background/process',
   *   httpMethod: HttpMethod.POST,
   *   appEngineRouting: {
   *     service: 'worker',
   *     version: 'v2',
   *   },
   *   body: JSON.stringify({ action: 'generate-report' }),
   * });
   * ```
   *
   * @example Scheduling an App Engine task with delay
   * ```typescript
   * const task = await provider.createAppEngineTask('cron-queue', {
   *   relativeUri: '/api/cron/daily-cleanup',
   *   httpMethod: HttpMethod.POST,
   * }, {
   *   scheduleTime: new Date(Date.now() + 3600000), // 1 hour delay
   *   dispatchDeadline: 1800, // 30 minutes to complete
   * });
   * ```
   */
  async createAppEngineTask(
    queueName: string,
    target: AppEngineHttpTargetOptions,
    options?: TaskOptions
  ): Promise<TaskResult> {
    return withSpan(
      `${this.providerName}.createAppEngineTask`,
      // eslint-disable-next-line complexity
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'createAppEngineTask',
          'queue.name': queueName,
          'task.http_method': target.httpMethod ?? 'POST'
        });

        // Validate HTTP method
        const httpMethod = target.httpMethod ?? 'POST';
        if (!isValidHttpMethod(httpMethod)) {
          throw new InvalidTaskConfigError(
            `Invalid HTTP method: ${httpMethod}. Must be one of: ${Array.from(VALID_HTTP_METHODS).join(', ')}`
          );
        }

        // Validate relative URI
        if (!target.relativeUri) {
          throw new InvalidTaskConfigError('relativeUri is required for App Engine tasks');
        }

        // Validate headers size
        validateHeaders(target.headers);

        // Validate priority range
        validatePriority(options?.priority);

        // Validate task name format if provided
        if (options?.name) {
          const taskName = options.name.split('/').pop() ?? options.name;
          if (!isValidQueueName(taskName)) {
            throw new InvalidTaskConfigError(
              `Invalid task name: "${taskName}". Task names must start with a letter, contain only lowercase letters, numbers, hyphens, and underscores, and be max 64 characters.`
            );
          }
        }

        try {
          const startTime = Date.now();
          const queuePath = getQueuePath(this.config, queueName);

          const bodySize = target.body ? Buffer.byteLength(target.body) : 0;
          const headersCount = Object.keys(target.headers ?? {}).length;

          const appEngineHttpRequest: AppEngineHttpRequest = {
            ...(target.appEngineRouting && { appEngineRouting: target.appEngineRouting }),
            httpMethod: toGoogleHttpMethod(httpMethod),
            ...(target.headers !== undefined && { headers: target.headers }),
            ...(target.body && { body: Buffer.from(target.body) }),
            relativeUri: target.relativeUri
          };

          const taskConfig = this.buildTaskConfig(options);
          const task: Task = {
            name: taskConfig.name ?? `tasks/${queueName}-${Date.now()}-${randomUUID()}`,
            appEngineHttpRequest,
            ...(taskConfig.scheduleTime && { scheduleTime: taskConfig.scheduleTime }),
            ...(taskConfig.dispatchDeadline && { dispatchDeadline: taskConfig.dispatchDeadline }),
            ...(taskConfig.priority && { priority: taskConfig.priority })
          };

          const request: CreateTaskRequest = {
            parent: queuePath,
            task
          };

          // Google SDK returns a tuple: [task, request, rawResponse]
          const response = await this.client.createTask(request);
          const createdTask = this.extractFirstElement<Task>(response);

          if (!createdTask) {
            throw new TaskCreationFailedError(queueName, {
              cause: new Error('No task returned from Google Cloud Tasks API')
            });
          }

          const duration = Date.now() - startTime;
          this.logger.info(`App Engine task created in queue: ${queueName}`, {
            queueName,
            taskName: createdTask?.name,
            httpMethod,
            relativeUri: target.relativeUri,
            durationMs: duration,
            bodySize,
            headersCount,
            hasScheduleTime: !!taskConfig.scheduleTime,
            priority: taskConfig.priority
          });

          return this.mapTaskResult(createdTask as Task);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            this.logger.error('Queue not found when creating App Engine task', {
              queueName,
              error
            });
            throw new QueueNotFoundError(queueName, { cause: error });
          }
          if (this.isRateLimitError(error)) {
            this.logger.warn('Rate limit exceeded when creating App Engine task', {
              queueName,
              error
            });
            throw new RateLimitExceededError({ cause: error });
          }
          this.logger.error('Failed to create App Engine task', { queueName, error });
          throw new TaskCreationFailedError(queueName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Delete a task
   *
   * Deletes a task from a queue. The task must be specified by its full
   * resource name. This operation cannot be undone.
   *
   * @param taskName - Full task resource name
   * @returns Promise that resolves when the task is deleted
   * @throws {TaskNotFoundError} If the task does not exist
   *
   * @example Deleting a task by name
   * ```typescript
   * // Delete using the task name from createHttpTask result
   * const task = await provider.createHttpTask('my-queue', {
   *   url: 'https://api.example.com/process',
   * });
   * await provider.deleteTask(task.name);
   * ```
   *
   * @example Deleting a task with full resource path
   * ```typescript
   * await provider.deleteTask(
   *   'projects/my-project/locations/us-central1/queues/my-queue/tasks/task-123'
   * );
   * ```
   */
  async deleteTask(taskName: string): Promise<void> {
    return withSpan(
      `${this.providerName}.deleteTask`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'deleteTask',
          'task.name': taskName
        });

        try {
          const startTime = Date.now();
          const request: DeleteTaskRequest = {
            name: taskName
          };

          await this.client.deleteTask(request);

          const duration = Date.now() - startTime;
          this.logger.info(`Task deleted: ${taskName}`, {
            taskName,
            durationMs: duration
          });
        } catch (error: unknown) {
          this.logger.error('Failed to delete task', { taskName, error });
          throw new TaskNotFoundError(taskName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Get a task
   *
   * Retrieves information about a specific task by its full resource name.
   *
   * @param taskName - Full task resource name
   * @returns Promise resolving to the task information
   * @throws {TaskNotFoundError} If the task does not exist
   * @throws {TaskRetrievalFailedError} If the API call fails
   *
   * @example Retrieving a task
   * ```typescript
   * const task = await provider.createHttpTask('my-queue', {
   *   url: 'https://api.example.com/process',
   * });
   *
   * const taskInfo = await provider.getTask(task.name);
   * console.log('Task scheduled for:', taskInfo.scheduleTime);
   * console.log('Task priority:', taskInfo.priority);
   * ```
   *
   * @example Checking if a task exists
   * ```typescript
   * try {
   *   const task = await provider.getTask(taskName);
   *   console.log('Task exists:', task.name);
   * } catch (error) {
   *   if (error instanceof TaskNotFoundError) {
   *     console.log('Task has been executed or deleted');
   *   }
   * }
   * ```
   */
  async getTask(taskName: string): Promise<TaskResult> {
    return withSpan(
      `${this.providerName}.getTask`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'getTask',
          'task.name': taskName
        });

        try {
          const startTime = Date.now();
          const request: GetTaskRequest = {
            name: taskName
          };

          // Google SDK returns a tuple: [task, request, rawResponse]
          const response = await this.client.getTask(request);
          const task = this.extractFirstElement<Task>(response);

          if (!task) {
            throw new TaskNotFoundError(taskName, {
              cause: new Error('No task returned from Google Cloud Tasks API')
            });
          }

          const duration = Date.now() - startTime;
          this.logger.debug(`Task retrieved: ${taskName}`, {
            taskName,
            durationMs: duration
          });

          return this.mapTaskResult(task as Task);
        } catch (error: unknown) {
          // Check if it's a not found error from the Google SDK API
          // The Google SDK throws gRPC errors for not found tasks, not TaskNotFoundError
          if (this.isNotFoundError(error)) {
            this.logger.warn(`Task not found: ${taskName}`, { error });
            throw new TaskNotFoundError(taskName, { cause: error });
          }

          // For other errors, throw a task retrieval error
          this.logger.error('Failed to get task', { taskName, error });
          throw new TaskRetrievalFailedError(taskName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Health check
   *
   * Checks if the Cloud Tasks provider is operational by attempting to list queues.
   *
   * @returns Promise resolving to true if healthy, false otherwise
   *
   * @example
   * ```typescript
   * const isHealthy = await provider.healthCheck();
   * if (!isHealthy) {
   *   console.error('Cloud Tasks provider is not healthy');
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    return withSpan(
      `${this.providerName}.healthCheck`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'healthCheck'
        });

        try {
          await this.listQueues();
          return true;
        } catch (error: unknown) {
          this.logger.error('Health check failed', { error });
          return false;
        }
      },
      {}
    );
  }

  /**
   * Build queue configuration from options
   */
  private buildQueueConfig(options?: QueueOptions): Partial<Queue> {
    if (!options) {
      return {};
    }

    const config: Partial<Queue> = {};

    if (options.rateLimits) {
      const rateLimitsConfig: GoogleRateLimits = {};
      if (options.rateLimits.maxRequestsPerSecond !== undefined) {
        rateLimitsConfig.maxRequestsPerSecond = options.rateLimits.maxRequestsPerSecond;
      }
      if (options.rateLimits.maxConcurrentDispatches !== undefined) {
        rateLimitsConfig.maxConcurrentDispatches = options.rateLimits.maxConcurrentDispatches;
      }
      if (options.rateLimits.maxBatchesPerSecond !== undefined) {
        rateLimitsConfig.maxBatchesPerSecond = options.rateLimits.maxBatchesPerSecond;
      }
      config.rateLimits = rateLimitsConfig;
    }

    if (options.retryConfig) {
      const retryConfig: GoogleRetryConfig = {};
      if (options.retryConfig.maxAttempts !== undefined) {
        retryConfig.maxAttempts = options.retryConfig.maxAttempts;
      }
      if (options.retryConfig.minBackoffInSeconds !== undefined) {
        retryConfig.minBackoff = { seconds: options.retryConfig.minBackoffInSeconds };
      }
      if (options.retryConfig.maxBackoffInSeconds !== undefined) {
        retryConfig.maxBackoff = { seconds: options.retryConfig.maxBackoffInSeconds };
      }
      if (options.retryConfig.maxRetryDurationInSeconds !== undefined) {
        retryConfig.maxRetryDuration = { seconds: options.retryConfig.maxRetryDurationInSeconds };
      }
      config.retryConfig = retryConfig;
    }

    if (options.state) {
      config.state = toGoogleQueueState(options.state);
    }

    return config;
  }

  /**
   * Build task configuration from options
   * Only returns a config object if at least one option is set
   */
  private buildTaskConfig(options?: TaskOptions): Partial<Task> {
    if (!options) {
      return {};
    }

    const config: Partial<Task> = {};
    let hasProperties = false;

    if (options.name) {
      config.name = options.name;
      hasProperties = true;
    }

    if (options.scheduleTime) {
      config.scheduleTime = {
        seconds: Math.floor(options.scheduleTime.getTime() / 1000).toString(),
        nanos: (options.scheduleTime.getTime() % 1000) * 1000000
      };
      hasProperties = true;
    }

    if (options.dispatchDeadline) {
      config.dispatchDeadline = {
        seconds: options.dispatchDeadline.toString()
      };
      hasProperties = true;
    }

    if (options.priority !== undefined) {
      config.priority = options.priority.toString();
      hasProperties = true;
    }

    // Only return the config object if it has properties
    return hasProperties ? config : {};
  }

  /**
   * Parse Duration object to seconds
   * Handles both number and string types for seconds field
   */
  private parseSeconds(duration?: Duration): number | undefined {
    if (!duration) return undefined;
    if (typeof duration.seconds === 'number') {
      return duration.seconds;
    }
    if (typeof duration.seconds === 'string') {
      const parsed = Number.parseInt(duration.seconds, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  /**
   * Map Queue to QueueInfo
   */
  // eslint-disable-next-line complexity
  private mapQueueInfo(queue: Queue): QueueInfo {
    const rateLimits = queue.rateLimits;
    const retryConfig = queue.retryConfig;
    const state = queue.state;

    // Defensive null check for queue.name
    const queueName = queue.name?.split('/').pop() ?? queue.name ?? '';

    const result: QueueInfo = {
      name: queueName,
      state: state ?? 'UNKNOWN'
    };

    if (rateLimits) {
      const rateLimitsConfig: QueueInfo['rateLimits'] = {};
      if (rateLimits.maxRequestsPerSecond !== undefined) {
        rateLimitsConfig.maxRequestsPerSecond = rateLimits.maxRequestsPerSecond;
      }
      if (rateLimits.maxConcurrentDispatches !== undefined) {
        rateLimitsConfig.maxConcurrentDispatches = rateLimits.maxConcurrentDispatches;
      }
      if (rateLimits.maxBatchesPerSecond !== undefined) {
        rateLimitsConfig.maxBatchesPerSecond = rateLimits.maxBatchesPerSecond;
      }
      result.rateLimits = rateLimitsConfig;
    }

    if (retryConfig) {
      const retryConfigValue: QueueInfo['retryConfig'] = {};
      if (retryConfig.maxAttempts !== undefined) {
        retryConfigValue.maxAttempts = retryConfig.maxAttempts;
      }
      if (retryConfig.minBackoff) {
        const seconds = this.parseSeconds(retryConfig.minBackoff);
        if (seconds !== undefined) {
          retryConfigValue.minBackoffInSeconds = seconds;
        }
      }
      if (retryConfig.maxBackoff) {
        const seconds = this.parseSeconds(retryConfig.maxBackoff);
        if (seconds !== undefined) {
          retryConfigValue.maxBackoffInSeconds = seconds;
        }
      }
      if (retryConfig.maxRetryDuration) {
        const seconds = this.parseSeconds(retryConfig.maxRetryDuration);
        if (seconds !== undefined) {
          retryConfigValue.maxRetryDurationInSeconds = seconds;
        }
      }
      result.retryConfig = retryConfigValue;
    }

    return result;
  }

  /**
   * Map Google Task to TaskResult
   */
  private mapTaskResult(task: Task): TaskResult {
    const scheduleTime = task.scheduleTime;
    const dispatchDeadline = task.dispatchDeadline;
    const priority = task.priority;

    let parsedPriority: number | undefined;
    if (priority) {
      const parsed = Number.parseInt(priority as string, 10);
      // Validate that the priority is a valid number (not NaN)
      if (!Number.isNaN(parsed)) {
        parsedPriority = parsed;
      }
    }

    const result: TaskResult = {
      name: task.name ?? ''
    };

    if (parsedPriority !== undefined) {
      result.priority = parsedPriority;
    }

    if (scheduleTime?.seconds) {
      result.scheduleTime = new Date((this.parseSeconds(scheduleTime) ?? 0) * 1000);
    }

    if (dispatchDeadline) {
      const seconds = this.parseSeconds(dispatchDeadline);
      if (seconds !== undefined) {
        result.dispatchDeadline = seconds;
      }
    }

    return result;
  }

  /**
   * Sanitize URL for logging
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return '****';
    }
  }

  /**
   * Extract first element from response (handles both array and single object responses)
   */
  private extractFirstElement<T>(response: unknown): T | null {
    if (Array.isArray(response) && response.length > 0) {
      return response[0] as T;
    }
    if (response && typeof response === 'object') {
      return response as T;
    }
    return null;
  }

  /**
   * Check if error is "already exists" error
   */
  private isAlreadyExistsError(error: unknown): boolean {
    if (error instanceof Error) {
      const err = error as { code?: number; message?: string };
      return (
        error.message.includes('AlreadyExists') || err.code === GRPC_STATUS_CODE.ALREADY_EXISTS
      );
    }
    return false;
  }

  /**
   * Check if error is "not found" error
   */
  private isNotFoundError(error: unknown): boolean {
    if (error instanceof Error) {
      const err = error as { code?: number; message?: string };
      return error.message.includes('NotFound') || err.code === GRPC_STATUS_CODE.NOT_FOUND;
    }
    return false;
  }

  /**
   * Check if error is "permission denied" error
   */
  private isPermissionDeniedError(error: unknown): boolean {
    if (error instanceof Error) {
      const err = error as { code?: number; message?: string };
      return (
        error.message.includes('PermissionDenied') ||
        err.code === GRPC_STATUS_CODE.PERMISSION_DENIED
      );
    }
    return false;
  }

  /**
   * Check if error is "rate limit" error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const err = error as { code?: number; message?: string };
      return (
        error.message.includes('ResourceExhausted') ||
        err.code === GRPC_STATUS_CODE.RESOURCE_EXHAUSTED
      );
    }
    return false;
  }

  /**
   * Cleanup resources (close Google Cloud Tasks client)
   *
   * Called automatically by NestJS when the module is destroyed.
   * Can also be called manually for explicit cleanup.
   */
  async dispose(): Promise<void> {
    try {
      await this.client.close();
      this.logger.info('CloudTasksProvider disposed');
    } catch (error) {
      this.logger.error('Error disposing CloudTasksProvider', { error });
    }
  }

  /**
   * NestJS lifecycle hook - called when module is destroyed
   *
   * Ensures proper cleanup of Cloud Tasks client on application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    await this.dispose();
  }
}

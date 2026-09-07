/**
 * Mock Cloud Tasks provider for testing
 *
 * In-memory implementation that mimics Cloud Tasks behavior without
 * making actual API calls. Useful for unit and integration tests.
 *
 * @example
 * ```typescript
 * const mockProvider = new MockCloudTasksProvider({
 *   projectId: 'test-project',
 *   location: 'us-central1',
 *   delayMs: 0, // No delay for faster tests
 * });
 *
 * await mockProvider.createQueue('test-queue');
 * await mockProvider.createHttpTask('test-queue', {
 *   url: 'https://example.com',
 *   httpMethod: HttpMethod.POST,
 * });
 * ```
 */

import {
  QueueNotFoundError,
  QueueAlreadyExistsError,
  TaskNotFoundError,
  InvalidTaskConfigError
} from '../errors';

import type {
  CloudTasksConfig,
  QueueOptions,
  TaskOptions,
  HttpTargetOptions,
  AppEngineHttpTargetOptions
} from '../config';
import type { QueueInfo } from './cloud-tasks.provider';
import type { TaskResult } from './google-tasks.types';

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
 * Validate priority range
 * - Must be between 0 and 10 for Google Cloud Tasks
 */
function validatePriority(priority?: number): void {
  if (priority !== undefined && (priority < 0 || priority > 10)) {
    throw new InvalidTaskConfigError(`Priority must be between 0 and 10, got ${priority}`);
  }
}

/**
 * Mock queue data structure
 *
 * Internal representation of a queue in the mock provider.
 */
interface MockQueue {
  name: string;
  state: string;
  rateLimits?: QueueInfo['rateLimits'];
  retryConfig?: QueueInfo['retryConfig'];
  tasks: MockTask[];
}

/**
 * Mock task data structure
 *
 * Internal representation of a task in the mock provider.
 */
interface MockTask {
  name: string;
  scheduleTime?: Date;
  dispatchDeadline?: number;
  priority?: number;
  httpTarget?: HttpTargetOptions;
  appEngineTarget?: AppEngineHttpTargetOptions;
}

/**
 * Mock Cloud Tasks provider options
 *
 * Configuration options specific to the mock provider.
 */
export interface MockCloudTasksProviderOptions {
  /**
   * Delay in milliseconds to simulate network latency
   * @default 10
   */
  delayMs?: number;
  /**
   * Whether to use random delay (0 to delayMs)
   * @default true
   */
  randomDelay?: boolean;
}

/**
 * Mock Cloud Tasks provider for testing
 *
 * Provides an in-memory implementation of Cloud Tasks for testing.
 * All operations are synchronous but return promises for API compatibility.
 */
export class MockCloudTasksProvider {
  private readonly _config: CloudTasksConfig;
  private readonly queues: Map<string, MockQueue>;
  private taskCounter = 0;
  private readonly delayMs: number;
  private readonly randomDelay: boolean;
  // O(1) task lookup by task name for performance
  private readonly taskMap: Map<string, { queueName: string; taskIndex: number }>;

  /**
   * Create a new MockCloudTasksProvider
   *
   * @param config - Cloud Tasks configuration
   * @param options - Mock-specific options (delay configuration)
   *
   * @example
   * ```typescript
   * // Default configuration (0-10ms random delay)
   * const mock = new MockCloudTasksProvider(config);
   *
   * // No delay for fast tests
   * const mock = new MockCloudTasksProvider(config, { delayMs: 0 });
   *
   * // Fixed delay for timing-sensitive tests
   * const mock = new MockCloudTasksProvider(config, {
   *   delayMs: 100,
   *   randomDelay: false,
   * });
   * ```
   */
  constructor(config: CloudTasksConfig, options?: MockCloudTasksProviderOptions) {
    // Store config for future use (e.g., getting project/location info)
    this._config = config;
    this.queues = new Map();
    this.delayMs = options?.delayMs ?? 10;
    this.randomDelay = options?.randomDelay ?? true;
    this.taskMap = new Map();
    // Mark config as intentionally used for future features
    void this._config;
  }

  /**
   * Create a new queue
   *
   * Creates a queue in the mock provider. If a queue with the same name
   * already exists, throws a QueueAlreadyExistsError.
   *
   * @param name - Queue name (must be valid Cloud Tasks queue name)
   * @param options - Optional queue configuration (rate limits, retry config, state)
   * @returns Promise resolving to the created queue information
   * @throws {QueueAlreadyExistsError} If a queue with the same name exists
   *
   * @example
   * ```typescript
   * const queue = await mockProvider.createQueue('my-queue', {
   *   state: QueueState.RUNNING,
   *   rateLimits: { maxRequestsPerSecond: 100 },
   * });
   * ```
   */
  async createQueue(name: string, options?: QueueOptions): Promise<QueueInfo> {
    await this.simulateDelay();

    // Validate queue name format
    if (!isValidQueueName(name)) {
      throw new InvalidTaskConfigError(
        `Invalid queue name: "${name}". Queue names must start with a letter, contain only lowercase letters, numbers, hyphens, and underscores, and be max 64 characters.`
      );
    }

    if (this.queues.has(name)) {
      throw new QueueAlreadyExistsError(name);
    }

    const queue: MockQueue = {
      name,
      state: options?.state ?? 'RUNNING',
      rateLimits: options?.rateLimits,
      retryConfig: options?.retryConfig,
      tasks: []
    };

    this.queues.set(name, queue);

    const result: QueueInfo = {
      name,
      state: queue.state
    };

    if (queue.rateLimits) {
      result.rateLimits = queue.rateLimits;
    }

    if (queue.retryConfig) {
      result.retryConfig = queue.retryConfig;
    }

    return result;
  }

  /**
   * Delete a queue
   *
   * Deletes a queue and all its tasks from the mock provider.
   *
   * @param name - Queue name to delete
   * @returns Promise that resolves when the queue is deleted
   * @throws {QueueNotFoundError} If the queue does not exist
   *
   * @example
   * ```typescript
   * await mockProvider.deleteQueue('my-queue');
   * ```
   */
  async deleteQueue(name: string): Promise<void> {
    await this.simulateDelay();

    if (!this.queues.has(name)) {
      throw new QueueNotFoundError(name);
    }

    this.queues.delete(name);

    // Remove all tasks for this queue from the task map
    for (const [taskName, mapping] of this.taskMap.entries()) {
      if (mapping.queueName === name) {
        this.taskMap.delete(taskName);
      }
    }
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
   * const queue = await mockProvider.getQueue('my-queue');
   * console.log(queue.state, queue.rateLimits);
   * ```
   */
  async getQueue(name: string): Promise<QueueInfo> {
    await this.simulateDelay();

    const queue = this.queues.get(name);
    if (!queue) {
      throw new QueueNotFoundError(name);
    }

    const result: QueueInfo = {
      name: queue.name,
      state: queue.state
    };

    if (queue.rateLimits) {
      result.rateLimits = queue.rateLimits;
    }

    if (queue.retryConfig) {
      result.retryConfig = queue.retryConfig;
    }

    return result;
  }

  /**
   * List all queues
   *
   * Returns queues in the mock provider with pagination support.
   *
   * @param options - Pagination options (pageSize, pageToken)
   * @returns Promise resolving to paginated queue list result
   *
   * @example
   * ```typescript
   * // Get all queues
   * const result = await mockProvider.listQueues();
   * console.log(`Found ${result.queues.length} queues`);
   *
   * // Get paginated queues
   * const page1 = await mockProvider.listQueues({ pageSize: 10 });
   * const page2 = await mockProvider.listQueues({ pageSize: 10, pageToken: page1.nextPageToken });
   * ```
   */
  async listQueues(options?: { pageSize?: number; pageToken?: string }): Promise<{
    queues: QueueInfo[];
    nextPageToken?: string;
  }> {
    await this.simulateDelay();

    const allQueues: QueueInfo[] = Array.from(this.queues.values()).map((queue) => {
      const result: QueueInfo = {
        name: queue.name,
        state: queue.state
      };

      if (queue.rateLimits) {
        result.rateLimits = queue.rateLimits;
      }

      if (queue.retryConfig) {
        result.retryConfig = queue.retryConfig;
      }

      return result;
    });

    // Apply pagination
    const pageSize = options?.pageSize;
    const pageToken = options?.pageToken;

    let startIndex = 0;
    if (pageToken) {
      // Validate pageToken format (should be a numeric string)
      if (!/^\d+$/.test(pageToken)) {
        throw new InvalidTaskConfigError(
          `Invalid pageToken: "${pageToken}". PageToken must be a numeric string representing the starting index.`
        );
      }

      startIndex = Number.parseInt(pageToken, 10);
      if (Number.isNaN(startIndex) || startIndex < 0 || startIndex >= allQueues.length) {
        throw new InvalidTaskConfigError(
          `Invalid pageToken: "${pageToken}". Start index ${startIndex} is out of bounds (0-${allQueues.length - 1}).`
        );
      }
    }

    const endIndex = pageSize ? startIndex + pageSize : allQueues.length;
    const paginatedQueues = allQueues.slice(startIndex, endIndex);

    const result: {
      queues: QueueInfo[];
      nextPageToken?: string;
    } = {
      queues: paginatedQueues
    };

    if (endIndex < allQueues.length) {
      result.nextPageToken = endIndex.toString();
    }

    return result;
  }

  /**
   * Create a task with HTTP target
   *
   * Creates a new HTTP task in the specified queue.
   *
   * @param queueName - Name of the queue to add the task to
   * @param target - HTTP target configuration (URL, method, headers, body)
   * @param options - Optional task configuration (name, schedule time, priority)
   * @returns Promise resolving to the created task information
   * @throws {QueueNotFoundError} If the queue does not exist
   *
   * @example
   * ```typescript
   * const task = await mockProvider.createHttpTask('my-queue', {
   *   url: 'https://api.example.com/process',
   *   httpMethod: HttpMethod.POST,
   *   body: JSON.stringify({ data: 'value' }),
   * }, {
   *   priority: 5,
   * });
   * ```
   */
  // eslint-disable-next-line complexity
  async createHttpTask(
    queueName: string,
    target: HttpTargetOptions,
    options?: TaskOptions
  ): Promise<TaskResult> {
    await this.simulateDelay();

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new QueueNotFoundError(queueName);
    }

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

    this.taskCounter += 1;
    const taskName = options?.name ?? `tasks/${queueName}-${this.taskCounter}`;

    const task: MockTask = {
      name: taskName,
      ...(options?.scheduleTime && { scheduleTime: options.scheduleTime }),
      ...(options?.dispatchDeadline && { dispatchDeadline: options.dispatchDeadline }),
      ...(options?.priority && { priority: options.priority }),
      httpTarget: target
    };

    const taskIndex = queue.tasks.length;
    queue.tasks.push(task);

    // Update task map for O(1) lookup
    this.taskMap.set(taskName, { queueName, taskIndex });

    const result: TaskResult = {
      name: taskName
    };

    if (task.scheduleTime) {
      result.scheduleTime = task.scheduleTime;
    }

    if (task.dispatchDeadline) {
      result.dispatchDeadline = task.dispatchDeadline;
    }

    if (task.priority) {
      result.priority = task.priority;
    }

    return result;
  }

  /**
   * Create a task with App Engine HTTP target
   *
   * Creates a new App Engine HTTP task in the specified queue.
   *
   * @param queueName - Name of the queue to add the task to
   * @param target - App Engine HTTP target configuration
   * @param options - Optional task configuration (name, schedule time, priority)
   * @returns Promise resolving to the created task information
   * @throws {QueueNotFoundError} If the queue does not exist
   *
   * @example
   * ```typescript
   * const task = await mockProvider.createAppEngineTask('my-queue', {
   *   relativeUri: '/api/tasks/process',
   *   httpMethod: HttpMethod.POST,
   *   appEngineRouting: { service: 'worker' },
   * });
   * ```
   */
  async createAppEngineTask(
    queueName: string,
    target: AppEngineHttpTargetOptions,
    options?: TaskOptions
  ): Promise<TaskResult> {
    await this.simulateDelay();

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new QueueNotFoundError(queueName);
    }

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

    this.taskCounter += 1;
    const taskName = options?.name ?? `tasks/${queueName}-${this.taskCounter}`;

    const task: MockTask = {
      name: taskName,
      ...(options?.scheduleTime && { scheduleTime: options.scheduleTime }),
      ...(options?.dispatchDeadline && { dispatchDeadline: options.dispatchDeadline }),
      ...(options?.priority && { priority: options.priority }),
      appEngineTarget: target
    };

    const taskIndex = queue.tasks.length;
    queue.tasks.push(task);

    // Update task map for O(1) lookup
    this.taskMap.set(taskName, { queueName, taskIndex });

    const result: TaskResult = {
      name: taskName
    };

    if (task.scheduleTime) {
      result.scheduleTime = task.scheduleTime;
    }

    if (task.dispatchDeadline) {
      result.dispatchDeadline = task.dispatchDeadline;
    }

    if (task.priority) {
      result.priority = task.priority;
    }

    return result;
  }

  /**
   * Delete a task
   *
   * Deletes a task from any queue using O(1) lookup via task map.
   *
   * @param taskName - Full task name to delete
   * @returns Promise that resolves when the task is deleted
   * @throws {TaskNotFoundError} If the task does not exist
   *
   * @example
   * ```typescript
   * await mockProvider.deleteTask('projects/my-project/locations/us-central1/queues/my-queue/tasks/my-task');
   * ```
   */
  async deleteTask(taskName: string): Promise<void> {
    await this.simulateDelay();

    // O(1) lookup via task map
    const mapping = this.taskMap.get(taskName);
    if (!mapping) {
      throw new TaskNotFoundError(taskName);
    }

    const queue = this.queues.get(mapping.queueName);
    if (!queue) {
      // Queue was deleted but task map wasn't updated (shouldn't happen)
      this.taskMap.delete(taskName);
      throw new TaskNotFoundError(taskName);
    }

    // Verify the task is still at the expected index
    if (
      mapping.taskIndex >= queue.tasks.length ||
      queue.tasks[mapping.taskIndex]?.name !== taskName
    ) {
      // Task index is stale, fall back to linear search for this queue only
      const actualIndex = queue.tasks.findIndex((t) => t.name === taskName);
      if (actualIndex === -1) {
        this.taskMap.delete(taskName);
        throw new TaskNotFoundError(taskName);
      }
      queue.tasks.splice(actualIndex, 1);
    } else {
      // Task is at expected index, delete directly
      queue.tasks.splice(mapping.taskIndex, 1);
    }

    // Remove from task map
    this.taskMap.delete(taskName);

    // Rebuild task map for this queue to fix indices
    this.rebuildTaskMapForQueue(mapping.queueName);
  }

  /**
   * Rebuild task map for a specific queue after task deletion
   * This ensures indices stay accurate after splice operations
   */
  private rebuildTaskMapForQueue(queueName: string): void {
    const queue = this.queues.get(queueName);
    if (!queue) return;

    // Remove all mappings for this queue
    for (const [taskName, mapping] of this.taskMap.entries()) {
      if (mapping.queueName === queueName) {
        this.taskMap.delete(taskName);
      }
    }

    // Re-add all tasks with correct indices
    queue.tasks.forEach((task, index) => {
      this.taskMap.set(task.name, { queueName, taskIndex: index });
    });
  }

  /**
   * Get a task
   *
   * Retrieves information about a specific task.
   *
   * @param taskName - Full task name to retrieve
   * @returns Promise resolving to the task information
   * @throws {TaskNotFoundError} If the task does not exist
   *
   * @example
   * ```typescript
   * const task = await mockProvider.getTask('projects/my-project/locations/us-central1/queues/my-queue/tasks/my-task');
   * console.log(task.name, task.scheduleTime);
   * ```
   */
  async getTask(taskName: string): Promise<TaskResult> {
    await this.simulateDelay();

    for (const queue of this.queues.values()) {
      const task = queue.tasks.find((t) => t.name === taskName);
      if (task) {
        const result: TaskResult = {
          name: task.name
        };

        if (task.scheduleTime) {
          result.scheduleTime = task.scheduleTime;
        }

        if (task.dispatchDeadline) {
          result.dispatchDeadline = task.dispatchDeadline;
        }

        if (task.priority) {
          result.priority = task.priority;
        }

        return result;
      }
    }

    throw new TaskNotFoundError(taskName);
  }

  /**
   * Health check
   *
   * Checks if the mock provider is operational.
   * Always returns true for the mock provider.
   *
   * @returns Promise resolving to true (always healthy)
   *
   * @example
   * ```typescript
   * const isHealthy = await mockProvider.healthCheck();
   * console.log('Mock provider is healthy:', isHealthy);
   * ```
   */
  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    return true;
  }

  /**
   * Get the number of queues
   *
   * Returns the total number of queues in the mock provider.
   * Useful for test assertions.
   *
   * @returns Number of queues
   *
   * @example
   * ```typescript
   * await mockProvider.createQueue('queue1');
   * await mockProvider.createQueue('queue2');
   * console.log(mockProvider.getQueueCount()); // 2
   * ```
   */
  getQueueCount(): number {
    return this.queues.size;
  }

  /**
   * Get the number of tasks in a queue
   *
   * Returns the number of tasks in the specified queue.
   * Useful for test assertions.
   *
   * @param queueName - Name of the queue
   * @returns Number of tasks in the queue (0 if queue doesn't exist)
   *
   * @example
   * ```typescript
   * await mockProvider.createHttpTask('my-queue', { url: 'https://example.com' });
   * console.log(mockProvider.getTaskCount('my-queue')); // 1
   * ```
   */
  getTaskCount(queueName: string): number {
    const queue = this.queues.get(queueName);
    return queue?.tasks.length ?? 0;
  }

  /**
   * Clear all queues and tasks
   *
   * Removes all queues and tasks from the mock provider.
   * Useful for test cleanup.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   mockProvider.clear();
   * });
   * ```
   */
  clear(): void {
    this.queues.clear();
    this.taskMap.clear();
    this.taskCounter = 0;
  }

  /**
   * Simulate network delay
   *
   * Simulates network latency based on the configured delay settings.
   * Respects both delayMs and randomDelay options from the constructor.
   *
   * @private
   */
  private async simulateDelay(): Promise<void> {
    if (this.delayMs === 0) return;
    const delay = this.randomDelay ? Math.random() * this.delayMs : this.delayMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

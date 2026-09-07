/**
 * Cloud Tasks adapter for unified queue provider interface
 *
 * Adapts the Cloud Tasks provider to work with the IQueueProvider interface
 */

// Intentional: @package/tasks is lazy-loaded in provider-factory and this adapter needs
// concrete provider classes for runtime integration. Keep this scoped suppression.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { CloudTasksProvider, MockCloudTasksProvider } from '@package/tasks';

import type {
  IQueueProvider,
  QueueMessageData,
  QueueMessageOptions,
  QueueCreationOptions,
  QueueInfo,
  QueueSubscriptionOptions,
  QueueMessageHandler
} from './queue-provider.interface';
import type { HttpTargetOptions } from '@package/tasks';

// Re-define enums locally to avoid Nx module boundary issues with lazy-loaded packages
const enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS'
}

const QueueState = {
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED'
} as const;

/**
 * Cloud Tasks adapter configuration
 */
export interface CloudTasksAdapterConfig {
  /** Base URL for HTTP targets */
  httpBaseUrl: string;
  /** API key for authentication (optional) */
  apiKey?: string;
  /** Default HTTP method */
  httpMethod?: HttpMethod;
}

/**
 * Cloud Tasks adapter
 *
 * Adapts Cloud Tasks to work as a queue provider
 * Note: Cloud Tasks is primarily a task queue (push-based), not a message queue
 * This adapter creates HTTP targets for processing tasks
 */
export class CloudTasksAdapter implements IQueueProvider {
  readonly name = 'CloudTasksAdapter';
  private readonly provider: CloudTasksProvider | MockCloudTasksProvider;
  private readonly config: CloudTasksAdapterConfig;
  private readonly handlers = new Map<string, QueueMessageHandler>();
  private readonly subscriptions = new Map<string, boolean>();

  constructor(
    provider: CloudTasksProvider | MockCloudTasksProvider,
    config: CloudTasksAdapterConfig
  ) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Publish a message as an HTTP task
   */
  async publish(
    queueName: string,
    data: QueueMessageData,
    options?: QueueMessageOptions
  ): Promise<string> {
    const httpTarget = this.buildHttpTarget(queueName, data, options);
    const taskOptions: { priority?: number; scheduleTime?: Date; dispatchDeadline?: number } = {};

    if (options?.priority !== undefined) {
      taskOptions.priority = options.priority;
    }
    if (options?.scheduleTime !== undefined) {
      taskOptions.scheduleTime = options.scheduleTime;
    }
    if (options?.timeout !== undefined) {
      taskOptions.dispatchDeadline = options.timeout;
    }

    const task = await this.provider.createHttpTask(queueName, httpTarget, taskOptions);

    return task.name;
  }

  /**
   * Publish multiple messages as HTTP tasks
   */
  async publishBatch(
    queueName: string,
    messages: Array<{ data: QueueMessageData; options?: QueueMessageOptions }>
  ): Promise<string[]> {
    const results: string[] = [];

    for (const { data, options } of messages) {
      const taskId = await this.publish(queueName, data, options);
      results.push(taskId);
    }

    return results;
  }

  /**
   * Subscribe to a queue
   *
   * Note: Cloud Tasks doesn't support pull subscriptions.
   * This method stores the handler for reference, but actual processing
   * happens via HTTP endpoints that tasks call.
   *
   * To implement this properly, you would need to:
   * 1. Create an HTTP endpoint at the configured URL
   * 2. Have that endpoint call the registered handler
   * 3. Return the task result
   *
   * This implementation stores the handler for later retrieval via getHandler().
   * The actual message delivery happens through HTTP callbacks.
   */
  async subscribe(
    queueName: string,
    handler: QueueMessageHandler,
    _options?: QueueSubscriptionOptions
  ): Promise<void> {
    // Store the handler for reference
    this.handlers.set(queueName, handler);
    this.subscriptions.set(queueName, true);

    // Note: In production, you would need to set up an HTTP endpoint
    // that receives the task and calls the handler
    // This method succeeds because the handler is stored for later use
  }

  /**
   * Unsubscribe from a queue
   */
  async unsubscribe(queueName: string): Promise<void> {
    this.handlers.delete(queueName);
    this.subscriptions.delete(queueName);
  }

  /**
   * Create a queue
   */
  async createQueue(name: string, options?: QueueCreationOptions): Promise<void> {
    const providerOptions: Record<string, unknown> = {};

    if (options?.rateLimits !== undefined) {
      providerOptions['rateLimits'] = options.rateLimits;
    }
    if (options?.retryConfig !== undefined) {
      providerOptions['retryConfig'] = options.retryConfig;
    }

    providerOptions['state'] = QueueState.RUNNING;

    await this.provider.createQueue(name, providerOptions);
  }

  /**
   * Delete a queue
   */
  async deleteQueue(name: string): Promise<void> {
    await this.provider.deleteQueue(name);
  }

  /**
   * Get queue information
   */
  async getQueue(name: string): Promise<QueueInfo> {
    const queue = await this.provider.getQueue(name);

    return {
      name: queue.name,
      state: queue.state,
      // Cloud Tasks doesn't provide message counts in the queue info
      waitingMessages: 0,
      activeMessages: 0,
      completedMessages: 0,
      failedMessages: 0
    };
  }

  /**
   * List all queues
   */
  async listQueues(): Promise<QueueInfo[]> {
    const result = await this.provider.listQueues();

    return result.queues.map((q) => ({
      name: q.name,
      state: q.state,
      waitingMessages: 0,
      activeMessages: 0,
      completedMessages: 0,
      failedMessages: 0
    }));
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  /**
   * Get the registered handler for a queue
   *
   * This is used by HTTP endpoints to process tasks
   *
   * @param queueName - Queue name
   * @returns Message handler or undefined
   */
  getHandler(queueName: string): QueueMessageHandler | undefined {
    return this.handlers.get(queueName);
  }

  /**
   * Check if subscribed to a queue
   */
  isSubscribed(queueName: string): boolean {
    return this.subscriptions.get(queueName) ?? false;
  }

  /**
   * Build HTTP target from message data and options
   */
  private buildHttpTarget(
    queueName: string,
    data: QueueMessageData,
    options?: QueueMessageOptions
  ): HttpTargetOptions {
    const url = `${this.config.httpBaseUrl}/${queueName}`;
    const body = this.serializeData(data);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }

    if (options?.attributes) {
      Object.assign(headers, options.attributes);
    }

    const result: HttpTargetOptions = {
      url,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body)
    };

    if (this.config.httpMethod !== undefined) {
      // Cast to unknown first to bypass type checking for httpMethod property
      (result as unknown as { httpMethod: string }).httpMethod = this.config.httpMethod;
    }

    return result;
  }

  /**
   * Serialize message data
   */
  private serializeData(data: QueueMessageData): string | Record<string, unknown> {
    if (typeof data === 'string') {
      return data;
    }

    if (Buffer.isBuffer(data)) {
      return data.toString('utf-8');
    }

    return data;
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    this.handlers.clear();
    this.subscriptions.clear();
  }
}

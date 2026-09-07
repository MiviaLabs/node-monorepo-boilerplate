/**
 * Queue destination adapter for event routing
 *
 * Publishes events to job queues using tasks or queues.
 *
 * eslint-disable @typescript-eslint/no-unsafe-assignment
 * eslint-disable @typescript-eslint/no-unsafe-member-access
 * eslint-disable @typescript-eslint/no-unsafe-call
 */

import type { EventMessage } from '../../event-bus';
import { logger } from '../../logging/logger';
import { DestinationType } from '../interfaces';

import { BaseDestinationAdapter, type BaseDestinationOptions } from './base-destination';

/**
 * Queue destination types
 */
const enum QueueProviderType {
  Tasks = 'tasks',
  Queues = 'queues'
}

/**
 * Queue-specific destination options
 */
export interface QueueDestinationOptions extends BaseDestinationOptions {
  /** Queue provider type (tasks or queues) */
  provider?: QueueProviderType;
  /** Default queue name */
  defaultQueueName?: string;
  /** HTTP URL for task queues (required for tasks) */
  httpUrl?: string;
  /** Delay before task execution in seconds (default: 0) */
  dispatchDelaySeconds?: number;
}

/**
 * Queue destination adapter
 *
 * Publishes events to job queues for asynchronous processing.
 * Supports both tasks (Google Cloud Tasks) and queues.
 */
export class QueueDestinationAdapter extends BaseDestinationAdapter {
  private readonly provider: QueueProviderType;
  private readonly defaultQueueName: string;
  private readonly httpUrl?: string | undefined;
  private readonly dispatchDelaySeconds: number;
  // @ts-expect-error - Property used for debugging, not currently used
  private _queueProvider: unknown = null;

  constructor(options: QueueDestinationOptions = {}) {
    super(DestinationType.QUEUE, options);
    this.provider = options.provider ?? QueueProviderType.Tasks;
    this.defaultQueueName = options.defaultQueueName ?? 'event-tasks';
    this.httpUrl = options.httpUrl;
    this.dispatchDelaySeconds = options.dispatchDelaySeconds ?? 0;
  }

  /**
   * Initialize queue destination adapter
   *
   * Loads infrastructure package and verifies provider availability.
   */
  protected async doInitialize(): Promise<void> {
    try {
      if (this.provider === QueueProviderType.Tasks) {
        await this.initializeTasksProvider();
      } else if (this.provider === QueueProviderType.Queues) {
        await this.initializeQueuesProvider();
      } else {
        throw new Error(`Invalid queue provider: ${this.provider}`);
      }

      logger.info('Queue destination adapter initialized successfully', {
        provider: this.provider,
        defaultQueueName: this.defaultQueueName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize queue destination: ${errorMessage}`);
    }
  }

  /**
   * Initialize tasks provider
   */
  private async initializeTasksProvider(): Promise<void> {
    // Dynamically import tasks
    // webpack-ignore: External optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tasksPackage = require(/* webpackIgnore: true */ '@package/tasks');

    // Verify provider is available
    const { getCloudTasksProvider } = tasksPackage;
    const provider = getCloudTasksProvider();

    if (!provider) {
      throw new Error('Cloud Tasks provider not available');
    }

    this._queueProvider = provider;

    // Ensure the queue exists
    const { getQueueManager } = tasksPackage;
    const queueManager = getQueueManager();

    if (queueManager) {
      const queueExists = await queueManager.exists(this.defaultQueueName);
      if (!queueExists) {
        logger.info(`Queue destination: Creating queue '${this.defaultQueueName}'`);
        await queueManager.create(this.defaultQueueName, {
          location: 'us-central1',
          rateLimits: {
            maxDispatchesPerSecond: 10
          }
        });
      }
    }

    if (!this.httpUrl) {
      throw new Error('httpUrl is required for tasks provider');
    }
  }

  /**
   * Initialize queues provider
   */
  private async initializeQueuesProvider(): Promise<void> {
    // Dynamically import queues
    // webpack-ignore: External optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queuesPackage = require(/* webpackIgnore: true */ '@package/queues');

    // Verify provider is available
    const { getQueueProvider } = queuesPackage;
    const provider = getQueueProvider();

    if (!provider) {
      throw new Error('Queue provider not available');
    }

    this._queueProvider = provider;

    // Ensure the queue exists
    const { getQueueManager } = queuesPackage;
    const queueManager = getQueueManager();

    if (queueManager) {
      const queueExists = await queueManager.exists(this.defaultQueueName);
      if (!queueExists) {
        logger.info(`Queue destination: Creating queue '${this.defaultQueueName}'`);
        await queueManager.create(this.defaultQueueName);
      }
    }
  }

  /**
   * Publish event to queue
   *
   * @param event - Event message to publish
   * @param options - Publishing options
   */
  protected async doPublish(event: EventMessage, options: Record<string, unknown>): Promise<void> {
    if (this.provider === QueueProviderType.Tasks) {
      await this.publishToTasks(event, options);
    } else if (this.provider === QueueProviderType.Queues) {
      await this.publishToQueues(event, options);
    }
  }

  /**
   * Publish event to tasks
   */
  private async publishToTasks(
    event: EventMessage,
    options: Record<string, unknown>
  ): Promise<void> {
    try {
      // Dynamically import tasks
      // webpack-ignore: External optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHttpTask } = require(/* webpackIgnore: true */ '@package/tasks');

      const queueName = (options['queueName'] as string | undefined) ?? this.defaultQueueName;
      const url = (options['httpUrl'] as string | undefined) ?? this.httpUrl;

      if (!url) {
        throw new Error('httpUrl is required for tasks');
      }

      await createHttpTask({
        queueName,
        url,
        method: 'POST' as const,
        body: event,
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': event.eventType,
          'X-Event-ID': event.eventId
        },
        dispatchDelaySeconds:
          (options['dispatchDelaySeconds'] as number | undefined) ?? this.dispatchDelaySeconds
      });

      logger.info(
        `Queue destination (tasks): Published event ${event.eventType} to queue ${queueName}`,
        {
          eventId: event.eventId,
          queueName
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish to task queue: ${errorMessage}`);
    }
  }

  /**
   * Publish event to queues
   */
  private async publishToQueues(
    event: EventMessage,
    options: Record<string, unknown>
  ): Promise<void> {
    try {
      // Dynamically import queues
      // webpack-ignore: External optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { enqueue } = require(/* webpackIgnore: true */ '@package/queues');

      const queueName = (options['queueName'] as string | undefined) ?? this.defaultQueueName;

      await enqueue(queueName, event, {
        priority: options['priority'] as number | undefined,
        delay: options['delay'] as number | undefined
      });

      logger.info(
        `Queue destination (queues): Published event ${event.eventType} to queue ${queueName}`,
        {
          eventId: event.eventId,
          queueName
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish to queue: ${errorMessage}`);
    }
  }

  /**
   * Publish multiple events to queue
   *
   * @param events - Event messages to publish
   * @param options - Publishing options
   */
  protected async doPublishBatch(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void> {
    if (this.provider === QueueProviderType.Tasks) {
      await this.publishBatchToTasks(events, options);
    } else if (this.provider === QueueProviderType.Queues) {
      await this.publishBatchToQueues(events, options);
    }
  }

  /**
   * Publish batch to tasks
   */
  private async publishBatchToTasks(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void> {
    try {
      // Dynamically import tasks
      // webpack-ignore: External optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHttpTask } = require(/* webpackIgnore: true */ '@package/tasks');

      const queueName = (options['queueName'] as string | undefined) ?? this.defaultQueueName;
      const url = (options['httpUrl'] as string | undefined) ?? this.httpUrl;

      if (!url) {
        throw new Error('httpUrl is required for tasks');
      }

      // Create tasks for each event
      for (const event of events) {
        await createHttpTask({
          queueName,
          url,
          method: 'POST' as const,
          body: event,
          headers: {
            'Content-Type': 'application/json',
            'X-Event-Type': event.eventType,
            'X-Event-ID': event.eventId
          },
          dispatchDelaySeconds:
            (options['dispatchDelaySeconds'] as number | undefined) ?? this.dispatchDelaySeconds
        });
      }

      logger.info(`Queue destination (tasks): Published ${events.length} events in batch`, {
        queueName,
        count: events.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish batch to task queue: ${errorMessage}`);
    }
  }

  /**
   * Publish batch to queues
   */
  private async publishBatchToQueues(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void> {
    try {
      // Dynamically import queues
      // webpack-ignore: External optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { enqueueBatch } = require(/* webpackIgnore: true */ '@package/queues');

      const queueName = (options['queueName'] as string | undefined) ?? this.defaultQueueName;

      await enqueueBatch(queueName, events, {
        priority: options['priority'] as number | undefined,
        delay: options['delay'] as number | undefined
      });

      logger.info(`Queue destination (queues): Published ${events.length} events in batch`, {
        queueName,
        count: events.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish batch to queue: ${errorMessage}`);
    }
  }

  /**
   * Clean up resources
   */
  override async cleanup(): Promise<void> {
    this.isInitialized = false;
    this._queueProvider = null;
    logger.info('Queue destination adapter cleaned up');
  }
}

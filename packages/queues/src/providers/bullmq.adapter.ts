/**
 * BullMQ adapter for unified queue provider interface
 *
 * Adapts the existing BullMQ implementation to work with the IQueueProvider interface
 */

import { Queue, Worker, Job } from 'bullmq';

import { QueueNotFoundError, PublishFailedError } from '../errors';
import { createQueue as createBullMQQueue, closeAllQueues } from '../queue';

import type {
  IQueueProvider,
  QueueMessageData,
  QueueMessageOptions,
  QueueCreationOptions,
  QueueInfo,
  QueueSubscriptionOptions,
  ReceivedQueueMessage,
  QueueMessageHandler
} from './queue-provider.interface';

/**
 * BullMQ adapter configuration
 */
export interface BullMQAdapterConfig {
  /** Redis connection options */
  connection?: Queue['opts']['connection'];
  /** Default job options */
  defaultJobOptions?: Queue['opts']['defaultJobOptions'];
}

/**
 * BullMQ adapter
 *
 * Adapts BullMQ to work as a queue provider
 */
export class BullMQAdapter implements IQueueProvider {
  readonly name = 'BullMQAdapter';
  private readonly config: BullMQAdapterConfig;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly handlers = new Map<string, QueueMessageHandler>();

  constructor(config?: BullMQAdapterConfig) {
    this.config = config ?? {};
  }

  /**
   * Publish a message to a queue
   */
  async publish(
    queueName: string,
    data: QueueMessageData,
    options?: QueueMessageOptions
  ): Promise<string> {
    const queue = this.getOrCreateQueue(queueName);

    try {
      const job = await queue.add('job', data, {
        delay: options?.delay,
        attempts: options?.attempts,
        backoff: options?.backoff,
        priority: options?.priority
      });

      return job.id ?? '';
    } catch (error) {
      throw new PublishFailedError(queueName, { cause: error });
    }
  }

  /**
   * Publish multiple messages to a queue
   */
  async publishBatch(
    queueName: string,
    messages: Array<{ data: QueueMessageData; options?: QueueMessageOptions }>
  ): Promise<string[]> {
    const queue = this.getOrCreateQueue(queueName);

    try {
      const jobs = await queue.addBulk(
        messages.map((msg) => ({
          name: 'job',
          data: msg.data,
          opts: {
            delay: msg.options?.delay,
            attempts: msg.options?.attempts,
            backoff: msg.options?.backoff,
            priority: msg.options?.priority
          }
        }))
      );

      return jobs.map((job) => job.id ?? '');
    } catch (error) {
      throw new PublishFailedError(queueName, { cause: error });
    }
  }

  /**
   * Subscribe to a queue with a message handler
   */
  async subscribe(
    queueName: string,
    handler: QueueMessageHandler,
    options?: QueueSubscriptionOptions
  ): Promise<void> {
    // Check if worker already exists
    if (this.workers.has(queueName)) {
      return;
    }

    // Store the handler
    this.handlers.set(queueName, handler);

    // Create a worker for the queue
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        // Properly serialize the job data
        const data = Buffer.from(JSON.stringify(job.data));

        const receivedMessage: ReceivedQueueMessage = {
          id: job.id ?? '',
          data,
          attributes: {},
          attempts: job.attemptsMade,
          ack: async () => {
            // BullMQ automatically acknowledges jobs on successful completion
          },
          nack: async () => {
            // BullMQ automatically retries jobs on failure
            throw new Error('Message nacked');
          }
        };

        await handler(receivedMessage);
      },
      {
        connection: this.config.connection ?? {},
        concurrency: options?.flowControl?.maxMessages ?? 1
      }
    );

    this.workers.set(queueName, worker);
  }

  /**
   * Unsubscribe from a queue
   */
  async unsubscribe(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.close();
      this.workers.delete(queueName);
    }

    this.handlers.delete(queueName);
  }

  /**
   * Create a queue
   */
  async createQueue(name: string, options?: QueueCreationOptions): Promise<void> {
    this.getOrCreateQueue(name, {
      defaultJobOptions: {
        attempts: options?.retryConfig?.maxAttempts,
        backoff: options?.retryConfig
          ? {
              type: options?.retryConfig?.minBackoffInSeconds ? 'exponential' : 'fixed',
              delay: options?.retryConfig?.minBackoffInSeconds
                ? options.retryConfig.minBackoffInSeconds * 1000
                : 1000
            }
          : undefined
      }
    });
  }

  /**
   * Delete a queue
   */
  async deleteQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.close();
      this.queues.delete(name);
    }
  }

  /**
   * Get queue information
   */
  async getQueue(name: string): Promise<QueueInfo> {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new QueueNotFoundError(name);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount()
    ]);

    return {
      name,
      waitingMessages: waiting,
      activeMessages: active,
      completedMessages: completed,
      failedMessages: failed
    };
  }

  /**
   * List all queues
   */
  async listQueues(): Promise<QueueInfo[]> {
    const queueInfos: QueueInfo[] = [];

    for (const [name] of this.queues.entries()) {
      try {
        const info = await this.getQueue(name);
        queueInfos.push(info);
      } catch {
        // Skip queues that error
      }
    }

    return queueInfos;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can get info from at least one queue
      for (const queue of this.queues.values()) {
        await queue.getWaitingCount();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or create a queue
   */
  private getOrCreateQueue(
    name: string,
    options?: { defaultJobOptions?: Queue['opts']['defaultJobOptions'] }
  ): Queue {
    let queue = this.queues.get(name);

    if (!queue) {
      queue = createBullMQQueue({
        name,
        connection: this.config.connection,
        defaultJobOptions: {
          ...this.config.defaultJobOptions,
          ...options?.defaultJobOptions
        }
      });
      this.queues.set(name, queue);
    }

    return queue;
  }

  /**
   * Get the registered handler for a queue
   */
  getHandler(queueName: string): QueueMessageHandler | undefined {
    return this.handlers.get(queueName);
  }

  /**
   * Check if subscribed to a queue
   */
  isSubscribed(queueName: string): boolean {
    return this.workers.has(queueName);
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    // Close all workers
    const workerClosePromises = Array.from(this.workers.values()).map((worker) => worker.close());
    await Promise.all(workerClosePromises);
    this.workers.clear();

    // Close all queues
    await closeAllQueues();
    this.queues.clear();

    this.handlers.clear();
  }
}

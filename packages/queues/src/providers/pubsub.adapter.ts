/**
 * Pub/Sub adapter for unified queue provider interface
 *
 * Adapts the Pub/Sub provider to work with the IQueueProvider interface
 */

import { QueueNotFoundError } from '../errors';

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
import type { PubSubProvider, MockPubSubProvider } from '@package/pubsub';

/**
 * Pub/Sub adapter
 *
 * Adapts Pub/Sub to work as a queue provider
 * In Pub/Sub, queues are implemented as topics with subscriptions
 */
export class PubSubAdapter implements IQueueProvider {
  readonly name = 'PubSubAdapter';
  private readonly provider: PubSubProvider | MockPubSubProvider;
  private readonly subscriptionPrefix: string;
  private readonly handlers = new Map<string, QueueMessageHandler>();
  private readonly subscriptions = new Map<string, boolean>();

  constructor(
    provider: PubSubProvider | MockPubSubProvider,
    options?: { subscriptionPrefix?: string }
  ) {
    this.provider = provider;
    this.subscriptionPrefix = options?.subscriptionPrefix ?? 'queue-sub';
  }

  /**
   * Publish a message to a topic (queue)
   */
  async publish(
    queueName: string,
    data: QueueMessageData,
    options?: QueueMessageOptions
  ): Promise<string> {
    const publishOptions: { attributes?: Record<string, string>; orderingKey?: string } = {};

    if (options?.attributes !== undefined) {
      publishOptions.attributes = options.attributes;
    }
    if (options?.orderingKey !== undefined) {
      publishOptions.orderingKey = options.orderingKey;
    }

    const result = await this.provider.publish(queueName, data, publishOptions);

    return result.messageId;
  }

  /**
   * Publish multiple messages to a topic (queue)
   */
  async publishBatch(
    queueName: string,
    messages: Array<{ data: QueueMessageData; options?: QueueMessageOptions }>
  ): Promise<string[]> {
    const messagesToPublish = messages.map((msg) => {
      const publishOptions: { attributes?: Record<string, string>; orderingKey?: string } = {};

      if (msg.options?.attributes !== undefined) {
        publishOptions.attributes = msg.options.attributes;
      }
      if (msg.options?.orderingKey !== undefined) {
        publishOptions.orderingKey = msg.options.orderingKey;
      }

      return {
        data: msg.data,
        options: publishOptions
      };
    });

    const results = await this.provider.publishBatch(queueName, messagesToPublish);

    return results.map((r) => r.messageId);
  }

  /**
   * Subscribe to a topic (queue)
   *
   * Creates a subscription for the topic
   */
  async subscribe(
    queueName: string,
    handler: QueueMessageHandler,
    options?: QueueSubscriptionOptions
  ): Promise<void> {
    const subscriptionName = this.getSubscriptionName(queueName);

    // Check if subscription exists, create if not
    try {
      await this.provider.getSubscription(subscriptionName);
    } catch {
      // Subscription doesn't exist, create it
      const hasFlowControl =
        options?.flowControl?.maxMessages !== undefined && options.flowControl.maxMessages > 0;

      await this.provider.createSubscription(subscriptionName, queueName, {
        ackDeadlineSeconds: options?.handlerTimeout
          ? Math.floor(options.handlerTimeout / 1000)
          : 60,
        enableMessageOrdering: hasFlowControl
      });
    }

    // Store handler for reference
    this.handlers.set(queueName, handler);
    this.subscriptions.set(queueName, true);

    // Subscribe to the subscription
    const subscribeOptions: {
      flowControl?: { maxMessages?: number; maxBytes?: number };
      autoAck?: boolean;
    } = {};

    if (options?.flowControl !== undefined) {
      subscribeOptions.flowControl = options.flowControl;
    }
    if (options?.autoAck !== undefined) {
      subscribeOptions.autoAck = options.autoAck;
    }

    await this.provider.subscribe(
      subscriptionName,
      async (message) => {
        const receivedMessage: ReceivedQueueMessage = {
          id: message.messageId,
          data: message.data,
          ack: () => message.ack(),
          nack: () => message.nack()
        };

        if (message.deliveryAttempt !== undefined) {
          receivedMessage.attempts = message.deliveryAttempt;
        }
        if (message.attributes !== undefined) {
          receivedMessage.attributes = message.attributes;
        }

        await handler(receivedMessage);
      },
      subscribeOptions
    );
  }

  /**
   * Unsubscribe from a topic (queue)
   */
  async unsubscribe(queueName: string): Promise<void> {
    const subscriptionName = this.getSubscriptionName(queueName);

    await this.provider.unsubscribe(subscriptionName);

    this.handlers.delete(queueName);
    this.subscriptions.delete(queueName);
  }

  /**
   * Create a topic (queue)
   */
  async createQueue(name: string, options?: QueueCreationOptions): Promise<void> {
    const topicOptions: { description?: string } = {};

    if (options?.description !== undefined) {
      topicOptions.description = options.description;
    }

    await this.provider.createTopic(name, topicOptions);
  }

  /**
   * Delete a topic (queue)
   */
  async deleteQueue(name: string): Promise<void> {
    await this.provider.deleteTopic(name);

    // Also delete the subscription
    const subscriptionName = this.getSubscriptionName(name);
    try {
      await this.provider.deleteSubscription(subscriptionName);
    } catch {
      // Subscription might not exist, ignore error
    }
  }

  /**
   * Get topic (queue) information
   */
  async getQueue(name: string): Promise<QueueInfo> {
    try {
      const topic = await this.provider.getTopic(name);

      return {
        name: topic.name,
        // Pub/Sub doesn't provide message counts in topic info
        waitingMessages: 0,
        activeMessages: 0,
        completedMessages: 0,
        failedMessages: 0
      };
    } catch (error) {
      throw new QueueNotFoundError(name, { cause: error });
    }
  }

  /**
   * List all topics (queues)
   */
  async listQueues(): Promise<QueueInfo[]> {
    const topics = await this.provider.listTopics();

    return topics.map((t) => ({
      name: t.name,
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
   * Get subscription name for a queue
   */
  private getSubscriptionName(queueName: string): string {
    return `${this.subscriptionPrefix}-${queueName}`;
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    // Unsubscribe from all queues
    for (const queueName of this.subscriptions.keys()) {
      try {
        await this.unsubscribe(queueName);
      } catch {
        // Ignore errors during close
      }
    }

    this.handlers.clear();
    this.subscriptions.clear();
  }
}

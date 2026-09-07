/**
 * @fileoverview In-memory mock Pub/Sub provider for testing.
 *
 * This module provides a mock implementation of the Pub/Sub provider that
 * simulates Google Cloud Pub/Sub behavior without requiring GCP credentials
 * or network access. Use this for unit tests, integration tests, and local
 * development.
 *
 * @module @package/pubsub/providers/mock-provider
 *
 * @example Test setup
 * ```typescript
 * import { createMockPubSubProvider } from '@package/pubsub';
 *
 * describe('OrderService', () => {
 *   let provider: MockPubSubProvider;
 *   let service: OrderService;
 *
 *   beforeEach(async () => {
 *     provider = createMockPubSubProvider();
 *     await provider.createTopic('orders');
 *     await provider.createSubscription('processor', 'orders');
 *     service = new OrderService(provider);
 *   });
 *
 *   afterEach(() => {
 *     provider.clear();
 *   });
 *
 *   it('publishes order events', async () => {
 *     await service.createOrder({ item: 'widget' });
 *     expect(provider.getMessageCount('orders')).toBe(1);
 *   });
 * });
 * ```
 */

import {
  TopicNotFoundError,
  TopicAlreadyExistsError,
  SubscriptionNotFoundError,
  SubscriptionAlreadyExistsError,
  InvalidMessageDataError
} from '../errors';

import type {
  IPubSubConfig,
  ITopicOptions,
  ISubscriptionOptions,
  IPublishOptions,
  MessageData,
  IReceivedMessage
} from '../config';
import type { ITopicInfo, ISubscriptionInfo, IPublishResult } from './pubsub.provider';

/**
 * Internal structure for storing topic data.
 * @internal
 */
interface MockTopic {
  name: string;
  path: string;
  description?: string;
  labels?: Record<string, string>;
  messages: MockMessage[];
}

/**
 * Internal structure for storing subscription data.
 * @internal
 */
interface MockSubscription {
  name: string;
  path: string;
  topicName: string;
  ackDeadlineSeconds: number;
  messageRetentionSeconds: number;
  retainAckedMessages: boolean;
  enableMessageOrdering: boolean;
  pushEndpoint?: string;
  deadLetterPolicy?: {
    deadLetterTopic: string;
    maxDeliveryAttempts: number;
  };
  messages: MockSubscriptionMessage[];
  handlers: Array<(message: IReceivedMessage) => void | Promise<void>>;
  active: boolean;
}

/**
 * Internal structure for storing message data.
 * @internal
 */
interface MockMessage {
  messageId: string;
  data: Buffer;
  attributes?: Record<string, string>;
  orderingKey?: string;
  publishTime: Date;
}

/**
 * Internal structure for tracking message delivery in subscriptions.
 * @internal
 */
interface MockSubscriptionMessage {
  message: MockMessage;
  ackId: string;
  deliveryAttempt: number;
  acked: boolean;
}

/**
 * In-memory mock Pub/Sub provider for testing.
 *
 * Simulates Google Cloud Pub/Sub behavior without requiring GCP credentials.
 * Supports all operations of the real provider plus additional test utilities.
 *
 * **Key Features:**
 * - Full topic and subscription management
 * - Message publishing and delivery simulation
 * - Dead Letter Queue simulation
 * - Delivery attempt tracking
 * - Test helper methods for state inspection
 * - Memory leak prevention (max 1000 messages per topic)
 * - Configurable network delay simulation
 *
 * @example Basic usage
 * ```typescript
 * const provider = createMockPubSubProvider();
 *
 * // Set up infrastructure
 * await provider.createTopic('events');
 * await provider.createSubscription('worker', 'events');
 *
 * // Publish messages
 * await provider.publish('events', { type: 'test' });
 *
 * // Check state
 * expect(provider.getTopicCount()).toBe(1);
 * expect(provider.getMessageCount('events')).toBe(1);
 *
 * // Clean up
 * provider.clear();
 * ```
 *
 * @example Testing message handlers
 * ```typescript
 * const received: ReceivedMessage[] = [];
 *
 * await provider.subscribe('worker', async (message) => {
 *   received.push(message);
 *   await message.ack();
 * });
 *
 * await provider.publish('events', { test: 'data' });
 *
 * // Handler is called synchronously in mock
 * expect(received.length).toBe(1);
 * ```
 *
 * @example Testing Dead Letter Queue
 * ```typescript
 * await provider.createTopic('events-dlq');
 * await provider.createSubscription('worker', 'events', {
 *   deadLetterPolicy: { deadLetterTopic: 'events-dlq', maxDeliveryAttempts: 3 }
 * });
 *
 * // Handler that always fails
 * await provider.subscribe('worker', async (message) => {
 *   await message.nack(); // Will retry
 * });
 *
 * await provider.publish('events', { will: 'fail' });
 *
 * // After 3 nacks, message goes to DLQ
 * expect(provider.getMessageCount('events-dlq')).toBe(1);
 * ```
 */
export class MockPubSubProvider {
  private readonly config: IPubSubConfig;
  private readonly topics: Map<string, MockTopic> = new Map();
  private readonly subscriptions: Map<string, MockSubscription> = new Map();
  private messageIdCounter = 0;
  private ackIdCounter = 0;
  private readonly simulateDelayMs: number;
  private static readonly MAX_MESSAGES_PER_TOPIC = 1000;
  // private static readonly MAX_MESSAGES_PER_SUBSCRIPTION = 1000;
  private static readonly DEFAULT_SIMULATE_DELAY_MS = 1; // 1ms for predictable testing

  constructor(config: IPubSubConfig, simulateDelayMs?: number) {
    this.config = config;
    this.simulateDelayMs = simulateDelayMs ?? MockPubSubProvider.DEFAULT_SIMULATE_DELAY_MS;
  }

  /**
   * Creates a new topic in the mock store.
   *
   * @param name - Topic name
   * @param options - Optional topic configuration
   * @returns Topic information
   * @throws {@link TopicAlreadyExistsError} When topic already exists
   */
  async createTopic(name: string, options?: ITopicOptions): Promise<ITopicInfo> {
    await this.simulateDelay();

    if (this.topics.has(name)) {
      throw new TopicAlreadyExistsError(name);
    }

    const topic: MockTopic = {
      name,
      path: `projects/${this.config.projectId}/topics/${name}`,
      messages: []
    };

    if (options?.description !== undefined) {
      topic.description = options.description;
    }
    if (options?.labels !== undefined) {
      topic.labels = options.labels;
    }

    this.topics.set(name, topic);

    const result: ITopicInfo = {
      name,
      path: topic.path
    };

    if (topic.description !== undefined) {
      result.description = topic.description;
    }
    if (topic.labels !== undefined) {
      result.labels = topic.labels;
    }

    return result;
  }

  /**
   * Deletes a topic and its associated subscriptions.
   *
   * @param name - Topic name to delete
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   */
  async deleteTopic(name: string): Promise<void> {
    await this.simulateDelay();

    if (!this.topics.has(name)) {
      throw new TopicNotFoundError(name);
    }

    // Delete all subscriptions for this topic
    for (const [subName, sub] of this.subscriptions.entries()) {
      if (sub.topicName === name) {
        this.subscriptions.delete(subName);
      }
    }

    this.topics.delete(name);
  }

  /**
   * Retrieves topic information.
   *
   * @param name - Topic name to retrieve
   * @returns Topic information
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   */
  async getTopic(name: string): Promise<ITopicInfo> {
    await this.simulateDelay();

    const topic = this.topics.get(name);
    if (!topic) {
      throw new TopicNotFoundError(name);
    }

    const result: ITopicInfo = {
      name: topic.name,
      path: topic.path
    };

    if (topic.description !== undefined) {
      result.description = topic.description;
    }
    if (topic.labels !== undefined) {
      result.labels = topic.labels;
    }

    return result;
  }

  /**
   * Lists all topics in the mock store.
   *
   * @returns Array of topic information objects
   */
  async listTopics(): Promise<ITopicInfo[]> {
    await this.simulateDelay();

    const results: ITopicInfo[] = [];
    for (const topic of this.topics.values()) {
      const result: ITopicInfo = {
        name: topic.name,
        path: topic.path
      };

      if (topic.description !== undefined) {
        result.description = topic.description;
      }
      if (topic.labels !== undefined) {
        result.labels = topic.labels;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Creates a subscription to receive messages from a topic.
   *
   * @param name - Subscription name
   * @param topicName - Topic to receive messages from
   * @param options - Optional subscription configuration
   * @returns Subscription information
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   * @throws {@link SubscriptionAlreadyExistsError} When subscription exists
   */
  async createSubscription(
    name: string,
    topicName: string,
    options?: ISubscriptionOptions
  ): Promise<ISubscriptionInfo> {
    await this.simulateDelay();

    if (!this.topics.has(topicName)) {
      throw new TopicNotFoundError(topicName);
    }

    if (this.subscriptions.has(name)) {
      throw new SubscriptionAlreadyExistsError(name);
    }

    const subscription: MockSubscription = {
      name,
      path: `projects/${this.config.projectId}/subscriptions/${name}`,
      topicName,
      ackDeadlineSeconds: options?.ackDeadlineSeconds ?? 60,
      messageRetentionSeconds: options?.messageRetentionSeconds ?? 604800,
      retainAckedMessages: options?.retainAckedMessages ?? false,
      enableMessageOrdering: options?.enableMessageOrdering ?? false,
      messages: [],
      handlers: [],
      active: true
    };

    if (options?.pushConfig?.pushEndpoint !== undefined) {
      subscription.pushEndpoint = options.pushConfig.pushEndpoint;
    }
    if (options?.deadLetterPolicy !== undefined) {
      subscription.deadLetterPolicy = options.deadLetterPolicy;
    }

    this.subscriptions.set(name, subscription);

    const result: ISubscriptionInfo = {
      name,
      path: subscription.path,
      topicPath: `projects/${this.config.projectId}/topics/${topicName}`,
      ackDeadlineSeconds: subscription.ackDeadlineSeconds,
      messageRetentionSeconds: subscription.messageRetentionSeconds,
      retainAckedMessages: subscription.retainAckedMessages,
      enableMessageOrdering: subscription.enableMessageOrdering
    };

    if (subscription.pushEndpoint !== undefined) {
      result.pushEndpoint = subscription.pushEndpoint;
    }
    if (subscription.deadLetterPolicy !== undefined) {
      result.deadLetterPolicy = subscription.deadLetterPolicy;
    }

    return result;
  }

  /**
   * Deletes a subscription.
   *
   * @param name - Subscription name to delete
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   */
  async deleteSubscription(name: string): Promise<void> {
    await this.simulateDelay();

    if (!this.subscriptions.has(name)) {
      throw new SubscriptionNotFoundError(name);
    }

    this.subscriptions.delete(name);
  }

  /**
   * Retrieves subscription information.
   *
   * @param name - Subscription name to retrieve
   * @returns Subscription information
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   */
  async getSubscription(name: string): Promise<ISubscriptionInfo> {
    await this.simulateDelay();

    const subscription = this.subscriptions.get(name);
    if (!subscription) {
      throw new SubscriptionNotFoundError(name);
    }

    const result: ISubscriptionInfo = {
      name: subscription.name,
      path: subscription.path,
      topicPath: `projects/${this.config.projectId}/topics/${subscription.topicName}`,
      ackDeadlineSeconds: subscription.ackDeadlineSeconds,
      messageRetentionSeconds: subscription.messageRetentionSeconds,
      retainAckedMessages: subscription.retainAckedMessages,
      enableMessageOrdering: subscription.enableMessageOrdering
    };

    if (subscription.pushEndpoint !== undefined) {
      result.pushEndpoint = subscription.pushEndpoint;
    }
    if (subscription.deadLetterPolicy !== undefined) {
      result.deadLetterPolicy = subscription.deadLetterPolicy;
    }

    return result;
  }

  /**
   * Lists all subscriptions in the mock store.
   *
   * @returns Array of subscription information objects
   */
  async listSubscriptions(): Promise<ISubscriptionInfo[]> {
    await this.simulateDelay();

    const results: ISubscriptionInfo[] = [];
    for (const sub of this.subscriptions.values()) {
      const result: ISubscriptionInfo = {
        name: sub.name,
        path: sub.path,
        topicPath: `projects/${this.config.projectId}/topics/${sub.topicName}`,
        ackDeadlineSeconds: sub.ackDeadlineSeconds,
        messageRetentionSeconds: sub.messageRetentionSeconds,
        retainAckedMessages: sub.retainAckedMessages,
        enableMessageOrdering: sub.enableMessageOrdering
      };

      if (sub.pushEndpoint !== undefined) {
        result.pushEndpoint = sub.pushEndpoint;
      }
      if (sub.deadLetterPolicy !== undefined) {
        result.deadLetterPolicy = sub.deadLetterPolicy;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Publishes a message to a topic.
   *
   * Messages are immediately delivered to all active subscriptions.
   * Enforces a maximum of 1000 messages per topic to prevent memory leaks.
   *
   * @param topicName - Topic to publish to
   * @param data - Message payload
   * @param options - Optional publish configuration
   * @returns Publish result with message ID
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   */
  async publish(
    topicName: string,
    data: MessageData,
    options?: IPublishOptions
  ): Promise<IPublishResult> {
    await this.simulateDelay();

    const topic = this.topics.get(topicName);
    if (!topic) {
      throw new TopicNotFoundError(topicName);
    }

    this.messageIdCounter += 1;
    const messageId = `msg-${this.messageIdCounter}`;

    const message: MockMessage = {
      messageId,
      data: this.serializeData(data),
      publishTime: new Date()
    };

    if (options?.attributes !== undefined) {
      message.attributes = options.attributes;
    }
    if (options?.orderingKey !== undefined) {
      message.orderingKey = options.orderingKey;
    }

    topic.messages.push(message);

    // Enforce max message limit to prevent memory growth
    if (topic.messages.length > MockPubSubProvider.MAX_MESSAGES_PER_TOPIC) {
      const removedCount = topic.messages.length - MockPubSubProvider.MAX_MESSAGES_PER_TOPIC;
      topic.messages.splice(0, removedCount);
    }

    // Deliver to all subscriptions
    this.deliverToSubscriptions(topicName, message);

    return {
      messageId,
      publishTime: message.publishTime
    };
  }

  /**
   * Publishes multiple messages to a topic.
   *
   * @param topicName - Topic to publish to
   * @param messages - Array of messages with data and options
   * @returns Array of publish results
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   */
  async publishBatch(
    topicName: string,
    messages: Array<{ data: MessageData; options?: IPublishOptions }>
  ): Promise<IPublishResult[]> {
    await this.simulateDelay();

    const results: IPublishResult[] = [];

    for (const { data, options } of messages) {
      const result = await this.publish(topicName, data, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Starts receiving messages from a subscription.
   *
   * The handler is called immediately for all pending messages and for
   * any new messages published to the topic.
   *
   * @param subscriptionName - Subscription to receive from
   * @param handler - Function to process each message
   * @param _options - Subscribe options (partially implemented in mock)
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   */
  async subscribe(
    subscriptionName: string,
    handler: (message: IReceivedMessage) => void | Promise<void>,
    _options?: { flowControl?: { maxMessages?: number }; autoAck?: boolean }
  ): Promise<void> {
    await this.simulateDelay();

    const subscription = this.subscriptions.get(subscriptionName);
    if (!subscription) {
      throw new SubscriptionNotFoundError(subscriptionName);
    }

    subscription.handlers.push(handler);
    subscription.active = true;

    // Process pending messages
    await this.processPendingMessages(subscription);
  }

  /**
   * Stops receiving messages from a subscription.
   *
   * Clears all handlers and marks the subscription as inactive.
   *
   * @param subscriptionName - Subscription to stop receiving from
   */
  async unsubscribe(subscriptionName: string): Promise<void> {
    await this.simulateDelay();

    const subscription = this.subscriptions.get(subscriptionName);
    if (subscription) {
      subscription.handlers = [];
      subscription.active = false;
    }
  }

  /**
   * Performs a health check (always returns true for mock).
   *
   * @returns Always true
   */
  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    return true;
  }

  /**
   * Returns the number of topics in the mock store.
   *
   * Test utility for verifying topic creation.
   *
   * @returns Number of topics
   *
   * @example
   * ```typescript
   * expect(provider.getTopicCount()).toBe(0);
   * await provider.createTopic('test');
   * expect(provider.getTopicCount()).toBe(1);
   * ```
   */
  getTopicCount(): number {
    return this.topics.size;
  }

  /**
   * Returns the number of subscriptions in the mock store.
   *
   * Test utility for verifying subscription creation.
   *
   * @returns Number of subscriptions
   *
   * @example
   * ```typescript
   * expect(provider.getSubscriptionCount()).toBe(0);
   * await provider.createSubscription('sub', 'topic');
   * expect(provider.getSubscriptionCount()).toBe(1);
   * ```
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Returns the number of messages stored in a topic.
   *
   * Test utility for verifying message publishing.
   *
   * @param topicName - Topic to check
   * @returns Number of messages (0 if topic doesn't exist)
   *
   * @example
   * ```typescript
   * await provider.publish('events', { test: 'data' });
   * expect(provider.getMessageCount('events')).toBe(1);
   * ```
   */
  getMessageCount(topicName: string): number {
    const topic = this.topics.get(topicName);
    return topic?.messages.length ?? 0;
  }

  /**
   * Returns the number of unacknowledged messages in a subscription.
   *
   * Test utility for verifying message processing.
   *
   * @param subscriptionName - Subscription to check
   * @returns Number of unacked messages (0 if subscription doesn't exist)
   *
   * @example
   * ```typescript
   * await provider.publish('events', { test: 'data' });
   * expect(provider.getSubscriptionMessageCount('worker')).toBe(1);
   * // After handler acks the message
   * expect(provider.getSubscriptionMessageCount('worker')).toBe(0);
   * ```
   */
  getSubscriptionMessageCount(subscriptionName: string): number {
    const subscription = this.subscriptions.get(subscriptionName);
    return subscription?.messages.filter((m) => !m.acked).length ?? 0;
  }

  /**
   * Clean up acked messages from a subscription to prevent memory growth
   */
  private cleanupAckedMessages(subscription: MockSubscription): void {
    const beforeLength = subscription.messages.length;
    subscription.messages = subscription.messages.filter((m) => !m.acked);
    const afterLength = subscription.messages.length;

    if (beforeLength > afterLength) {
      // Messages were cleaned up
      const _cleanedUp = beforeLength - afterLength;
      void _cleanedUp; // Prevent unused variable warning
    }
  }

  /**
   * Clears all topics, subscriptions, and messages.
   *
   * Test utility for resetting state between tests.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   provider.clear();
   * });
   * ```
   */
  clear(): void {
    this.topics.clear();
    this.subscriptions.clear();
    this.messageIdCounter = 0;
    this.ackIdCounter = 0;
  }

  /**
   * Releases all resources and clears state.
   *
   * Equivalent to {@link clear} but async for interface compatibility.
   *
   * @example
   * ```typescript
   * afterAll(async () => {
   *   await provider.dispose();
   * });
   * ```
   */
  async dispose(): Promise<void> {
    // Clear all handlers
    for (const subscription of this.subscriptions.values()) {
      subscription.handlers = [];
      subscription.active = false;
    }
    this.topics.clear();
    this.subscriptions.clear();
    this.messageIdCounter = 0;
    this.ackIdCounter = 0;
  }

  /**
   * Deliver message to all subscriptions for a topic
   */
  private async deliverToSubscriptions(topicName: string, message: MockMessage): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.topicName === topicName && subscription.active) {
        this.ackIdCounter += 1;
        const ackId = `ack-${this.ackIdCounter}`;

        const subscriptionMessage: MockSubscriptionMessage = {
          message,
          ackId,
          deliveryAttempt: 1,
          acked: false
        };

        subscription.messages.push(subscriptionMessage);

        // Notify handlers
        await this.processPendingMessages(subscription);
      }
    }
  }

  /**
   * Process pending messages for a subscription
   */
  private async processPendingMessages(subscription: MockSubscription): Promise<void> {
    if (!subscription.active || subscription.handlers.length === 0) {
      return;
    }

    const pendingMessages = subscription.messages.filter((m) => !m.acked);

    for (const subMessage of pendingMessages) {
      const receivedMessage: IReceivedMessage = {
        messageId: subMessage.message.messageId,
        data: subMessage.message.data,
        publishTime: subMessage.message.publishTime,
        deliveryAttempt: subMessage.deliveryAttempt,
        ackId: subMessage.ackId,
        ack: async () => {
          subMessage.acked = true;
          // Clean up acked messages to prevent memory growth
          this.cleanupAckedMessages(subscription);
        },
        nack: async () => {
          subMessage.deliveryAttempt += 1;

          // Check if message should be moved to DLQ
          if (
            subscription.deadLetterPolicy &&
            subMessage.deliveryAttempt >= subscription.deadLetterPolicy.maxDeliveryAttempts
          ) {
            await this.sendToDeadLetterQueue(subscription, subMessage);
            subMessage.acked = true; // Mark as acked to remove from subscription
            // Clean up after sending to DLQ
            this.cleanupAckedMessages(subscription);
          }
        },
        modifyAckDeadline: async (_seconds: number) => {
          // No-op for mock
        }
      };

      if (subMessage.message.attributes !== undefined) {
        receivedMessage.attributes = subMessage.message.attributes;
      }
      if (subMessage.message.orderingKey !== undefined) {
        receivedMessage.orderingKey = subMessage.message.orderingKey;
      }

      for (const handler of subscription.handlers) {
        try {
          await handler(receivedMessage);
        } catch {
          // Handler error, continue with next handler
          // Silently ignore handler errors in mock provider
        }
      }
    }
  }

  /**
   * Send message to Dead Letter Queue
   */
  private async sendToDeadLetterQueue(
    subscription: MockSubscription,
    subMessage: MockSubscriptionMessage
  ): Promise<void> {
    if (!subscription.deadLetterPolicy) {
      return;
    }

    const dlqTopicName = subscription.deadLetterPolicy.deadLetterTopic;
    const dlqTopic = this.topics.get(dlqTopicName);

    if (!dlqTopic) {
      // DLQ topic doesn't exist, skip delivery
      return;
    }

    // Create a copy of the message for the DLQ
    const dlqMessage: MockMessage = {
      ...subMessage.message,
      messageId: `dlq-${subMessage.message.messageId}`,
      attributes: {
        ...subMessage.message.attributes,
        originalMessageId: subMessage.message.messageId,
        originalTopic: subscription.topicName,
        originalSubscription: subscription.name,
        deliveryAttempts: subMessage.deliveryAttempt.toString()
      }
    };

    dlqTopic.messages.push(dlqMessage);

    // Deliver to DLQ subscriptions
    await this.deliverToSubscriptions(dlqTopicName, dlqMessage);
  }

  /**
   * Serialize message data to Buffer
   */
  private serializeData(data: MessageData): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (typeof data === 'string') {
      return Buffer.from(data, 'utf-8');
    }

    try {
      return Buffer.from(JSON.stringify(data), 'utf-8');
    } catch (error) {
      throw new InvalidMessageDataError(
        `Failed to serialize message data to JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Simulate network delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.simulateDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateDelayMs));
    }
  }
}

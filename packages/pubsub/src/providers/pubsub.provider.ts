/**
 * @fileoverview Google Cloud Pub/Sub provider implementation.
 *
 * This module provides a production-ready Pub/Sub client with enterprise features:
 * - **Circuit Breaker**: Prevents cascading failures during outages
 * - **Automatic Reconnection**: Exponential backoff for subscription recovery
 * - **Message Tracking**: TTL-based cleanup of processing state
 * - **OpenTelemetry Integration**: Distributed tracing for all operations
 * - **Graceful Degradation**: Half-open circuit breaker state for recovery testing
 *
 * @module @package/pubsub/providers/pubsub.provider
 *
 * @example Basic usage
 * ```typescript
 * import { createPubSubProvider } from '@package/pubsub';
 *
 * const provider = createPubSubProvider({
 *   projectId: 'my-project',
 *   credentials: { keyFile: '/path/to/key.json' }
 * });
 *
 * // Create topic and subscription
 * await provider.createTopic('orders');
 * await provider.createSubscription('order-processor', 'orders');
 *
 * // Publish messages
 * await provider.publish('orders', {
 *   type: 'order.created',
 *   orderId: '12345'
 * });
 *
 * // Subscribe to messages
 * await provider.subscribe('order-processor', async (message) => {
 *   const data = JSON.parse(message.data.toString());
 *   await processOrder(data);
 *   await message.ack();
 * });
 *
 * // Cleanup on shutdown
 * await provider.dispose();
 * ```
 */

import { PubSub } from '@google-cloud/pubsub';
import { INFRASTRUCTURE_ATTRS, withSpan } from '@package/core';
import { Logger } from '@package/observability';

import {
  validateConfig,
  getTopicPath,
  parseTopicName,
  parseSubscriptionName
} from '../config/config-resolver';
import {
  TopicNotFoundError,
  TopicAlreadyExistsError,
  SubscriptionNotFoundError,
  SubscriptionAlreadyExistsError,
  PublishFailedError,
  SubscribeFailedError,
  TopicCreationFailedError,
  TopicDeletionFailedError,
  SubscriptionCreationFailedError,
  SubscriptionDeletionFailedError,
  PermissionDeniedError,
  InvalidMessageDataError
} from '../errors';
import {
  isNotFoundError as isGcpNotFoundError,
  isAlreadyExistsError as isGcpAlreadyExistsError,
  isPermissionDeniedError as isGcpPermissionDeniedError,
  createAsyncModifyAckDeadline
} from './gcp-types';

import type {
  IGcpTopicCreateOptions,
  IGcpSubscriptionCreateOptions,
  IGcpPublishOptions,
  IGcpPubSubMessage,
  IGcpTopicMetadata,
  IGcpSubscriptionMetadata
} from './gcp-types';
import type {
  IPubSubConfig,
  ITopicOptions,
  ISubscriptionOptions,
  IPublishOptions,
  ISubscribeOptions,
  MessageData,
  IReceivedMessage
} from '../config';
import type { Topic, Subscription } from '@google-cloud/pubsub';
import type { Span } from '@opentelemetry/api';

/**
 * Information about a Pub/Sub topic.
 *
 * Returned by topic creation, retrieval, and listing operations.
 * Contains both the topic identifier and its configuration metadata.
 *
 * @example Topic info structure
 * ```typescript
 * const topicInfo: ITopicInfo = {
 *   name: 'orders',
 *   path: 'projects/my-project/topics/orders',
 *   description: 'Order events',
 *   labels: { team: 'commerce' }
 * };
 * ```
 */
export interface ITopicInfo {
  /** Short topic name (e.g., 'orders') */
  name: string;
  /** Full GCP resource path (e.g., 'projects/my-project/topics/orders') */
  path: string;
  /** Human-readable description */
  description?: string;
  /** Regional message storage configuration */
  messageStoragePolicy?: {
    /** GCP regions where messages can be stored */
    allowedPersistenceRegions?: string[];
  };
  /** Cloud KMS key for encryption at rest */
  kmsKeyName?: string;
  /** Key-value labels for categorization */
  labels?: Record<string, string>;
}

/**
 * @deprecated Use {@link ITopicInfo} instead. This alias is maintained for backward compatibility.
 */
export type TopicInfo = ITopicInfo;

/**
 * Information about a Pub/Sub subscription.
 *
 * Returned by subscription creation, retrieval, and listing operations.
 * Contains the subscription identifier, its associated topic, and
 * configuration settings.
 *
 * @example Subscription info structure
 * ```typescript
 * const subInfo: ISubscriptionInfo = {
 *   name: 'order-processor',
 *   path: 'projects/my-project/subscriptions/order-processor',
 *   topicPath: 'projects/my-project/topics/orders',
 *   ackDeadlineSeconds: 60,
 *   deadLetterPolicy: {
 *     deadLetterTopic: 'orders-dlq',
 *     maxDeliveryAttempts: 5
 *   }
 * };
 * ```
 */
export interface ISubscriptionInfo {
  /** Short subscription name (e.g., 'order-processor') */
  name: string;
  /** Full GCP resource path */
  path: string;
  /** Full path of the topic this subscription receives from */
  topicPath: string;
  /** Time limit for message acknowledgment in seconds */
  ackDeadlineSeconds?: number;
  /** Duration to retain unacknowledged messages in seconds */
  messageRetentionSeconds?: number;
  /** Whether acknowledged messages are retained */
  retainAckedMessages?: boolean;
  /** Whether message ordering is enabled */
  enableMessageOrdering?: boolean;
  /** HTTPS endpoint for push delivery (if configured) */
  pushEndpoint?: string;
  /** Dead Letter Queue configuration (if configured) */
  deadLetterPolicy?: {
    /** Short name of the DLQ topic */
    deadLetterTopic: string;
    /** Maximum delivery attempts before routing to DLQ */
    maxDeliveryAttempts: number;
  };
}

/**
 * @deprecated Use {@link ISubscriptionInfo} instead. This alias is maintained for backward compatibility.
 */
export type SubscriptionInfo = ISubscriptionInfo;

/**
 * Result of a message publish operation.
 *
 * Returned by {@link PubSubProvider.publish} and contains the
 * server-assigned message identifier.
 *
 * @example Using publish result
 * ```typescript
 * const result = await provider.publish('orders', orderData);
 * console.log('Published message:', result.messageId);
 * // Store messageId for tracking/debugging
 * ```
 */
export interface IPublishResult {
  /** Unique server-assigned message identifier */
  messageId: string;
  /** Timestamp when the message was published */
  publishTime?: Date;
}

/**
 * @deprecated Use {@link IPublishResult} instead. This alias is maintained for backward compatibility.
 */
export type PublishResult = IPublishResult;

/**
 * Google Cloud Pub/Sub provider with enterprise features.
 *
 * This class provides a production-ready interface to Google Cloud Pub/Sub
 * with built-in resilience patterns and observability.
 *
 * **Key Features:**
 * - **Topic Management**: Create, delete, list, and retrieve topics
 * - **Subscription Management**: Create, delete, list, and retrieve subscriptions
 * - **Message Publishing**: Publish single messages or batches with ordering
 * - **Message Subscribing**: Pull-based subscription with flow control
 * - **Circuit Breaker**: Prevents cascading failures during service outages
 * - **Auto-Reconnection**: Exponential backoff for subscription recovery
 * - **OpenTelemetry**: Distributed tracing for all operations
 * - **Dead Letter Queues**: Automatic routing of failed messages
 *
 * **Circuit Breaker Behavior:**
 * - Opens after 10 consecutive failures
 * - Enters half-open state after 5 minutes
 * - Requires consecutive successes to fully close
 *
 * **Reconnection Behavior:**
 * - Up to 5 reconnection attempts per subscription
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 60s)
 * - Non-retryable errors (auth) skip reconnection
 *
 * @example Basic workflow
 * ```typescript
 * const provider = new PubSubProvider({
 *   projectId: 'my-project',
 *   enableTracing: true
 * });
 *
 * // Create infrastructure
 * await provider.createTopic('events');
 * await provider.createSubscription('worker', 'events', {
 *   ackDeadlineSeconds: 60,
 *   deadLetterPolicy: { deadLetterTopic: 'events-dlq', maxDeliveryAttempts: 5 }
 * });
 *
 * // Publish events
 * await provider.publish('events', { type: 'user.signup', userId: '123' });
 *
 * // Process events
 * await provider.subscribe('worker', async (msg) => {
 *   await processEvent(JSON.parse(msg.data.toString()));
 *   await msg.ack();
 * });
 * ```
 */
export class PubSubProvider {
  private readonly client: PubSub;
  private readonly config: IPubSubConfig;
  private readonly logger: Logger;
  private readonly providerName = 'PubSubProvider';
  private readonly topics: Map<string, Topic> = new Map();
  private readonly subscriptions: Map<string, Subscription> = new Map();
  private readonly messageTracking: Map<string, { timestamp: number; attempts: number }> =
    new Map();
  private readonly failedMessageTracking: Map<string, { count: number; lastFailure: number }> =
    new Map();
  private readonly reconnectAttempts: Map<
    string,
    { count: number; lastAttempt: number; error?: unknown }
  > = new Map();
  private readonly subscriptionHandlers: Map<
    string,
    (message: IReceivedMessage) => void | Promise<void>
  > = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs: number;
  private static readonly MESSAGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 10;
  private static readonly CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly INITIAL_RECONNECT_DELAY_MS = 1000; // 1 second
  private static readonly MAX_RECONNECT_DELAY_MS = 60000; // 1 minute
  private static readonly RECONNECT_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: IPubSubConfig, logger?: Logger) {
    validateConfig(config);

    this.config = config;
    this.logger = logger ?? new Logger();
    this.cleanupIntervalMs = config.cleanupIntervalMs ?? PubSubProvider.DEFAULT_CLEANUP_INTERVAL_MS;

    // Initialize PubSub client
    const clientOptions: Record<string, unknown> = {};

    if (config.credentials) {
      if (config.credentials.keyFile) {
        clientOptions['keyFile'] = config.credentials.keyFile;
      } else if (config.credentials.clientEmail && config.credentials.privateKey) {
        clientOptions['credentials'] = {
          client_email: config.credentials.clientEmail,
          private_key: config.credentials.privateKey
        };
      }
    }

    if (config.timeout) {
      clientOptions['timeout'] = config.timeout;
    }

    if (config.maxRetries) {
      clientOptions['maxRetries'] = config.maxRetries;
    }

    this.client = new PubSub({
      projectId: config.projectId,
      ...clientOptions
    });

    // Start periodic cleanup interval
    this.startPeriodicCleanup();

    this.logger.info('PubSubProvider initialized', {
      projectId: config.projectId
    });
  }

  /**
   * Start periodic cleanup of expired tracking entries
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      return; // Already started
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTracking();
      this.cleanupStaleReconnectAttempts();
    }, this.cleanupIntervalMs);

    // Don't keep the process alive just for this interval
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    this.logger.debug('Started periodic cleanup interval', {
      intervalMs: this.cleanupIntervalMs
    });
  }

  /**
   * Stop periodic cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.debug('Stopped periodic cleanup interval');
    }
  }

  /**
   * Creates a new Pub/Sub topic.
   *
   * Topics are named resources that act as feeds of messages. Publishers
   * send messages to topics, and subscribers receive messages from
   * subscriptions attached to topics.
   *
   * This operation is idempotent - if a topic with the same name already
   * exists, the method returns the existing topic's information.
   *
   * @param name - Topic name (must match pattern `^[a-zA-Z][\w-.~+%]*$`)
   * @param options - Optional topic configuration
   * @returns Topic information including the full resource path
   * @throws {@link TopicAlreadyExistsError} When topic exists (non-idempotent mode)
   * @throws {@link TopicCreationFailedError} When creation fails
   * @throws {@link PermissionDeniedError} When lacking create permissions
   *
   * @example Creating a simple topic
   * ```typescript
   * const topicInfo = await provider.createTopic('orders');
   * console.log(topicInfo.path);
   * // 'projects/my-project/topics/orders'
   * ```
   *
   * @example Creating a topic with options
   * ```typescript
   * const topicInfo = await provider.createTopic('pii-events', {
   *   description: 'Contains personally identifiable information',
   *   messageStoragePolicy: {
   *     allowedPersistenceRegions: ['us-central1']
   *   },
   *   labels: { 'data-classification': 'pii' }
   * });
   * ```
   */
  async createTopic(name: string, options?: ITopicOptions): Promise<ITopicInfo> {
    return withSpan(
      `${this.providerName}.createTopic`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'createTopic',
          'topic.name': name
        });

        try {
          const topic = this.client.topic(name);

          // Create topic with callback-style to avoid type issues
          try {
            await new Promise<void>((resolve, reject) => {
              const createOptions: IGcpTopicCreateOptions = {};

              // Add gcpConfig if options provided
              if (options) {
                createOptions.gcpConfig = {};
                if (options.description) {
                  createOptions.gcpConfig['description'] = options.description;
                }
                if (options.messageStoragePolicy) {
                  createOptions.gcpConfig['messageStoragePolicy'] = options.messageStoragePolicy;
                }
                if (options.kmsKeyName) {
                  createOptions.gcpConfig['kmsKeyName'] = options.kmsKeyName;
                }
                if (options.labels) {
                  createOptions.gcpConfig['labels'] = options.labels;
                }
              }

              topic.create(createOptions.gcpConfig ?? {}, (err: unknown) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });

            this.topics.set(name, topic);

            this.logger.info(`Topic created: ${name}`);
          } catch (error: unknown) {
            // If topic already exists, check if we can get it (idempotent operation)
            if (this.isAlreadyExistsError(error)) {
              this.logger.info(`Topic already exists: ${name}, fetching existing topic`);
              try {
                await topic.get();
                this.topics.set(name, topic);
              } catch (getError: unknown) {
                // Topic was deleted between the create attempt and get, propagate NOT_FOUND
                if (this.isNotFoundError(getError)) {
                  throw new TopicNotFoundError(name, { cause: getError });
                }
                throw getError;
              }
            } else {
              throw error;
            }
          }

          // Get the topic to return its info
          // Wrap in try-catch to handle race condition where topic is deleted
          let topicResponse: Topic;
          try {
            [topicResponse] = await topic.get();
          } catch (getError: unknown) {
            if (this.isNotFoundError(getError)) {
              throw new TopicNotFoundError(name, { cause: getError });
            }
            throw getError;
          }
          return this.mapTopicInfo(topicResponse);
        } catch (error: unknown) {
          if (this.isAlreadyExistsError(error)) {
            throw new TopicAlreadyExistsError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            throw new PermissionDeniedError('Failed to create topic', { cause: error });
          }
          throw new TopicCreationFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Deletes a Pub/Sub topic.
   *
   * Deleting a topic does not delete its subscriptions. However, those
   * subscriptions will no longer receive messages since the topic no longer
   * exists. You may want to delete subscriptions first.
   *
   * @param name - Topic name to delete
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   * @throws {@link TopicDeletionFailedError} When deletion fails
   * @throws {@link PermissionDeniedError} When lacking delete permissions
   *
   * @example Deleting a topic
   * ```typescript
   * await provider.deleteTopic('orders');
   * ```
   *
   * @example Safe deletion with subscription cleanup
   * ```typescript
   * // Delete subscriptions first
   * const subs = await provider.listSubscriptions();
   * const topicSubs = subs.filter(s => s.topicPath.endsWith('/orders'));
   * await Promise.all(topicSubs.map(s => provider.deleteSubscription(s.name)));
   *
   * // Then delete the topic
   * await provider.deleteTopic('orders');
   * ```
   */
  async deleteTopic(name: string): Promise<void> {
    return withSpan(
      `${this.providerName}.deleteTopic`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'deleteTopic',
          'topic.name': name
        });

        try {
          const topic = this.client.topic(name);
          await topic.delete();

          this.topics.delete(name);

          this.logger.info(`Topic deleted: ${name}`);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new TopicNotFoundError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            throw new PermissionDeniedError('Failed to delete topic', { cause: error });
          }
          throw new TopicDeletionFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Retrieves information about a topic.
   *
   * @param name - Topic name to retrieve
   * @returns Topic information including configuration
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   *
   * @example Getting topic info
   * ```typescript
   * const info = await provider.getTopic('orders');
   * console.log('Topic path:', info.path);
   * console.log('Labels:', info.labels);
   * ```
   */
  async getTopic(name: string): Promise<ITopicInfo> {
    return withSpan(
      `${this.providerName}.getTopic`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'getTopic',
          'topic.name': name
        });

        try {
          const topic = this.client.topic(name);
          const [topicInfo] = await topic.get();

          return this.mapTopicInfo(topicInfo);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new TopicNotFoundError(name, { cause: error });
          }
          throw error;
        }
      },
      {}
    );
  }

  /**
   * Lists all topics in the project.
   *
   * @returns Array of topic information objects
   *
   * @example Listing all topics
   * ```typescript
   * const topics = await provider.listTopics();
   * for (const topic of topics) {
   *   console.log(`Topic: ${topic.name} (${topic.path})`);
   * }
   * ```
   *
   * @example Filtering topics by label
   * ```typescript
   * const topics = await provider.listTopics();
   * const orderTopics = topics.filter(t => t.labels?.team === 'orders');
   * ```
   */
  async listTopics(): Promise<ITopicInfo[]> {
    return withSpan(
      `${this.providerName}.listTopics`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'listTopics'
        });

        try {
          const [topics] = await this.client.getTopics();

          return topics.map((topic) => this.mapTopicInfo(topic));
        } catch (error: unknown) {
          this.logger.error('Failed to list topics', { error });
          throw error;
        }
      },
      {}
    );
  }

  /**
   * Creates a subscription to receive messages from a topic.
   *
   * Each subscription represents a stream of messages from a topic.
   * Multiple subscriptions to the same topic receive independent copies
   * of all messages, enabling fan-out patterns.
   *
   * @param name - Subscription name (unique within the project)
   * @param topicName - Topic to receive messages from
   * @param options - Optional subscription configuration
   * @returns Subscription information including the full resource path
   * @throws {@link TopicNotFoundError} When the topic doesn't exist
   * @throws {@link SubscriptionAlreadyExistsError} When subscription exists
   * @throws {@link SubscriptionCreationFailedError} When creation fails
   * @throws {@link PermissionDeniedError} When lacking create permissions
   *
   * @example Creating a simple subscription
   * ```typescript
   * const subInfo = await provider.createSubscription('order-processor', 'orders');
   * console.log(subInfo.path);
   * // 'projects/my-project/subscriptions/order-processor'
   * ```
   *
   * @example Creating a subscription with Dead Letter Queue
   * ```typescript
   * // First create the DLQ topic
   * await provider.createTopic('orders-dlq');
   *
   * // Then create subscription with DLQ
   * await provider.createSubscription('order-processor', 'orders', {
   *   ackDeadlineSeconds: 60,
   *   deadLetterPolicy: {
   *     deadLetterTopic: 'orders-dlq',
   *     maxDeliveryAttempts: 5
   *   },
   *   retryPolicy: {
   *     minimumBackoffInSeconds: 10,
   *     maximumBackoffInSeconds: 600
   *   }
   * });
   * ```
   *
   * @example Creating a filtered subscription
   * ```typescript
   * // Only receive high-priority messages
   * await provider.createSubscription('priority-handler', 'events', {
   *   filter: 'attributes.priority = "high"'
   * });
   * ```
   */
  async createSubscription(
    name: string,
    topicName: string,
    options?: ISubscriptionOptions
  ): Promise<ISubscriptionInfo> {
    return withSpan(
      `${this.providerName}.createSubscription`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'createSubscription',
          'subscription.name': name,
          'topic.name': topicName
        });

        try {
          const topic = this.client.topic(topicName);

          // Build subscription options compatible with Google Cloud PubSub SDK
          const subscriptionOptions: IGcpSubscriptionCreateOptions = {
            ...options
          };

          // Add dead letter policy if provided
          if (options?.deadLetterPolicy) {
            subscriptionOptions.deadLetterPolicy = {
              deadLetterTopic: getTopicPath(this.config, options.deadLetterPolicy.deadLetterTopic),
              maxDeliveryAttempts: options.deadLetterPolicy.maxDeliveryAttempts
            };
          }

          await topic.createSubscription(name, subscriptionOptions);

          // Get the subscription to return its info
          const subscription = this.client.subscription(name);
          const [subscriptionInfo] = await subscription.get();

          this.subscriptions.set(name, subscription);

          this.logger.info(`Subscription created: ${name} for topic: ${topicName}`);

          return this.mapSubscriptionInfo(subscriptionInfo);
        } catch (error: unknown) {
          if (this.isAlreadyExistsError(error)) {
            throw new SubscriptionAlreadyExistsError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            throw new PermissionDeniedError('Failed to create subscription', { cause: error });
          }
          throw new SubscriptionCreationFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Deletes a subscription.
   *
   * After deletion, any unacknowledged messages in the subscription are lost.
   * Active message handlers will stop receiving messages.
   *
   * @param name - Subscription name to delete
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   * @throws {@link SubscriptionDeletionFailedError} When deletion fails
   * @throws {@link PermissionDeniedError} When lacking delete permissions
   *
   * @example Deleting a subscription
   * ```typescript
   * await provider.deleteSubscription('order-processor');
   * ```
   *
   * @example Graceful deletion
   * ```typescript
   * // Stop receiving new messages
   * await provider.unsubscribe('order-processor');
   *
   * // Wait for in-flight messages
   * await sleep(5000);
   *
   * // Delete the subscription
   * await provider.deleteSubscription('order-processor');
   * ```
   */
  async deleteSubscription(name: string): Promise<void> {
    return withSpan(
      `${this.providerName}.deleteSubscription`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'deleteSubscription',
          'subscription.name': name
        });

        try {
          const subscription = this.client.subscription(name);
          await subscription.delete();

          this.subscriptions.delete(name);

          this.logger.info(`Subscription deleted: ${name}`);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new SubscriptionNotFoundError(name, { cause: error });
          }
          if (this.isPermissionDeniedError(error)) {
            throw new PermissionDeniedError('Failed to delete subscription', { cause: error });
          }
          throw new SubscriptionDeletionFailedError(name, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Retrieves information about a subscription.
   *
   * @param name - Subscription name to retrieve
   * @returns Subscription information including configuration
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   *
   * @example Getting subscription info
   * ```typescript
   * const info = await provider.getSubscription('order-processor');
   * console.log('Topic:', info.topicPath);
   * console.log('Ack deadline:', info.ackDeadlineSeconds);
   * console.log('DLQ:', info.deadLetterPolicy?.deadLetterTopic);
   * ```
   */
  async getSubscription(name: string): Promise<ISubscriptionInfo> {
    return withSpan(
      `${this.providerName}.getSubscription`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'getSubscription',
          'subscription.name': name
        });

        try {
          const subscription = this.client.subscription(name);
          const [subscriptionInfo] = await subscription.get();

          return this.mapSubscriptionInfo(subscriptionInfo);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new SubscriptionNotFoundError(name, { cause: error });
          }
          throw error;
        }
      },
      {}
    );
  }

  /**
   * Lists all subscriptions in the project.
   *
   * @returns Array of subscription information objects
   *
   * @example Listing all subscriptions
   * ```typescript
   * const subs = await provider.listSubscriptions();
   * for (const sub of subs) {
   *   console.log(`${sub.name} -> ${sub.topicPath}`);
   * }
   * ```
   *
   * @example Finding subscriptions for a topic
   * ```typescript
   * const subs = await provider.listSubscriptions();
   * const orderSubs = subs.filter(s => s.topicPath.endsWith('/orders'));
   * ```
   */
  async listSubscriptions(): Promise<ISubscriptionInfo[]> {
    return withSpan(
      `${this.providerName}.listSubscriptions`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'listSubscriptions'
        });

        try {
          const [subscriptions] = await this.client.getSubscriptions();

          return subscriptions.map((sub) => this.mapSubscriptionInfo(sub));
        } catch (error: unknown) {
          this.logger.error('Failed to list subscriptions', { error });
          throw error;
        }
      },
      {}
    );
  }

  /**
   * Publishes a message to a topic.
   *
   * Messages can be published as JSON objects, strings, or Buffers.
   * Objects are automatically serialized to JSON. The maximum message
   * size is 10MB (including attributes).
   *
   * @param topicName - Topic to publish to
   * @param data - Message payload (object, string, or Buffer)
   * @param options - Optional publish configuration
   * @returns Publish result with message ID
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   * @throws {@link PublishFailedError} When publishing fails
   * @throws {@link InvalidMessageDataError} When data can't be serialized
   *
   * @example Publishing a JSON object
   * ```typescript
   * const result = await provider.publish('orders', {
   *   type: 'order.created',
   *   orderId: '12345',
   *   timestamp: new Date().toISOString()
   * });
   * console.log('Published:', result.messageId);
   * ```
   *
   * @example Publishing with ordering
   * ```typescript
   * // Messages with the same orderingKey are delivered in order
   * await provider.publish('orders', orderData, {
   *   orderingKey: `customer-${customerId}`,
   *   attributes: {
   *     'event-type': 'order.created',
   *     'source': 'checkout-service'
   *   }
   * });
   * ```
   *
   * @example Publishing binary data
   * ```typescript
   * const imageBuffer = await fs.readFile('image.png');
   * await provider.publish('images', imageBuffer, {
   *   attributes: { 'content-type': 'image/png' }
   * });
   * ```
   */
  async publish(
    topicName: string,
    data: MessageData,
    options?: IPublishOptions
  ): Promise<IPublishResult> {
    return withSpan(
      `${this.providerName}.publish`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'publish',
          'topic.name': topicName
        });

        try {
          const topic = this.client.topic(topicName);

          const messageData = this.serializeData(data);

          // Build publish options compatible with Google Cloud PubSub SDK
          const publishOptions: IGcpPublishOptions = {};
          if (options?.attributes) {
            publishOptions.attributes = options.attributes;
          }
          if (options?.orderingKey) {
            publishOptions.orderingKey = options.orderingKey;
          }

          // Apply timeout if specified
          const timeout = options?.timeout ?? this.config.timeout;
          let publishPromise = topic.publish(messageData, publishOptions as Record<string, string>);

          if (timeout) {
            publishPromise = Promise.race([
              publishPromise,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Publish timeout after ${timeout}ms`)), timeout)
              )
            ]) as Promise<string>;
          }

          const messageId = await publishPromise;

          this.logger.debug(`Message published to topic: ${topicName}`, {
            messageId
          });

          return {
            messageId: String(messageId),
            publishTime: new Date()
          };
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new TopicNotFoundError(topicName, { cause: error });
          }
          // Preserve typed PubSub errors (e.g. InvalidMessageDataError) so
          // callers can match the documented error contract instead of a
          // generic PublishFailedError wrapper.
          if (error instanceof InvalidMessageDataError) {
            throw error;
          }
          throw new PublishFailedError(topicName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Publishes multiple messages to a topic in a single batch.
   *
   * More efficient than multiple single publishes when sending many
   * messages. All messages are published concurrently.
   *
   * @param topicName - Topic to publish to
   * @param messages - Array of messages with data and optional options
   * @returns Array of publish results with message IDs
   * @throws {@link TopicNotFoundError} When topic doesn't exist
   * @throws {@link PublishFailedError} When any message fails to publish
   *
   * @example Batch publishing
   * ```typescript
   * const messages = orders.map(order => ({
   *   data: { type: 'order.created', order },
   *   options: { orderingKey: `customer-${order.customerId}` }
   * }));
   *
   * const results = await provider.publishBatch('orders', messages);
   * console.log(`Published ${results.length} messages`);
   * ```
   */
  async publishBatch(
    topicName: string,
    messages: Array<{ data: MessageData; options?: IPublishOptions }>
  ): Promise<IPublishResult[]> {
    return withSpan(
      `${this.providerName}.publishBatch`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'publishBatch',
          'topic.name': topicName,
          'batch.size': messages.length
        });

        try {
          const topic = this.client.topic(topicName);

          // Publish messages concurrently using Promise.all for better performance
          const publishPromises = messages.map(async (msg) => {
            const messageData = this.serializeData(msg.data);

            // Build publish options compatible with Google Cloud PubSub SDK
            const publishOptions: IGcpPublishOptions = {};
            if (msg.options?.attributes) {
              publishOptions.attributes = msg.options.attributes;
            }
            if (msg.options?.orderingKey) {
              publishOptions.orderingKey = msg.options.orderingKey;
            }

            // Apply timeout if specified
            const timeout = msg.options?.timeout ?? this.config.timeout;
            let publishPromise = topic.publish(
              messageData,
              publishOptions as Record<string, string>
            );

            if (timeout) {
              publishPromise = Promise.race([
                publishPromise,
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error(`Publish timeout after ${timeout}ms`)), timeout)
                )
              ]) as Promise<string>;
            }

            const messageId = await publishPromise;
            return {
              messageId: messageId as string,
              publishTime: new Date()
            };
          });

          const results = await Promise.all(publishPromises);

          this.logger.debug(`Messages published to topic: ${topicName}`, {
            count: results.length
          });

          return results;
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new TopicNotFoundError(topicName, { cause: error });
          }
          // Preserve typed PubSub errors (e.g. InvalidMessageDataError) so
          // callers can match the documented error contract instead of a
          // generic PublishFailedError wrapper.
          if (error instanceof InvalidMessageDataError) {
            throw error;
          }
          throw new PublishFailedError(topicName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Starts receiving messages from a subscription.
   *
   * Opens a streaming pull connection to receive messages. The handler
   * is called for each message received. Messages must be acknowledged
   * or negatively acknowledged to manage redelivery.
   *
   * The provider implements:
   * - **Circuit Breaker**: Opens after 10 consecutive failures
   * - **Auto-Reconnection**: Exponential backoff on connection errors
   * - **Handler Timeout**: Configurable timeout per message
   * - **Auto-Ack**: Optional automatic acknowledgment on success
   *
   * @param subscriptionName - Subscription to receive from
   * @param handler - Function to process each received message
   * @param options - Optional subscribe configuration
   * @throws {@link SubscriptionNotFoundError} When subscription doesn't exist
   * @throws {@link SubscribeFailedError} When subscription fails
   *
   * @example Basic subscription
   * ```typescript
   * await provider.subscribe('order-processor', async (message) => {
   *   const data = JSON.parse(message.data.toString());
   *   await processOrder(data);
   *   await message.ack();
   * });
   * ```
   *
   * @example With auto-ack and timeout
   * ```typescript
   * await provider.subscribe('fast-processor', async (message) => {
   *   const data = JSON.parse(message.data.toString());
   *   await processQuickly(data);
   *   // No need to call ack() - autoAck handles it
   * }, {
   *   autoAck: true,
   *   handlerTimeout: 5000 // 5 second timeout
   * });
   * ```
   *
   * @example With flow control
   * ```typescript
   * await provider.subscribe('heavy-processor', handler, {
   *   flowControl: {
   *     maxMessages: 10, // Process 10 at a time
   *     maxBytes: 10 * 1024 * 1024 // 10MB buffer
   *   }
   * });
   * ```
   *
   * @example Manual ack with error handling
   * ```typescript
   * await provider.subscribe('reliable-processor', async (message) => {
   *   try {
   *     await processWithTransaction(message);
   *     await message.ack();
   *   } catch (error) {
   *     if (isRetryable(error)) {
   *       await message.nack(); // Retry later
   *     } else {
   *       // Log and ack to prevent infinite retry
   *       logger.error('Permanent failure', { error, messageId: message.messageId });
   *       await message.ack();
   *     }
   *   }
   * }, { autoAck: false });
   * ```
   */
  async subscribe(
    subscriptionName: string,
    handler: (message: IReceivedMessage) => void | Promise<void>,
    options?: ISubscribeOptions
  ): Promise<void> {
    return withSpan(
      `${this.providerName}.subscribe`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'subscribe',
          'subscription.name': subscriptionName
        });

        try {
          const subscription = this.client.subscription(subscriptionName);

          // Remove existing message listeners to prevent duplicates
          subscription.removeAllListeners('message');
          subscription.removeAllListeners('error');

          // Store handler for reconnection attempts
          this.subscriptionHandlers.set(subscriptionName, handler);

          // Apply flow control settings if provided
          if (options?.flowControl) {
            const flowControlOptions: Record<string, number> = {};
            if (options.flowControl.maxMessages) {
              flowControlOptions['maxMessages'] = options.flowControl.maxMessages;
            }
            if (options.flowControl.maxBytes) {
              flowControlOptions['maxBytes'] = options.flowControl.maxBytes;
            }
            subscription.setOptions({
              flowControl: flowControlOptions
            });
            this.logger.info(`Flow control configured for subscription: ${subscriptionName}`, {
              maxMessages: options.flowControl.maxMessages,
              maxBytes: options.flowControl.maxBytes
            });
          }

          // Apply streaming options if provided
          if (options?.streamingOptions) {
            const streamingOptions: Record<string, number> = {};
            if (options.streamingOptions.maxOutstandingMessages) {
              streamingOptions['maxOutstandingMessages'] =
                options.streamingOptions.maxOutstandingMessages;
            }
            if (options.streamingOptions.maxOutstandingBytes) {
              streamingOptions['maxOutstandingBytes'] =
                options.streamingOptions.maxOutstandingBytes;
            }
            if (options.streamingOptions.maxTotalOutstandingBytes) {
              streamingOptions['maxTotalOutstandingBytes'] =
                options.streamingOptions.maxTotalOutstandingBytes;
            }
            subscription.setOptions(streamingOptions);
            this.logger.info(`Streaming options configured for subscription: ${subscriptionName}`, {
              maxOutstandingMessages: options.streamingOptions.maxOutstandingMessages,
              maxOutstandingBytes: options.streamingOptions.maxOutstandingBytes,
              maxTotalOutstandingBytes: options.streamingOptions.maxTotalOutstandingBytes
            });
          }

          const messageHandler = async (message: unknown) => {
            const pubsubMessage = message as IGcpPubSubMessage;
            const messageId = pubsubMessage.id;
            const now = Date.now();

            // Check circuit breaker for this subscription
            if (this.isCircuitBreakerOpen(subscriptionName)) {
              this.logger.warn('Circuit breaker is open, skipping message handler', {
                subscription: subscriptionName,
                messageId
              });
              await pubsubMessage.nack();
              return;
            }

            // Track message with timestamp
            this.messageTracking.set(messageId, { timestamp: now, attempts: 0 });

            // Wrap ack to clean up tracking
            const originalAck = pubsubMessage.ack.bind(pubsubMessage);
            const trackedAck = async (): Promise<void> => {
              this.messageTracking.delete(messageId);
              await originalAck();
            };

            // Wrap nack to track failures and update circuit breaker
            const trackedNack = async (): Promise<void> => {
              const tracking = this.messageTracking.get(messageId);
              if (tracking) {
                tracking.attempts += 1;
                this.updateCircuitBreaker(subscriptionName, true);
              }
              try {
                await pubsubMessage.nack();
              } catch (nackError) {
                this.logger.error('Failed to nack message', {
                  subscription: subscriptionName,
                  messageId,
                  error: nackError
                });
              }
            };

            const receivedMessage: IReceivedMessage = {
              messageId: pubsubMessage.id,
              data: pubsubMessage.data,
              attributes: pubsubMessage.attributes,
              orderingKey: pubsubMessage.orderingKey,
              publishTime: pubsubMessage.publishTime,
              deliveryAttempt: pubsubMessage.deliveryAttempt,
              ackId: pubsubMessage.id,
              ack: trackedAck,
              nack: trackedNack,
              modifyAckDeadline: createAsyncModifyAckDeadline(pubsubMessage)
            };

            try {
              // Apply handler timeout if specified
              if (options?.handlerTimeout) {
                await Promise.race([
                  handler(receivedMessage),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error(`Handler timeout after ${options.handlerTimeout}ms`)),
                      options.handlerTimeout
                    )
                  )
                ]);
              } else {
                await handler(receivedMessage);
              }

              // Auto-ack if enabled and handler succeeded
              if (options?.autoAck) {
                await receivedMessage.ack();
              }

              // Update circuit breaker on success
              this.updateCircuitBreaker(subscriptionName, false);
            } catch (error) {
              this.logger.error('Message handler error', {
                subscription: subscriptionName,
                messageId: receivedMessage.messageId,
                error
              });
              // Nack the message on handler error (tracked wrapper handles cleanup)
              await trackedNack();
            }
          };

          subscription.on('message', messageHandler);

          // Set up error handler with recovery logic
          subscription.on('error', async (error: unknown) => {
            this.logger.error('Subscription error', {
              subscription: subscriptionName,
              error
            });

            // Attempt to reconnect with exponential backoff
            await this.attemptReconnect(subscriptionName, handler, options, error);
          });

          this.subscriptions.set(subscriptionName, subscription);

          this.logger.info(`Subscribed to: ${subscriptionName}`);
        } catch (error: unknown) {
          if (this.isNotFoundError(error)) {
            throw new SubscriptionNotFoundError(subscriptionName, { cause: error });
          }
          throw new SubscribeFailedError(subscriptionName, { cause: error });
        }
      },
      {}
    );
  }

  /**
   * Stops receiving messages from a subscription.
   *
   * Removes all message listeners and cleans up the streaming connection.
   * Does not delete the subscription - use {@link deleteSubscription} for that.
   *
   * @param subscriptionName - Subscription to stop receiving from
   *
   * @example Stopping message processing
   * ```typescript
   * // Start receiving
   * await provider.subscribe('processor', handleMessage);
   *
   * // Later, stop receiving
   * await provider.unsubscribe('processor');
   * ```
   */
  async unsubscribe(subscriptionName: string): Promise<void> {
    return withSpan(
      `${this.providerName}.unsubscribe`,
      async (span: Span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.providerName,
          [INFRASTRUCTURE_ATTRS.OPERATION]: 'unsubscribe',
          'subscription.name': subscriptionName
        });

        try {
          const subscription = this.subscriptions.get(subscriptionName);
          if (subscription) {
            subscription.removeAllListeners();
            this.subscriptions.delete(subscriptionName);
          }

          // Clean up handler tracking
          this.subscriptionHandlers.delete(subscriptionName);

          this.logger.info(`Unsubscribed from: ${subscriptionName}`);
        } catch (error: unknown) {
          this.logger.error('Failed to unsubscribe', {
            subscription: subscriptionName,
            error
          });
        }
      },
      {}
    );
  }

  /**
   * Performs a health check on the Pub/Sub connection.
   *
   * Verifies connectivity by attempting to list topics. Returns true
   * if the connection is healthy, false otherwise.
   *
   * @returns True if healthy, false if connection failed
   *
   * @example Health check endpoint
   * ```typescript
   * app.get('/health/pubsub', async (req, res) => {
   *   const healthy = await provider.healthCheck();
   *   res.status(healthy ? 200 : 503).json({ healthy });
   * });
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
          await this.listTopics();
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
   * Map Topic to ITopicInfo
   */
  private mapTopicInfo(topic: Topic): ITopicInfo {
    const metadata = topic.metadata as IGcpTopicMetadata;
    return {
      name: parseTopicName(topic.name),
      path: topic.name,
      description: metadata?.description,
      messageStoragePolicy: metadata?.messageStoragePolicy,
      kmsKeyName: metadata?.kmsKeyName,
      labels: metadata?.labels
    };
  }

  /**
   * Map Subscription to ISubscriptionInfo
   */
  private mapSubscriptionInfo(subscription: Subscription): ISubscriptionInfo {
    const metadata = subscription.metadata as IGcpSubscriptionMetadata;
    const topicValue = subscription.topic as { name?: string } | string;

    const topicPath = typeof topicValue === 'string' ? topicValue : (topicValue?.name ?? '');

    return {
      name: parseSubscriptionName(subscription.name),
      path: subscription.name,
      topicPath,
      ackDeadlineSeconds: metadata?.ackDeadlineSeconds,
      messageRetentionSeconds: metadata?.messageRetentionSeconds,
      retainAckedMessages: metadata?.retainAckedMessages,
      enableMessageOrdering: metadata?.enableMessageOrdering,
      pushEndpoint: metadata?.pushConfig?.pushEndpoint,
      deadLetterPolicy: metadata?.deadLetterPolicy
        ? {
            deadLetterTopic: parseTopicName(metadata.deadLetterPolicy.deadLetterTopic),
            maxDeliveryAttempts: metadata.deadLetterPolicy.maxDeliveryAttempts
          }
        : undefined
    };
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
      // Preserve original error context and data type information
      const dataType = Array.isArray(data)
        ? `array (${data.length} items)`
        : typeof data === 'object' && data !== null
          ? `object (${Object.keys(data).length} keys)`
          : typeof data;

      this.logger.error('Failed to serialize message data to JSON', {
        error,
        dataType,
        dataKeys: typeof data === 'object' && data !== null ? Object.keys(data) : undefined
      });

      throw new InvalidMessageDataError(
        `Failed to serialize message data to JSON. Data type: ${dataType}. Original error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Check if error is "already exists" error
   */
  private isAlreadyExistsError(error: unknown): boolean {
    return isGcpAlreadyExistsError(error);
  }

  /**
   * Check if error is "not found" error
   */
  private isNotFoundError(error: unknown): boolean {
    return isGcpNotFoundError(error);
  }

  /**
   * Check if error is "permission denied" error
   */
  private isPermissionDeniedError(error: unknown): boolean {
    return isGcpPermissionDeniedError(error);
  }

  /**
   * Clean up expired message tracking entries
   */
  private cleanupExpiredTracking(): void {
    const now = Date.now();
    for (const [messageId, tracking] of this.messageTracking.entries()) {
      if (now - tracking.timestamp > PubSubProvider.MESSAGE_TTL_MS) {
        this.messageTracking.delete(messageId);
        this.logger.debug('Cleaned up expired message tracking', { messageId });
      }
    }
  }

  /**
   * Update circuit breaker state based on message handling success/failure
   * Implements half-open state: requires consecutive successes to fully reset
   */
  private updateCircuitBreaker(subscriptionName: string, isFailure: boolean): void {
    const now = Date.now();
    const state = this.failedMessageTracking.get(subscriptionName) ?? {
      count: 0,
      lastFailure: 0
    };

    if (isFailure) {
      state.count += 1;
      state.lastFailure = now;
      this.failedMessageTracking.set(subscriptionName, state);

      if (state.count >= PubSubProvider.CIRCUIT_BREAKER_THRESHOLD) {
        this.logger.warn('Circuit breaker threshold reached', {
          subscription: subscriptionName,
          failureCount: state.count
        });
      }
    } else {
      // Success handling: implement half-open state
      if (state.count > PubSubProvider.CIRCUIT_BREAKER_THRESHOLD) {
        // Circuit breaker is open, decrement count slowly to test recovery
        // Only decrement after reset timeout has elapsed
        const timeSinceLastFailure = now - state.lastFailure;
        if (timeSinceLastFailure > PubSubProvider.CIRCUIT_BREAKER_RESET_MS) {
          state.count -= 1;
          this.failedMessageTracking.set(subscriptionName, state);

          this.logger.debug('Circuit breaker half-open: success recorded', {
            subscription: subscriptionName,
            remainingFailures: state.count,
            threshold: PubSubProvider.CIRCUIT_BREAKER_THRESHOLD
          });

          // Fully reset when we've had enough consecutive successes
          if (state.count === PubSubProvider.CIRCUIT_BREAKER_THRESHOLD) {
            this.failedMessageTracking.delete(subscriptionName);
            this.logger.info('Circuit breaker fully reset', { subscription: subscriptionName });
          }
        }
      } else if (state.count > 0 && state.count <= PubSubProvider.CIRCUIT_BREAKER_THRESHOLD) {
        // Circuit breaker is closed or in half-open, reset immediately
        this.failedMessageTracking.delete(subscriptionName);
        this.logger.debug('Circuit breaker reset', { subscription: subscriptionName });
      }
    }
  }

  /**
   * Check if circuit breaker is open for a subscription
   */
  private isCircuitBreakerOpen(subscriptionName: string): boolean {
    const state = this.failedMessageTracking.get(subscriptionName);
    if (!state) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastFailure = now - state.lastFailure;

    // Check if we should enter half-open state
    if (state.count >= PubSubProvider.CIRCUIT_BREAKER_THRESHOLD) {
      // Allow messages through after reset timeout (half-open state)
      if (timeSinceLastFailure > PubSubProvider.CIRCUIT_BREAKER_RESET_MS) {
        this.logger.debug('Circuit breaker entering half-open state', {
          subscription: subscriptionName,
          timeSinceLastFailure
        });
        return false; // Allow messages to test recovery
      }
      return true; // Circuit breaker is fully open
    }

    return false;
  }

  /**
   * Attempt to reconnect a subscription with exponential backoff
   * Uses initial error for logging and considers error type for retry strategy
   */
  private async attemptReconnect(
    subscriptionName: string,
    handler: (message: IReceivedMessage) => void | Promise<void>,
    options?: ISubscribeOptions,
    initialError?: unknown
  ): Promise<void> {
    const tracking = this.reconnectAttempts.get(subscriptionName) ?? {
      count: 0,
      lastAttempt: Date.now(),
      error: initialError
    };
    const now = Date.now();

    // Clean up stale reconnect attempts
    if (now - tracking.lastAttempt > PubSubProvider.RECONNECT_TTL_MS) {
      this.logger.debug('Reconnect tracking expired, starting fresh', {
        subscription: subscriptionName,
        lastAttempt: tracking.lastAttempt
      });
      tracking.count = 0;
    }

    // Check if error is non-retryable (e.g., auth errors)
    if (this.isNonRetryableError(initialError)) {
      this.logger.error('Non-retryable error encountered, skipping reconnection', {
        subscription: subscriptionName,
        error: initialError,
        errorType: initialError instanceof Error ? initialError.constructor.name : 'unknown'
      });
      this.reconnectAttempts.delete(subscriptionName);
      return;
    }

    if (tracking.count >= PubSubProvider.MAX_RECONNECT_ATTEMPTS) {
      this.logger.error('Max reconnection attempts reached, giving up', {
        subscription: subscriptionName,
        attempts: tracking.count,
        initialError:
          initialError instanceof Error
            ? {
                message: initialError.message,
                name: initialError.constructor.name
              }
            : initialError
      });
      this.reconnectAttempts.delete(subscriptionName);
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      PubSubProvider.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, tracking.count),
      PubSubProvider.MAX_RECONNECT_DELAY_MS
    );

    this.logger.warn('Attempting to reconnect subscription', {
      subscription: subscriptionName,
      attempt: tracking.count + 1,
      delayMs: delay,
      initialError:
        initialError instanceof Error
          ? {
              message: initialError.message,
              name: initialError.constructor.name
            }
          : initialError
    });

    // Update tracking before attempting reconnect
    tracking.count += 1;
    tracking.lastAttempt = now;
    tracking.error = initialError;
    this.reconnectAttempts.set(subscriptionName, tracking);

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Try to resubscribe
      await this.subscribe(subscriptionName, handler, options);
      this.reconnectAttempts.delete(subscriptionName);
      this.logger.info('Successfully reconnected subscription', {
        subscription: subscriptionName,
        attempts: tracking.count
      });
    } catch (reconnectError) {
      this.logger.error('Reconnection attempt failed', {
        subscription: subscriptionName,
        attempt: tracking.count,
        error: reconnectError
      });

      // Update error and retry (count already incremented before attempt)
      const updatedTracking = this.reconnectAttempts.get(subscriptionName);
      if (updatedTracking) {
        updatedTracking.lastAttempt = Date.now();
        updatedTracking.error = reconnectError;
        this.reconnectAttempts.set(subscriptionName, updatedTracking);
      }

      await this.attemptReconnect(subscriptionName, handler, options, reconnectError);
    }
  }

  /**
   * Check if error is non-retryable (e.g., authentication errors)
   */
  private isNonRetryableError(error: unknown): boolean {
    return isGcpPermissionDeniedError(error);
  }

  /**
   * Clean up stale reconnect attempt tracking
   */
  private cleanupStaleReconnectAttempts(): void {
    const now = Date.now();
    for (const [subscriptionName, tracking] of this.reconnectAttempts.entries()) {
      if (now - tracking.lastAttempt > PubSubProvider.RECONNECT_TTL_MS) {
        this.reconnectAttempts.delete(subscriptionName);
        this.logger.debug('Cleaned up stale reconnect tracking', {
          subscription: subscriptionName,
          lastAttempt: tracking.lastAttempt
        });
      }
    }
  }

  /**
   * Releases all resources held by the provider.
   *
   * Stops the periodic cleanup interval, removes all subscription listeners,
   * and clears internal tracking state. Call this during application shutdown
   * to ensure clean resource cleanup.
   *
   * @example Graceful shutdown
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   logger.info('Shutting down...');
   *   await provider.dispose();
   *   process.exit(0);
   * });
   * ```
   */
  async dispose(): Promise<void> {
    // Stop periodic cleanup
    this.stopPeriodicCleanup();

    // Remove all listeners from subscriptions
    for (const subscription of this.subscriptions.values()) {
      subscription.removeAllListeners();
    }

    // Clear all tracking maps
    this.subscriptions.clear();
    this.topics.clear();
    this.messageTracking.clear();
    this.failedMessageTracking.clear();
    this.reconnectAttempts.clear();
    this.subscriptionHandlers.clear();

    this.logger.info('PubSubProvider disposed');
  }
}

/**
 * @fileoverview Configuration interfaces for Google Cloud Pub/Sub provider.
 *
 * This module defines the type-safe configuration interfaces used to configure
 * topics, subscriptions, message publishing, and subscription handling. These
 * interfaces align with the Google Cloud Pub/Sub API while providing a
 * simplified developer experience.
 *
 * @module @package/pubsub/config/interfaces
 *
 * @example Basic configuration
 * ```typescript
 * import type { IPubSubConfig, ISubscriptionOptions } from '@package/pubsub';
 *
 * const config: IPubSubConfig = {
 *   projectId: 'my-gcp-project',
 *   credentials: {
 *     keyFile: '/path/to/service-account.json'
 *   },
 *   enableTracing: true
 * };
 *
 * const subOptions: ISubscriptionOptions = {
 *   ackDeadlineSeconds: 30,
 *   deadLetterPolicy: {
 *     deadLetterTopic: 'my-dlq',
 *     maxDeliveryAttempts: 5
 *   }
 * };
 * ```
 */

/**
 * Configuration for Dead Letter Queue (DLQ) policy.
 *
 * A Dead Letter Queue captures messages that cannot be processed successfully
 * after a specified number of delivery attempts. This prevents poison messages
 * from blocking the processing of other messages.
 *
 * @example Setting up DLQ
 * ```typescript
 * const deadLetterPolicy: IDeadLetterPolicy = {
 *   deadLetterTopic: 'orders-dlq',
 *   maxDeliveryAttempts: 5
 * };
 *
 * // Messages that fail 5 times are moved to 'orders-dlq'
 * await provider.createSubscription('order-processor', 'orders', {
 *   deadLetterPolicy
 * });
 * ```
 */
export interface IDeadLetterPolicy {
  /**
   * Name of the topic where undeliverable messages are sent.
   *
   * The DLQ topic must exist before creating the subscription.
   * Messages sent to DLQ include original attributes plus delivery metadata.
   */
  deadLetterTopic: string;

  /**
   * Maximum number of delivery attempts before routing to DLQ.
   *
   * Valid range: 5-100. After this many failed deliveries (nacks or
   * ack deadline expirations), the message is forwarded to the dead
   * letter topic.
   */
  maxDeliveryAttempts: number;
}

/**
 * @deprecated Use {@link IDeadLetterPolicy} instead. This alias is maintained for backward compatibility.
 */
export type DeadLetterPolicy = IDeadLetterPolicy;

/**
 * Configuration for message retry policy with exponential backoff.
 *
 * Controls the delay between message redeliveries when messages are
 * negatively acknowledged. Uses exponential backoff within the
 * specified bounds.
 *
 * @example Custom retry policy
 * ```typescript
 * const retryPolicy: IRetryPolicy = {
 *   minimumBackoffInSeconds: 10,  // Start with 10s delay
 *   maximumBackoffInSeconds: 600  // Cap at 10 minutes
 * };
 *
 * await provider.createSubscription('worker', 'jobs', {
 *   retryPolicy
 * });
 * ```
 */
export interface IRetryPolicy {
  /**
   * Minimum delay between delivery attempts in seconds.
   *
   * The initial retry delay after a nack. Must be between 0 and 600.
   * Default: 10 seconds.
   */
  minimumBackoffInSeconds?: number;

  /**
   * Maximum delay between delivery attempts in seconds.
   *
   * The upper bound for exponential backoff. Must be between 0 and 600,
   * and >= minimumBackoffInSeconds. Default: 600 seconds (10 minutes).
   */
  maximumBackoffInSeconds?: number;
}

/**
 * @deprecated Use {@link IRetryPolicy} instead. This alias is maintained for backward compatibility.
 */
export type RetryPolicy = IRetryPolicy;

/**
 * Configuration for push-based message delivery.
 *
 * Instead of the subscriber pulling messages, Pub/Sub pushes messages
 * to a webhook endpoint. This is useful for serverless architectures
 * where you don't want to maintain long-running connections.
 *
 * @example HTTPS push endpoint with authentication
 * ```typescript
 * const pushConfig: IPushConfig = {
 *   pushEndpoint: 'https://my-app.run.app/pubsub/handler',
 *   oidcToken: {
 *     serviceAccountEmail: 'pubsub-push@project.iam.gserviceaccount.com',
 *     audience: 'https://my-app.run.app'
 *   },
 *   attributes: {
 *     'x-custom-header': 'value'
 *   }
 * };
 *
 * await provider.createSubscription('webhook-sub', 'events', {
 *   pushConfig
 * });
 * ```
 */
export interface IPushConfig {
  /**
   * HTTPS endpoint URL where messages will be pushed.
   *
   * Must be a valid HTTPS URL. The endpoint receives POST requests
   * with the message in the request body.
   */
  pushEndpoint: string;

  /**
   * OIDC token configuration for authenticated push.
   *
   * When configured, Pub/Sub includes an Authorization header with
   * a signed JWT that can be verified by the receiving endpoint.
   */
  oidcToken?: {
    /** Service account email used to generate the OIDC token */
    serviceAccountEmail: string;
    /** Optional audience claim for the token (defaults to pushEndpoint) */
    audience?: string;
  };

  /**
   * Custom attributes added to the push request as HTTP headers.
   *
   * Keys must be valid HTTP header names. Values are passed as-is.
   */
  attributes?: Record<string, string>;
}

/**
 * @deprecated Use {@link IPushConfig} instead. This alias is maintained for backward compatibility.
 */
export type PushConfig = IPushConfig;

/**
 * Supported message data formats for publishing.
 *
 * Messages can be published as:
 * - **Buffer**: Raw binary data (most efficient for binary payloads)
 * - **string**: UTF-8 encoded text
 * - **object**: JSON-serializable object (automatically serialized)
 *
 * @example Different message data formats
 * ```typescript
 * // JSON object (most common)
 * await provider.publish('events', {
 *   type: 'user.created',
 *   payload: { userId: '123', accountType: 'premium' }
 * });
 *
 * // Raw string
 * await provider.publish('logs', 'Application started successfully');
 *
 * // Binary data
 * const imageBuffer = await fs.readFile('image.png');
 * await provider.publish('images', imageBuffer, {
 *   attributes: { contentType: 'image/png' }
 * });
 * ```
 */
export type MessageData = string | Record<string, unknown> | Buffer;

/**
 * Structure of a message to be published.
 *
 * This interface represents the full message structure including
 * metadata. In most cases, you'll use the simpler `publish(topic, data, options)`
 * method instead of constructing this manually.
 *
 * @example Using IPubSubMessage directly
 * ```typescript
 * const message: IPubSubMessage = {
 *   data: { orderId: '12345', status: 'completed' },
 *   attributes: {
 *     'event-type': 'order.completed',
 *     'correlation-id': 'abc-123'
 *   },
 *   orderingKey: 'customer-789' // Ensures ordering for this customer
 * };
 * ```
 */
export interface IPubSubMessage {
  /**
   * The message payload.
   *
   * Can be a Buffer, string, or JSON-serializable object.
   * Maximum size: 10MB (including attributes).
   */
  data: MessageData;

  /**
   * Key-value metadata attached to the message.
   *
   * Useful for filtering, routing, and adding context without
   * modifying the message body. Keys and values must be strings.
   */
  attributes?: Record<string, string>;

  /**
   * Key for message ordering within a topic.
   *
   * Messages with the same ordering key are delivered in publish order.
   * Different ordering keys may be delivered in parallel.
   * Note: Requires `enableMessageOrdering: true` on the subscription.
   */
  orderingKey?: string;

  /**
   * Unique message identifier.
   *
   * Auto-generated by Pub/Sub when publishing. Useful for
   * idempotency and deduplication tracking.
   */
  messageId?: string;

  /**
   * Timestamp when the message was published.
   *
   * Auto-set by Pub/Sub. Useful for message age monitoring
   * and time-based filtering.
   */
  publishTime?: Date;
}

/**
 * @deprecated Use {@link IPubSubMessage} instead. This alias is maintained for backward compatibility.
 */
export type PubSubMessage = IPubSubMessage;

/**
 * Message received from a subscription with acknowledgment methods.
 *
 * When processing messages, you must call either `ack()` or `nack()` to
 * indicate whether processing was successful. If neither is called before
 * the ack deadline, the message is automatically redelivered.
 *
 * @example Processing received messages
 * ```typescript
 * await provider.subscribe('my-subscription', async (message) => {
 *   try {
 *     // Parse the message data
 *     const payload = JSON.parse(message.data.toString());
 *
 *     // Check for duplicate processing
 *     if (await isDuplicate(message.messageId)) {
 *       await message.ack(); // Already processed
 *       return;
 *     }
 *
 *     // Process the message
 *     await processOrder(payload);
 *
 *     // Acknowledge successful processing
 *     await message.ack();
 *   } catch (error) {
 *     if (isTransientError(error)) {
 *       // Requeue for retry
 *       await message.nack();
 *     } else {
 *       // Permanent failure - ack to prevent redelivery
 *       // (message will go to DLQ if configured)
 *       logger.error('Permanent failure', { messageId: message.messageId });
 *       await message.ack();
 *     }
 *   }
 * });
 * ```
 */
export interface IReceivedMessage {
  /**
   * Unique identifier for this message.
   *
   * Generated by Pub/Sub at publish time. Useful for logging,
   * deduplication, and tracking.
   */
  messageId: string;

  /**
   * The message payload as a Buffer.
   *
   * Use `message.data.toString()` for text data, or
   * `JSON.parse(message.data.toString())` for JSON data.
   */
  data: Buffer;

  /**
   * Key-value metadata attached to the message.
   *
   * Contains attributes set by the publisher. Useful for
   * routing and filtering without parsing the message body.
   */
  attributes?: Record<string, string>;

  /**
   * Ordering key if message ordering is enabled.
   *
   * Messages with the same key are delivered in order.
   */
  orderingKey?: string;

  /**
   * Timestamp when the message was published.
   *
   * Use for message age monitoring and time-based logic.
   */
  publishTime?: Date;

  /**
   * Number of times this message has been delivered.
   *
   * Starts at 1 for the first delivery. Useful for implementing
   * custom retry logic or detecting stuck messages.
   */
  deliveryAttempt?: number;

  /**
   * Internal acknowledgment ID for this delivery.
   *
   * Used by the Pub/Sub client to acknowledge or reject the message.
   * This value changes with each delivery attempt.
   */
  ackId: string;

  /**
   * Acknowledges successful message processing.
   *
   * After calling `ack()`, the message is removed from the subscription
   * and will not be redelivered. Call this after successfully processing
   * the message.
   *
   * @returns Promise that resolves when acknowledgment is confirmed
   * @throws {@link MessageAckFailedError} if acknowledgment fails
   */
  ack(): Promise<void>;

  /**
   * Negatively acknowledges the message for redelivery.
   *
   * After calling `nack()`, the message becomes available for redelivery
   * immediately (subject to retry policy backoff). Use when you want to
   * retry processing the message.
   *
   * @returns Promise that resolves when nack is confirmed
   * @throws {@link MessageNackFailedError} if nack fails
   */
  nack(): Promise<void>;

  /**
   * Extends or reduces the acknowledgment deadline.
   *
   * Call this if processing takes longer than expected. The deadline
   * is relative to the current time, not the original deadline.
   *
   * @param deadlineSeconds - New deadline in seconds (0-600)
   * @returns Promise that resolves when deadline is modified
   *
   * @example Extending deadline for long-running tasks
   * ```typescript
   * await provider.subscribe('heavy-jobs', async (message) => {
   *   // Extend deadline to 10 minutes for heavy processing
   *   await message.modifyAckDeadline(600);
   *
   *   await processHeavyTask(message.data);
   *   await message.ack();
   * });
   * ```
   */
  modifyAckDeadline(deadlineSeconds: number): Promise<void>;
}

/**
 * @deprecated Use {@link IReceivedMessage} instead. This alias is maintained for backward compatibility.
 */
export type ReceivedMessage = IReceivedMessage;

/**
 * Options for creating a new topic.
 *
 * Topics are named resources that act as feeds of messages. Publishers
 * send messages to topics, and subscribers receive messages from
 * subscriptions attached to topics.
 *
 * @example Creating a topic with regional storage
 * ```typescript
 * const topicOptions: ITopicOptions = {
 *   description: 'Order events for the e-commerce platform',
 *   messageStoragePolicy: {
 *     allowedPersistenceRegions: ['us-central1', 'us-east1']
 *   },
 *   labels: {
 *     environment: 'production',
 *     team: 'orders'
 *   }
 * };
 *
 * await provider.createTopic('order-events', topicOptions);
 * ```
 *
 * @example Creating a topic with CMEK encryption
 * ```typescript
 * await provider.createTopic('sensitive-data', {
 *   description: 'PII and sensitive customer data',
 *   kmsKeyName: 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/my-key'
 * });
 * ```
 */
export interface ITopicOptions {
  /**
   * Human-readable description of the topic.
   *
   * Useful for documentation and understanding topic purpose.
   * Maximum length: 1000 characters.
   */
  description?: string;

  /**
   * Regions where messages may be stored.
   *
   * Controls data residency by restricting message storage to
   * specific GCP regions. Required for compliance with data
   * sovereignty regulations.
   */
  messageStoragePolicy?: {
    /**
     * List of GCP regions where messages can be stored.
     *
     * Example: `['us-central1', 'us-east1', 'europe-west1']`
     */
    allowedPersistenceRegions?: string[];
  };

  /**
   * Cloud KMS key for encrypting messages at rest.
   *
   * Use Customer-Managed Encryption Keys (CMEK) for additional
   * control over message encryption. Format:
   * `projects/{project}/locations/{location}/keyRings/{keyRing}/cryptoKeys/{key}`
   */
  kmsKeyName?: string;

  /**
   * Labels for organizing and filtering topics.
   *
   * Key-value pairs for categorization and cost allocation.
   * Keys must be lowercase, start with a letter, and contain
   * only letters, numbers, hyphens, and underscores.
   */
  labels?: Record<string, string>;
}

/**
 * @deprecated Use {@link ITopicOptions} instead. This alias is maintained for backward compatibility.
 */
export type TopicOptions = ITopicOptions;

/**
 * Options for creating a new subscription.
 *
 * Subscriptions represent the stream of messages from a topic to a
 * subscriber application. Each subscription receives a copy of every
 * message published to its topic.
 *
 * @example Creating a subscription with DLQ and retry policy
 * ```typescript
 * const subscriptionOptions: ISubscriptionOptions = {
 *   description: 'Processes order events for fulfillment',
 *   ackDeadlineSeconds: 60,
 *   messageRetentionSeconds: 604800, // 7 days
 *   deadLetterPolicy: {
 *     deadLetterTopic: 'orders-dlq',
 *     maxDeliveryAttempts: 5
 *   },
 *   retryPolicy: {
 *     minimumBackoffInSeconds: 10,
 *     maximumBackoffInSeconds: 600
 *   },
 *   enableMessageOrdering: true,
 *   labels: {
 *     service: 'fulfillment',
 *     environment: 'production'
 *   }
 * };
 *
 * await provider.createSubscription('fulfillment-worker', 'orders', subscriptionOptions);
 * ```
 *
 * @example Creating a filtered subscription
 * ```typescript
 * // Only receive messages where attributes.priority = "high"
 * await provider.createSubscription('priority-handler', 'events', {
 *   filter: 'attributes.priority = "high"'
 * });
 * ```
 */
export interface ISubscriptionOptions {
  /**
   * Human-readable description of the subscription.
   *
   * Useful for documentation and understanding subscription purpose.
   */
  description?: string;

  /**
   * Time limit for acknowledging messages in seconds.
   *
   * After this deadline, unacknowledged messages are redelivered.
   * Range: 10-600 seconds. Default: 60 seconds.
   * Choose based on your message processing time.
   */
  ackDeadlineSeconds?: number;

  /**
   * How long to retain unacknowledged messages in seconds.
   *
   * Messages older than this are automatically dropped.
   * Range: 600 (10 min) to 604800 (7 days). Default: 604800.
   */
  messageRetentionSeconds?: number;

  /**
   * Whether to keep messages after acknowledgment.
   *
   * When true, acknowledged messages are retained for the
   * retention duration. Useful for replay and audit scenarios.
   * Default: false.
   */
  retainAckedMessages?: boolean;

  /**
   * Configuration for Dead Letter Queue.
   *
   * Routes messages that fail processing to a separate topic
   * after exceeding the maximum delivery attempts.
   */
  deadLetterPolicy?: IDeadLetterPolicy;

  /**
   * Retry policy with exponential backoff configuration.
   *
   * Controls the delay between message redeliveries after nacks.
   */
  retryPolicy?: IRetryPolicy;

  /**
   * Push delivery configuration.
   *
   * When set, messages are pushed to an HTTPS endpoint instead
   * of being pulled by the subscriber.
   */
  pushConfig?: IPushConfig;

  /**
   * Enable ordered message delivery.
   *
   * When true, messages with the same ordering key are delivered
   * in publish order. Requires publishers to set ordering keys.
   * Default: false.
   */
  enableMessageOrdering?: boolean;

  /**
   * Filter expression for message selection.
   *
   * Only messages matching the filter are delivered. Uses a subset
   * of SQL syntax. Example: `attributes.type = "order" AND attributes.priority = "high"`
   */
  filter?: string;

  /**
   * Labels for organizing and filtering subscriptions.
   *
   * Key-value pairs for categorization and cost allocation.
   */
  labels?: Record<string, string>;
}

/**
 * @deprecated Use {@link ISubscriptionOptions} instead. This alias is maintained for backward compatibility.
 */
export type SubscriptionOptions = ISubscriptionOptions;

/**
 * Function signature for message handlers.
 *
 * Message handlers receive {@link IReceivedMessage} objects and process them.
 * Handlers can be synchronous or asynchronous. For async handlers, the
 * provider waits for the returned Promise to resolve.
 *
 * @example Async message handler
 * ```typescript
 * const handler: IMessageHandler = async (message) => {
 *   const data = JSON.parse(message.data.toString());
 *   await processEvent(data);
 *   await message.ack();
 * };
 *
 * await provider.subscribe('my-subscription', handler);
 * ```
 */
export type IMessageHandler = (message: IReceivedMessage) => void | Promise<void>;

/**
 * @deprecated Use {@link IMessageHandler} instead. This alias is maintained for backward compatibility.
 */
export type MessageHandler = IMessageHandler;

/**
 * Options for publishing messages.
 *
 * These options control message delivery behavior including ordering,
 * metadata, and timeout settings.
 *
 * @example Publishing with ordering and attributes
 * ```typescript
 * const publishOptions: IPublishOptions = {
 *   orderingKey: `customer-${customerId}`,
 *   attributes: {
 *     'event-type': 'order.created',
 *     'correlation-id': correlationId,
 *     'source': 'checkout-service'
 *   },
 *   timeout: 5000 // 5 second timeout
 * };
 *
 * await provider.publish('orders', orderData, publishOptions);
 * ```
 */
export interface IPublishOptions {
  /**
   * Key for message ordering.
   *
   * Messages with the same ordering key are delivered in publish order
   * to subscriptions that have `enableMessageOrdering: true`.
   * Use entity IDs (e.g., customer ID, order ID) to ensure related
   * messages are processed sequentially.
   */
  orderingKey?: string;

  /**
   * Key-value metadata attached to the message.
   *
   * Attributes are delivered alongside the message body and can be used
   * for filtering, routing, and context. All values must be strings.
   * Maximum: 100 attributes, 256 bytes per key, 1024 bytes per value.
   */
  attributes?: Record<string, string>;

  /**
   * Maximum time to wait for publish confirmation in milliseconds.
   *
   * If the publish operation takes longer than this, it fails with
   * a timeout error. Default: uses provider's configured timeout.
   */
  timeout?: number;
}

/**
 * @deprecated Use {@link IPublishOptions} instead. This alias is maintained for backward compatibility.
 */
export type PublishOptions = IPublishOptions;

/**
 * Options for subscribing to messages.
 *
 * These options control how messages are pulled, buffered, and processed.
 * Proper configuration is essential for optimal throughput and resource usage.
 *
 * @example High-throughput subscription configuration
 * ```typescript
 * const subscribeOptions: ISubscribeOptions = {
 *   flowControl: {
 *     maxMessages: 1000,        // Process up to 1000 messages concurrently
 *     maxBytes: 100 * 1024 * 1024  // 100MB buffer
 *   },
 *   streamingOptions: {
 *     maxOutstandingMessages: 500,
 *     maxOutstandingBytes: 50 * 1024 * 1024  // 50MB outstanding
 *   },
 *   handlerTimeout: 60000,  // 1 minute timeout per message
 *   autoAck: true           // Auto-ack on successful handler completion
 * };
 *
 * await provider.subscribe('high-volume-sub', processMessage, subscribeOptions);
 * ```
 *
 * @example Low-latency subscription configuration
 * ```typescript
 * await provider.subscribe('realtime-sub', handleEvent, {
 *   flowControl: {
 *     maxMessages: 10,  // Low concurrency for predictable latency
 *     maxBytes: 1024 * 1024  // 1MB buffer
 *   },
 *   handlerTimeout: 5000,  // Fail fast
 *   autoAck: false  // Manual ack for precise control
 * });
 * ```
 */
export interface ISubscribeOptions {
  /**
   * Flow control settings for message delivery.
   *
   * Controls the rate at which messages are delivered to the handler.
   * Use to prevent memory exhaustion and maintain stable throughput.
   */
  flowControl?: {
    /**
     * Maximum number of messages processed simultaneously.
     *
     * The client pauses pulling when this limit is reached and resumes
     * when messages are acknowledged. Default: 100.
     */
    maxMessages?: number;

    /**
     * Maximum bytes of message data buffered locally.
     *
     * Prevents memory exhaustion when processing large messages.
     * Default: 100MB (104857600 bytes).
     */
    maxBytes?: number;
  };

  /**
   * Streaming pull options for advanced tuning.
   *
   * Fine-grained control over the streaming pull connection.
   * Most applications should use flowControl instead.
   */
  streamingOptions?: {
    /**
     * Maximum outstanding messages awaiting processing.
     *
     * Messages pulled from Pub/Sub but not yet delivered to handler.
     */
    maxOutstandingMessages?: number;

    /**
     * Maximum outstanding bytes awaiting processing.
     */
    maxOutstandingBytes?: number;

    /**
     * Maximum total bytes including internal buffers.
     *
     * Includes both outstanding and buffered messages.
     */
    maxTotalOutstandingBytes?: number;
  };

  /**
   * Maximum time allowed for message handler execution in milliseconds.
   *
   * If the handler doesn't complete within this time, it's considered
   * failed and the message is nacked for redelivery. Use to prevent
   * stuck handlers from blocking message processing.
   * Default: 300000 (5 minutes).
   */
  handlerTimeout?: number;

  /**
   * Automatically acknowledge messages after successful handler completion.
   *
   * When true, messages are acked after the handler returns/resolves
   * without throwing. When false, you must call `message.ack()` manually.
   * Default: true.
   *
   * Set to false when you need:
   * - Custom ack timing (e.g., after database commit)
   * - Conditional acking based on handler result
   * - Batch acknowledgments
   */
  autoAck?: boolean;
}

/**
 * @deprecated Use {@link ISubscribeOptions} instead. This alias is maintained for backward compatibility.
 */
export type SubscribeOptions = ISubscribeOptions;

/**
 * Configuration for the Pub/Sub provider.
 *
 * This interface defines all settings needed to initialize a Pub/Sub provider,
 * including authentication, defaults, and behavior settings.
 *
 * @example Production configuration
 * ```typescript
 * const config: IPubSubConfig = {
 *   projectId: 'my-production-project',
 *   credentials: {
 *     keyFile: '/etc/secrets/pubsub-key.json'
 *   },
 *   enableTracing: true,
 *   timeout: 30000,
 *   maxRetries: 5,
 *   defaultAckDeadlineSeconds: 60,
 *   defaultMessageRetentionSeconds: 604800 // 7 days
 * };
 *
 * const provider = createPubSubProvider(config);
 * ```
 *
 * @example Development configuration with inline credentials
 * ```typescript
 * const config: IPubSubConfig = {
 *   projectId: process.env.GCP_PROJECT_ID!,
 *   credentials: {
 *     clientEmail: process.env.GCP_CLIENT_EMAIL,
 *     privateKey: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n')
 *   },
 *   enableTracing: false,
 *   testMode: false
 * };
 * ```
 *
 * @example Test configuration using mock provider
 * ```typescript
 * const testConfig: IPubSubConfig = {
 *   projectId: 'test-project',
 *   testMode: true  // Uses MockPubSubProvider
 * };
 *
 * const provider = createPubSubProvider(testConfig);
 * // No GCP credentials needed!
 * ```
 */
export interface IPubSubConfig {
  /**
   * Google Cloud project ID.
   *
   * The GCP project containing your Pub/Sub topics and subscriptions.
   * This is the only required field - credentials can be auto-detected.
   */
  projectId: string;

  /**
   * Default topic name for operations that don't specify a topic.
   *
   * Optional convenience setting for applications that primarily
   * work with a single topic.
   */
  topicName?: string;

  /**
   * Default subscription name for operations that don't specify one.
   *
   * Optional convenience setting for applications that primarily
   * work with a single subscription.
   */
  subscriptionName?: string;

  /**
   * Authentication credentials for GCP.
   *
   * If not provided, the provider uses Application Default Credentials (ADC),
   * which automatically discovers credentials from the environment.
   */
  credentials?: {
    /**
     * Service account email address.
     *
     * Required when using inline credentials (with privateKey).
     * Example: `pubsub@project.iam.gserviceaccount.com`
     */
    clientEmail?: string;

    /**
     * Service account private key in PEM format.
     *
     * Required when using inline credentials (with clientEmail).
     * Note: Replace `\n` with actual newlines in the key string.
     */
    privateKey?: string;

    /**
     * Path to a service account key file (JSON).
     *
     * Alternative to inline credentials. The file should be the JSON
     * key file downloaded from GCP Console.
     */
    keyFile?: string;
  };

  /**
   * Enable OpenTelemetry distributed tracing.
   *
   * When true, all Pub/Sub operations create trace spans for
   * observability. Requires OpenTelemetry to be configured.
   * Default: true.
   */
  enableTracing?: boolean;

  /**
   * API operation timeout in milliseconds.
   *
   * Maximum time to wait for Pub/Sub API operations (create, delete,
   * list, etc.). Default: 60000 (1 minute).
   */
  timeout?: number;

  /**
   * Maximum retry attempts for transient failures.
   *
   * Number of times to retry failed API calls before giving up.
   * Uses exponential backoff between retries. Default: 3.
   */
  maxRetries?: number;

  /**
   * Enable test mode using in-memory mock provider.
   *
   * When true, operations use {@link MockPubSubProvider} instead of
   * the real GCP client. No credentials or network access required.
   * Default: false.
   */
  testMode?: boolean;

  /**
   * Default acknowledgment deadline for new subscriptions in seconds.
   *
   * Applied when creating subscriptions without explicit ackDeadlineSeconds.
   * Range: 10-600. Default: 60 seconds.
   */
  defaultAckDeadlineSeconds?: number;

  /**
   * Default message retention for new subscriptions in seconds.
   *
   * Applied when creating subscriptions without explicit messageRetentionSeconds.
   * Default: 604800 (7 days).
   */
  defaultMessageRetentionSeconds?: number;

  /**
   * Interval for cleaning up expired internal tracking data in milliseconds.
   *
   * The provider maintains internal state for circuit breakers and
   * reconnection tracking. This setting controls how often stale
   * entries are purged. Default: 300000 (5 minutes).
   */
  cleanupIntervalMs?: number;
}

/**
 * @deprecated Use {@link IPubSubConfig} instead. This alias is maintained for backward compatibility.
 */
export type PubSubConfig = IPubSubConfig;

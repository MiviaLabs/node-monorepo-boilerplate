/**
 * @fileoverview Custom error types for Google Cloud Pub/Sub operations.
 *
 * This module provides a comprehensive error hierarchy for Pub/Sub operations,
 * enabling precise error handling and recovery strategies. All errors extend
 * {@link InfrastructureError} from `@package/core` for consistent error handling
 * across the infrastructure layer.
 *
 * @module @package/pubsub/errors
 *
 * @example Handling specific error types
 * ```typescript
 * import {
 *   TopicNotFoundError,
 *   PublishFailedError,
 *   PubSubErrorCode
 * } from '@package/pubsub';
 *
 * try {
 *   await provider.publish('my-topic', { event: 'user.created' });
 * } catch (error) {
 *   if (error instanceof TopicNotFoundError) {
 *     // Topic doesn't exist - create it first
 *     await provider.createTopic('my-topic');
 *     await provider.publish('my-topic', { event: 'user.created' });
 *   } else if (error instanceof PublishFailedError) {
 *     // Transient failure - retry with backoff
 *     await retryWithBackoff(() => provider.publish('my-topic', data));
 *   }
 * }
 * ```
 *
 * @example Using error codes for switch-case handling
 * ```typescript
 * import { PubSubError, PubSubErrorCode } from '@package/pubsub';
 *
 * catch (error) {
 *   if (error instanceof PubSubError) {
 *     switch (error.code) {
 *       case PubSubErrorCode.TOPIC_NOT_FOUND:
 *         // Handle missing topic
 *         break;
 *       case PubSubErrorCode.PERMISSION_DENIED:
 *         // Handle permission issues
 *         break;
 *       default:
 *         // Generic error handling
 *     }
 *   }
 * }
 * ```
 */

import { InfrastructureError } from '@package/core';

/**
 * Enumeration of all Pub/Sub-specific error codes.
 *
 * These codes provide a type-safe way to identify specific error conditions
 * and implement targeted error handling logic. Each code corresponds to a
 * specific error class in this module.
 *
 * @example Checking error codes
 * ```typescript
 * if (error.code === PubSubErrorCode.TOPIC_NOT_FOUND) {
 *   console.log('Topic does not exist');
 * }
 * ```
 */
export enum PubSubErrorCode {
  /** Requested topic does not exist in the project */
  TOPIC_NOT_FOUND = 'PUBSUB_TOPIC_NOT_FOUND',
  /** Topic with the specified name already exists */
  TOPIC_ALREADY_EXISTS = 'PUBSUB_TOPIC_ALREADY_EXISTS',
  /** Requested subscription does not exist in the project */
  SUBSCRIPTION_NOT_FOUND = 'PUBSUB_SUBSCRIPTION_NOT_FOUND',
  /** Subscription with the specified name already exists */
  SUBSCRIPTION_ALREADY_EXISTS = 'PUBSUB_SUBSCRIPTION_ALREADY_EXISTS',
  /** Message publishing operation failed */
  PUBLISH_FAILED = 'PUBSUB_PUBLISH_FAILED',
  /** Subscription attachment or message receiving failed */
  SUBSCRIBE_FAILED = 'PUBSUB_SUBSCRIBE_FAILED',
  /** Message acknowledgment operation failed */
  MESSAGE_ACK_FAILED = 'PUBSUB_MESSAGE_ACK_FAILED',
  /** Message negative acknowledgment operation failed */
  MESSAGE_NACK_FAILED = 'PUBSUB_MESSAGE_NACK_FAILED',
  /** Message data format is invalid or cannot be serialized */
  INVALID_MESSAGE_DATA = 'PUBSUB_INVALID_MESSAGE_DATA',
  /** Provider configuration is invalid or incomplete */
  INVALID_CONFIG = 'PUBSUB_INVALID_CONFIG',
  /** Topic creation operation failed */
  TOPIC_CREATION_FAILED = 'PUBSUB_TOPIC_CREATION_FAILED',
  /** Topic deletion operation failed */
  TOPIC_DELETION_FAILED = 'PUBSUB_TOPIC_DELETION_FAILED',
  /** Subscription creation operation failed */
  SUBSCRIPTION_CREATION_FAILED = 'PUBSUB_SUBSCRIPTION_CREATION_FAILED',
  /** Subscription deletion operation failed */
  SUBSCRIPTION_DELETION_FAILED = 'PUBSUB_SUBSCRIPTION_DELETION_FAILED',
  /** GCP authentication or credential validation failed */
  AUTHENTICATION_FAILED = 'PUBSUB_AUTHENTICATION_FAILED',
  /** IAM permission check failed for the requested operation */
  PERMISSION_DENIED = 'PUBSUB_PERMISSION_DENIED',
  /** Dead Letter Queue configuration or delivery failed */
  DEAD_LETTER_QUEUE_FAILED = 'PUBSUB_DEAD_LETTER_QUEUE_FAILED'
}

/**
 * Base error class for all Pub/Sub operations.
 *
 * This class extends {@link InfrastructureError} and serves as the parent
 * for all specialized Pub/Sub error types. Use `instanceof PubSubError` to
 * catch any Pub/Sub-related error.
 *
 * @extends InfrastructureError
 *
 * @example Catching all Pub/Sub errors
 * ```typescript
 * try {
 *   await provider.publish('topic', data);
 * } catch (error) {
 *   if (error instanceof PubSubError) {
 *     logger.error('Pub/Sub operation failed', {
 *       code: error.code,
 *       message: error.message
 *     });
 *   }
 * }
 * ```
 */
export class PubSubError extends InfrastructureError {
  /**
   * Creates a new PubSubError instance.
   *
   * @param message - Human-readable error description
   * @param code - Specific error code from {@link PubSubErrorCode}
   */
  constructor(message: string, code: PubSubErrorCode = PubSubErrorCode.PUBLISH_FAILED) {
    super(message, code);
    this.name = 'PubSubError';
  }
}

/**
 * Error thrown when a requested topic does not exist.
 *
 * This error occurs when attempting to perform operations on a topic
 * that hasn't been created or has been deleted. Common scenarios include:
 * - Publishing to a non-existent topic
 * - Creating a subscription for a non-existent topic
 * - Getting or deleting a topic that doesn't exist
 *
 * @extends PubSubError
 *
 * @example Handling topic not found
 * ```typescript
 * try {
 *   await provider.publish('orders', orderData);
 * } catch (error) {
 *   if (error instanceof TopicNotFoundError) {
 *     // Create the topic and retry
 *     await provider.createTopic('orders');
 *     await provider.publish('orders', orderData);
 *   }
 * }
 * ```
 */
export class TopicNotFoundError extends PubSubError {
  /**
   * Creates a new TopicNotFoundError instance.
   *
   * @param topicName - Name of the topic that was not found
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(topicName: string, _details?: Record<string, unknown>) {
    super(`Topic not found: ${topicName}`, PubSubErrorCode.TOPIC_NOT_FOUND);
    this.name = 'TopicNotFoundError';
  }
}

/**
 * Error thrown when attempting to create a topic that already exists.
 *
 * This error indicates a naming conflict. The provider's `createTopic` method
 * handles this gracefully by returning the existing topic info when the topic
 * already exists with the same configuration.
 *
 * @extends PubSubError
 *
 * @example Idempotent topic creation
 * ```typescript
 * try {
 *   await provider.createTopic('notifications');
 * } catch (error) {
 *   if (error instanceof TopicAlreadyExistsError) {
 *     // Topic exists - this is fine, get its info
 *     const topicInfo = await provider.getTopic('notifications');
 *     console.log('Using existing topic:', topicInfo.path);
 *   }
 * }
 * ```
 */
export class TopicAlreadyExistsError extends PubSubError {
  /**
   * Creates a new TopicAlreadyExistsError instance.
   *
   * @param topicName - Name of the topic that already exists
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(topicName: string, _details?: Record<string, unknown>) {
    super(`Topic already exists: ${topicName}`, PubSubErrorCode.TOPIC_ALREADY_EXISTS);
    this.name = 'TopicAlreadyExistsError';
  }
}

/**
 * Error thrown when a requested subscription does not exist.
 *
 * This error occurs when attempting to perform operations on a subscription
 * that hasn't been created or has been deleted. Common scenarios include:
 * - Subscribing to messages from a non-existent subscription
 * - Getting or deleting a subscription that doesn't exist
 *
 * @extends PubSubError
 *
 * @example Handling subscription not found
 * ```typescript
 * try {
 *   await provider.subscribe('order-processor', handleMessage);
 * } catch (error) {
 *   if (error instanceof SubscriptionNotFoundError) {
 *     // Create the subscription first
 *     await provider.createSubscription('order-processor', 'orders');
 *     await provider.subscribe('order-processor', handleMessage);
 *   }
 * }
 * ```
 */
export class SubscriptionNotFoundError extends PubSubError {
  /**
   * Creates a new SubscriptionNotFoundError instance.
   *
   * @param subscriptionName - Name of the subscription that was not found
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(`Subscription not found: ${subscriptionName}`, PubSubErrorCode.SUBSCRIPTION_NOT_FOUND);
    this.name = 'SubscriptionNotFoundError';
  }
}

/**
 * Error thrown when attempting to create a subscription that already exists.
 *
 * This error indicates a naming conflict with an existing subscription.
 * Unlike topics, subscriptions have configuration that may differ, so
 * this error should be handled explicitly.
 *
 * @extends PubSubError
 *
 * @example Handling existing subscription
 * ```typescript
 * try {
 *   await provider.createSubscription('worker-sub', 'jobs');
 * } catch (error) {
 *   if (error instanceof SubscriptionAlreadyExistsError) {
 *     // Verify the existing subscription is configured correctly
 *     const existing = await provider.getSubscription('worker-sub');
 *     if (existing.topicPath.endsWith('/jobs')) {
 *       console.log('Using existing subscription');
 *     } else {
 *       throw new Error('Subscription exists but for different topic');
 *     }
 *   }
 * }
 * ```
 */
export class SubscriptionAlreadyExistsError extends PubSubError {
  /**
   * Creates a new SubscriptionAlreadyExistsError instance.
   *
   * @param subscriptionName - Name of the subscription that already exists
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(
      `Subscription already exists: ${subscriptionName}`,
      PubSubErrorCode.SUBSCRIPTION_ALREADY_EXISTS
    );
    this.name = 'SubscriptionAlreadyExistsError';
  }
}

/**
 * Error thrown when publishing a message to a topic fails.
 *
 * This error can occur due to various reasons including:
 * - Network connectivity issues
 * - Topic permissions problems
 * - Message size exceeds limits (10MB max)
 * - Timeout during publish operation
 * - GCP service unavailability
 *
 * The provider implements circuit breaker pattern to prevent cascading failures.
 *
 * @extends PubSubError
 *
 * @example Handling publish failures with retry
 * ```typescript
 * async function publishWithRetry(topic: string, data: object, maxRetries = 3) {
 *   for (let attempt = 1; attempt <= maxRetries; attempt++) {
 *     try {
 *       return await provider.publish(topic, data);
 *     } catch (error) {
 *       if (error instanceof PublishFailedError && attempt < maxRetries) {
 *         await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
 *         continue;
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
export class PublishFailedError extends PubSubError {
  /**
   * Creates a new PublishFailedError instance.
   *
   * @param topicName - Name of the topic where publishing failed
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(topicName: string, _details?: Record<string, unknown>) {
    super(`Failed to publish message to topic: ${topicName}`, PubSubErrorCode.PUBLISH_FAILED);
    this.name = 'PublishFailedError';
  }
}

/**
 * Error thrown when subscribing to messages from a subscription fails.
 *
 * This error occurs when the provider cannot establish a streaming pull
 * connection to the subscription. Causes include:
 * - Subscription doesn't exist
 * - Permission denied
 * - Network connectivity issues
 * - GCP service unavailability
 *
 * The provider implements automatic reconnection with exponential backoff.
 *
 * @extends PubSubError
 *
 * @example Handling subscribe failures
 * ```typescript
 * try {
 *   await provider.subscribe('my-subscription', async (message) => {
 *     await processMessage(message);
 *     await message.ack();
 *   });
 * } catch (error) {
 *   if (error instanceof SubscribeFailedError) {
 *     logger.error('Failed to subscribe', { error });
 *     // The provider will attempt automatic reconnection
 *   }
 * }
 * ```
 */
export class SubscribeFailedError extends PubSubError {
  /**
   * Creates a new SubscribeFailedError instance.
   *
   * @param subscriptionName - Name of the subscription that failed
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(`Failed to subscribe to: ${subscriptionName}`, PubSubErrorCode.SUBSCRIBE_FAILED);
    this.name = 'SubscribeFailedError';
  }
}

/**
 * Error thrown when acknowledging a message fails.
 *
 * Message acknowledgment tells Pub/Sub that the message was successfully
 * processed and should not be redelivered. This error typically occurs due to:
 * - Ack deadline expired before acknowledgment
 * - Network issues during ack operation
 * - Invalid ack ID (message already acked or nacked)
 *
 * @extends PubSubError
 *
 * @example Handling ack failures
 * ```typescript
 * await provider.subscribe('my-sub', async (message) => {
 *   try {
 *     await processMessage(message);
 *     await message.ack();
 *   } catch (error) {
 *     if (error instanceof MessageAckFailedError) {
 *       // Message will be redelivered, log for monitoring
 *       logger.warn('Ack failed, message will be redelivered', {
 *         messageId: message.messageId
 *       });
 *     }
 *   }
 * });
 * ```
 */
export class MessageAckFailedError extends PubSubError {
  /**
   * Creates a new MessageAckFailedError instance.
   *
   * @param messageId - ID of the message that failed to acknowledge
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(messageId: string, _details?: Record<string, unknown>) {
    super(`Failed to acknowledge message: ${messageId}`, PubSubErrorCode.MESSAGE_ACK_FAILED);
    this.name = 'MessageAckFailedError';
  }
}

/**
 * Error thrown when negatively acknowledging a message fails.
 *
 * Negative acknowledgment (nack) tells Pub/Sub to redeliver the message
 * immediately. This error typically occurs due to:
 * - Network issues during nack operation
 * - Invalid ack ID
 * - Service unavailability
 *
 * @extends PubSubError
 *
 * @example Handling nack failures
 * ```typescript
 * await provider.subscribe('my-sub', async (message) => {
 *   try {
 *     const result = await processMessage(message);
 *     if (!result.success) {
 *       await message.nack(); // Request redelivery
 *     } else {
 *       await message.ack();
 *     }
 *   } catch (error) {
 *     if (error instanceof MessageNackFailedError) {
 *       logger.error('Nack failed', { messageId: message.messageId });
 *       // Message may or may not be redelivered
 *     }
 *   }
 * });
 * ```
 */
export class MessageNackFailedError extends PubSubError {
  /**
   * Creates a new MessageNackFailedError instance.
   *
   * @param messageId - ID of the message that failed to nack
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(messageId: string, _details?: Record<string, unknown>) {
    super(
      `Failed to negatively acknowledge message: ${messageId}`,
      PubSubErrorCode.MESSAGE_NACK_FAILED
    );
    this.name = 'MessageNackFailedError';
  }
}

/**
 * Error thrown when message data cannot be serialized or is invalid.
 *
 * The provider accepts message data as Buffer, string, or JSON-serializable
 * objects. This error occurs when:
 * - Object contains circular references
 * - Object contains BigInt values without custom serializer
 * - Data exceeds maximum message size (10MB)
 *
 * @extends PubSubError
 *
 * @example Validating message data before publish
 * ```typescript
 * function safePublish(topic: string, data: unknown) {
 *   try {
 *     // Pre-validate by attempting JSON serialization
 *     JSON.stringify(data);
 *     return provider.publish(topic, data);
 *   } catch (error) {
 *     if (error instanceof InvalidMessageDataError) {
 *       logger.error('Invalid message data', { error });
 *       throw new ValidationError('Message data cannot be serialized');
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export class InvalidMessageDataError extends PubSubError {
  /**
   * Creates a new InvalidMessageDataError instance.
   *
   * @param message - Description of the validation error
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(message: string, _details?: Record<string, unknown>) {
    super(`Invalid message data: ${message}`, PubSubErrorCode.INVALID_MESSAGE_DATA);
    this.name = 'InvalidMessageDataError';
  }
}

/**
 * Error thrown when topic creation fails.
 *
 * This error occurs when the Pub/Sub API rejects a topic creation request.
 * Common causes include:
 * - Invalid topic name (must match `^[a-zA-Z][\w-.~+%]*$`)
 * - Quota exceeded for topics in project
 * - Network or service issues
 * - Permission denied (use {@link PermissionDeniedError} for specific handling)
 *
 * Note: {@link TopicAlreadyExistsError} is thrown separately when the topic
 * already exists.
 *
 * @extends PubSubError
 *
 * @example Handling topic creation failures
 * ```typescript
 * try {
 *   await provider.createTopic('my-events', {
 *     labels: { environment: 'production' }
 *   });
 * } catch (error) {
 *   if (error instanceof TopicCreationFailedError) {
 *     logger.error('Could not create topic', { error });
 *     // Check quotas in GCP Console
 *   }
 * }
 * ```
 */
export class TopicCreationFailedError extends PubSubError {
  /**
   * Creates a new TopicCreationFailedError instance.
   *
   * @param topicName - Name of the topic that failed to create
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(topicName: string, _details?: Record<string, unknown>) {
    super(`Failed to create topic: ${topicName}`, PubSubErrorCode.TOPIC_CREATION_FAILED);
    this.name = 'TopicCreationFailedError';
  }
}

/**
 * Error thrown when topic deletion fails.
 *
 * This error occurs when the Pub/Sub API rejects a topic deletion request.
 * Note that deleting a topic does not delete its subscriptions, but those
 * subscriptions will no longer receive messages.
 *
 * @extends PubSubError
 *
 * @example Safe topic deletion
 * ```typescript
 * async function deleteTopic(name: string) {
 *   try {
 *     // List and delete subscriptions first
 *     const subs = await provider.listSubscriptions();
 *     const topicSubs = subs.filter(s => s.topicPath.endsWith(`/${name}`));
 *     await Promise.all(topicSubs.map(s => provider.deleteSubscription(s.name)));
 *
 *     await provider.deleteTopic(name);
 *   } catch (error) {
 *     if (error instanceof TopicDeletionFailedError) {
 *       logger.error('Topic deletion failed', { topic: name, error });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export class TopicDeletionFailedError extends PubSubError {
  /**
   * Creates a new TopicDeletionFailedError instance.
   *
   * @param topicName - Name of the topic that failed to delete
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(topicName: string, _details?: Record<string, unknown>) {
    super(`Failed to delete topic: ${topicName}`, PubSubErrorCode.TOPIC_DELETION_FAILED);
    this.name = 'TopicDeletionFailedError';
  }
}

/**
 * Error thrown when subscription creation fails.
 *
 * This error occurs when the Pub/Sub API rejects a subscription creation request.
 * Common causes include:
 * - Invalid subscription name
 * - Referenced topic doesn't exist (use {@link TopicNotFoundError})
 * - Quota exceeded
 * - Invalid configuration options
 *
 * @extends PubSubError
 *
 * @example Creating subscription with Dead Letter Queue
 * ```typescript
 * try {
 *   // Ensure DLQ topic exists first
 *   await provider.createTopic('orders-dlq');
 *
 *   await provider.createSubscription('order-processor', 'orders', {
 *     deadLetterPolicy: {
 *       deadLetterTopic: 'orders-dlq',
 *       maxDeliveryAttempts: 5
 *     }
 *   });
 * } catch (error) {
 *   if (error instanceof SubscriptionCreationFailedError) {
 *     logger.error('Subscription creation failed', { error });
 *   }
 * }
 * ```
 */
export class SubscriptionCreationFailedError extends PubSubError {
  /**
   * Creates a new SubscriptionCreationFailedError instance.
   *
   * @param subscriptionName - Name of the subscription that failed to create
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(
      `Failed to create subscription: ${subscriptionName}`,
      PubSubErrorCode.SUBSCRIPTION_CREATION_FAILED
    );
    this.name = 'SubscriptionCreationFailedError';
  }
}

/**
 * Error thrown when subscription deletion fails.
 *
 * This error occurs when the Pub/Sub API rejects a subscription deletion request.
 * After deletion, any unacknowledged messages in the subscription are lost.
 *
 * @extends PubSubError
 *
 * @example Graceful subscription deletion
 * ```typescript
 * async function deleteSubscriptionGracefully(name: string) {
 *   try {
 *     // Stop receiving new messages
 *     await provider.unsubscribe(name);
 *
 *     // Wait for in-flight messages to complete
 *     await sleep(5000);
 *
 *     await provider.deleteSubscription(name);
 *   } catch (error) {
 *     if (error instanceof SubscriptionDeletionFailedError) {
 *       logger.error('Could not delete subscription', { name, error });
 *     }
 *   }
 * }
 * ```
 */
export class SubscriptionDeletionFailedError extends PubSubError {
  /**
   * Creates a new SubscriptionDeletionFailedError instance.
   *
   * @param subscriptionName - Name of the subscription that failed to delete
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(
      `Failed to delete subscription: ${subscriptionName}`,
      PubSubErrorCode.SUBSCRIPTION_DELETION_FAILED
    );
    this.name = 'SubscriptionDeletionFailedError';
  }
}

/**
 * Error thrown when GCP authentication fails.
 *
 * This error indicates that the provided credentials are invalid or the
 * authentication process failed. Common causes include:
 * - Invalid service account key file
 * - Expired credentials
 * - Malformed private key
 * - Missing GOOGLE_APPLICATION_CREDENTIALS environment variable
 *
 * @extends PubSubError
 *
 * @example Handling authentication failures
 * ```typescript
 * try {
 *   const provider = createPubSubProvider({
 *     projectId: 'my-project',
 *     credentials: {
 *       clientEmail: 'service@project.iam.gserviceaccount.com',
 *       privateKey: process.env.GCP_PRIVATE_KEY
 *     }
 *   });
 *   await provider.listTopics(); // Triggers auth
 * } catch (error) {
 *   if (error instanceof AuthenticationFailedError) {
 *     console.error('Check your GCP credentials');
 *     // Verify service account key or environment variables
 *   }
 * }
 * ```
 */
export class AuthenticationFailedError extends PubSubError {
  /**
   * Creates a new AuthenticationFailedError instance.
   *
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(_details?: Record<string, unknown>) {
    super(
      'Pub/Sub authentication failed. Check your credentials.',
      PubSubErrorCode.AUTHENTICATION_FAILED
    );
    this.name = 'AuthenticationFailedError';
  }
}

/**
 * Error thrown when IAM permission check fails for a Pub/Sub operation.
 *
 * This error indicates that the service account has authenticated successfully
 * but lacks the necessary IAM permissions. Required roles include:
 * - `roles/pubsub.publisher` for publishing
 * - `roles/pubsub.subscriber` for subscribing
 * - `roles/pubsub.editor` for creating/deleting topics and subscriptions
 * - `roles/pubsub.admin` for full access
 *
 * This error is non-retryable - fix the IAM permissions before retrying.
 *
 * @extends PubSubError
 *
 * @example Checking permissions
 * ```typescript
 * try {
 *   await provider.createTopic('sensitive-data');
 * } catch (error) {
 *   if (error instanceof PermissionDeniedError) {
 *     console.error('Service account lacks pubsub.topics.create permission');
 *     console.error('Grant roles/pubsub.editor to the service account');
 *   }
 * }
 * ```
 */
export class PermissionDeniedError extends PubSubError {
  /**
   * Creates a new PermissionDeniedError instance.
   *
   * @param message - Description of the permission that was denied
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(message: string, _details?: Record<string, unknown>) {
    super(`Pub/Sub permission denied: ${message}`, PubSubErrorCode.PERMISSION_DENIED);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Error thrown when Dead Letter Queue configuration or delivery fails.
 *
 * Dead Letter Queues (DLQs) capture messages that cannot be processed after
 * the maximum number of delivery attempts. This error occurs when:
 * - DLQ topic doesn't exist
 * - Service account lacks permissions on DLQ topic
 * - DLQ configuration is invalid
 *
 * @extends PubSubError
 *
 * @example Setting up Dead Letter Queue properly
 * ```typescript
 * try {
 *   // Step 1: Create DLQ topic
 *   await provider.createTopic('orders-dlq', {
 *     labels: { type: 'dead-letter-queue' }
 *   });
 *
 *   // Step 2: Create main subscription with DLQ
 *   await provider.createSubscription('order-processor', 'orders', {
 *     deadLetterPolicy: {
 *       deadLetterTopic: 'orders-dlq',
 *       maxDeliveryAttempts: 5
 *     }
 *   });
 *
 *   // Step 3: Create DLQ subscription for monitoring
 *   await provider.createSubscription('dlq-monitor', 'orders-dlq');
 * } catch (error) {
 *   if (error instanceof DeadLetterQueueFailedError) {
 *     logger.error('DLQ setup failed', { error });
 *   }
 * }
 * ```
 */
export class DeadLetterQueueFailedError extends PubSubError {
  /**
   * Creates a new DeadLetterQueueFailedError instance.
   *
   * @param subscriptionName - Name of the subscription with DLQ configuration issue
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(subscriptionName: string, _details?: Record<string, unknown>) {
    super(
      `Failed to configure Dead Letter Queue for subscription: ${subscriptionName}`,
      PubSubErrorCode.DEAD_LETTER_QUEUE_FAILED
    );
    this.name = 'DeadLetterQueueFailedError';
  }
}

/**
 * Error thrown when Pub/Sub provider configuration is invalid.
 *
 * This error is thrown during provider initialization when:
 * - Required configuration is missing (e.g., projectId)
 * - Configuration values are out of valid range
 * - Conflicting configuration options are provided
 * - Environment variable values cannot be parsed
 *
 * @extends PubSubError
 *
 * @example Validating configuration
 * ```typescript
 * try {
 *   const config = resolveConfig(); // From environment variables
 *   validateConfig(config);
 *   const provider = createPubSubProvider(config);
 * } catch (error) {
 *   if (error instanceof InvalidPubSubConfigError) {
 *     console.error('Configuration error:', error.message);
 *     console.error('Check environment variables:');
 *     console.error('  - PUBSUB_PROJECT_ID (required)');
 *     console.error('  - PUBSUB_KEY_FILE or PUBSUB_CLIENT_EMAIL + PUBSUB_PRIVATE_KEY');
 *   }
 * }
 * ```
 */
export class InvalidPubSubConfigError extends PubSubError {
  /**
   * Creates a new InvalidPubSubConfigError instance.
   *
   * @param message - Description of the configuration error
   * @param _details - Optional additional error context (reserved for future use)
   */
  constructor(message: string, _details?: Record<string, unknown>) {
    super(`Invalid Pub/Sub configuration: ${message}`, PubSubErrorCode.INVALID_CONFIG);
    this.name = 'InvalidPubSubConfigError';
  }
}

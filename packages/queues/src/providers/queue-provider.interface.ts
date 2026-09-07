/**
 * Unified queue provider interface
 *
 * Abstract interface for all queue implementations (BullMQ, Cloud Tasks, Pub/Sub)
 */

import type { BackoffType } from '../config/interfaces';

/**
 * Queue message data
 */
export type QueueMessageData = string | Record<string, unknown> | Buffer;

/**
 * Queue message options
 */
export interface QueueMessageOptions {
  /** Message priority (0-10, lower is higher priority) */
  priority?: number;
  /** Delay before processing (milliseconds) */
  delay?: number;
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff strategy for retries */
  backoff?: {
    type: BackoffType;
    delay: number;
  };
  /** Schedule time for delayed processing */
  scheduleTime?: Date;
  /** Message attributes/metadata */
  attributes?: Record<string, string>;
  /** Ordering key for ordered delivery */
  orderingKey?: string;
  /** Timeout for processing (milliseconds) */
  timeout?: number;
}

/**
 * Queue creation options
 */
export interface QueueCreationOptions {
  /** Queue description */
  description?: string;
  /** Rate limits */
  rateLimits?: {
    maxRequestsPerSecond?: number;
    maxConcurrentDispatches?: number;
  };
  /** Retry configuration */
  retryConfig?: {
    maxAttempts?: number;
    minBackoffInSeconds?: number;
    maxBackoffInSeconds?: number;
  };
  /** Dead Letter Queue configuration */
  deadLetterQueue?: {
    enabled: boolean;
    queueName?: string;
    maxDeliveryAttempts?: number;
  };
  /** Message retention duration (seconds) */
  messageRetentionSeconds?: number;
}

/**
 * Queue info
 */
export interface QueueInfo {
  /** Queue name */
  name: string;
  /** Queue state (if applicable) */
  state?: string;
  /** Number of messages waiting */
  waitingMessages?: number;
  /** Number of active messages */
  activeMessages?: number;
  /** Number of completed messages */
  completedMessages?: number;
  /** Number of failed messages */
  failedMessages?: number;
}

/**
 * Subscription options for pull-based queues
 */
export interface QueueSubscriptionOptions {
  /** Flow control settings */
  flowControl?: {
    maxMessages?: number;
    maxBytes?: number;
  };
  /** Handler timeout (milliseconds) */
  handlerTimeout?: number;
  /** Auto-acknowledge messages after successful handler */
  autoAck?: boolean;
}

/**
 * Received queue message
 */
export interface ReceivedQueueMessage {
  /** Message ID */
  id: string;
  /** Message data */
  data: Buffer;
  /** Message attributes */
  attributes?: Record<string, string>;
  /** Number of delivery attempts */
  attempts?: number;
  /** Acknowledge the message */
  ack(): Promise<void>;
  /** Negative acknowledge the message */
  nack(): Promise<void>;
}

/**
 * Message handler for subscriptions
 */
export type QueueMessageHandler = (message: ReceivedQueueMessage) => void | Promise<void>;

/**
 * Unified queue provider interface
 *
 * All queue providers (BullMQ, Cloud Tasks, Pub/Sub) must implement this interface
 */
export interface IQueueProvider {
  /**
   * Provider name (for telemetry)
   */
  readonly name: string;

  /**
   * Publish a message to a queue
   *
   * @param queueName - Queue name
   * @param data - Message data
   * @param options - Message options
   * @returns Message ID
   */
  publish(
    queueName: string,
    data: QueueMessageData,
    options?: QueueMessageOptions
  ): Promise<string>;

  /**
   * Publish multiple messages to a queue (batch)
   *
   * @param queueName - Queue name
   * @param messages - Array of messages with options
   * @returns Array of message IDs
   */
  publishBatch(
    queueName: string,
    messages: Array<{ data: QueueMessageData; options?: QueueMessageOptions }>
  ): Promise<string[]>;

  /**
   * Subscribe to a queue with a message handler
   *
   * @param queueName - Queue name
   * @param handler - Message handler function
   * @param options - Subscription options
   */
  subscribe(
    queueName: string,
    handler: QueueMessageHandler,
    options?: QueueSubscriptionOptions
  ): Promise<void>;

  /**
   * Unsubscribe from a queue
   *
   * @param queueName - Queue name
   */
  unsubscribe(queueName: string): Promise<void>;

  /**
   * Create a new queue
   *
   * @param name - Queue name
   * @param options - Queue creation options
   */
  createQueue(name: string, options?: QueueCreationOptions): Promise<void>;

  /**
   * Delete a queue
   *
   * @param name - Queue name
   */
  deleteQueue(name: string): Promise<void>;

  /**
   * Get queue information
   *
   * @param name - Queue name
   */
  getQueue(name: string): Promise<QueueInfo>;

  /**
   * List all queues
   */
  listQueues(): Promise<QueueInfo[]>;

  /**
   * Health check for the provider
   */
  healthCheck(): Promise<boolean>;

  /**
   * Close the provider and release resources
   */
  close?(): Promise<void>;
}

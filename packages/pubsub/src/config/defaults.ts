/**
 * @fileoverview Default configuration values for Google Cloud Pub/Sub provider.
 *
 * This module exports sensible defaults for all configuration options. These
 * values are used when specific options are not provided, ensuring consistent
 * behavior across the application.
 *
 * @module @package/pubsub/config/defaults
 *
 * @example Using defaults in custom configuration
 * ```typescript
 * import {
 *   DEFAULT_SUBSCRIPTION_OPTIONS,
 *   DEFAULT_RETRY_POLICY
 * } from '@package/pubsub';
 *
 * // Extend defaults with custom values
 * const customOptions = {
 *   ...DEFAULT_SUBSCRIPTION_OPTIONS,
 *   ackDeadlineSeconds: 120, // Override default
 *   retryPolicy: DEFAULT_RETRY_POLICY
 * };
 * ```
 */

import type {
  PubSubConfig,
  TopicOptions,
  SubscriptionOptions,
  SubscribeOptions,
  PublishOptions,
  RetryPolicy
} from './interfaces';

/**
 * Default retry policy for message redelivery.
 *
 * Defines exponential backoff bounds for message redelivery after nacks.
 * Messages are redelivered with increasing delays between the minimum
 * and maximum backoff values.
 *
 * @example Using default retry policy
 * ```typescript
 * await provider.createSubscription('my-sub', 'my-topic', {
 *   retryPolicy: DEFAULT_RETRY_POLICY
 * });
 * // Messages will retry with 10s-600s exponential backoff
 * ```
 */
export const DEFAULT_RETRY_POLICY: Required<RetryPolicy> = {
  /** Initial retry delay: 10 seconds */
  minimumBackoffInSeconds: 10,
  /** Maximum retry delay: 10 minutes */
  maximumBackoffInSeconds: 600
};

/**
 * Default maximum delivery attempts before routing to Dead Letter Queue.
 *
 * After this many failed deliveries (nacks or ack deadline expirations),
 * messages are forwarded to the configured dead letter topic.
 *
 * @example Using with Dead Letter Queue
 * ```typescript
 * await provider.createSubscription('processor', 'events', {
 *   deadLetterPolicy: {
 *     deadLetterTopic: 'events-dlq',
 *     maxDeliveryAttempts: DEFAULT_MAX_DELIVERY_ATTEMPTS
 *   }
 * });
 * ```
 */
export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Default options applied when creating new topics.
 *
 * Topics created without explicit options inherit these defaults.
 *
 * @example Extending default topic options
 * ```typescript
 * await provider.createTopic('my-topic', {
 *   ...DEFAULT_TOPIC_OPTIONS,
 *   labels: { team: 'platform' }
 * });
 * ```
 */
export const DEFAULT_TOPIC_OPTIONS: TopicOptions = {
  /** Default description identifying the management source */
  description: 'Managed by @package/pubsub'
};

/**
 * Default options applied when creating new subscriptions.
 *
 * These values balance reliability with resource efficiency for
 * typical message processing workloads.
 *
 * @example Extending default subscription options
 * ```typescript
 * await provider.createSubscription('my-sub', 'my-topic', {
 *   ...DEFAULT_SUBSCRIPTION_OPTIONS,
 *   enableMessageOrdering: true
 * });
 * ```
 */
export const DEFAULT_SUBSCRIPTION_OPTIONS: SubscriptionOptions = {
  /**
   * Time to acknowledge messages before redelivery.
   * 1 minute provides reasonable processing time.
   */
  ackDeadlineSeconds: 60,
  /**
   * How long unacknowledged messages are retained.
   * 7 days allows recovery from extended outages.
   */
  messageRetentionSeconds: 604800,
  /**
   * Whether to keep acknowledged messages.
   * Disabled by default to save storage costs.
   */
  retainAckedMessages: false
};

/**
 * Default options for the subscribe() method's message handling.
 *
 * These values are optimized for balanced throughput and stability.
 * Adjust for high-throughput or low-latency use cases.
 *
 * @example High-throughput override
 * ```typescript
 * await provider.subscribe('high-volume', handler, {
 *   ...DEFAULT_SUBSCRIBE_OPTIONS,
 *   flowControl: {
 *     maxMessages: 1000,
 *     maxBytes: 500 * 1024 * 1024 // 500MB
 *   }
 * });
 * ```
 */
export const DEFAULT_SUBSCRIBE_OPTIONS: SubscribeOptions = {
  /**
   * Flow control for message delivery rate.
   */
  flowControl: {
    /** Maximum concurrent messages: 100 */
    maxMessages: 100,
    /** Maximum buffered bytes: 100MB */
    maxBytes: 104857600
  },
  /**
   * Streaming pull connection settings.
   */
  streamingOptions: {
    /** Maximum outstanding messages: 100 */
    maxOutstandingMessages: 100,
    /** Maximum outstanding bytes: 100MB */
    maxOutstandingBytes: 104857600
  },
  /**
   * Maximum handler execution time: 5 minutes.
   * Messages taking longer are considered failed.
   */
  handlerTimeout: 300000,
  /**
   * Auto-acknowledge on successful handler completion.
   * Set to false for manual ack control.
   */
  autoAck: true
};

/**
 * Default options for the publish() method.
 *
 * These values ensure reliable message delivery for typical workloads.
 *
 * @example Custom publish timeout
 * ```typescript
 * await provider.publish('topic', data, {
 *   ...DEFAULT_PUBLISH_OPTIONS,
 *   timeout: 30000 // 30 seconds for large messages
 * });
 * ```
 */
export const DEFAULT_PUBLISH_OPTIONS: PublishOptions = {
  /**
   * Publish operation timeout: 10 seconds.
   * Sufficient for most network conditions.
   */
  timeout: 10000
};

/**
 * Default Pub/Sub client configuration.
 *
 * Applied when creating a provider without explicit configuration.
 * These values are production-ready for most use cases.
 *
 * @example Checking default values
 * ```typescript
 * console.log(DEFAULT_CLIENT_CONFIG);
 * // {
 * //   enableTracing: true,
 * //   timeout: 60000,
 * //   maxRetries: 3,
 * //   testMode: false,
 * //   defaultAckDeadlineSeconds: 60,
 * //   defaultMessageRetentionSeconds: 604800
 * // }
 * ```
 */
export const DEFAULT_CLIENT_CONFIG = {
  /** Enable OpenTelemetry tracing for observability */
  enableTracing: true,
  /** API operation timeout: 1 minute */
  timeout: 60000,
  /** Retry transient failures up to 3 times */
  maxRetries: 3,
  /** Use real GCP provider (not mock) */
  testMode: false,
  /** Default ack deadline for new subscriptions: 1 minute */
  defaultAckDeadlineSeconds: 60,
  /** Default message retention: 7 days */
  defaultMessageRetentionSeconds: 604800
} as const satisfies Partial<PubSubConfig>;

/**
 * Environment variable names for configuration resolution.
 *
 * The {@link resolveConfig} function reads these environment variables
 * to construct a {@link PubSubConfig} object automatically.
 *
 * @example Setting environment variables
 * ```bash
 * # Required
 * export PUBSUB_PROJECT_ID="my-gcp-project"
 *
 * # Authentication (choose one method)
 * export PUBSUB_KEY_FILE="/path/to/service-account.json"
 * # OR
 * export PUBSUB_CLIENT_EMAIL="sa@project.iam.gserviceaccount.com"
 * export PUBSUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *
 * # Optional overrides
 * export PUBSUB_TIMEOUT="30000"
 * export PUBSUB_MAX_RETRIES="5"
 * export PUBSUB_ENABLE_TRACING="true"
 * export PUBSUB_ACK_DEADLINE="120"
 * ```
 *
 * @example Checking which env vars are expected
 * ```typescript
 * import { ENV_VARS } from '@package/pubsub';
 *
 * console.log('Required:', ENV_VARS.PROJECT_ID);
 * console.log('Auth options:', ENV_VARS.KEY_FILE, 'or', ENV_VARS.CLIENT_EMAIL);
 * ```
 */
export const ENV_VARS = {
  /** GCP project ID (required) */
  PROJECT_ID: 'PUBSUB_PROJECT_ID',
  /** Default topic name (optional) */
  TOPIC_NAME: 'PUBSUB_TOPIC_NAME',
  /** Default subscription name (optional) */
  SUBSCRIPTION_NAME: 'PUBSUB_SUBSCRIPTION_NAME',
  /** Path to service account JSON key file */
  KEY_FILE: 'PUBSUB_KEY_FILE',
  /** Service account email (for inline credentials) */
  CLIENT_EMAIL: 'PUBSUB_CLIENT_EMAIL',
  /** Service account private key (for inline credentials) */
  PRIVATE_KEY: 'PUBSUB_PRIVATE_KEY',
  /** API timeout in milliseconds */
  TIMEOUT: 'PUBSUB_TIMEOUT',
  /** Maximum retry attempts */
  MAX_RETRIES: 'PUBSUB_MAX_RETRIES',
  /** Enable/disable tracing ("true" or "false") */
  ENABLE_TRACING: 'PUBSUB_ENABLE_TRACING',
  /** Enable test mode ("true" for mock provider) */
  TEST_MODE: 'PUBSUB_TEST_MODE',
  /** Default ack deadline in seconds */
  ACK_DEADLINE: 'PUBSUB_ACK_DEADLINE',
  /** Maximum concurrent messages for subscribe */
  MAX_MESSAGES: 'PUBSUB_MAX_MESSAGES'
} as const;

/**
 * Default topic names by environment.
 *
 * Convenience constants for environment-specific topic naming conventions.
 *
 * @example Environment-aware topic selection
 * ```typescript
 * import { TOPIC_PATHS } from '@package/pubsub';
 *
 * const topicName = process.env.NODE_ENV === 'production'
 *   ? TOPIC_PATHS.PRODUCTION
 *   : TOPIC_PATHS.DEVELOPMENT;
 *
 * await provider.createTopic(topicName);
 * ```
 */
export const TOPIC_PATHS = {
  /** Production topic name */
  PRODUCTION: 'default-topic',
  /** Development topic name */
  DEVELOPMENT: 'dev-topic',
  /** Test topic name */
  TEST: 'test-topic'
} as const;

/**
 * Default subscription names by environment.
 *
 * Convenience constants for environment-specific subscription naming conventions.
 *
 * @example Environment-aware subscription selection
 * ```typescript
 * import { SUBSCRIPTION_PATHS, TOPIC_PATHS } from '@package/pubsub';
 *
 * const env = process.env.NODE_ENV ?? 'development';
 * const subName = env === 'production'
 *   ? SUBSCRIPTION_PATHS.PRODUCTION
 *   : SUBSCRIPTION_PATHS.DEVELOPMENT;
 *
 * await provider.createSubscription(subName, TOPIC_PATHS[env.toUpperCase()]);
 * ```
 */
export const SUBSCRIPTION_PATHS = {
  /** Production subscription name */
  PRODUCTION: 'default-subscription',
  /** Development subscription name */
  DEVELOPMENT: 'dev-subscription',
  /** Test subscription name */
  TEST: 'test-subscription'
} as const;

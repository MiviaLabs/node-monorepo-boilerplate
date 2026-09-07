/**
 * Configuration interfaces for events package
 *
 * This module defines all configuration interfaces that allow users to override
 * default settings via input options, with environment variables as fallback.
 */

import type { ResolvedEventRoutingConfig } from '../routing/interfaces';

/**
 * Compression codec types
 */
export const enum CompressionCodec {
  None = 'none',
  Gzip = 'gzip',
  Snappy = 'snappy',
  Lz4 = 'lz4',
  Zstd = 'zstd'
}

/**
 * SASL authentication configuration
 *
 * This type is compatible with KafkaJS's SASLOptions type.
 * For AWS mechanism, all credential fields are required when using AWS IAM authentication.
 */
export type SaslConfig =
  | { mechanism: 'plain'; username: string; password: string }
  | { mechanism: 'scram-sha-256'; username: string; password: string }
  | { mechanism: 'scram-sha-512'; username: string; password: string }
  | {
      mechanism: 'aws';
      authorizationIdentity: string;
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };

/**
 * Kafka client configuration
 */
export interface KafkaClientConfig {
  /** Kafka broker addresses (e.g., ['localhost:9092']) */
  brokers?: string[];
  /** Client identifier for tracking */
  clientId?: string;
  /** Enable SSL/TLS for secure connections */
  ssl?: boolean;
  /** SASL authentication configuration */
  sasl?: SaslConfig;
  /** Connection timeout in milliseconds (default: 10000) */
  connectionTimeout?: number;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  /** Retry interval in milliseconds (default: 5000) */
  retryInterval?: number;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Replication factor for topics (default: 1) */
  replicationFactor?: number;
}

/**
 * Kafka consumer configuration
 */
export interface ConsumerConfig {
  /** Session timeout in milliseconds (default: 30000) */
  sessionTimeout?: number;
  /** Heartbeat interval in milliseconds (default: 3000) */
  heartbeatInterval?: number;
  /** Rebalance timeout in milliseconds (default: 60000) */
  rebalanceTimeout?: number;
  /** Maximum wait time in milliseconds (default: 5000) */
  maxWaitTimeInMs?: number;
  /** Auto-create topic before subscribing (default: true) */
  autoCreateTopic?: boolean;
  /** Subscription timeout in milliseconds (default: 60000) */
  subscriptionTimeout?: number;
  /** Start consuming from beginning of topic (default: false) */
  fromBeginning?: boolean;
}

/**
 * Kafka producer configuration
 */
export interface ProducerConfig {
  /** Number of acknowledgments required: -1 (all), 0 (none), 1 (leader only) (default: 1) */
  acks?: -1 | 0 | 1;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Compression codec: none, gzip, snappy, lz4, zstd (default: none) */
  compression?: CompressionCodec;
}

/**
 * Message handler configuration
 */
export interface MessageHandlerConfig {
  /** Maximum retry attempts for failed messages (default: 3) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Dead-letter topic for messages that exceed max retries */
  deadLetterTopic?: string;
  /** Auto-create topic before subscribing (default: true) */
  autoCreateTopic?: boolean;
  /** Subscription timeout in milliseconds (default: 60000) */
  subscriptionTimeout?: number;
}

/**
 * Outbox pattern configuration
 */
export interface OutboxConfig {
  /** Enable outbox poller (default: true) */
  enabled?: boolean;
  /** Poll interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Number of events to process per batch (default: 10) */
  batchSize?: number;
  /** Maximum retry attempts for failed events (default: 5) */
  maxRetries?: number;
  /** Exponential backoff multiplier (default: 2) */
  retryBackoffMultiplier?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelay?: number;
  /** Cleanup interval in milliseconds (default: 3600000 = 1 hour) */
  cleanupInterval?: number;
  /** Retention period in days for processed events (default: 7) */
  retentionDays?: number;
  /** Unique worker identifier (auto-generated if not provided) */
  workerId?: string;
}

/**
 * Dead letter queue configuration
 */
export interface DeadLetterConfig {
  /** Enable dead letter processing (default: true) */
  enabled?: boolean;
  /** Maximum retry attempts before sending to DLQ (default: 5) */
  maxRetries?: number;
  /** Dead letter topic name (default: 'dead-letter') */
  deadLetterTopic?: string;
  /** Send alerts when events go to DLQ (default: true) */
  alertOnFailure?: boolean;
  /** Retention period in days for dead-lettered events (default: 30) */
  retentionDays?: number;
  /** Cleanup interval in milliseconds for DLQ events (default: 86400000 = 1 day) */
  cleanupInterval?: number;
}

/**
 * Event replay configuration
 */
export interface ReplayConfig {
  /** Enable event replay functionality (default: true) */
  enabled?: boolean;
  /** Maximum parallel events to replay at once (default: 10) */
  maxParallel?: number;
  /** Number of events to process per batch (default: 50) */
  batchSize?: number;
  /** Stop replay on first error (default: false) */
  stopOnError?: boolean;
  /** Retention period in days for replay metadata (default: 90) */
  retentionDays?: number;
  /** Cleanup interval in milliseconds for replay data (default: 86400000 = 1 day) */
  cleanupInterval?: number;
}

/**
 * Environment variable name mappings
 *
 * Allows customization of environment variable names for different deployment scenarios.
 */
export interface EnvironmentVariableNames {
  /** Kafka brokers (default: KAFKA_BROKERS) */
  kafkaBrokers?: string;
  /** Kafka client ID (default: KAFKA_CLIENT_ID) */
  kafkaClientId?: string;
  /** Enable SSL (default: KAFKA_SSL) */
  kafkaSsl?: string;
  /** SASL mechanism (default: KAFKA_SASL_MECHANISM) */
  kafkaSaslMechanism?: string;
  /** SASL username (default: KAFKA_SASL_USERNAME) */
  kafkaSaslUsername?: string;
  /** SASL password (default: KAFKA_SASL_PASSWORD) */
  kafkaSaslPassword?: string;
  /** Connection timeout (default: KAFKA_CONNECTION_TIMEOUT) */
  kafkaConnectionTimeout?: string;
  /** Request timeout (default: KAFKA_REQUEST_TIMEOUT) */
  kafkaRequestTimeout?: string;
  /** Retry interval (default: KAFKA_RETRY_INTERVAL) */
  kafkaRetryInterval?: string;
  /** Maximum retries (default: KAFKA_MAX_RETRIES) */
  kafkaMaxRetries?: string;
  /** Replication factor (default: KAFKA_REPLICATION_FACTOR) */
  kafkaReplicationFactor?: string;
  /** Consumer session timeout (default: KAFKA_CONSUMER_SESSION_TIMEOUT) */
  consumerSessionTimeout?: string;
  /** Consumer heartbeat interval (default: KAFKA_CONSUMER_HEARTBEAT_INTERVAL) */
  consumerHeartbeatInterval?: string;
  /** Producer acknowledgments (default: KAFKA_PRODUCER_ACKS) */
  producerAcks?: string;
  /** Producer timeout (default: KAFKA_PRODUCER_TIMEOUT) */
  producerTimeout?: string;
  /** Producer compression (default: KAFKA_PRODUCER_COMPRESSION) */
  producerCompression?: string;
  /** Outbox enabled (default: OUTBOX_ENABLED) */
  outboxEnabled?: string;
  /** Outbox poll interval (default: OUTBOX_POLL_INTERVAL) */
  outboxPollInterval?: string;
  /** Outbox batch size (default: OUTBOX_BATCH_SIZE) */
  outboxBatchSize?: string;
  /** Outbox max retries (default: OUTBOX_MAX_RETRIES) */
  outboxMaxRetries?: string;
  /** Outbox retry backoff multiplier (default: OUTBOX_RETRY_BACKOFF_MULTIPLIER) */
  outboxRetryBackoffMultiplier?: string;
  /** Outbox initial retry delay (default: OUTBOX_INITIAL_RETRY_DELAY) */
  outboxInitialRetryDelay?: string;
  /** Outbox cleanup interval (default: OUTBOX_CLEANUP_INTERVAL) */
  outboxCleanupInterval?: string;
  /** Outbox retention days (default: OUTBOX_RETENTION_DAYS) */
  outboxRetentionDays?: string;
  /** Events enabled (default: EVENTS_ENABLED) */
  eventsEnabled?: string;
  /** Event type validation enabled (default: EVENTS_TYPE_VALIDATION_ENABLED) */
  eventsTypeValidationEnabled?: string;
  /** Circuit breaker enabled (default: EVENTS_CIRCUIT_BREAKER_ENABLED) */
  circuitBreakerEnabled?: string;
  /** Circuit breaker threshold (default: EVENTS_CIRCUIT_BREAKER_THRESHOLD) */
  circuitBreakerThreshold?: string;
  /** Circuit breaker timeout (default: EVENTS_CIRCUIT_BREAKER_TIMEOUT_MS) */
  circuitBreakerTimeoutMs?: string;
  /** Integration queues enabled (default: INTEGRATION_QUEUES_ENABLED) */
  integrationQueuesEnabled?: string;
  /** Integration pubsub enabled (default: INTEGRATION_PUBSUB_ENABLED) */
  integrationPubsubEnabled?: string;
  /** Integration tasks enabled (default: INTEGRATION_TASKS_ENABLED) */
  integrationTasksEnabled?: string;
  /** Outbox connection retry max (default: OUTBOX_CONNECTION_RETRY_MAX) */
  outboxConnectionRetryMax?: string;
  /** Outbox connection retry delay (default: OUTBOX_CONNECTION_RETRY_DELAY_MS) */
  outboxConnectionRetryDelayMs?: string;

  /** Dead letter enabled (default: DEAD_LETTER_ENABLED) */
  deadLetterEnabled?: string;

  /** Dead letter max retries (default: DEAD_LETTER_MAX_RETRIES) */
  deadLetterMaxRetries?: string;

  /** Dead letter topic (default: DEAD_LETTER_TOPIC) */
  deadLetterTopic?: string;

  /** Dead letter alert on failure (default: DEAD_LETTER_ALERT_ON_FAILURE) */
  deadLetterAlertOnFailure?: string;

  /** Dead letter retention days (default: DEAD_LETTER_RETENTION_DAYS) */
  deadLetterRetentionDays?: string;

  /** Dead letter cleanup interval (default: DEAD_LETTER_CLEANUP_INTERVAL) */
  deadLetterCleanupInterval?: string;

  /** Replay enabled (default: REPLAY_ENABLED) */
  replayEnabled?: string;
  /** Replay max parallel (default: REPLAY_MAX_PARALLEL) */
  replayMaxParallel?: string;
  /** Replay batch size (default: REPLAY_BATCH_SIZE) */
  replayBatchSize?: string;
  /** Replay stop on error (default: REPLAY_STOP_ON_ERROR) */
  replayStopOnError?: string;
  /** Replay retention days (default: REPLAY_RETENTION_DAYS) */
  replayRetentionDays?: string;
  /** Replay cleanup interval (default: REPLAY_CLEANUP_INTERVAL) */
  replayCleanupInterval?: string;
}

/**
 * Circuit breaker configuration for Kafka connections
 */
export interface CircuitBreakerConfig {
  /** Enable circuit breaker (default: true) */
  enabled?: boolean;
  /** Number of consecutive failures before opening circuit (default: 5) */
  threshold?: number;
  /** Time in ms to wait before attempting to close circuit (default: 60000) */
  timeoutMs?: number;
}

/**
 * Integration configuration for bridging events to other infrastructure packages
 */
export interface IntegrationConfig {
  /** Enable bridge to queues (default: false) */
  queuesEnabled?: boolean;
  /** Enable bridge to pubsub (default: false) */
  pubsubEnabled?: boolean;
  /** Enable bridge to tasks (default: false) */
  tasksEnabled?: boolean;
}

/**
 * Main configuration interface for events package
 *
 * All configuration options are optional. If not provided, they will be
 * read from environment variables, or fall back to default values.
 */
export interface InfrastructureEventsConfig {
  /** Enable graceful shutdown on SIGTERM/SIGINT (default: true) */
  enableGracefulShutdown?: boolean;

  /** Enable event publishing globally (default: true) */
  enabled?: boolean;

  /** Kafka client configuration */
  kafka?: KafkaClientConfig;

  /** Kafka consumer configuration */
  consumer?: ConsumerConfig;

  /** Kafka producer configuration */
  producer?: ProducerConfig;

  /** Message handler configuration */
  handler?: MessageHandlerConfig;

  /** Outbox pattern configuration */
  outbox?: OutboxConfig;

  /** Dead letter queue configuration */
  deadLetter?: DeadLetterConfig;

  /** Event replay configuration */
  replay?: ReplayConfig;

  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;

  /** Integration configuration */
  integration?: IntegrationConfig;

  /** Event routing configuration */
  routing?: Record<string, unknown>;

  /** Custom event bus instance (optional) */
  eventBus?: unknown;

  /** Custom message handler instance (optional) */
  messageHandler?: unknown;

  /** Custom environment variable names (optional) */
  envVarNames?: EnvironmentVariableNames;

  /**
   * Consumer group ID for all event handlers (optional)
   *
   * If not provided, a unique group ID will be generated for each event type.
   * In production, all instances should use the same consumer group ID for load balancing.
   * In tests, each test should provide a unique consumer group ID to avoid conflicts.
   *
   * @example
   * // Production: all instances use same group ID
   * EventsModule.forRoot({ consumerGroupId: 'my-service' })
   *
   * // Tests: each test gets unique group ID
   * EventsModule.forRoot({ consumerGroupId: `test-${Date.now()}` })
   */
  consumerGroupId?: string;
}

/**
 * Resolved configuration with all defaults applied
 *
 * This interface represents the final configuration after merging user options,
 * environment variables, and defaults.
 */
export interface ResolvedInfrastructureEventsConfig {
  /** Enable graceful shutdown */
  enableGracefulShutdown: boolean;

  /** Enable event publishing globally */
  enabled: boolean;

  /** Kafka client configuration (with defaults, sasl may be undefined) */
  kafka: Omit<Required<KafkaClientConfig>, 'sasl'> & { sasl?: SaslConfig };

  /** Kafka consumer configuration (with defaults) */
  consumer: Required<ConsumerConfig>;

  /** Kafka producer configuration (with defaults) */
  producer: Required<ProducerConfig>;

  /** Message handler configuration (with defaults, deadLetterTopic may be undefined) */
  handler: Omit<Required<MessageHandlerConfig>, 'deadLetterTopic'> & { deadLetterTopic?: string };

  /** Outbox pattern configuration (with defaults) */
  outbox: Required<OutboxConfig>;

  /** Dead letter queue configuration (with defaults) */
  deadLetter: Required<DeadLetterConfig>;

  /** Event replay configuration (with defaults) */
  replay: Required<ReplayConfig>;

  /** Circuit breaker configuration (with defaults) */
  circuitBreaker: Required<CircuitBreakerConfig>;

  /** Integration configuration (with defaults) */
  integration: Required<IntegrationConfig>;

  /** Event routing configuration (with defaults) */
  routing: ResolvedEventRoutingConfig;

  /** Event type validation enabled */
  eventTypeValidationEnabled: boolean;

  /** Outbox connection retry max */
  outboxConnectionRetryMax: number;

  /** Outbox connection retry delay ms */
  outboxConnectionRetryDelayMs: number;
}

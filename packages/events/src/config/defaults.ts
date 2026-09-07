/**
 * Default configuration values for events package
 *
 * These defaults are designed for production use with balanced
 * throughput, latency, and resource consumption.
 */

import type {
  KafkaClientConfig,
  ConsumerConfig,
  ProducerConfig,
  MessageHandlerConfig,
  OutboxConfig,
  DeadLetterConfig,
  ReplayConfig,
  CircuitBreakerConfig,
  IntegrationConfig
} from './interfaces';
import { CompressionCodec } from './interfaces';

/**
 * Default Kafka client configuration (excluding sasl which is always optional)
 */
export const DEFAULT_KAFKA_CONFIG: Omit<Required<KafkaClientConfig>, 'sasl'> = {
  brokers: ['localhost:9092'],
  clientId: 'enterprise-starter-kit',
  ssl: false,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retryInterval: 5000,
  maxRetries: 5,
  replicationFactor: 1
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<CircuitBreakerConfig> = {
  enabled: true,
  threshold: 5,
  timeoutMs: 60000
};

/**
 * Default integration configuration
 */
export const DEFAULT_INTEGRATION_CONFIG: Required<IntegrationConfig> = {
  queuesEnabled: false,
  pubsubEnabled: false,
  tasksEnabled: false
};

/**
 * Default Kafka consumer configuration
 *
 * Optimized for stability with higher timeouts for group coordinator
 * stability on Railway and other cloud platforms.
 */
export const DEFAULT_CONSUMER_CONFIG: Required<ConsumerConfig> = {
  sessionTimeout: 30000, // 30 seconds for coordinator stability
  heartbeatInterval: 3000, // 3 seconds balance between responsiveness and network tolerance
  rebalanceTimeout: 60000, // 60 seconds supports multi-broker setups
  maxWaitTimeInMs: 5000, // 5 seconds to reduce latency
  autoCreateTopic: true, // Auto-create topics for convenience
  subscriptionTimeout: 60000, // 60 seconds for subscription
  fromBeginning: false // Start from latest offset by default
};

/**
 * Default Kafka producer configuration
 */
export const DEFAULT_PRODUCER_CONFIG: Required<ProducerConfig> = {
  acks: 1, // Wait for leader acknowledgment
  timeout: 30000, // 30 seconds
  compression: CompressionCodec.None // No compression by default
};

/**
 * Default message handler configuration
 */
export const DEFAULT_HANDLER_CONFIG: Omit<Required<MessageHandlerConfig>, 'deadLetterTopic'> & {
  deadLetterTopic?: string;
} = {
  maxRetries: 3, // Retry up to 3 times
  retryDelay: 1000, // 1 second between retries
  autoCreateTopic: true, // Auto-create topics for convenience
  subscriptionTimeout: 60000 // 60 seconds for subscription
};

/**
 * Default outbox pattern configuration
 *
 * These defaults are designed for production use with balanced
 * throughput, latency, and resource consumption.
 */
export const DEFAULT_OUTBOX_CONFIG: Required<OutboxConfig> = {
  enabled: true, // Enable outbox by default
  pollInterval: 1000, // Poll every 1 second for low-latency delivery
  batchSize: 10, // Process up to 10 events per batch
  maxRetries: 5, // Retry up to 5 times before giving up
  retryBackoffMultiplier: 2, // Exponential backoff: 2x delay per retry
  initialRetryDelay: 1000, // Start with 1 second delay
  cleanupInterval: 3600000, // Run cleanup every hour (3600000ms)
  retentionDays: 7, // Keep published events for 7 days
  workerId: `worker-${process.pid}-${Date.now()}` // Unique worker ID
};

/**
 * Default dead letter queue configuration
 */
export const DEFAULT_DEAD_LETTER_CONFIG: Required<DeadLetterConfig> = {
  enabled: true, // Enable dead letter processing by default
  maxRetries: 5, // Retry up to 5 times before DLQ
  deadLetterTopic: 'dead-letter', // Default DLQ topic name
  alertOnFailure: true, // Send alerts when events go to DLQ
  retentionDays: 30, // Keep dead-lettered events for 30 days
  cleanupInterval: 86400000 // Run DLQ cleanup every day (86400000ms)
};

/**
 * Default event replay configuration
 */
export const DEFAULT_REPLAY_CONFIG: Required<ReplayConfig> = {
  enabled: true, // Enable event replay by default
  maxParallel: 10, // Process up to 10 events in parallel
  batchSize: 50, // Process events in batches of 50
  stopOnError: false, // Continue on error by default
  retentionDays: 90, // Keep replay metadata for 90 days
  cleanupInterval: 86400000 // Run replay cleanup every day (86400000ms)
};

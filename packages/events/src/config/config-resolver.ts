/**
 * Configuration resolver for events package
 *
 * Merges user configuration, environment variables, and defaults
 * to produce the final resolved configuration.
 *
 * Priority order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import {
  resolveRoutingConfig,
  type EventRoutingConfig,
  type ResolvedEventRoutingConfig
} from '../routing/config';

import {
  DEFAULT_KAFKA_CONFIG,
  DEFAULT_CONSUMER_CONFIG,
  DEFAULT_PRODUCER_CONFIG,
  DEFAULT_HANDLER_CONFIG,
  DEFAULT_OUTBOX_CONFIG,
  DEFAULT_DEAD_LETTER_CONFIG,
  DEFAULT_REPLAY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_INTEGRATION_CONFIG
} from './defaults';
import type {
  InfrastructureEventsConfig,
  ResolvedInfrastructureEventsConfig,
  EnvironmentVariableNames,
  SaslConfig,
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

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<EnvironmentVariableNames> = {
  kafkaBrokers: 'KAFKA_BROKERS',
  kafkaClientId: 'KAFKA_CLIENT_ID',
  kafkaSsl: 'KAFKA_SSL',
  kafkaSaslMechanism: 'KAFKA_SASL_MECHANISM',
  kafkaSaslUsername: 'KAFKA_SASL_USERNAME',
  kafkaSaslPassword: 'KAFKA_SASL_PASSWORD',
  kafkaConnectionTimeout: 'KAFKA_CONNECTION_TIMEOUT',
  kafkaRequestTimeout: 'KAFKA_REQUEST_TIMEOUT',
  kafkaRetryInterval: 'KAFKA_RETRY_INTERVAL',
  kafkaMaxRetries: 'KAFKA_MAX_RETRIES',
  kafkaReplicationFactor: 'KAFKA_REPLICATION_FACTOR',
  consumerSessionTimeout: 'KAFKA_CONSUMER_SESSION_TIMEOUT',
  consumerHeartbeatInterval: 'KAFKA_CONSUMER_HEARTBEAT_INTERVAL',
  producerAcks: 'KAFKA_PRODUCER_ACKS',
  producerTimeout: 'KAFKA_PRODUCER_TIMEOUT',
  producerCompression: 'KAFKA_PRODUCER_COMPRESSION',
  outboxEnabled: 'OUTBOX_ENABLED',
  outboxPollInterval: 'OUTBOX_POLL_INTERVAL',
  outboxBatchSize: 'OUTBOX_BATCH_SIZE',
  outboxMaxRetries: 'OUTBOX_MAX_RETRIES',
  outboxRetryBackoffMultiplier: 'OUTBOX_RETRY_BACKOFF_MULTIPLIER',
  outboxInitialRetryDelay: 'OUTBOX_INITIAL_RETRY_DELAY',
  outboxCleanupInterval: 'OUTBOX_CLEANUP_INTERVAL',
  outboxRetentionDays: 'OUTBOX_RETENTION_DAYS',
  eventsEnabled: 'EVENTS_ENABLED',
  eventsTypeValidationEnabled: 'EVENTS_TYPE_VALIDATION_ENABLED',
  circuitBreakerEnabled: 'EVENTS_CIRCUIT_BREAKER_ENABLED',
  circuitBreakerThreshold: 'EVENTS_CIRCUIT_BREAKER_THRESHOLD',
  circuitBreakerTimeoutMs: 'EVENTS_CIRCUIT_BREAKER_TIMEOUT_MS',
  integrationQueuesEnabled: 'INTEGRATION_QUEUES_ENABLED',
  integrationPubsubEnabled: 'INTEGRATION_PUBSUB_ENABLED',
  integrationTasksEnabled: 'INTEGRATION_TASKS_ENABLED',
  outboxConnectionRetryMax: 'OUTBOX_CONNECTION_RETRY_MAX',
  outboxConnectionRetryDelayMs: 'OUTBOX_CONNECTION_RETRY_DELAY_MS',
  deadLetterEnabled: 'DEAD_LETTER_ENABLED',
  deadLetterMaxRetries: 'DEAD_LETTER_MAX_RETRIES',
  deadLetterTopic: 'DEAD_LETTER_TOPIC',
  deadLetterAlertOnFailure: 'DEAD_LETTER_ALERT_ON_FAILURE',
  deadLetterRetentionDays: 'DEAD_LETTER_RETENTION_DAYS',
  deadLetterCleanupInterval: 'DEAD_LETTER_CLEANUP_INTERVAL',
  replayEnabled: 'REPLAY_ENABLED',
  replayMaxParallel: 'REPLAY_MAX_PARALLEL',
  replayBatchSize: 'REPLAY_BATCH_SIZE',
  replayStopOnError: 'REPLAY_STOP_ON_ERROR',
  replayRetentionDays: 'REPLAY_RETENTION_DAYS',
  replayCleanupInterval: 'REPLAY_CLEANUP_INTERVAL'
};

/**
 * Configuration resolver class
 */
export class ConfigResolver {
  constructor(
    private userConfig: InfrastructureEventsConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolve a configuration value with priority: user > env > default
   *
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional parser function for environment values
   * @returns Resolved value
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) return userValue;
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName];
      return parser ? parser(envValue) : (envValue as unknown as T);
    }
    return defaultValue;
  }

  /**
   * Parse comma-separated string into array
   */
  private parseStringList(value: string): string[] {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  /**
   * Parse string to boolean
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Parse string to number
   */
  private parseNumber(value: string): number {
    return parseInt(value, 10);
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<EnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Resolve SASL configuration
   */
  private resolveSasl(envNames: Required<EnvironmentVariableNames>): SaslConfig | undefined {
    const userKafka = this.userConfig.kafka || {};

    // If user provided SASL config, use it
    if (userKafka.sasl) return userKafka.sasl;

    // Check environment variables
    const mechanism = this.resolveValue<string | undefined>(
      undefined,
      envNames.kafkaSaslMechanism,
      undefined
    );

    if (!mechanism) return undefined;

    // Build SASL config based on mechanism
    if (mechanism === 'aws') {
      // AWS mechanism requires authorizationIdentity, accessKeyId, and secretAccessKey
      // These would need to come from environment variables or user config
      // For now, return undefined if AWS mechanism is specified but credentials are missing
      // Note: You may want to add specific env variables for AWS credentials
      return undefined;
    }

    // For plain, scram-sha-256, scram-sha-512 mechanisms, username and password are required
    const username = this.resolveValue<string | undefined>(
      undefined,
      envNames.kafkaSaslUsername,
      undefined
    );
    const password = this.resolveValue<string | undefined>(
      undefined,
      envNames.kafkaSaslPassword,
      undefined
    );

    if (!username || !password) {
      return undefined;
    }

    // At this point, username and password are guaranteed to be strings (not undefined)
    return {
      mechanism: mechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
      username: username as string,
      password: password as string
    };
  }

  /**
   * Get Kafka client configuration
   */
  getKafkaConfig(): Omit<Required<KafkaClientConfig>, 'sasl'> & { sasl?: SaslConfig } {
    const envNames = this.getEnvVarNames();
    const userKafka = this.userConfig.kafka || {};

    const config: Omit<Required<KafkaClientConfig>, 'sasl'> & { sasl?: SaslConfig } = {
      brokers: this.resolveValue(
        userKafka.brokers,
        envNames.kafkaBrokers,
        DEFAULT_KAFKA_CONFIG.brokers,
        this.parseStringList
      ),
      clientId: this.resolveValue(
        userKafka.clientId,
        envNames.kafkaClientId,
        DEFAULT_KAFKA_CONFIG.clientId
      ),
      ssl: this.resolveValue(
        userKafka.ssl,
        envNames.kafkaSsl,
        DEFAULT_KAFKA_CONFIG.ssl,
        this.parseBoolean
      ),
      connectionTimeout: this.resolveValue(
        userKafka.connectionTimeout,
        envNames.kafkaConnectionTimeout,
        DEFAULT_KAFKA_CONFIG.connectionTimeout,
        this.parseNumber
      ),
      requestTimeout: this.resolveValue(
        userKafka.requestTimeout,
        envNames.kafkaRequestTimeout,
        DEFAULT_KAFKA_CONFIG.requestTimeout,
        this.parseNumber
      ),
      retryInterval: this.resolveValue(
        userKafka.retryInterval,
        envNames.kafkaRetryInterval,
        DEFAULT_KAFKA_CONFIG.retryInterval,
        this.parseNumber
      ),
      maxRetries: this.resolveValue(
        userKafka.maxRetries,
        envNames.kafkaMaxRetries,
        DEFAULT_KAFKA_CONFIG.maxRetries,
        this.parseNumber
      ),
      replicationFactor: this.resolveValue(
        userKafka.replicationFactor,
        envNames.kafkaReplicationFactor,
        DEFAULT_KAFKA_CONFIG.replicationFactor,
        this.parseNumber
      )
    };

    const sasl = this.resolveSasl(envNames);
    if (sasl !== undefined) {
      config.sasl = sasl;
    }

    return config;
  }

  /**
   * Get Kafka consumer configuration
   */
  getConsumerConfig(): Required<ConsumerConfig> {
    const envNames = this.getEnvVarNames();
    const userConsumer = this.userConfig.consumer || {};

    return {
      sessionTimeout: this.resolveValue(
        userConsumer.sessionTimeout,
        envNames.consumerSessionTimeout,
        DEFAULT_CONSUMER_CONFIG.sessionTimeout,
        this.parseNumber
      ),
      heartbeatInterval: this.resolveValue(
        userConsumer.heartbeatInterval,
        envNames.consumerHeartbeatInterval,
        DEFAULT_CONSUMER_CONFIG.heartbeatInterval,
        this.parseNumber
      ),
      rebalanceTimeout: this.resolveValue(
        userConsumer.rebalanceTimeout,
        undefined,
        DEFAULT_CONSUMER_CONFIG.rebalanceTimeout
      ),
      maxWaitTimeInMs: this.resolveValue(
        userConsumer.maxWaitTimeInMs,
        undefined,
        DEFAULT_CONSUMER_CONFIG.maxWaitTimeInMs
      ),
      autoCreateTopic: this.resolveValue(
        userConsumer.autoCreateTopic,
        undefined,
        DEFAULT_CONSUMER_CONFIG.autoCreateTopic
      ),
      subscriptionTimeout: this.resolveValue(
        userConsumer.subscriptionTimeout,
        undefined,
        DEFAULT_CONSUMER_CONFIG.subscriptionTimeout
      ),
      fromBeginning: this.resolveValue(
        userConsumer.fromBeginning,
        undefined,
        DEFAULT_CONSUMER_CONFIG.fromBeginning
      )
    };
  }

  /**
   * Get Kafka producer configuration
   */
  getProducerConfig(): Required<ProducerConfig> {
    const envNames = this.getEnvVarNames();
    const userProducer = this.userConfig.producer || {};

    return {
      acks: this.resolveValue(
        userProducer.acks,
        envNames.producerAcks,
        DEFAULT_PRODUCER_CONFIG.acks,
        (v) => parseInt(v, 10) as -1 | 0 | 1
      ),
      timeout: this.resolveValue(
        userProducer.timeout,
        envNames.producerTimeout,
        DEFAULT_PRODUCER_CONFIG.timeout,
        this.parseNumber
      ),
      compression: this.resolveValue(
        userProducer.compression,
        envNames.producerCompression,
        DEFAULT_PRODUCER_CONFIG.compression
      )
    };
  }

  /**
   * Get message handler configuration
   */
  getHandlerConfig(): Omit<Required<MessageHandlerConfig>, 'deadLetterTopic'> & {
    deadLetterTopic?: string;
  } {
    const userHandler = this.userConfig.handler || {};

    const config: Omit<Required<MessageHandlerConfig>, 'deadLetterTopic'> & {
      deadLetterTopic?: string;
    } = {
      maxRetries: this.resolveValue(
        userHandler.maxRetries,
        undefined,
        DEFAULT_HANDLER_CONFIG.maxRetries,
        this.parseNumber
      ),
      retryDelay: this.resolveValue(
        userHandler.retryDelay,
        undefined,
        DEFAULT_HANDLER_CONFIG.retryDelay,
        this.parseNumber
      ),
      autoCreateTopic: this.resolveValue(
        userHandler.autoCreateTopic,
        undefined,
        DEFAULT_HANDLER_CONFIG.autoCreateTopic
      ),
      subscriptionTimeout: this.resolveValue(
        userHandler.subscriptionTimeout,
        undefined,
        DEFAULT_HANDLER_CONFIG.subscriptionTimeout,
        this.parseNumber
      )
    };

    const deadLetterTopic = this.resolveValue(
      userHandler.deadLetterTopic,
      undefined,
      DEFAULT_HANDLER_CONFIG.deadLetterTopic
    );
    if (deadLetterTopic !== undefined) {
      config.deadLetterTopic = deadLetterTopic;
    }

    return config;
  }

  /**
   * Get outbox configuration
   */
  getOutboxConfig(): Required<OutboxConfig> {
    const envNames = this.getEnvVarNames();
    const userOutbox = this.userConfig.outbox || {};

    return {
      enabled: this.resolveValue(
        userOutbox.enabled,
        envNames.outboxEnabled,
        DEFAULT_OUTBOX_CONFIG.enabled,
        this.parseBoolean
      ),
      pollInterval: this.resolveValue(
        userOutbox.pollInterval,
        envNames.outboxPollInterval,
        DEFAULT_OUTBOX_CONFIG.pollInterval,
        this.parseNumber
      ),
      batchSize: this.resolveValue(
        userOutbox.batchSize,
        envNames.outboxBatchSize,
        DEFAULT_OUTBOX_CONFIG.batchSize,
        this.parseNumber
      ),
      maxRetries: this.resolveValue(
        userOutbox.maxRetries,
        envNames.outboxMaxRetries,
        DEFAULT_OUTBOX_CONFIG.maxRetries,
        this.parseNumber
      ),
      retryBackoffMultiplier: this.resolveValue(
        userOutbox.retryBackoffMultiplier,
        envNames.outboxRetryBackoffMultiplier,
        DEFAULT_OUTBOX_CONFIG.retryBackoffMultiplier,
        this.parseNumber
      ),
      initialRetryDelay: this.resolveValue(
        userOutbox.initialRetryDelay,
        envNames.outboxInitialRetryDelay,
        DEFAULT_OUTBOX_CONFIG.initialRetryDelay,
        this.parseNumber
      ),
      cleanupInterval: this.resolveValue(
        userOutbox.cleanupInterval,
        envNames.outboxCleanupInterval,
        DEFAULT_OUTBOX_CONFIG.cleanupInterval,
        this.parseNumber
      ),
      retentionDays: this.resolveValue(
        userOutbox.retentionDays,
        envNames.outboxRetentionDays,
        DEFAULT_OUTBOX_CONFIG.retentionDays,
        this.parseNumber
      ),
      workerId: userOutbox.workerId || DEFAULT_OUTBOX_CONFIG.workerId
    };
  }

  /**
   * Get circuit breaker configuration
   */
  getCircuitBreakerConfig(): Required<CircuitBreakerConfig> {
    const envNames = this.getEnvVarNames();
    const userCircuitBreaker = this.userConfig.circuitBreaker || {};

    return {
      enabled: this.resolveValue(
        userCircuitBreaker.enabled,
        envNames.circuitBreakerEnabled,
        DEFAULT_CIRCUIT_BREAKER_CONFIG.enabled,
        this.parseBoolean
      ),
      threshold: this.resolveValue(
        userCircuitBreaker.threshold,
        envNames.circuitBreakerThreshold,
        DEFAULT_CIRCUIT_BREAKER_CONFIG.threshold,
        this.parseNumber
      ),
      timeoutMs: this.resolveValue(
        userCircuitBreaker.timeoutMs,
        envNames.circuitBreakerTimeoutMs,
        DEFAULT_CIRCUIT_BREAKER_CONFIG.timeoutMs,
        this.parseNumber
      )
    };
  }

  /**
   * Get integration configuration
   */
  getIntegrationConfig(): Required<IntegrationConfig> {
    const envNames = this.getEnvVarNames();
    const userIntegration = this.userConfig.integration || {};

    return {
      queuesEnabled: this.resolveValue(
        userIntegration.queuesEnabled,
        envNames.integrationQueuesEnabled,
        DEFAULT_INTEGRATION_CONFIG.queuesEnabled,
        this.parseBoolean
      ),
      pubsubEnabled: this.resolveValue(
        userIntegration.pubsubEnabled,
        envNames.integrationPubsubEnabled,
        DEFAULT_INTEGRATION_CONFIG.pubsubEnabled,
        this.parseBoolean
      ),
      tasksEnabled: this.resolveValue(
        userIntegration.tasksEnabled,
        envNames.integrationTasksEnabled,
        DEFAULT_INTEGRATION_CONFIG.tasksEnabled,
        this.parseBoolean
      )
    };
  }

  /**
   * Get dead letter queue configuration
   */
  getDeadLetterConfig(): Required<DeadLetterConfig> {
    const envNames = this.getEnvVarNames();
    const userDeadLetter = this.userConfig.deadLetter || {};

    return {
      enabled: this.resolveValue(
        userDeadLetter.enabled,
        envNames.deadLetterEnabled,
        DEFAULT_DEAD_LETTER_CONFIG.enabled,
        this.parseBoolean
      ),
      maxRetries: this.resolveValue(
        userDeadLetter.maxRetries,
        envNames.deadLetterMaxRetries,
        DEFAULT_DEAD_LETTER_CONFIG.maxRetries,
        this.parseNumber
      ),
      deadLetterTopic: this.resolveValue(
        userDeadLetter.deadLetterTopic,
        envNames.deadLetterTopic,
        DEFAULT_DEAD_LETTER_CONFIG.deadLetterTopic
      ),
      alertOnFailure: this.resolveValue(
        userDeadLetter.alertOnFailure,
        envNames.deadLetterAlertOnFailure,
        DEFAULT_DEAD_LETTER_CONFIG.alertOnFailure,
        this.parseBoolean
      ),
      retentionDays: this.resolveValue(
        userDeadLetter.retentionDays,
        envNames.deadLetterRetentionDays,
        DEFAULT_DEAD_LETTER_CONFIG.retentionDays,
        this.parseNumber
      ),
      cleanupInterval: this.resolveValue(
        userDeadLetter.cleanupInterval,
        envNames.deadLetterCleanupInterval,
        DEFAULT_DEAD_LETTER_CONFIG.cleanupInterval,
        this.parseNumber
      )
    };
  }

  /**
   * Get event replay configuration
   */
  getReplayConfig(): Required<ReplayConfig> {
    const envNames = this.getEnvVarNames();
    const userReplay = this.userConfig.replay || {};

    return {
      enabled: this.resolveValue(
        userReplay.enabled,
        envNames.replayEnabled,
        DEFAULT_REPLAY_CONFIG.enabled,
        this.parseBoolean
      ),
      maxParallel: this.resolveValue(
        userReplay.maxParallel,
        envNames.replayMaxParallel,
        DEFAULT_REPLAY_CONFIG.maxParallel,
        this.parseNumber
      ),
      batchSize: this.resolveValue(
        userReplay.batchSize,
        envNames.replayBatchSize,
        DEFAULT_REPLAY_CONFIG.batchSize,
        this.parseNumber
      ),
      stopOnError: this.resolveValue(
        userReplay.stopOnError,
        envNames.replayStopOnError,
        DEFAULT_REPLAY_CONFIG.stopOnError,
        this.parseBoolean
      ),
      retentionDays: this.resolveValue(
        userReplay.retentionDays,
        envNames.replayRetentionDays,
        DEFAULT_REPLAY_CONFIG.retentionDays,
        this.parseNumber
      ),
      cleanupInterval: this.resolveValue(
        userReplay.cleanupInterval,
        envNames.replayCleanupInterval,
        DEFAULT_REPLAY_CONFIG.cleanupInterval,
        this.parseNumber
      )
    };
  }

  /**
   * Get routing configuration
   */
  getRoutingConfig(): ResolvedEventRoutingConfig {
    const userRouting = this.userConfig.routing as EventRoutingConfig | undefined;
    return resolveRoutingConfig(userRouting);
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): ResolvedInfrastructureEventsConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    const envNames = this.getEnvVarNames();
    return {
      enableGracefulShutdown: this.userConfig.enableGracefulShutdown !== false,
      enabled: this.resolveValue(
        this.userConfig.enabled,
        envNames.eventsEnabled,
        true,
        this.parseBoolean
      ),
      kafka: this.getKafkaConfig(),
      consumer: this.getConsumerConfig(),
      producer: this.getProducerConfig(),
      handler: this.getHandlerConfig(),
      outbox: this.getOutboxConfig(),
      deadLetter: this.getDeadLetterConfig(),
      replay: this.getReplayConfig(),
      circuitBreaker: this.getCircuitBreakerConfig(),
      integration: this.getIntegrationConfig(),
      routing: this.getRoutingConfig(),
      eventTypeValidationEnabled: this.resolveValue(
        undefined,
        envNames.eventsTypeValidationEnabled,
        true,
        this.parseBoolean
      ),
      outboxConnectionRetryMax: this.resolveValue(
        undefined,
        envNames.outboxConnectionRetryMax,
        3,
        this.parseNumber
      ),
      outboxConnectionRetryDelayMs: this.resolveValue(
        undefined,
        envNames.outboxConnectionRetryDelayMs,
        2000,
        this.parseNumber
      )
    };
  }
}

/**
 * Resolve configuration from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/events';
 *
 * const config = resolveConfig({
 *   kafka: {
 *     brokers: ['localhost:9092'],
 *     clientId: 'my-app',
 *   },
 *   outbox: {
 *     enabled: true,
 *     pollInterval: 5000,
 *   },
 * });
 * ```
 */
export function resolveConfig(
  userConfig: InfrastructureEventsConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedInfrastructureEventsConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

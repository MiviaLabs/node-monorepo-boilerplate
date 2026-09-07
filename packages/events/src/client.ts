import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Kafka, Producer, Consumer, SASLOptions } from 'kafkajs';
import { z } from 'zod';

import {
  resolveConfig,
  type ResolvedInfrastructureEventsConfig,
  type InfrastructureEventsConfig
} from './config';
import { logger } from './logging/logger';

// Note: Using inline validation to avoid circular dependency
// When @package/schema is available, import parseSafe from there
type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; error: z.ZodError };

function parseSafe<T>(schema: z.ZodSchema<T>, data: unknown): ParseSuccess<T> | ParseFailure {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Circuit breaker state enum
 */
enum CircuitBreakerState {
  CLOSED = 'closed', // Circuit is closed, requests flow through
  OPEN = 'open', // Circuit is open, requests are blocked
  HALF_OPEN = 'half_open' // Circuit is half-open, testing if service has recovered
}

/**
 * Kafka configuration schema with validation
 */
const kafkaConfigSchema = z.object({
  brokers: z.array(z.string().min(1)).min(1),
  clientId: z.string().min(1).optional(),
  ssl: z.boolean().optional(),
  sasl: z.any().optional(), // Accept any SASLOptions from KafkaJS
  connectionTimeout: z.number().int().positive().max(60000).optional(),
  requestTimeout: z.number().int().positive().max(300000).optional(),
  retryInterval: z.number().int().positive().max(60000).optional(),
  maxRetries: z.number().int().positive().max(10).optional()
});

export type KafkaConfig = Omit<z.infer<typeof kafkaConfigSchema>, 'sasl'> & {
  sasl?: SASLOptions;
};

/**
 * Kafka client singleton with lifecycle management
 */
class KafkaClientManager {
  private kafkaInstance: Kafka | null = null;
  private producerInstance: Producer | null = null;
  private isProducerConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isClosing = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000; // 5 seconds
  private readonly tracer = trace.getTracer('KafkaClientManager');
  private static config: ResolvedInfrastructureEventsConfig | null = null;
  static userConfig: InfrastructureEventsConfig | null = null;

  // Circuit breaker state
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private circuitBreakerFailureCount = 0;
  // @ts-expect-error - Property used for debugging, not currently used
  private _circuitBreakerLastFailureTime: number | null = null;
  private circuitBreakerHalfOpenTimeout: NodeJS.Timeout | null = null;

  /**
   * Set Kafka configuration (used by forRootAsync)
   */
  static setConfig(config: InfrastructureEventsConfig): void {
    KafkaClientManager.userConfig = config;
    // Resolve the configuration immediately to store resolved version
    KafkaClientManager.config = resolveConfig(config);
  }

  /**
   * Get Kafka configuration (returns static config or null)
   */
  static getConfig(): ResolvedInfrastructureEventsConfig | null {
    return KafkaClientManager.config;
  }

  /**
   * Reset Kafka configuration (for testing)
   */
  static resetConfig(): void {
    KafkaClientManager.config = null;
    KafkaClientManager.userConfig = null;
  }

  /**
   * Get effective Kafka config (static config takes precedence over env vars)
   */
  private getEffectiveConfig(): ResolvedInfrastructureEventsConfig {
    if (KafkaClientManager.config) {
      return KafkaClientManager.config;
    }

    // Resolve from environment and defaults
    const resolved = resolveConfig(KafkaClientManager.userConfig || {});
    return resolved;
  }

  /**
   * Check if circuit breaker is enabled in config
   */
  private isCircuitBreakerEnabled(): boolean {
    const config = this.getEffectiveConfig();
    return config.circuitBreaker.enabled;
  }

  /**
   * Handle circuit breaker state on success
   */
  private handleCircuitBreakerSuccess(): void {
    if (!this.isCircuitBreakerEnabled()) return;

    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      logger.info('Circuit breaker: Service recovered, closing circuit');
      this.circuitBreakerState = CircuitBreakerState.CLOSED;
    }

    this.circuitBreakerFailureCount = 0;
    this._circuitBreakerLastFailureTime = null;

    if (this.circuitBreakerHalfOpenTimeout) {
      clearTimeout(this.circuitBreakerHalfOpenTimeout);
      this.circuitBreakerHalfOpenTimeout = null;
    }
  }

  /**
   * Handle circuit breaker state on failure
   */
  private handleCircuitBreakerFailure(): void {
    if (!this.isCircuitBreakerEnabled()) return;

    const config = this.getEffectiveConfig();
    this.circuitBreakerFailureCount++;
    this._circuitBreakerLastFailureTime = Date.now();

    if (
      this.circuitBreakerState === CircuitBreakerState.CLOSED &&
      this.circuitBreakerFailureCount >= config.circuitBreaker.threshold
    ) {
      logger.warn(
        `Circuit breaker: Threshold reached (${config.circuitBreaker.threshold} failures), opening circuit`
      );
      this.circuitBreakerState = CircuitBreakerState.OPEN;

      // Schedule transition to HALF_OPEN after timeout
      const timeoutMs = config.circuitBreaker.timeoutMs;
      this.circuitBreakerHalfOpenTimeout = setTimeout(() => {
        logger.info('Circuit breaker: Transitioning to HALF_OPEN state');
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.circuitBreakerHalfOpenTimeout = null;
      }, timeoutMs);
    } else if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      logger.warn('Circuit breaker: Failure in HALF_OPEN state, opening circuit again');
      this.circuitBreakerState = CircuitBreakerState.OPEN;

      // Schedule transition to HALF_OPEN after timeout
      const timeoutMs = config.circuitBreaker.timeoutMs;
      this.circuitBreakerHalfOpenTimeout = setTimeout(() => {
        logger.info('Circuit breaker: Transitioning to HALF_OPEN state');
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        this.circuitBreakerHalfOpenTimeout = null;
      }, timeoutMs);
    }
  }

  /**
   * Check if circuit breaker allows requests
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.isCircuitBreakerEnabled()) return false;

    const isOpen = this.circuitBreakerState === CircuitBreakerState.OPEN;
    if (isOpen) {
      logger.info('Circuit breaker: Request blocked (circuit is open)');
    }
    return isOpen;
  }

  /**
   * Create or get existing Kafka client
   */
  createKafkaClient(config: KafkaConfig): Kafka {
    if (this.kafkaInstance) {
      return this.kafkaInstance;
    }

    // Validate config
    const validationResult = parseSafe(kafkaConfigSchema, config);
    if (!validationResult.success) {
      throw new Error(
        `Invalid Kafka configuration: ${(validationResult as ParseFailure).error.message}`
      );
    }

    const validConfig = validationResult.data;

    this.kafkaInstance = new Kafka({
      clientId: validConfig.clientId ?? this.getEffectiveConfig().kafka.clientId,
      brokers: validConfig.brokers,
      ssl: validConfig.ssl ?? this.getEffectiveConfig().kafka.ssl,
      sasl: validConfig.sasl,
      connectionTimeout:
        validConfig.connectionTimeout ?? this.getEffectiveConfig().kafka.connectionTimeout,
      requestTimeout: validConfig.requestTimeout ?? this.getEffectiveConfig().kafka.requestTimeout
    });

    return this.kafkaInstance;
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    retryInterval: number = 5000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          `Kafka connection attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          logger.info(`Retrying in ${retryInterval}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
      }
    }

    throw new Error(
      `Kafka connection failed after ${maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`
    );
  }

  /**
   * Get producer with auto-reconnect and circuit breaker
   */
  async getProducer(): Promise<Producer> {
    this.isClosing = false;

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error(
        'Circuit breaker is open - Kafka connections are temporarily blocked due to repeated failures'
      );
    }

    if (this.producerInstance && this.isProducerConnected) {
      return this.producerInstance;
    }

    return this.tracer.startActiveSpan('KafkaClient.getProducer', async (span) => {
      try {
        const resolvedConfig = this.getEffectiveConfig();

        span.setAttribute('kafka.client_id', resolvedConfig.kafka.clientId);

        const kafkaConfig: {
          brokers: string[];
          clientId: string;
          ssl: boolean;
          sasl?: { mechanism: string; username: string; password: string };
        } = {
          brokers: resolvedConfig.kafka.brokers,
          clientId: resolvedConfig.kafka.clientId,
          ssl: resolvedConfig.kafka.ssl
        };
        if (resolvedConfig.kafka.sasl) {
          kafkaConfig.sasl = resolvedConfig.kafka.sasl as {
            mechanism: string;
            username: string;
            password: string;
          };
        }
        const kafka = this.createKafkaClient(kafkaConfig as KafkaConfig);

        if (!this.producerInstance) {
          this.producerInstance = kafka.producer();
        }

        // Use resolved retry config
        const maxRetries = resolvedConfig.kafka.maxRetries;
        const retryInterval = resolvedConfig.kafka.retryInterval;

        await this.retryOperation(
          async () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await this.producerInstance!.connect();
            this.isProducerConnected = true;
            this.reconnectAttempts = 0; // Reset reconnect attempts on success
            // Handle circuit breaker success
            this.handleCircuitBreakerSuccess();
          },
          maxRetries,
          retryInterval
        );

        // Set up event listeners
        this.setupProducerEventListeners();

        span.setStatus({ code: SpanStatusCode.OK });
        return this.producerInstance;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        // Handle circuit breaker failure
        this.handleCircuitBreakerFailure();
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Set up producer event listeners with auto-reconnect
   */
  private setupProducerEventListeners(): void {
    if (!this.producerInstance) return;

    this.producerInstance.on('producer.network.request_timeout', () => {
      logger.warn('Kafka Producer: Request timeout');
    });

    this.producerInstance.on('producer.disconnect', async () => {
      if (this.isClosing) {
        return;
      }

      logger.warn('Kafka Producer: Disconnected');
      this.isProducerConnected = false;
      await this.scheduleReconnect();
    });
  }

  /**
   * Schedule automatic reconnection
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.isClosing || !this.producerInstance) {
      return;
    }

    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Kafka Producer: Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `Kafka Producer: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      if (this.isClosing || !this.producerInstance) {
        return;
      }

      try {
        await this.getProducer();
      } catch (error) {
        logger.error(
          `Kafka Producer: Reconnect attempt ${this.reconnectAttempts} failed: ${(error as Error).message}`
        );
        await this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  /**
   * Ensure internal Kafka topics exist
   *
   * For single-broker Kafka deployments, internal topics like
   * __consumer_offsets may not be pre-created with the correct
   * replication factor. This method ensures these topics exist before
   * creating consumers.
   */
  private async ensureInternalTopics(): Promise<void> {
    await this.tracer.startActiveSpan('KafkaClient.ensureInternalTopics', async (span) => {
      try {
        const resolvedConfig = this.getEffectiveConfig();
        const replicationFactor = resolvedConfig.kafka.replicationFactor;

        span.setAttribute('kafka.replication_factor', replicationFactor);

        // Create admin client
        const kafka = this.createKafkaClient({
          brokers: resolvedConfig.kafka.brokers,
          clientId: resolvedConfig.kafka.clientId
        });
        const admin = kafka.admin();

        await admin.connect();

        try {
          // List existing topics
          const topics = await admin.listTopics();
          span.setAttribute('kafka.existing_topics', topics.length);

          // Check if __consumer_offsets topic exists
          const consumerOffsetsTopic = '__consumer_offsets';
          if (!topics.includes(consumerOffsetsTopic)) {
            logger.info(
              `Creating internal topic '${consumerOffsetsTopic}' with replication factor ${replicationFactor}`
            );

            await admin.createTopics({
              topics: [
                {
                  topic: consumerOffsetsTopic,
                  numPartitions: 50, // Kafka default for __consumer_offsets
                  replicationFactor
                }
              ]
            });

            logger.info(`Successfully created internal topic '${consumerOffsetsTopic}'`);
            span.setAttribute('kafka.topic_created', consumerOffsetsTopic);
          } else {
            logger.info(`Internal topic '${consumerOffsetsTopic}' already exists`);
            span.setAttribute('kafka.topic_already_exists', consumerOffsetsTopic);
          }
        } finally {
          await admin.disconnect();
        }

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        // Log warning but don't fail - topic may already exist or may not be needed
        logger.warn(
          `Failed to ensure internal topics: ${(error as Error).message}. This may not be critical.`
        );
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Create consumer with proper lifecycle management
   *
   * Uses higher timeouts for consumer group stability:
   * - Higher session timeout for group coordinator stability
   * - Higher heartbeat interval for network tolerance
   * - Longer rebalance timeout for multi-broker setups
   * - Internal topics pre-created with proper replication factor
   */
  async createConsumer(consumerGroupId: string): Promise<Consumer> {
    return this.tracer.startActiveSpan('KafkaClient.createConsumer', async (span) => {
      try {
        const resolvedConfig = this.getEffectiveConfig();

        span.setAttribute('kafka.consumer_group_id', consumerGroupId);

        // Ensure internal topics exist before creating consumer
        await this.ensureInternalTopics();

        const kafka = this.createKafkaClient({
          brokers: resolvedConfig.kafka.brokers,
          clientId: resolvedConfig.kafka.clientId
        });

        // Consumer configuration from resolved config
        const consumerConfig = resolvedConfig.consumer;
        const consumer = kafka.consumer({
          groupId: consumerGroupId,
          sessionTimeout: consumerConfig.sessionTimeout,
          heartbeatInterval: consumerConfig.heartbeatInterval,
          rebalanceTimeout: consumerConfig.rebalanceTimeout,
          maxWaitTimeInMs: consumerConfig.maxWaitTimeInMs
        });

        span.setStatus({ code: SpanStatusCode.OK });
        return consumer;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Close producer connection
   */
  async closeProducer(): Promise<void> {
    this.isClosing = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.circuitBreakerHalfOpenTimeout) {
      clearTimeout(this.circuitBreakerHalfOpenTimeout);
      this.circuitBreakerHalfOpenTimeout = null;
    }

    if (this.producerInstance && this.isProducerConnected) {
      await this.producerInstance.disconnect();
      this.isProducerConnected = false;
    }
    this.producerInstance = null;

    // Reset circuit breaker state
    this.circuitBreakerState = CircuitBreakerState.CLOSED;
    this.circuitBreakerFailureCount = 0;
    this._circuitBreakerLastFailureTime = null;
  }

  /**
   * Close all Kafka connections
   */
  async closeKafka(): Promise<void> {
    await this.closeProducer();
    this.kafkaInstance = null;
  }

  /**
   * Health check with tracing
   */
  async healthCheck(): Promise<boolean> {
    return this.tracer.startActiveSpan('KafkaClient.healthCheck', async (span) => {
      try {
        await this.getProducer();

        if (!this.isProducerConnected) {
          span.setAttribute('health.status', 'unhealthy');
          span.setAttribute('health.reason', 'producer_not_connected');
          return false;
        }

        const resolvedConfig = this.getEffectiveConfig();

        const admin = this.createKafkaClient({
          brokers: resolvedConfig.kafka.brokers,
          clientId: resolvedConfig.kafka.clientId
        }).admin();

        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();

        span.setAttribute('health.status', 'healthy');
        span.setStatus({ code: SpanStatusCode.OK });
        return true;
      } catch (error) {
        span.recordException(error as Error);
        span.setAttribute('health.status', 'unhealthy');
        span.setAttribute('health.error', (error as Error).message);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        return false;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown(): void {
    const shutdownHandler = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down Kafka gracefully...`);
      try {
        await this.closeKafka();
        logger.info('Kafka closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during Kafka shutdown: ${(error as Error).message}`);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => void shutdownHandler('SIGINT'));
  }
}

// Singleton instance
const kafkaManager = new KafkaClientManager();

// Export functions for backward compatibility

/**
 * Create or get existing Kafka client
 *
 * @param config - Kafka configuration including brokers, clientId, SSL/SASL settings
 * @returns Kafka client instance
 * @throws {Error} When configuration is invalid (e.g., empty or missing brokers array,
 *   invalid clientId, malformed SSL/SASL settings, or connection/request timeout values
 *   outside allowed ranges)
 */
export function createKafkaClient(config: KafkaConfig): Kafka {
  return kafkaManager.createKafkaClient(config);
}

/**
 * Get Kafka producer with auto-reconnect and circuit breaker
 *
 * @returns Promise resolving to the Kafka producer instance
 * @throws {Error} When the circuit breaker is open (Kafka connections are temporarily
 *   blocked due to repeated failures; wait for the circuit breaker timeout to elapse)
 * @throws {Error} When connection attempts fail after all retries are exhausted
 *   (check broker availability, network connectivity, and authentication settings)
 */
export async function getProducer(): Promise<Producer> {
  return kafkaManager.getProducer();
}

/**
 * Create Kafka consumer with proper lifecycle management
 *
 * @param consumerGroupId - Consumer group ID for the consumer. For multi-tenant applications,
 *   this should follow tenant isolation conventions by prefixing with the tenant ID
 *   (e.g., `tenant-123-order-processor`) to ensure proper data isolation between tenants.
 * @returns Promise resolving to the Kafka consumer instance
 */
export async function createConsumer(consumerGroupId: string): Promise<Consumer> {
  return kafkaManager.createConsumer(consumerGroupId);
}

/**
 * Close producer connection
 *
 * @returns Promise that resolves when the producer is disconnected
 */
export async function closeProducer(): Promise<void> {
  return kafkaManager.closeProducer();
}

/**
 * Close all Kafka connections
 *
 * @returns Promise that resolves when all Kafka connections are closed
 */
export async function closeKafka(): Promise<void> {
  return kafkaManager.closeKafka();
}

/**
 * Perform health check on Kafka connection
 *
 * @returns Promise resolving to true if healthy, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  return kafkaManager.healthCheck();
}

/**
 * Setup graceful shutdown handlers for SIGTERM and SIGINT signals
 *
 * @returns void
 */
export function setupGracefulShutdown(): void {
  kafkaManager.setupGracefulShutdown();
}

/**
 * Set Kafka configuration (used by EventsModule.forRootAsync)
 *
 * @param config - Kafka configuration object
 */
export function setKafkaConfig(config: InfrastructureEventsConfig): void {
  KafkaClientManager.setConfig(config);
}

/**
 * Get Kafka replication factor from configuration
 *
 * Reads from user config, environment variable, or defaults to 1.
 *
 * @returns Replication factor (positive integer)
 */
export function getReplicationFactor(): number {
  const resolved = resolveConfig(KafkaClientManager.userConfig || {});
  return resolved.kafka.replicationFactor;
}

/**
 * Get Kafka client ID from configuration
 *
 * Reads from user config, environment variable, or defaults.
 *
 * @returns Client ID string
 */
export function getClientId(): string {
  const resolved = resolveConfig(KafkaClientManager.userConfig || {});
  return resolved.kafka.clientId;
}

// Export KafkaClientManager for testing purposes
export { KafkaClientManager };
export { kafkaConfigSchema };

/**
 * Parse Kafka brokers string from environment or configuration
 *
 * Handles protocol prefixes like INTERNAL://, PLAINTEXT://, etc.
 * KafkaJS expects host:port format without protocol prefix.
 *
 * @example
 * ```typescript
 * // Format with protocol prefix
 * parseKafkaBrokers('INTERNAL://kafka.example.internal:29092')
 * // Returns: ['kafka.example.internal:29092']
 *
 * // Standard format
 * parseKafkaBrokers('localhost:9092,localhost:9093')
 * // Returns: ['localhost:9092', 'localhost:9093']
 *
 * // Mixed formats
 * parseKafkaBrokers('INTERNAL://kafka.example.internal:29092,PLAINTEXT://kafka.example.com:9092')
 * // Returns: ['kafka.example.internal:29092', 'kafka.example.com:9092']
 * ```
 *
 * @param brokersString - Comma-separated broker list with optional protocol prefixes
 * @returns Array of parsed broker strings in host:port format
 */
export function parseKafkaBrokers(brokersString: string): string[] {
  return brokersString
    .split(',')
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((b) => {
      // Remove protocol prefixes like INTERNAL://, PLAINTEXT://, etc.
      // KafkaJS expects host:port format without protocol prefix
      return b.replace(/^[a-zA-Z]+:\/\//, '');
    });
}

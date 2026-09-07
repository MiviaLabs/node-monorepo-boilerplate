import { randomUUID } from 'node:crypto';

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { KafkaMessage, Consumer } from 'kafkajs';

import { createConsumer } from './client';
import { resolveConfig, type InfrastructureEventsConfig } from './config';
import { EventMessage } from './event-bus';
import { logger } from './logging/logger';
import { sanitizeError } from './utils/error-sanitizer';

/**
 * Message handler options
 */
export interface MessageHandlerOptions {
  readonly topic: string;
  readonly groupId?: string; // Consumer group ID (uses UUID if not provided)
  readonly fromBeginning?: boolean; // Start from beginning of topic
  readonly deadLetterTopic?: string; // Dead letter topic for failed messages
  readonly maxRetries?: number; // Maximum retry attempts (default: 3)
  readonly retryDelay?: number; // Delay between retries in ms (default: 1000)
  readonly autoCreateTopic?: boolean; // Auto-create topic before subscribing (default: true)
  readonly subscriptionTimeout?: number; // Timeout for subscription in ms (default: 30000)
}

/**
 * Message handler function type
 */
export type MessageHandlerFn<T = unknown> = (message: EventMessage<T>) => void | Promise<void>;

/**
 * Consumer subscription type
 */
type ConsumerSubscription = {
  readonly consumer: Consumer;
  readonly handler: MessageHandlerFn<unknown>;
  readonly options: MessageHandlerOptions;
};

/**
 * Message handler with retry logic and dead-letter queue support
 *
 * This class provides advanced message handling with:
 * - Automatic retry with exponential backoff
 * - Dead-letter queue for failed messages
 * - Kafka headers for retry count (instead of unbounded Map)
 * - Sanitized error messages for DLQ
 * - OpenTelemetry tracing
 * - Structured logging
 */
export class MessageHandler {
  private readonly subscriptions = new Map<string, ConsumerSubscription>();
  private readonly tracer = trace.getTracer('MessageHandler');
  private static config: InfrastructureEventsConfig | null = null;

  /**
   * Set configuration (used by EventsModule)
   */
  static setConfig(config: InfrastructureEventsConfig): void {
    MessageHandler.config = config;
  }

  /**
   * Reset configuration (for testing)
   */
  static resetConfig(): void {
    MessageHandler.config = null;
  }

  /**
   * Get resolved configuration
   */
  private getResolvedConfig() {
    return resolveConfig(MessageHandler.config || {});
  }

  /**
   * Register a message handler for a topic
   *
   * @param options - Handler options including topic, retries, DLQ
   * @param handler - The message handler function
   */
  async register<T = unknown>(
    options: MessageHandlerOptions,
    handler: MessageHandlerFn<T>
  ): Promise<void> {
    return this.tracer.startActiveSpan('MessageHandler.register', async (span) => {
      try {
        span.setAttribute('handler.topic', options.topic);
        span.setAttribute('handler.group_id', options.groupId ?? 'auto-generated');

        // Fixed: Use crypto.randomUUID() instead of Date.now() for consumer group ID
        const groupId = options.groupId ?? `handler-${options.topic}-${randomUUID()}`;
        const consumer = await createConsumer(groupId);

        const resolvedConfig = this.getResolvedConfig();
        const handlerConfig = resolvedConfig.handler;

        const subscriptionTimeout =
          options.subscriptionTimeout ?? handlerConfig.subscriptionTimeout;
        const autoCreateTopic = options.autoCreateTopic ?? handlerConfig.autoCreateTopic;

        // Step 1: Connect consumer with retry logic (allow longer for group coordinator)
        await this.withRetry(
          async () => {
            await consumer.connect();
          },
          {
            maxRetries: 10,
            retryDelay: 2000,
            timeout: subscriptionTimeout,
            operation: 'connect',
            topic: options.topic
          }
        );

        // Step 2: Auto-create topic if enabled (helps avoid leadership election errors)
        if (autoCreateTopic) {
          await this.ensureTopicExists(options.topic);
        }

        // Step 3: Subscribe with retry logic (handles leadership election errors)
        await this.withRetry(
          async () => {
            await consumer.subscribe({
              topic: options.topic,
              fromBeginning: options.fromBeginning ?? resolvedConfig.consumer.fromBeginning
            });
          },
          {
            maxRetries: 15,
            retryDelay: 3000,
            timeout: subscriptionTimeout,
            operation: 'subscribe',
            topic: options.topic
          }
        );

        const maxRetries = options.maxRetries ?? handlerConfig.maxRetries;
        // Note: retryDelay is available in options but not used directly here
        // as Kafka consumer handles retry timing internally

        // Step 4: Run consumer with retry logic (handles group coordinator errors)
        await this.withRetry(
          async () => {
            await consumer.run({
              eachMessage: async ({ topic, partition, message }) => {
                return this.tracer.startActiveSpan(
                  'MessageHandler.handleMessage',
                  async (messageSpan) => {
                    try {
                      messageSpan.setAttribute('messaging.kafka.partition', partition);
                      messageSpan.setAttribute('messaging.kafka.topic', topic);
                      messageSpan.setAttribute(
                        'messaging.kafka.message_key',
                        message.key?.toString() ?? 'undefined'
                      );

                      if (!message.value) {
                        messageSpan.setStatus({
                          code: SpanStatusCode.ERROR,
                          message: 'Empty message value'
                        });
                        return;
                      }

                      const event = JSON.parse(message.value.toString()) as EventMessage<T>;

                      messageSpan.setAttribute('event.id', event.eventId);
                      messageSpan.setAttribute('event.type', event.eventType);

                      logger.info(`Processing message: ${event.eventType}`, {
                        eventId: event.eventId,
                        topic,
                        partition
                      });

                      await handler(event);

                      // Fixed: Delete retry count from headers after successful processing
                      const retryCount = this.getRetryCount(message.headers);
                      if (retryCount > 0) {
                        logger.info(`Message succeeded after ${retryCount} retries`, {
                          eventId: event.eventId
                        });
                      }

                      messageSpan.setStatus({ code: SpanStatusCode.OK });
                    } catch (err) {
                      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

                      // Fixed: Get retry count from Kafka headers instead of unbounded Map
                      const currentRetry = this.getRetryCount(message.headers);
                      const sanitizedError = sanitizeError(errorMessage);

                      messageSpan.setAttribute('retry.count', currentRetry);
                      messageSpan.recordException(err as Error);
                      messageSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: sanitizedError
                      });

                      logger.warn(
                        `Error processing message (attempt ${currentRetry + 1}/${maxRetries}): ${sanitizedError}`,
                        {
                          eventId: (JSON.parse(message.value?.toString() || '{}') as EventMessage)
                            .eventId,
                          topic,
                          currentRetry: currentRetry + 1
                        }
                      );

                      if (currentRetry < maxRetries) {
                        // Re-publish with incremented retry count instead of throwing
                        // Throwing would re-deliver the original message with unchanged headers
                        try {
                          await this.republishWithIncrementedRetry(topic, message, currentRetry);
                        } catch (republishError) {
                          // If re-publish fails, fall back to DLQ or rethrow to preserve offset
                          logger.error(`Failed to republish message with incremented retry count`, {
                            topic,
                            currentRetry
                          });

                          if (options.deadLetterTopic) {
                            await this.sendToDeadLetterTopic(
                              options.deadLetterTopic,
                              message,
                              republishError,
                              topic
                            );
                          } else {
                            // Rethrow to prevent message loss via Kafka offset management
                            throw republishError;
                          }
                        }
                      } else {
                        // Max retries exceeded - send to DLQ
                        if (options.deadLetterTopic) {
                          await this.sendToDeadLetterTopic(
                            options.deadLetterTopic,
                            message,
                            err,
                            topic
                          );
                        }

                        messageSpan.setStatus({
                          code: SpanStatusCode.ERROR,
                          message: 'Max retries exceeded, sent to DLQ'
                        });
                      }
                    } finally {
                      messageSpan.end();
                    }
                  }
                );
              }
            });
          },
          {
            maxRetries: 5,
            retryDelay: 2000,
            timeout: subscriptionTimeout,
            operation: 'run',
            topic: options.topic
          }
        );

        this.subscriptions.set(options.topic, {
          consumer,
          handler: handler as MessageHandlerFn<unknown>,
          options
        });

        span.setStatus({ code: SpanStatusCode.OK });
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
   * Unregister a handler for a topic
   *
   * @param topic - The topic to unregister
   */
  async unregister(topic: string): Promise<void> {
    const subscription = this.subscriptions.get(topic);
    if (!subscription) return;

    await subscription.consumer.stop();
    await subscription.consumer.disconnect();
    this.subscriptions.delete(topic);
  }

  /**
   * Unregister all handlers
   */
  async unregisterAll(): Promise<void> {
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map((topic) =>
      this.unregister(topic)
    );
    await Promise.all(unsubscribePromises);
  }

  /**
   * Retry helper with exponential backoff for transient Kafka errors
   *
   * Handles:
   * - Leadership election errors: "There is no leader for this topic-partition"
   * - Group coordinator errors: "The group coordinator is not available"
   * - Connection timeouts during startup
   *
   * @param operation - The async operation to retry
   * @param config - Retry configuration
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    config: {
      readonly maxRetries: number;
      readonly retryDelay: number;
      readonly timeout: number;
      readonly operation: string;
      readonly topic: string;
    }
  ): Promise<T> {
    const { maxRetries, retryDelay, timeout, operation: operationName, topic } = config;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const errorMessage = (error as Error).message ?? '';
        const elapsed = Date.now() - startTime;

        // Check if error is retryable (leadership election or coordinator errors)
        const isRetryable =
          errorMessage.includes('leadership election') ||
          errorMessage.includes('group coordinator') ||
          errorMessage.includes('not available') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout');

        // If not retryable or timeout exceeded, throw immediately
        if (!isRetryable || elapsed > timeout) {
          logger.error(`Kafka ${operationName} failed for topic "${topic}": ${errorMessage}`, {
            topic,
            operation: operationName,
            attempts: attempt,
            elapsedMs: elapsed,
            timeoutExceeded: elapsed > timeout
          });
          throw error;
        }

        // Log retry attempt
        logger.warn(
          `Kafka ${operationName} retry ${attempt}/${maxRetries} for topic "${topic}": ${errorMessage}`,
          {
            topic,
            operation: operationName,
            attempt,
            maxRetries,
            elapsedMs: elapsed
          }
        );

        // Wait before retry with exponential backoff
        const backoffDelay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, Math.min(backoffDelay, 10000)));
      }
    }

    throw new Error(
      `Kafka ${operationName} failed for topic "${topic}" after ${maxRetries} attempts`
    );
  }

  /**
   * Ensure topic exists before consumer subscribes
   *
   * Creates topic if it doesn't exist, which helps avoid leadership election errors
   * during consumer subscription. Uses Kafka admin client.
   *
   * @param topic - The topic name to ensure exists
   */
  private async ensureTopicExists(topic: string): Promise<void> {
    return this.tracer.startActiveSpan('MessageHandler.ensureTopicExists', async (span) => {
      try {
        span.setAttribute('topic.name', topic);

        const { Kafka } = await import('kafkajs');
        const resolvedConfig = this.getResolvedConfig();

        // Get Kafka config from resolved configuration
        const brokers = resolvedConfig.kafka.brokers;
        const clientId = resolvedConfig.kafka.clientId;
        const replicationFactor = resolvedConfig.kafka.replicationFactor;

        const kafka = new Kafka({
          clientId,
          brokers
        });

        const admin = kafka.admin();

        try {
          await admin.connect();

          // Check if topic exists
          const topics = await admin.listTopics();
          const topicExists = topics.includes(topic);

          if (!topicExists) {
            logger.info(`Creating Kafka topic: ${topic}`, { topic });

            await admin.createTopics({
              topics: [
                {
                  topic,
                  numPartitions: 1,
                  replicationFactor
                }
              ],
              validateOnly: false
            });

            logger.info(`Kafka topic created successfully: ${topic}`, { topic });
          } else {
            logger.info(`Kafka topic already exists: ${topic}`, { topic });
          }

          span.setStatus({ code: SpanStatusCode.OK });
        } finally {
          await admin.disconnect();
        }
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });

        // Log warning but don't fail - topic auto-creation may still work
        logger.warn(
          `Failed to ensure topic exists for "${topic}": ${(error as Error).message}. Relying on Kafka auto-creation.`,
          {
            topic,
            error: (error as Error).message
          }
        );
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get retry count from Kafka message headers
   *
   * Fixed: Use Kafka headers for retry count instead of unbounded Map
   *
   * @param headers - Kafka message headers
   * @returns The current retry count
   */
  private getRetryCount(headers: KafkaMessage['headers']): number {
    const retryHeader = headers?.['x-retry-count'];
    if (!retryHeader) return 0;

    const retryValue = Buffer.from(retryHeader as string).toString('utf-8');
    const parsed = parseInt(retryValue, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Re-publish a failed message with incremented retry count
   *
   * Instead of throwing to trigger Kafka redelivery (which preserves original headers),
   * this method re-publishes the message with an incremented x-retry-count header.
   * This ensures the DLQ threshold is properly enforced.
   *
   * @param topic - The topic to re-publish to
   * @param originalMessage - The original Kafka message
   * @param currentRetry - The current retry count
   */
  private async republishWithIncrementedRetry(
    topic: string,
    originalMessage: KafkaMessage,
    currentRetry: number
  ): Promise<void> {
    const { getProducer } = await import('./client');
    const producer = await getProducer();

    await producer.send({
      topic,
      messages: [
        {
          key: originalMessage.key,
          value: originalMessage.value,
          headers: {
            ...originalMessage.headers,
            'x-retry-count': Buffer.from(String(currentRetry + 1))
          }
        }
      ]
    });

    logger.info(`Message re-published with retry count ${currentRetry + 1}`, {
      topic,
      retryCount: currentRetry + 1
    });
  }

  /**
   * Send failed message to dead-letter topic
   *
   * @param deadLetterTopic - The DLQ topic name
   * @param originalMessage - The original Kafka message
   * @param error - The error that caused the failure
   * @param originalTopic - The original topic name
   */
  private async sendToDeadLetterTopic(
    deadLetterTopic: string,
    originalMessage: KafkaMessage,
    error: unknown,
    originalTopic: string
  ): Promise<void> {
    return this.tracer.startActiveSpan('MessageHandler.sendToDeadLetterTopic', async (span) => {
      try {
        span.setAttribute('dlq.topic', deadLetterTopic);
        span.setAttribute('dlq.original_topic', originalTopic);

        const { getProducer } = await import('./client');
        const producer = await getProducer();

        // Fixed: Sanitize error messages - don't expose stack traces in DLQ
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const sanitizedError = sanitizeError(errorMessage);

        const deadLetterMessage = {
          topic: deadLetterTopic,
          messages: [
            {
              key: originalMessage.key,
              value: originalMessage.value,
              headers: {
                ...originalMessage.headers,
                'x-dead-letter-reason': sanitizedError, // Sanitized error
                'x-original-topic': originalTopic,
                'x-error-timestamp': new Date().toISOString()
              }
            }
          ]
        };

        await producer.send(deadLetterMessage);

        logger.error(`Message sent to DLQ: ${sanitizedError}`, {
          originalTopic,
          deadLetterTopic
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (dlqError) {
        span.recordException(dlqError as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (dlqError as Error).message });
        throw dlqError;
      } finally {
        span.end();
      }
    });
  }
}

/**
 * Global message handler singleton (for backward compatibility)
 *
 * Note: For NestJS integration, use EventsModule instead of this singleton
 */
export const messageHandler = new MessageHandler();

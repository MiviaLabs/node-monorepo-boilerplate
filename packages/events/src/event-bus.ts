import { randomUUID } from 'node:crypto';

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ConsumerRunConfig, Message, Consumer } from 'kafkajs';

import { getProducer, createConsumer } from './client';
import { resolveConfig, type InfrastructureEventsConfig } from './config';
import { EventValidationError } from './errors';
import { logger } from './logging/logger';
import type { ResolvedEventRoutingConfig } from './routing/interfaces';
import { EventRouter } from './routing/router';
import { sanitizeError } from './utils/error-sanitizer';

// Maximum batch size (1MB) for Kafka
const MAX_BATCH_SIZE_BYTES = 1_000_000;

/**
 * Event type validation regex
 * Ensures event types follow the pattern: domain.event (e.g., "user.created")
 */
const EVENT_TYPE_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

/**
 * Base event interface compatible with @package/types IEvent
 *
 * This interface aligns with the CQRS pattern from @package/types
 * while remaining flexible for Kafka messaging patterns.
 */
export interface IEvent {
  readonly readonly: true;
  readonly aggregateId?: string; // Optional for Kafka events (uses eventId if not provided)
  readonly occurredAt: Date;
  readonly version: number; // Event version (for event sourcing)
}

/**
 * Event metadata compatible with @package/types EventMetadata
 *
 * This interface matches the EventMetadata from @package/types
 * but is defined inline to avoid circular dependencies.
 */
export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
}

/**
 * Event message extending CQRS IEvent pattern from @package/types
 *
 * This represents a domain event that flows through the event bus.
 * It follows CQRS patterns for event sourcing and notification.
 *
 * @example
 * ```typescript
 * const event: EventMessage<UserCreatedData> = {
 *   eventType: 'user.created',
 *   eventId: '123e4567-e89b-12d3-a456-426614174000',
 *   timestamp: new Date(),
 *   aggregateId: 'user-123',
 *   aggregateVersion: 1,
 *   readonly: true,
 *   occurredAt: new Date(),
 *   version: 1,
 *   data: {
 *     userId: 'user-123',
 *     email: 'user@example.com',
 *     name: 'John Doe'
 *   },
 *   correlationId: 'abc-123',
 *   causationId: 'def-456',
 *   metadata: {
 *     tenantId: 'tenant-123',
 *     userId: 'user-456'
 *   }
 * };
 * ```
 */
export interface EventMessage<T = unknown> extends IEvent {
  readonly eventType: string; // Event type (e.g., 'user.created')
  readonly eventId: string; // Unique event ID (UUID v4)
  readonly timestamp: Date; // Event creation time (alias for occurredAt)
  readonly data: T; // Event payload
  readonly correlationId?: string; // Correlation ID for tracing (in metadata)
  readonly causationId?: string; // Causation ID for event chains (in metadata)
  readonly aggregateVersion?: number; // Aggregate version (for event sourcing)
  readonly schemaVersion: string; // Event schema version (format: '1.0')
  readonly tenantId?: string; // Tenant ID for multi-tenancy (in metadata)
  readonly metadata?: ExtendedEventMetadata; // Additional metadata
}

/**
 * Extended event metadata with additional fields
 */
export interface ExtendedEventMetadata extends EventMetadata {
  readonly [key: string]: unknown;
}

/**
 * Event publishing options
 */
export interface PublishOptions {
  readonly topic?: string; // Override default topic
  readonly partition?: number; // Specific partition
  readonly key?: string; // Partitioning key
  readonly headers?: Record<string, string>; // Custom headers
}

/**
 * Consumer subscription options
 */
export interface SubscribeOptions {
  readonly groupId?: string; // Consumer group ID (uses UUID if not provided)
  readonly fromBeginning?: boolean; // Start from beginning of topic
  readonly retryCount?: number; // Number of retry attempts
  readonly retryDelay?: number; // Delay between retries (ms)
  readonly deadLetterTopic?: string; // Dead letter topic for failed messages
}

/**
 * Event bus for publishing and subscribing to domain events
 *
 * This class provides a high-level API for event-driven architecture using Kafka.
 * It handles serialization, topic naming, and consumer group management.
 *
 * @example
 * ```typescript
 * const eventBus = new EventBus();
 *
 * // Publish event
 * await eventBus.publish('user.created', { userId: '123', email: 'user@example.com' });
 *
 * // Subscribe to events
 * await eventBus.subscribe('user-created', async (event) => {
 *   console.log('User created:', event.data);
 * });
 * ```
 */
export class EventBus {
  private readonly tracer = trace.getTracer('EventBus');
  private enabled = true;
  private eventTypeValidationEnabled = true;
  private routingConfig?: ResolvedEventRoutingConfig;
  private eventRouter?: EventRouter;

  constructor(config?: InfrastructureEventsConfig) {
    if (config) {
      const resolved = resolveConfig(config);
      this.enabled = resolved.enabled;
      this.eventTypeValidationEnabled = resolved.eventTypeValidationEnabled;
      this.routingConfig = resolved.routing;

      // Initialize event router if routing is enabled
      if (this.routingConfig?.enabled) {
        this.eventRouter = new EventRouter(this.routingConfig);
        // Initialize router asynchronously (don't await in constructor)
        this.eventRouter.initialize().catch((error) => {
          logger.error(
            `Failed to initialize event router: ${error instanceof Error ? error.message : String(error)}`
          );
          // Note: eventRouter remains defined but in failed state
        });
      }
    }
  }

  /**
   * Enable or disable event publishing
   *
   * @param enabled - Whether events should be published
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Event publishing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if event publishing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Validate event type format
   *
   * @param eventType - The event type to validate
   * @throws {EventValidationError} If the event type is invalid
   */
  private validateEventType(eventType: string): void {
    if (!this.eventTypeValidationEnabled) {
      return;
    }

    if (!EVENT_TYPE_REGEX.test(eventType)) {
      throw new EventValidationError(
        `Invalid event type format: '${eventType}'. Expected format: 'domain.event' (e.g., 'user.created', 'order.completed')`,
        eventType
      );
    }
  }

  /**
   * Publish a single event to Kafka
   *
   * @param eventType - The type of event (e.g., 'user.created')
   * @param data - The event payload
   * @param options - Optional publishing configuration
   */
  async publish<T = unknown>(
    eventType: string,
    data: T,
    options: PublishOptions = {}
  ): Promise<void> {
    // Check if events are disabled
    if (!this.enabled) {
      return;
    }

    // Validate event type
    this.validateEventType(eventType);

    return this.tracer.startActiveSpan('EventBus.publish', async (span) => {
      try {
        span.setAttribute('event.type', eventType);
        span.setAttribute('event.topic', options.topic ?? this.topicFromEventType(eventType));

        const producer = await getProducer();

        // Allow callers to supply a stable eventId (e.g. when publishing an
        // outbox row whose eventId is the original domain event id, or when
        // replaying events). Falls back to a new UUID for fresh events.
        const callerEventId = options.headers?.['event-id'] as string | undefined;
        const eventId =
          typeof callerEventId === 'string' && callerEventId.length > 0
            ? callerEventId
            : randomUUID();
        const timestamp = new Date();

        const correlationId = options.headers?.['correlation-id'] as string | undefined;
        const causationId = options.headers?.['causation-id'] as string | undefined;
        const tenantId = options.headers?.['tenant-id'] as string | undefined;
        const userId = options.headers?.['user-id'] as string | undefined;

        const message: EventMessage<T> = {
          eventType,
          eventId,
          timestamp,
          occurredAt: timestamp,
          readonly: true,
          version: 1, // Event sourcing version (starts at 1)
          aggregateId: options.key,
          data,
          correlationId,
          causationId,
          schemaVersion: '1.0', // Schema version (string)
          tenantId,
          metadata: {
            ...(correlationId !== undefined && { correlationId }),
            ...(causationId !== undefined && { causationId }),
            ...(tenantId !== undefined && { tenantId }),
            ...(userId !== undefined && { userId })
          }
        } as EventMessage<T>;

        const topic = options.topic ?? this.topicFromEventType(eventType);

        // Validate message size (max 1MB for Kafka)
        // Stringify once and reuse for both size check and sending
        const messageJson = JSON.stringify(message);
        const messageSize = Buffer.byteLength(messageJson, 'utf8');
        if (messageSize > MAX_BATCH_SIZE_BYTES) {
          throw new Error(
            `Event message size (${messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
          );
        }

        // Always publish to Kafka (default behavior for backwards compatibility)
        const kafkaMessage = {
          key: options.key ?? message.eventId,
          value: messageJson,
          headers: {
            'content-type': 'application/json',
            'event-type': eventType,
            'event-id': message.eventId,
            'event-version': message.schemaVersion,
            ...options.headers
          }
        };

        await producer.send({
          topic,
          messages: [
            {
              ...kafkaMessage,
              ...(options.partition !== undefined && { partition: options.partition })
            }
          ]
        });

        span.setAttribute('event.id', message.eventId);

        // If routing is enabled, also route to other destinations
        if (this.eventRouter?.isReady()) {
          try {
            const routingResult = await this.eventRouter.publish(message);
            span.setAttribute('routing.enabled', true);
            span.setAttribute('routing.success', routingResult.success);
            span.setAttribute('routing.destinations', routingResult.totalDestinations);
            span.setAttribute('routing.successful', routingResult.successfulDestinations);
            span.setAttribute('routing.failed', routingResult.failedDestinations);

            logger.info(`Event routed to ${routingResult.successfulDestinations} destinations`, {
              eventType,
              eventId,
              routingResult
            });
          } catch (error) {
            // Log routing errors but don't fail the publish
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Event routing failed for ${eventType}: ${errorMessage}`, {
              eventId
            });
            span.setAttribute('routing.error', errorMessage);
          }
        } else {
          span.setAttribute('routing.enabled', false);
        }

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
   * Publish multiple events in batch
   *
   * @param events - Array of events with optional configurations
   */
  async publishBatch<T = unknown>(
    events: ReadonlyArray<{
      readonly eventType: string;
      readonly data: T;
      readonly options?: PublishOptions;
    }>
  ): Promise<void> {
    // Check if events are disabled
    if (!this.enabled) {
      return;
    }

    // Validate all event types
    for (const event of events) {
      this.validateEventType(event.eventType);
    }

    return this.tracer.startActiveSpan('EventBus.publishBatch', async (span) => {
      try {
        span.setAttribute('event.count', events.length);

        const producer = await getProducer();

        // Group messages by topic
        const messagesByTopic = new Map<string, Message[]>();
        const eventMessages: EventMessage<T>[] = [];
        let totalBatchSize = 0;

        for (const event of events) {
          // Allow callers to supply a stable eventId (e.g. when publishing
          // outbox rows whose eventId is the original domain event id).
          const callerEventId = event.options?.headers?.['event-id'] as string | undefined;
          const eventId =
            typeof callerEventId === 'string' && callerEventId.length > 0
              ? callerEventId
              : randomUUID();
          const timestamp = new Date();

          const message: EventMessage<T> = {
            eventType: event.eventType,
            eventId,
            timestamp,
            occurredAt: timestamp,
            readonly: true,
            version: 1, // Event sourcing version (starts at 1)
            aggregateId: event.options?.key,
            data: event.data,
            correlationId: event.options?.headers?.['correlation-id'] as string | undefined,
            causationId: event.options?.headers?.['causation-id'] as string | undefined,
            schemaVersion: '1.0', // Schema version (string)
            tenantId: event.options?.headers?.['tenant-id'] as string | undefined,
            metadata: {
              correlationId: event.options?.headers?.['correlation-id'] as string | undefined,
              causationId: event.options?.headers?.['causation-id'] as string | undefined,
              tenantId: event.options?.headers?.['tenant-id'] as string | undefined,
              userId: event.options?.headers?.['user-id'] as string | undefined
            } as ExtendedEventMetadata
          };

          eventMessages.push(message);

          const topic = event.options?.topic ?? this.topicFromEventType(event.eventType);
          // Stringify once and reuse for both size check and sending
          const messageJson = JSON.stringify(message);
          const messageSize = Buffer.byteLength(messageJson, 'utf8');

          // Add batch size limits (max 1MB total)
          if (messageSize > MAX_BATCH_SIZE_BYTES) {
            throw new Error(
              `Event message size (${messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
            );
          }

          if (totalBatchSize + messageSize > MAX_BATCH_SIZE_BYTES) {
            throw new Error(
              `Batch size (${totalBatchSize + messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
            );
          }

          totalBatchSize += messageSize;

          if (!messagesByTopic.has(topic)) {
            messagesByTopic.set(topic, []);
          }

          const kafkaMessage: Message = {
            key: event.options?.key ?? message.eventId,
            value: messageJson,
            ...(event.options?.partition !== undefined && { partition: event.options.partition }),
            headers: {
              'content-type': 'application/json',
              'event-type': event.eventType,
              'event-id': message.eventId,
              'event-version': message.schemaVersion,
              ...(event.options?.headers ?? {})
            }
          } as Message;

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          messagesByTopic.get(topic)!.push(kafkaMessage);
        }

        // Send batches per topic
        for (const [topic, messages] of messagesByTopic) {
          await producer.send({ topic, messages });
        }

        // If routing is enabled, also route events to other destinations
        if (this.eventRouter?.isReady()) {
          try {
            // Reuse the same event messages created for Kafka to preserve identity
            const routingResults = await this.eventRouter.publishBatch(eventMessages);
            span.setAttribute('routing.enabled', true);
            span.setAttribute('routing.batch_size', events.length);

            const successfulRoutes = routingResults.filter((r) => r.success).length;
            span.setAttribute('routing.successful', successfulRoutes);

            logger.info(
              `Batch routing completed: ${successfulRoutes}/${events.length} events routed`,
              {
                batchResults: routingResults
              }
            );
          } catch (error) {
            // Log routing errors but don't fail the batch publish
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn(`Event batch routing failed: ${errorMessage}`);
            span.setAttribute('routing.error', errorMessage);
          }
        } else {
          span.setAttribute('routing.enabled', false);
        }

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
   * Subscribe to events from a topic
   *
   * Uses stable consumer configuration:
   * - Higher session timeout for group coordinator stability
   * - Increased retry attempts for connection and subscription
   * - Longer delays between retries for network tolerance
   *
   * @param topic - The Kafka topic to subscribe to
   * @param handler - The event handler function
   * @param options - Optional subscription configuration
   * @returns A subscription that can be unsubscribed
   */
  async subscribe(
    topic: string,
    handler: (message: EventMessage) => void | Promise<void>,
    options: SubscribeOptions = {}
  ): Promise<ConsumerSubscription> {
    // eslint-disable-next-line complexity
    return this.tracer.startActiveSpan('EventBus.subscribe', async (span) => {
      try {
        span.setAttribute('event.topic', topic);
        span.setAttribute('event.group_id', options.groupId ?? 'auto-generated');

        // Use crypto.randomUUID() instead of Date.now() for consumer group ID
        const groupId = options.groupId ?? `event-bus-${topic}-${randomUUID()}`;
        const consumer = await createConsumer(groupId);

        // Retry logic for Kafka connection with exponential backoff
        const maxConnectRetries = 10;
        const connectRetryDelay = 2000;

        for (let attempt = 1; attempt <= maxConnectRetries; attempt++) {
          try {
            await consumer.connect();
            break; // Connection successful
          } catch (error) {
            const errorMessage = (error as Error).message ?? '';
            const isRetryable =
              errorMessage.includes('group coordinator') ||
              errorMessage.includes('not available') ||
              errorMessage.includes('connection') ||
              errorMessage.includes('timeout');

            if (!isRetryable || attempt === maxConnectRetries) {
              throw error;
            }

            // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s (max)
            const backoffDelay = Math.min(connectRetryDelay * Math.pow(2, attempt - 1), 60000);
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          }
        }

        // Retry logic for subscription (allow longer for leadership election)
        const maxSubscribeRetries = 15;
        const subscribeRetryDelay = 3000;

        for (let attempt = 1; attempt <= maxSubscribeRetries; attempt++) {
          try {
            await consumer.subscribe({ topic, fromBeginning: options.fromBeginning ?? false });
            break; // Subscription successful
          } catch (error) {
            const errorMessage = (error as Error).message ?? '';
            const isRetryable =
              errorMessage.includes('leadership election') ||
              errorMessage.includes('group coordinator') ||
              errorMessage.includes('not available') ||
              errorMessage.includes('connection') ||
              errorMessage.includes('timeout');

            if (!isRetryable || attempt === maxSubscribeRetries) {
              throw error;
            }

            // Exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s (max)
            const backoffDelay = Math.min(subscribeRetryDelay * Math.pow(2, attempt - 1), 60000);
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          }
        }

        const runConfig: ConsumerRunConfig = {
          eachMessage: async ({ message, partition }) => {
            return this.tracer.startActiveSpan('EventBus.handleMessage', async (messageSpan) => {
              try {
                messageSpan.setAttribute('messaging.kafka.partition', partition);
                messageSpan.setAttribute('messaging.kafka.topic', topic);

                if (!message.value) {
                  messageSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: 'Empty message value'
                  });
                  return;
                }

                const event = JSON.parse(message.value.toString()) as EventMessage;

                messageSpan.setAttribute('event.id', event.eventId);
                messageSpan.setAttribute('event.type', event.eventType);

                // Add structured logging
                logger.info(`Processing event: ${event.eventType}`, {
                  eventId: event.eventId,
                  topic,
                  partition
                });

                await handler(event);

                messageSpan.setStatus({ code: SpanStatusCode.OK });
              } catch (err) {
                // Sanitize error messages - don't expose stack traces in DLQ
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                const sanitizedError = sanitizeError(errorMessage);

                messageSpan.recordException(err as Error);
                messageSpan.setStatus({ code: SpanStatusCode.ERROR, message: sanitizedError });

                logger.error(`Error processing event: ${sanitizedError}`, {
                  topic,
                  partition
                });

                throw err;
              } finally {
                messageSpan.end();
              }
            });
          }
        };

        await consumer.run(runConfig);

        span.setStatus({ code: SpanStatusCode.OK });
        return new ConsumerSubscription(consumer, topic);
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
   * Convert event type to topic name
   *
   * Examples:
   * - 'user.created' -> 'user-created'
   * - 'order.completed' -> 'order-completed'
   */
  private topicFromEventType(eventType: string): string {
    return eventType.replace(/\./g, '-').toLowerCase();
  }
}

/**
 * Consumer subscription that can be unsubscribed
 */
export class ConsumerSubscription {
  constructor(
    private readonly consumer: Consumer,
    public readonly topic: string
  ) {}

  /**
   * Unsubscribe from the topic and disconnect consumer
   */
  async unsubscribe(): Promise<void> {
    await this.consumer.stop();
    await this.consumer.disconnect();
  }
}

/**
 * Global event bus singleton (for backward compatibility)
 *
 * Note: For NestJS integration, use EventsModule instead of this singleton
 */
export const eventBus = new EventBus();

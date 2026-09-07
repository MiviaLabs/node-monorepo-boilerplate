/**
 * Kafka destination adapter for event routing
 *
 * Publishes events to Kafka topics using the existing EventBus infrastructure.
 *
 * eslint-disable @typescript-eslint/no-unsafe-assignment
 * eslint-disable @typescript-eslint/no-unsafe-member-access
 * eslint-disable @typescript-eslint/no-unsafe-call
 */

import { getProducer } from '../../client';
import type { EventMessage } from '../../event-bus';
import { logger } from '../../logging/logger';
import { DestinationType } from '../interfaces';
import type { Message } from 'kafkajs';

import { BaseDestinationAdapter, type BaseDestinationOptions } from './base-destination';

// Maximum batch size (1MB) for Kafka
const MAX_BATCH_SIZE_BYTES = 1_000_000;

/**
 * Kafka-specific destination options
 */
export interface KafkaDestinationOptions extends BaseDestinationOptions {
  /** Default topic override (optional, uses event type topic by default) */
  defaultTopic?: string;
  /** Producer configuration (optional, uses global producer by default) */
  producerConfig?: Record<string, unknown>;
}

/**
 * Kafka destination adapter
 *
 * Publishes events to Kafka topics. Integrates with the existing Kafka producer
 * from the EventBus infrastructure.
 */
export class KafkaDestinationAdapter extends BaseDestinationAdapter {
  private readonly defaultTopic?: string;

  constructor(options: KafkaDestinationOptions = {}) {
    super(DestinationType.KAFKA, options);
    if (options.defaultTopic !== undefined) {
      this.defaultTopic = options.defaultTopic;
    }
  }

  /**
   * Initialize Kafka destination adapter
   *
   * Verifies Kafka producer is available.
   */
  protected async doInitialize(): Promise<void> {
    try {
      // Verify Kafka producer is available
      const producer = await getProducer();

      if (!producer) {
        throw new Error('Kafka producer not available');
      }

      logger.info('Kafka destination adapter: Producer verified successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize Kafka destination: ${errorMessage}`);
    }
  }

  /**
   * Publish event to Kafka
   *
   * @param event - Event message to publish
   * @param options - Publishing options
   */
  protected async doPublish(event: EventMessage, options: Record<string, unknown>): Promise<void> {
    const producer = await getProducer();

    const topic = (this.defaultTopic ??
      options['topic'] ??
      this.topicFromEventType(event.eventType)) as string;
    const key = (options['key'] as string | undefined) ?? event.aggregateId ?? event.eventId;
    const partition = options['partition'] as number | undefined;
    const headers = options['headers'] as Record<string, string> | undefined;

    // Validate message size
    const messageJson = JSON.stringify(event);
    const messageSize = messageJson.length;

    if (messageSize > MAX_BATCH_SIZE_BYTES) {
      throw new Error(
        `Event message size (${messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
      );
    }

    const kafkaMessage: Message = {
      key,
      value: messageJson,
      headers: {
        'content-type': 'application/json',
        'event-type': event.eventType,
        'event-id': event.eventId,
        'event-version': event.schemaVersion,
        ...headers
      }
    };

    if (partition !== undefined) {
      kafkaMessage.partition = partition;
    }

    await producer.send({
      topic,
      messages: [kafkaMessage]
    });

    logger.info(`Kafka destination: Published event ${event.eventType} to topic ${topic}`, {
      eventId: event.eventId,
      topic,
      partition
    });
  }

  /**
   * Publish multiple events to Kafka
   *
   * @param events - Event messages to publish
   * @param options - Publishing options
   */
  protected async doPublishBatch(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void> {
    const producer = await getProducer();

    // Group messages by topic
    const messagesByTopic = new Map<
      string,
      Array<{ key: string; value: string; partition?: number; headers?: Record<string, string> }>
    >();
    let totalBatchSize = 0;

    for (const event of events) {
      const topic = (this.defaultTopic ??
        options['topic'] ??
        this.topicFromEventType(event.eventType)) as string;
      const key = (options['key'] as string | undefined) ?? event.aggregateId ?? event.eventId;
      const partition = options['partition'] as number | undefined;
      const headers = options['headers'] as Record<string, string> | undefined;

      const messageJson = JSON.stringify(event);
      const messageSize = messageJson.length;

      // Validate message size
      if (messageSize > MAX_BATCH_SIZE_BYTES) {
        throw new Error(
          `Event message size (${messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
        );
      }

      // Validate batch size
      if (totalBatchSize + messageSize > MAX_BATCH_SIZE_BYTES) {
        throw new Error(
          `Batch size (${totalBatchSize + messageSize} bytes) exceeds Kafka limit of ${MAX_BATCH_SIZE_BYTES} bytes`
        );
      }

      totalBatchSize += messageSize;

      if (!messagesByTopic.has(topic)) {
        messagesByTopic.set(topic, []);
      }

      const kafkaMessage: {
        key: string;
        value: string;
        partition?: number;
        headers: Record<string, string>;
      } = {
        key,
        value: messageJson,
        headers: {
          'content-type': 'application/json',
          'event-type': event.eventType,
          'event-id': event.eventId,
          'event-version': event.schemaVersion,
          ...headers
        }
      };

      if (partition !== undefined) {
        kafkaMessage.partition = partition;
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      messagesByTopic.get(topic)!.push(kafkaMessage);
    }

    // Send batches per topic
    for (const [topic, messages] of messagesByTopic) {
      await producer.send({ topic, messages });
    }

    logger.info(`Kafka destination: Published ${events.length} events in batch`, {
      topics: Array.from(messagesByTopic.keys()),
      totalMessages: events.length,
      totalBatchSize
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

  /**
   * Clean up resources
   */
  override async cleanup(): Promise<void> {
    // No specific cleanup needed for Kafka destination
    this.isInitialized = false;
    logger.info('Kafka destination adapter cleaned up');
  }
}

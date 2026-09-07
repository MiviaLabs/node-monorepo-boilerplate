/**
 * PubSub destination adapter for event routing
 *
 * Publishes events to Google Cloud Pub/Sub topics.
 *
 * eslint-disable @typescript-eslint/no-unsafe-assignment
 * eslint-disable @typescript-eslint/no-unsafe-member-access
 * eslint-disable @typescript-eslint/no-unsafe-call
 */

import type { EventMessage } from '../../event-bus';
import { logger } from '../../logging/logger';
import { DestinationType } from '../interfaces';

import { BaseDestinationAdapter, type BaseDestinationOptions } from './base-destination';

/**
 * PubSub-specific destination options
 */
export interface PubSubDestinationOptions extends BaseDestinationOptions {
  /** Default topic name (default: 'events') */
  defaultTopic?: string;
}

/**
 * PubSub destination adapter
 *
 * Publishes events to Google Cloud Pub/Sub topics.
 * Uses the pubsub package via dynamic import.
 */
export class PubSubDestinationAdapter extends BaseDestinationAdapter {
  private readonly defaultTopic: string;
  private publisher: {
    publish: (topic: string, data: Buffer, attributes: Record<string, string>) => Promise<void>;
  } | null = null;

  constructor(options: PubSubDestinationOptions = {}) {
    super(DestinationType.PUBSUB, options);
    this.defaultTopic = options.defaultTopic ?? 'events';
  }

  /**
   * Initialize PubSub destination adapter
   *
   * Loads pubsub package and verifies publisher availability.
   */
  protected async doInitialize(): Promise<void> {
    try {
      // Dynamically import pubsub to avoid circular dependencies
      // webpack-ignore: External optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pubsubPackage = require(/* webpackIgnore: true */ '@package/pubsub');

      // Get publisher
      const { getPublisher } = pubsubPackage;
      this.publisher = getPublisher();

      if (!this.publisher) {
        throw new Error('PubSub publisher not available');
      }

      // Get topic manager and ensure default topic exists
      const { getTopicManager } = pubsubPackage;
      const topicManager = getTopicManager();

      if (topicManager) {
        const topicExists = await topicManager.exists(this.defaultTopic);
        if (!topicExists) {
          logger.info(`PubSub destination: Creating topic '${this.defaultTopic}'`);
          await topicManager.create(this.defaultTopic);
        }
      }

      logger.info('PubSub destination adapter: Publisher initialized successfully', {
        defaultTopic: this.defaultTopic
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize PubSub destination: ${errorMessage}`);
    }
  }

  /**
   * Publish event to Pub/Sub
   *
   * @param event - Event message to publish
   * @param options - Publishing options
   */
  protected async doPublish(event: EventMessage, options: Record<string, unknown>): Promise<void> {
    if (!this.publisher) {
      throw new Error('PubSub publisher not initialized');
    }

    try {
      const topic = (options['topic'] as string | undefined) ?? this.defaultTopic;
      const data = Buffer.from(JSON.stringify(event));

      // Build Pub/Sub attributes from event metadata
      const attributes: Record<string, string> = {
        eventType: event.eventType,
        eventId: event.eventId,
        timestamp: event.timestamp.toISOString(),
        schemaVersion: event.schemaVersion
      };

      // Add optional metadata
      if (event.correlationId) {
        attributes['correlationId'] = event.correlationId;
      }

      if (event.causationId) {
        attributes['causationId'] = event.causationId;
      }

      if (event.tenantId) {
        attributes['tenantId'] = event.tenantId;
      }

      // Add custom attributes from options
      if (options['attributes']) {
        Object.assign(attributes, options['attributes'] as Record<string, string>);
      }

      await this.publisher.publish(topic, data, attributes);

      logger.info(`PubSub destination: Published event ${event.eventType} to topic ${topic}`, {
        eventId: event.eventId,
        topic
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish to PubSub: ${errorMessage}`);
    }
  }

  /**
   * Publish multiple events to Pub/Sub
   *
   * @param events - Event messages to publish
   * @param options - Publishing options
   */
  protected async doPublishBatch(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void> {
    if (!this.publisher) {
      throw new Error('PubSub publisher not initialized');
    }

    try {
      const topic = (options['topic'] as string | undefined) ?? this.defaultTopic;

      // Publish each event
      for (const event of events) {
        const data = Buffer.from(JSON.stringify(event));

        const attributes: Record<string, string> = {
          eventType: event.eventType,
          eventId: event.eventId,
          timestamp: event.timestamp.toISOString(),
          schemaVersion: event.schemaVersion
        };

        if (event.correlationId) {
          attributes['correlationId'] = event.correlationId;
        }

        if (event.causationId) {
          attributes['causationId'] = event.causationId;
        }

        if (event.tenantId) {
          attributes['tenantId'] = event.tenantId;
        }

        await this.publisher.publish(topic, data, attributes);
      }

      logger.info(`PubSub destination: Published ${events.length} events in batch`, {
        topic,
        count: events.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to publish batch to PubSub: ${errorMessage}`);
    }
  }

  /**
   * Clean up resources
   */
  override async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.publisher = null;
    logger.info('PubSub destination adapter cleaned up');
  }
}

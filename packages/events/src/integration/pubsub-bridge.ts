/**
 * Kafka-to-PubSub Bridge
 *
 * Bridges events from Kafka to Google Cloud Pub/Sub for cross-cloud
 * event distribution or integration with GCP services.
 */

import type { EventMessage } from '../event-bus';
import { logger } from '../logging/logger';

/**
 * Kafka-to-PubSub bridge configuration
 */
export interface KafkaToPubSubBridgeConfig {
  /** Enable the bridge (default: false) */
  enabled: boolean;
  /** Topic name to publish events to (default: 'events') */
  topicName?: string;
  /** Event types to bridge (default: all events) */
  eventTypes?: string[];
}

/**
 * Kafka-to-PubSub bridge class
 *
 * Bridges Kafka events to Google Cloud Pub/Sub for cross-cloud
 * event distribution or integration with GCP services.
 *
 * @example
 * ```typescript
 * const bridge = new KafkaToPubSubBridge({
 *   enabled: true,
 *   topicName: 'events',
 *   eventTypes: ['user.created', 'order.completed'],
 * });
 *
 * await bridge.initialize();
 *
 * // Bridge an event
 * await bridge.bridgeEvent(event);
 *
 * // Bridge multiple events
 * await bridge.bridgeEvents([event1, event2]);
 * ```
 */
export class KafkaToPubSubBridge {
  private readonly config: Required<KafkaToPubSubBridgeConfig>;
  private isInitialized = false;

  constructor(config: KafkaToPubSubBridgeConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      topicName: config.topicName ?? 'events',
      eventTypes: config.eventTypes ?? [] // Empty array means bridge all events
    };
  }

  /**
   * Initialize the bridge
   *
   * Loads the pubsub package dynamically to avoid
   * circular dependencies.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Dynamically import pubsub
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pubsubPackage = require(/* webpackIgnore: true */ '@package/pubsub');

      // Verify that the provider is available
      const { getPubSubProvider } = pubsubPackage;
      const provider = getPubSubProvider();

      if (!provider) {
        logger.warn(
          'Kafka-to-PubSub bridge: PubSub provider not available. Bridge will be disabled.'
        );
        this.config.enabled = false;
        return;
      }

      // Ensure the topic exists
      const { getTopicManager } = pubsubPackage;
      const topicManager = getTopicManager();

      if (topicManager) {
        const topicExists = await topicManager.exists(this.config.topicName);
        if (!topicExists) {
          logger.info(`Kafka-to-PubSub bridge: Creating topic '${this.config.topicName}'`);
          await topicManager.create(this.config.topicName);
        }
      }

      this.isInitialized = true;
      logger.info('Kafka-to-PubSub bridge initialized', {
        topicName: this.config.topicName,
        eventTypes: this.config.eventTypes.length > 0 ? this.config.eventTypes : 'all'
      });
    } catch (error) {
      logger.warn(
        `Kafka-to-PubSub bridge: Failed to initialize. Bridge will be disabled. Error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      this.config.enabled = false;
    }
  }

  /**
   * Check if the bridge should handle this event type
   */
  private shouldBridgeEvent(eventType: string): boolean {
    // If no event types are specified, bridge all events
    if (this.config.eventTypes.length === 0) {
      return true;
    }

    return this.config.eventTypes.includes(eventType);
  }

  /**
   * Bridge a single event to Pub/Sub
   *
   * @param event - The event to bridge
   * @returns Promise that resolves when the event is bridged
   */
  async bridgeEvent(event: EventMessage): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) {
      return;
    }

    if (!this.shouldBridgeEvent(event.eventType)) {
      return;
    }

    try {
      // Dynamically import pubsub
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getPublisher } = require(/* webpackIgnore: true */ '@package/pubsub');

      const publisher = getPublisher();
      if (!publisher) {
        throw new Error('PubSub publisher not available');
      }

      // Serialize the event
      const data = Buffer.from(JSON.stringify(event));

      // Publish to Pub/Sub
      await publisher.publish(this.config.topicName, data, {
        eventType: event.eventType,
        eventId: event.eventId,
        timestamp: event.timestamp.toISOString()
      });

      logger.info(`Kafka-to-PubSub bridge: Bridged event ${event.eventType} to Pub/Sub`, {
        eventId: event.eventId,
        topicName: this.config.topicName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Kafka-to-PubSub bridge: Failed to bridge event ${event.eventType}: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Bridge multiple events to Pub/Sub
   *
   * @param events - The events to bridge
   * @returns Promise that resolves when all events are bridged
   */
  async bridgeEvents(events: EventMessage[]): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) {
      return;
    }

    // Filter events by type if needed
    const eventsToBridge = events.filter((event) => this.shouldBridgeEvent(event.eventType));

    if (eventsToBridge.length === 0) {
      return;
    }

    try {
      // Dynamically import pubsub
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getPublisher } = require(/* webpackIgnore: true */ '@package/pubsub');

      const publisher = getPublisher();
      if (!publisher) {
        throw new Error('PubSub publisher not available');
      }

      // Publish each event
      for (const event of eventsToBridge) {
        const data = Buffer.from(JSON.stringify(event));
        await publisher.publish(this.config.topicName, data, {
          eventType: event.eventType,
          eventId: event.eventId,
          timestamp: event.timestamp.toISOString()
        });
      }

      logger.info(`Kafka-to-PubSub bridge: Bridged ${eventsToBridge.length} events to Pub/Sub`, {
        topicName: this.config.topicName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Kafka-to-PubSub bridge: Failed to bridge ${eventsToBridge.length} events: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Check if the bridge is enabled and initialized
   */
  isActive(): boolean {
    return this.config.enabled && this.isInitialized;
  }
}

/**
 * Create a Kafka-to-PubSub bridge with the given configuration
 *
 * @param config - Bridge configuration
 * @returns Kafka-to-PubSub bridge instance
 *
 * @example
 * ```typescript
 * const bridge = createKafkaToPubSubBridge({
 *   enabled: true,
 *   topicName: 'events',
 *   eventTypes: ['user.created', 'order.completed'],
 * });
 *
 * await bridge.initialize();
 * ```
 */
export function createKafkaToPubSubBridge(config: KafkaToPubSubBridgeConfig): KafkaToPubSubBridge {
  return new KafkaToPubSubBridge(config);
}

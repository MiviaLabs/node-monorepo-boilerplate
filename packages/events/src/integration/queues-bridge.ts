/**
 * Event-to-Queues Bridge
 *
 * Bridges events from Kafka to job queues for asynchronous processing.
 * This enables event-driven task scheduling using the queues package.
 */

import type { EventMessage } from '../event-bus';
import { logger } from '../logging/logger';

/**
 * Event-to-Queue bridge configuration
 */
export interface EventToQueueBridgeConfig {
  /** Enable the bridge (default: false) */
  enabled: boolean;
  /** Queue name to bridge events to (default: 'events') */
  queueName?: string;
  /** Job name for bridged events (default: 'process-event') */
  jobName?: string;
  /** Event types to bridge (default: all events) */
  eventTypes?: string[];
}

/**
 * Event-to-Queue bridge class
 *
 * Bridges Kafka events to job queues for asynchronous processing.
 * Events are automatically added to the configured queue as jobs.
 *
 * @example
 * ```typescript
 * const bridge = new EventToQueueBridge({
 *   enabled: true,
 *   queueName: 'events',
 *   jobName: 'process-event',
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
export class EventToQueueBridge {
  private readonly config: Required<EventToQueueBridgeConfig>;
  private isInitialized = false;

  constructor(config: EventToQueueBridgeConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      queueName: config.queueName ?? 'events',
      jobName: config.jobName ?? 'process-event',
      eventTypes: config.eventTypes ?? [] // Empty array means bridge all events
    };
  }

  /**
   * Initialize the bridge
   *
   * Loads the queues package dynamically to avoid
   * circular dependencies.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Dynamically import queues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const queuesPackage = require(/* webpackIgnore: true */ '@package/queues');

      // Verify that the queue exists
      const { getQueue } = queuesPackage;
      const queue = getQueue(this.config.queueName);

      if (!queue) {
        logger.warn(
          `Event-to-Queue bridge: Queue '${this.config.queueName}' not found. Bridge will be disabled.`
        );
        this.config.enabled = false;
        return;
      }

      this.isInitialized = true;
      logger.info(`Event-to-Queue bridge initialized`, {
        queueName: this.config.queueName,
        jobName: this.config.jobName,
        eventTypes: this.config.eventTypes.length > 0 ? this.config.eventTypes : 'all'
      });
    } catch (error) {
      logger.warn(
        `Event-to-Queue bridge: Failed to initialize. Bridge will be disabled. Error: ${
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
   * Bridge a single event to the queue
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
      // Dynamically import queues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { addJob } = require(/* webpackIgnore: true */ '@package/queues');

      await addJob({
        queueName: this.config.queueName,
        jobName: this.config.jobName,
        data: event
      });

      logger.info(`Event-to-Queue bridge: Bridged event ${event.eventType} to queue`, {
        eventId: event.eventId,
        queueName: this.config.queueName,
        jobName: this.config.jobName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Event-to-Queue bridge: Failed to bridge event ${event.eventType}: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Bridge multiple events to the queue
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
      // Dynamically import queues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { addBulkJobs } = require(/* webpackIgnore: true */ '@package/queues');

      const jobs = eventsToBridge.map((event) => ({
        name: this.config.jobName,
        data: event
      }));

      await addBulkJobs(this.config.queueName, jobs);

      logger.info(`Event-to-Queue bridge: Bridged ${eventsToBridge.length} events to queue`, {
        queueName: this.config.queueName,
        jobName: this.config.jobName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Event-to-Queue bridge: Failed to bridge ${eventsToBridge.length} events: ${errorMessage}`
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
 * Create an event-to-queue bridge with the given configuration
 *
 * @param config - Bridge configuration
 * @returns Event-to-Queue bridge instance
 *
 * @example
 * ```typescript
 * const bridge = createEventToQueueBridge({
 *   enabled: true,
 *   queueName: 'events',
 *   eventTypes: ['user.created', 'order.completed'],
 * });
 *
 * await bridge.initialize();
 * ```
 */
export function createEventToQueueBridge(config: EventToQueueBridgeConfig): EventToQueueBridge {
  return new EventToQueueBridge(config);
}

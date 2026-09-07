/**
 * Event-to-Tasks Bridge
 *
 * Bridges events from Kafka to Google Cloud Tasks for event-driven
 * task scheduling with HTTP targets.
 */

import type { EventMessage } from '../event-bus';
import { logger } from '../logging/logger';

/**
 * Event-to-Tasks bridge configuration
 */
export interface EventToTasksBridgeConfig {
  /** Enable the bridge (default: false) */
  enabled: boolean;
  /** Queue name to bridge events to (default: 'event-tasks') */
  queueName?: string;
  /** HTTP URL to send events to (required for HTTP target) */
  httpUrl?: string;
  /** Event types to bridge (default: all events) */
  eventTypes?: string[];
  /** Delay before task execution in seconds (default: 0) */
  dispatchDelaySeconds?: number;
}

/**
 * Event-to-Tasks bridge class
 *
 * Bridges Kafka events to Google Cloud Tasks for event-driven
 * task scheduling with HTTP targets.
 *
 * @example
 * ```typescript
 * const bridge = new EventToTasksBridge({
 *   enabled: true,
 *   queueName: 'event-tasks',
 *   httpUrl: 'https://api.example.com/events/handle',
 *   eventTypes: ['user.created', 'order.completed'],
 *   dispatchDelaySeconds: 10,
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
export class EventToTasksBridge {
  private readonly config: {
    enabled: boolean;
    queueName: string;
    httpUrl: string | undefined;
    eventTypes: string[];
    dispatchDelaySeconds: number;
  };
  private isInitialized = false;

  constructor(config: EventToTasksBridgeConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      queueName: config.queueName ?? 'event-tasks',
      httpUrl: config.httpUrl,
      eventTypes: config.eventTypes ?? [], // Empty array means bridge all events
      dispatchDelaySeconds: config.dispatchDelaySeconds ?? 0
    };
  }

  /**
   * Initialize the bridge
   *
   * Loads the tasks package dynamically to avoid
   * circular dependencies.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (!this.config.httpUrl) {
      logger.warn(
        'Event-to-Tasks bridge: httpUrl is required but not provided. Bridge will be disabled.'
      );
      this.config.enabled = false;
      return;
    }

    try {
      // Dynamically import tasks
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tasksPackage = require(/* webpackIgnore: true */ '@package/tasks');

      // Verify that the provider is available
      const { getCloudTasksProvider } = tasksPackage;
      const provider = getCloudTasksProvider();

      if (!provider) {
        logger.warn(
          'Event-to-Tasks bridge: Cloud Tasks provider not available. Bridge will be disabled.'
        );
        this.config.enabled = false;
        return;
      }

      // Ensure the queue exists
      const { getQueueManager } = tasksPackage;
      const queueManager = getQueueManager();

      if (queueManager) {
        const queueExists = await queueManager.exists(this.config.queueName);
        if (!queueExists) {
          logger.info(`Event-to-Tasks bridge: Creating queue '${this.config.queueName}'`);
          await queueManager.create(this.config.queueName, {
            location: 'us-central1',
            rateLimits: {
              maxDispatchesPerSecond: 10
            }
          });
        }
      }

      this.isInitialized = true;
      logger.info('Event-to-Tasks bridge initialized', {
        queueName: this.config.queueName,
        httpUrl: this.config.httpUrl,
        eventTypes: this.config.eventTypes.length > 0 ? this.config.eventTypes : 'all',
        dispatchDelaySeconds: this.config.dispatchDelaySeconds
      });
    } catch (error) {
      logger.warn(
        `Event-to-Tasks bridge: Failed to initialize. Bridge will be disabled. Error: ${
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
   * Bridge a single event to Cloud Tasks
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
      // Dynamically import tasks
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHttpTask } = require(/* webpackIgnore: true */ '@package/tasks');

      // Create HTTP task with event payload
      await createHttpTask({
        queueName: this.config.queueName,
        url: this.config.httpUrl,
        method: 'POST' as const,
        body: event,
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': event.eventType,
          'X-Event-ID': event.eventId
        },
        dispatchDelaySeconds: this.config.dispatchDelaySeconds
      });

      logger.info(`Event-to-Tasks bridge: Bridged event ${event.eventType} to Cloud Tasks`, {
        eventId: event.eventId,
        queueName: this.config.queueName,
        httpUrl: this.config.httpUrl
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Event-to-Tasks bridge: Failed to bridge event ${event.eventType}: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Bridge multiple events to Cloud Tasks
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
      // Dynamically import tasks
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createHttpTask } = require(/* webpackIgnore: true */ '@package/tasks');

      // Create tasks for each event
      for (const event of eventsToBridge) {
        await createHttpTask({
          queueName: this.config.queueName,
          url: this.config.httpUrl ?? '', // Use default empty string if undefined
          method: 'POST' as const,
          body: event,
          headers: {
            'Content-Type': 'application/json',
            'X-Event-Type': event.eventType,
            'X-Event-ID': event.eventId
          },
          dispatchDelaySeconds: this.config.dispatchDelaySeconds
        });
      }

      logger.info(`Event-to-Tasks bridge: Bridged ${eventsToBridge.length} events to Cloud Tasks`, {
        queueName: this.config.queueName
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Event-to-Tasks bridge: Failed to bridge ${eventsToBridge.length} events: ${errorMessage}`
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
 * Create an event-to-tasks bridge with the given configuration
 *
 * @param config - Bridge configuration
 * @returns Event-to-Tasks bridge instance
 *
 * @example
 * ```typescript
 * const bridge = createEventToTasksBridge({
 *   enabled: true,
 *   queueName: 'event-tasks',
 *   httpUrl: 'https://api.example.com/events/handle',
 *   eventTypes: ['user.created', 'order.completed'],
 * });
 *
 * await bridge.initialize();
 * ```
 */
export function createEventToTasksBridge(config: EventToTasksBridgeConfig): EventToTasksBridge {
  return new EventToTasksBridge(config);
}

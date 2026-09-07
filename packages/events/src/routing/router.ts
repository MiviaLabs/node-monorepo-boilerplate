/**
 * Event Router
 *
 * Core routing logic for publishing events to multiple destinations
 * based on routing configuration.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';

import type { EventMessage } from '../event-bus';
import { logger } from '../logging/logger';

import { KafkaDestinationAdapter } from './destinations/kafka-destination';
import { PubSubDestinationAdapter } from './destinations/pubsub-destination';
import { QueueDestinationAdapter } from './destinations/queue-destination';
import { DestinationType } from './interfaces';
import type {
  DestinationResult,
  EventRoute,
  ResolvedEventRoutingConfig,
  RoutingResult,
  IDestinationAdapter
} from './interfaces';

/**
 * Event router class
 *
 * Routes events to multiple destinations based on configuration.
 * Supports parallel/ordered publishing and various failure policies.
 */
export class EventRouter {
  private readonly config: ResolvedEventRoutingConfig;
  private readonly tracer = trace.getTracer('EventRouter');
  private readonly adapters = new Map<DestinationType, IDestinationAdapter>();
  private isInitialized = false;

  constructor(config: ResolvedEventRoutingConfig) {
    this.config = config;

    // Initialize destination adapters
    if (this.hasDestinationType(DestinationType.KAFKA)) {
      this.adapters.set(DestinationType.KAFKA, new KafkaDestinationAdapter());
    }

    if (this.hasDestinationType(DestinationType.PUBSUB)) {
      this.adapters.set(DestinationType.PUBSUB, new PubSubDestinationAdapter());
    }

    if (this.hasDestinationType(DestinationType.QUEUE)) {
      this.adapters.set(DestinationType.QUEUE, new QueueDestinationAdapter());
    }
  }

  /**
   * Initialize event router and all destination adapters
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Event routing is disabled, skipping initialization');
      return;
    }

    if (this.isInitialized) {
      logger.info('Event router already initialized');
      return;
    }

    try {
      // Initialize all adapters in parallel
      const initPromises = Array.from(this.adapters.values()).map((adapter) =>
        adapter.initialize().catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to initialize ${adapter.type} destination adapter: ${errorMessage}`);
          // Don't throw - allow partial initialization
        })
      );

      await Promise.all(initPromises);

      // Remove failed adapters
      for (const [type, adapter] of this.adapters) {
        if (!adapter.isReady()) {
          logger.warn(`Removing ${type} destination adapter (failed to initialize)`);
          this.adapters.delete(type);
        }
      }

      this.isInitialized = true;

      const activeAdapters = Array.from(this.adapters.keys());
      logger.info('Event router initialized successfully', {
        activeAdapters,
        routesCount: this.config.routes.length,
        defaultStrategy: this.config.defaultStrategy,
        defaultFailurePolicy: this.config.defaultFailurePolicy,
        parallel: this.config.parallel
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize event router: ${errorMessage}`);
    }
  }

  /**
   * Check if router is ready
   */
  isReady(): boolean {
    return this.config.enabled && this.isInitialized && this.adapters.size > 0;
  }

  /**
   * Publish event to configured destinations
   *
   * @param event - Event message to publish
   * @returns Routing result with details about each destination
   */
  async publish(event: EventMessage): Promise<RoutingResult> {
    if (!this.isReady()) {
      logger.info('Event router not ready, skipping routing');
      return {
        eventType: event.eventType,
        totalDestinations: 0,
        successfulDestinations: 0,
        failedDestinations: 0,
        results: [],
        success: false,
        totalDuration: 0
      };
    }

    return this.tracer.startActiveSpan('EventRouter.publish', async (span) => {
      const startTime = Date.now();

      try {
        span.setAttribute('event.type', event.eventType);
        span.setAttribute('event.id', event.eventId);

        // Find matching routes
        const routes = this.findRoutes(event.eventType);

        if (routes.length === 0) {
          logger.info(`No routes found for event type ${event.eventType}`);
          span.setStatus({
            code: SpanStatusCode.OK,
            message: 'No routes configured for this event type'
          });
          return {
            eventType: event.eventType,
            totalDestinations: 0,
            successfulDestinations: 0,
            failedDestinations: 0,
            results: [],
            success: false,
            totalDuration: Date.now() - startTime
          };
        }

        // Collect all unique destinations from all routes
        const destinations = new Map<DestinationType, IDestinationAdapter>();

        for (const route of routes) {
          const strategy = route.strategy ?? this.config.defaultStrategy;
          // const _failurePolicy = route.failurePolicy ?? this.config.defaultFailurePolicy;

          for (const destConfig of route.destinations) {
            if (destConfig.enabled !== false) {
              const adapter = this.adapters.get(destConfig.type);
              if (adapter && adapter.isReady()) {
                destinations.set(destConfig.type, adapter);
              }
            }
          }

          // If strategy is 'any', we only need the first successful destination
          if (strategy === 'any' && destinations.size > 0) {
            break;
          }
        }

        if (destinations.size === 0) {
          logger.warn(`No ready destinations for event type ${event.eventType}`);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'No ready destinations configured'
          });
          return {
            eventType: event.eventType,
            totalDestinations: 0,
            successfulDestinations: 0,
            failedDestinations: 0,
            results: [],
            success: false,
            totalDuration: Date.now() - startTime
          };
        }

        span.setAttribute('routing.destinations', Array.from(destinations.keys()));

        // Publish to destinations
        const results = await this.publishToDestinations(event, Array.from(destinations.values()));

        const totalDuration = Date.now() - startTime;
        const successfulCount = results.filter((r) => r.success).length;
        const failedCount = results.filter((r) => !r.success).length;
        const overallSuccess = successfulCount > 0;

        span.setAttribute('routing.success', overallSuccess);
        span.setAttribute('routing.successful', successfulCount);
        span.setAttribute('routing.failed', failedCount);

        if (overallSuccess) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'All destinations failed' });
        }

        return {
          eventType: event.eventType,
          totalDestinations: results.length,
          successfulDestinations: successfulCount,
          failedDestinations: failedCount,
          results,
          success: overallSuccess,
          totalDuration
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Publish multiple events to configured destinations
   *
   * @param events - Event messages to publish
   * @returns Array of routing results
   */
  async publishBatch(events: EventMessage[]): Promise<RoutingResult[]> {
    if (!this.isReady()) {
      logger.info('Event router not ready, skipping batch routing');
      return events.map((event) => ({
        eventType: event.eventType,
        totalDestinations: 0,
        successfulDestinations: 0,
        failedDestinations: 0,
        results: [],
        success: false,
        totalDuration: 0
      }));
    }

    // Process events in parallel or sequentially based on config
    if (this.config.parallel) {
      return Promise.all(events.map((event) => this.publish(event)));
    }

    const results: RoutingResult[] = [];
    for (const event of events) {
      results.push(await this.publish(event));
    }
    return results;
  }

  /**
   * Publish event to multiple destinations
   */
  private async publishToDestinations(
    event: EventMessage,
    adapters: IDestinationAdapter[]
  ): Promise<DestinationResult[]> {
    const results: DestinationResult[] = [];

    for (const adapter of adapters) {
      const startTime = Date.now();

      try {
        await adapter.publish(event);

        results.push({
          destination: adapter.type,
          success: true,
          duration: Date.now() - startTime
        });

        logger.info(`Successfully published event ${event.eventType} to ${adapter.type}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          destination: adapter.type,
          success: false,
          error: errorMessage,
          duration: Date.now() - startTime
        });

        logger.warn(
          `Failed to publish event ${event.eventType} to ${adapter.type}: ${errorMessage}`
        );

        // Apply failure policy
        if (this.config.defaultFailurePolicy === 'stop') {
          logger.info(`Stopping routing due to failure policy 'stop' after ${adapter.type} failed`);
          break;
        }
      }
    }

    return results;
  }

  /**
   * Find routes matching event type
   *
   * Supports wildcard matching:
   * - Exact match: 'user.created'
   * - Domain wildcard: 'user.*' (matches all user events)
   * - Suffix wildcard: '*.created' (matches all creation events)
   *
   * @param eventType - Event type to match
   * @returns Matching routes
   */
  private findRoutes(eventType: string): EventRoute[] {
    return this.config.routes.filter((route) => {
      const pattern = route.eventType;

      // Exact match
      if (pattern === eventType) {
        return true;
      }

      // Wildcard patterns
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' +
            pattern.replace(/\./g, '\\.').replace(/\*/g, '[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*') +
            '$'
        );
        return regex.test(eventType);
      }

      return false;
    });
  }

  /**
   * Check if any route uses the given destination type
   */
  private hasDestinationType(type: DestinationType): boolean {
    return this.config.routes.some((route) =>
      route.destinations.some((dest) => dest.type === type)
    );
  }

  /**
   * Clean up all destination adapters
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up event router');

    const cleanupPromises = Array.from(this.adapters.values()).map((adapter) =>
      adapter.cleanup?.().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to cleanup ${adapter.type} destination adapter: ${errorMessage}`);
      })
    );

    await Promise.all(cleanupPromises);

    this.adapters.clear();
    this.isInitialized = false;

    logger.info('Event router cleaned up');
  }

  /**
   * Get active destination adapters
   */
  getActiveAdapters(): DestinationType[] {
    return Array.from(this.adapters.keys()).filter((type) => {
      const adapter = this.adapters.get(type);
      return adapter?.isReady() ?? false;
    });
  }
}

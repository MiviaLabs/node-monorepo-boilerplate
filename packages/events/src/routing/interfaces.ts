/**
 * Event routing system interfaces
 *
 * This module defines the core interfaces for the flexible event routing system
 * that allows events to be published to multiple destinations simultaneously.
 */

/**
 * Routing strategy determines how events are routed to multiple destinations
 */
export enum RoutingStrategy {
  /** All destinations must succeed */
  ALL = 'all',
  /** At least one destination must succeed */
  ANY = 'any',
  /** Destinations are executed in priority order */
  ORDERED = 'ordered'
}

/**
 * Failure policy determines how to handle failures when routing to multiple destinations
 */
export enum FailurePolicy {
  /** Continue with other destinations on failure */
  CONTINUE = 'continue',
  /** Stop routing on first failure */
  STOP = 'stop',
  /** Use fallback destination on failure */
  FALLBACK = 'fallback'
}

/**
 * Event destination types supported by the routing system
 */
export enum DestinationType {
  /** Apache Kafka */
  KAFKA = 'kafka',
  /** Google Cloud Pub/Sub */
  PUBSUB = 'pubsub',
  /** Job queue (BullMQ, Cloud Tasks, etc.) */
  QUEUE = 'queue'
}

/**
 * Individual destination configuration
 *
 * Defines where events should be routed and how to handle failures.
 */
export interface EventDestination {
  /** Destination type (kafka, pubsub, queue) */
  type: DestinationType;
  /** Destination-specific configuration */
  config?: Record<string, unknown>;
  /** Priority for ordered routing (1 = highest, larger numbers = lower priority) */
  priority?: number;
  /** Enable/disable this destination */
  enabled?: boolean;
}

/**
 * Event route configuration
 *
 * Maps event types to their destination routes.
 */
export interface EventRoute {
  /** Event type pattern (e.g., 'user.created', 'user.*', '*.created') */
  eventType: string;
  /** Destinations for this event type */
  destinations: EventDestination[];
  /** Routing strategy for this route */
  strategy?: RoutingStrategy;
  /** Failure policy for this route */
  failurePolicy?: FailurePolicy;
}

/**
 * Event routing configuration
 *
 * Top-level configuration for the event routing system.
 */
export interface EventRoutingConfig {
  /** Enable event routing (default: false for backwards compatibility) */
  enabled?: boolean;
  /** Default routing strategy for all routes (default: 'all') */
  defaultStrategy?: RoutingStrategy;
  /** Default failure policy for all routes (default: 'continue') */
  defaultFailurePolicy?: FailurePolicy;
  /** Event routes configuration */
  routes?: EventRoute[];
  /** Enable parallel publishing to multiple destinations (default: true) */
  parallel?: boolean;
}

/**
 * Resolved event routing configuration with defaults applied
 */
export interface ResolvedEventRoutingConfig {
  /** Enable event routing */
  enabled: boolean;
  /** Default routing strategy */
  defaultStrategy: RoutingStrategy;
  /** Default failure policy */
  defaultFailurePolicy: FailurePolicy;
  /** Event routes configuration */
  routes: EventRoute[];
  /** Enable parallel publishing */
  parallel: boolean;
}

/**
 * Routing result for a single destination
 */
export interface DestinationResult {
  /** Destination type */
  destination: DestinationType;
  /** Whether publishing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Time taken to publish (ms) */
  duration: number;
}

/**
 * Overall routing result
 */
export interface RoutingResult {
  /** Event type that was routed */
  eventType: string;
  /** Total number of destinations attempted */
  totalDestinations: number;
  /** Number of successful destinations */
  successfulDestinations: number;
  /** Number of failed destinations */
  failedDestinations: number;
  /** Individual destination results */
  results: DestinationResult[];
  /** Overall success (at least one destination succeeded) */
  success: boolean;
  /** Total time taken (ms) */
  totalDuration: number;
}

/**
 * Destination adapter interface
 *
 * All destination adapters must implement this interface.
 */
export interface IDestinationAdapter {
  /** Destination type */
  readonly type: DestinationType;
  /** Initialize the adapter */
  initialize(): Promise<void>;
  /** Check if adapter is ready */
  isReady(): boolean;
  /** Publish an event to this destination */
  publish(event: unknown, options?: Record<string, unknown>): Promise<void>;
  /** Publish multiple events to this destination */
  publishBatch(events: unknown[], options?: Record<string, unknown>): Promise<void>;
  /** Clean up resources */
  cleanup?(): Promise<void>;
}

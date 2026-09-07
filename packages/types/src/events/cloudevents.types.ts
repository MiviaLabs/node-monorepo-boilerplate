/**
 * CloudEvents Specification v1.0
 *
 * This module provides types and utilities for working with CloudEvents,
 * a specification for describing event data in common formats to provide
 * interoperability across services, platforms, and systems.
 *
 * @see https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents.md
 * @module events/cloudevents.types
 */

import type { IEvent, EventMetadata } from '../cqrs/event.types';

/**
 * CloudEvents specification v1.0 core attributes.
 *
 * Defines the standard envelope for event data following the CloudEvents
 * specification. Use this for inter-service communication, message queues,
 * and event-driven architectures that need vendor-neutral event format.
 *
 * @template T - The type of the event data payload, defaults to unknown
 *
 * @example
 * ```typescript
 * // Define a typed CloudEvent for user registration
 * interface UserRegisteredData {
 *   userId: string;
 *   email: string;
 *   registeredAt: string;
 * }
 *
 * const event: CloudEvent<UserRegisteredData> = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   source: '/user-service/registration',
 *   specversion: '1.0',
 *   type: 'com.example.user.registered',
 *   time: '2024-01-15T10:30:00Z',
 *   datacontenttype: 'application/json',
 *   subject: 'user_123',
 *   data: {
 *     userId: 'user_123',
 *     email: 'user@example.com',
 *     registeredAt: '2024-01-15T10:30:00Z',
 *   },
 * };
 *
 * // Publish to message broker
 * await messageBroker.publish('user.events', event);
 *
 * // Type guard for CloudEvent
 * if (isValidCloudEvent(message)) {
 *   handleEvent(message);
 * }
 * ```
 *
 * @see {@link IEvent} for domain event interface
 * @see {@link toCloudEvent} for converting domain events to CloudEvents
 * @see {@link fromCloudEvent} for converting CloudEvents to domain events
 * @see {@link CloudEventWithExtensions} for events with extension attributes
 */
// Intentionally named `CloudEvent` to align with the CloudEvents specification terminology.
// This is an explicit exception to the repository's interface I-prefix convention.
export interface CloudEvent<T = unknown> {
  // Required attributes
  /** Unique identifier for this event instance (UUID recommended) */
  readonly id: string;
  /** URI reference identifying the event producer context */
  readonly source: string;
  /** CloudEvents specification version (always '1.0' for this interface) */
  readonly specversion: string;
  /** Event type identifier (reverse-DNS naming recommended) */
  readonly type: string;

  // Optional attributes
  /** Content type of the data attribute (e.g., 'application/json') */
  readonly datacontenttype?: string;
  /** URI reference to the schema for the data attribute */
  readonly dataschema?: string;
  /** Additional context about the event subject/target */
  readonly subject?: string;
  /** ISO 8601 timestamp when the event occurred */
  readonly time?: string;

  // Event data
  /** The event payload containing domain-specific data */
  readonly data?: T;
}

/**
 * CloudEvents extension attributes for distributed tracing and context.
 *
 * Provides commonly used extension attributes beyond the core CloudEvents
 * specification. These attributes enable distributed tracing, correlation,
 * multi-tenancy, and audit logging across services.
 *
 * @example
 * ```typescript
 * // Create event with extensions
 * const event: CloudEventWithExtensions<OrderData> = {
 *   id: crypto.randomUUID(), // Browser/Node.js crypto API
 *   source: '/order-service',
 *   specversion: '1.0',
 *   type: 'com.example.order.created',
 *   data: orderData,
 *   // Extension attributes
 *   traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
 *   correlationid: 'req_abc123',
 *   tenantid: 'tenant_xyz',
 *   userid: 'user_456',
 * };
 *
 * // Extract extensions for observability
 * function enrichSpan(event: CloudEventWithExtensions) {
 *   if (event.traceparent) {
 *     span.setParentFromTraceContext(event.traceparent);
 *   }
 *   if (event.correlationid) {
 *     span.setAttribute('correlation.id', event.correlationid);
 *   }
 *   if (event.tenantid) {
 *     span.setAttribute('tenant.id', event.tenantid);
 *   }
 * }
 * ```
 *
 * @see {@link EventMetadata} for domain event metadata pattern
 * @see {@link CloudEventWithExtensions} for CloudEvent type with extensions
 * @see {@link ITenantContext} for tenant context propagation
 */
// Intentionally named `CloudEventExtensions` to align with CloudEvents specification terminology.
// This is an explicit exception to the repository's interface I-prefix convention.
// See {@link CloudEvent} for the same rationale applied to the core event interface.
export interface CloudEventExtensions {
  /** W3C Trace Context traceparent header for distributed tracing */
  readonly traceparent?: string;

  /** Correlation ID for tracking related requests across services */
  readonly correlationid?: string;

  /** Causation ID linking this event to the event that caused it */
  readonly causationid?: string;

  /** Tenant identifier for multi-tenant event routing and isolation */
  readonly tenantid?: string;

  /** User identifier for audit trails and accountability */
  readonly userid?: string;
}

/**
 * Full CloudEvent with optional extension attributes.
 *
 * Combines the core CloudEvent structure with common extension attributes
 * for distributed tracing, correlation, multi-tenancy, and audit logging.
 *
 * @template T - The type of the event data payload, defaults to unknown
 *
 * @example
 * ```typescript
 * // Create event with all context
 * const event: CloudEventWithExtensions<UserCreatedData> = {
 *   // Core attributes
 *   id: crypto.randomUUID(), // Browser/Node.js crypto API
 *   source: '/user-service',
 *   specversion: '1.0',
 *   type: 'user.created.v1',
 *   time: new Date().toISOString(),
 *   datacontenttype: 'application/json',
 *   data: { userId: 'user_123', email: 'user@example.com' },
 *   // Extensions
 *   correlationid: requestContext.correlationId,
 *   tenantid: requestContext.tenantId,
 *   userid: requestContext.userId,
 * };
 * ```
 *
 * @see {@link CloudEvent} for core CloudEvent structure
 * @see {@link CloudEventExtensions} for extension attributes
 */
export type CloudEventWithExtensions<T = unknown> = CloudEvent<T> & Partial<CloudEventExtensions>;

type CloudEventSourceEvent = IEvent & {
  readonly metadata?: EventMetadata;
  readonly eventId?: string;
  /** Event type identifier - REQUIRED. Do not rely on constructor.name as it breaks under minification. */
  readonly eventType: string;
  readonly data?: unknown;
};

/**
 * Convert domain event to CloudEvent format.
 *
 * Transforms a domain event (following the IEvent interface) into a
 * CloudEvents-compliant structure for external publishing. Automatically
 * maps event metadata to CloudEvents extension attributes.
 *
 * @param domainEvent - The domain event to convert
 * @param source - Event source URI (e.g., '/organization-service')
 * @param eventId - Optional event ID (uses domainEvent.eventId if not provided)
 * @returns CloudEvent in spec-compliant format with extensions
 * @throws {Error} If neither eventId parameter nor domainEvent.eventId is set
 *
 * @example
 * ```typescript
 * // Convert domain event for publishing
 * class UserRegisteredEvent implements IEvent {
 *   readonly aggregateId: string;
 *   readonly occurredAt: Date;
 *   readonly version: number;
 *   readonly eventType = 'UserRegistered';
 *   readonly eventId: string;
 *
 *   constructor(
 *     public readonly data: { userId: string; email: string },
 *     public readonly metadata?: EventMetadata,
 *   ) {
 *     this.aggregateId = data.userId;
 *     this.occurredAt = new Date();
 *     this.version = 1;
 *     this.eventId = crypto.randomUUID();
 *   }
 * }
 *
 * const domainEvent = new UserRegisteredEvent(
 *   { userId: 'user_123', email: 'user@example.com' },
 *   { correlationId: 'req_abc', tenantId: 'tenant_xyz' },
 * );
 *
 * // Use eventId from domain event
 * const cloudEvent = toCloudEvent(domainEvent, '/user-service');
 *
 * // Or provide eventId explicitly
 * const cloudEvent2 = toCloudEvent(domainEvent, '/user-service', crypto.randomUUID());
 * ```
 *
 * @see {@link IEvent} for domain event interface
 * @see {@link CloudEvent} for CloudEvents structure
 * @see {@link fromCloudEvent} for reverse conversion
 */
export const toCloudEvent = (
  domainEvent: CloudEventSourceEvent,
  source: string,
  eventId?: string
): CloudEventWithExtensions => {
  const { eventId: domainEventId, metadata, eventType, data } = domainEvent;
  const occurredAt = domainEvent.occurredAt instanceof Date ? domainEvent.occurredAt : new Date();
  const id = eventId || domainEventId;

  if (!id) {
    throw new Error(
      'Event ID is required: provide eventId parameter or ensure domainEvent.eventId is set'
    );
  }

  // Runtime guard: eventType is required. Do not use constructor.name as fallback
  // because it breaks under minification in production builds.
  if (!eventType) {
    throw new Error(
      'Event type is required: ensure domainEvent.eventType is set. ' +
        'Do not rely on constructor.name as it is unreliable under minification.'
    );
  }

  return {
    id,
    source,
    specversion: '1.0',
    type: eventType,
    time: occurredAt.toISOString(),
    datacontenttype: 'application/json',
    subject: domainEvent.aggregateId,
    data,
    // Add metadata as CloudEvents extensions
    ...(metadata?.correlationId && { correlationid: metadata.correlationId }),
    ...(metadata?.causationId && { causationid: metadata.causationId }),
    ...(metadata?.tenantId && { tenantid: metadata.tenantId }),
    ...(metadata?.userId && { userid: metadata.userId })
  };
};

/**
 * Convert CloudEvent to domain event format.
 *
 * Transforms a CloudEvents-compliant event into a domain event following
 * the IEvent interface. Extracts extension attributes and maps them to
 * event metadata for correlation and tracing.
 *
 * @param cloudEvent - CloudEvent to convert
 * @returns Domain event with eventType and optional data
 *
 * @example
 * ```typescript
 * // Receive CloudEvent from message broker
 * const cloudEvent: CloudEventWithExtensions = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   source: '/order-service',
 *   specversion: '1.0',
 *   type: 'com.example.order.placed',
 *   time: '2024-01-15T10:30:00Z',
 *   subject: 'order_456',
 *   data: { orderId: 'order_456', total: 99.99 },
 *   correlationid: 'req_abc123',
 *   tenantid: 'tenant_xyz',
 * };
 *
 * // Convert to domain event for processing
 * const domainEvent = fromCloudEvent(cloudEvent);
 * // Result:
 * // {
 * //   _brand: 'event',
 * //   eventId: '550e8400-e29b-41d4-a716-446655440000',
 * //   eventType: 'com.example.order.placed',
 * //   aggregateId: 'order_456',
 * //   occurredAt: Date('2024-01-15T10:30:00Z'),
 * //   version: 1,
 * //   data: { orderId: 'order_456', total: 99.99 },
 * //   metadata: { correlationId: 'req_abc123', tenantId: 'tenant_xyz' },
 * // }
 *
 * // Route to appropriate event handler
 * const handler = this.eventHandlers.get(domainEvent.eventType);
 * await handler?.handle(domainEvent);
 * ```
 *
 * @see {@link CloudEvent} for CloudEvents structure
 * @see {@link IEvent} for domain event interface
 * @see {@link toCloudEvent} for reverse conversion
 */
export const fromCloudEvent = (
  cloudEvent: CloudEventWithExtensions
): IEvent & { eventType: string; data?: unknown } => {
  // Validate subject is present - required for domain event aggregateId
  if (!cloudEvent.subject) {
    throw new Error(
      `Missing required 'subject' field in CloudEvent (id: ${cloudEvent.id}, type: ${cloudEvent.type}). ` +
        `The 'subject' field maps to 'aggregateId' in domain events and cannot be empty.`
    );
  }

  // Build metadata from CloudEvents extensions
  const metadata: EventMetadata = {
    ...(cloudEvent.correlationid && { correlationId: cloudEvent.correlationid }),
    ...(cloudEvent.causationid && { causationId: cloudEvent.causationid }),
    ...(cloudEvent.tenantid && { tenantId: cloudEvent.tenantid }),
    ...(cloudEvent.userid && { userId: cloudEvent.userid })
  };

  // Build domain event immutably with conditional metadata spread
  const domainEvent: IEvent & { eventType: string; data?: unknown } = {
    _brand: 'event',
    eventId: cloudEvent.id,
    eventType: cloudEvent.type,
    aggregateId: cloudEvent.subject,
    occurredAt: cloudEvent.time ? new Date(cloudEvent.time) : new Date(),
    version: 1, // Default version
    data: cloudEvent.data,
    // Only include metadata if it has properties
    ...(Object.keys(metadata).length > 0 && { metadata })
  };

  return domainEvent;
};

/**
 * Validate CloudEvent format.
 *
 * Type guard that checks if an unknown value conforms to the CloudEvents
 * specification by verifying the presence and types of required attributes.
 *
 * @param cloudEvent - Value to validate
 * @returns True if the value is a valid CloudEvent
 *
 * @example
 * ```typescript
 * // Validate incoming message
 * function handleMessage(message: unknown) {
 *   if (!isValidCloudEvent(message)) {
 *     logger.warn('Received invalid CloudEvent', { message });
 *     throw new ValidationError('Message is not a valid CloudEvent');
 *   }
 *
 *   // TypeScript now knows message is CloudEvent
 *   console.log(`Processing event: ${message.type} from ${message.source}`);
 *   processEvent(message);
 * }
 *
 * // Use in message handler
 * messageBroker.subscribe('events.*', (message) => {
 *   if (isValidCloudEvent(message.body)) {
 *     await eventDispatcher.dispatch(message.body);
 *   }
 * });
 *
 * // Filter valid events from batch
 * const validEvents = messages.filter(isValidCloudEvent);
 * ```
 *
 * @see {@link CloudEvent} for CloudEvents structure
 */
export const isValidCloudEvent = (cloudEvent: unknown): cloudEvent is CloudEvent => {
  if (typeof cloudEvent !== 'object' || cloudEvent === null) {
    return false;
  }

  const event = cloudEvent as Record<string, unknown>;

  return (
    typeof event['id'] === 'string' &&
    typeof event['source'] === 'string' &&
    typeof event['specversion'] === 'string' &&
    typeof event['type'] === 'string'
  );
};

/**
 * Standard content types for CloudEvent data payloads.
 *
 * Use these constants for the `datacontenttype` attribute to ensure
 * consistent content type declarations across services.
 *
 * @example
 * ```typescript
 * // Use JSON content type (most common)
 * const event: CloudEvent = {
 *   ...eventAttributes,
 *   datacontenttype: CLOUD_EVENT_CONTENT_TYPES.JSON,
 *   data: { orderId: 'order_123' },
 * };
 *
 * // Use appropriate content type based on data
 * function getContentType(data: unknown): string {
 *   if (typeof data === 'string') return CLOUD_EVENT_CONTENT_TYPES.TEXT;
 *   if (data instanceof ArrayBuffer) return CLOUD_EVENT_CONTENT_TYPES.OCTET_STREAM;
 *   return CLOUD_EVENT_CONTENT_TYPES.JSON;
 * }
 * ```
 *
 * @see {@link CloudEvent} for using with datacontenttype attribute
 */
export const CLOUD_EVENT_CONTENT_TYPES = {
  /** JSON content type for structured data */
  JSON: 'application/json',
  /** Plain text content type */
  TEXT: 'text/plain',
  /** XML content type for XML payloads */
  XML: 'application/xml',
  /** Binary content type for raw bytes */
  OCTET_STREAM: 'application/octet-stream'
} as const;

/**
 * @deprecated Use CLOUD_EVENT_CONTENT_TYPES instead. This alias is provided for backward compatibility.
 */
export const CloudEventContentTypes = CLOUD_EVENT_CONTENT_TYPES;

/**
 * Create a CloudEvent for publishing to external systems.
 *
 * Factory function that creates a fully-formed CloudEvent with timestamp
 * and optional extension attributes. Use this for creating events to
 * publish to message brokers or external services.
 *
 * @template T - The type of the event data payload
 * @param id - Unique event identifier (use crypto.randomUUID() to generate)
 * @param type - Event type identifier (reverse-DNS naming recommended)
 * @param source - Event source URI identifying the producer
 * @param data - Event payload data
 * @param metadata - Optional metadata including subject and extension attributes
 * @returns Fully-formed CloudEvent ready for publishing
 *
 * @example
 * ```typescript
 * // Create a simple event
 * const orderCreatedEvent = createCloudEvent(
 *   crypto.randomUUID(),
 *   'com.example.order.created',
 *   '/order-service',
 *   { orderId: 'order_123', customerId: 'cust_456', total: 99.99 },
 * );
 *
 * // Create event with full metadata
 * const paymentProcessedEvent = createCloudEvent(
 *   crypto.randomUUID(),
 *   'com.example.payment.processed',
 *   '/payment-service',
 *   { paymentId: 'pay_789', amount: 99.99, currency: 'USD' },
 *   {
 *     subject: 'order_123',
 *     correlationId: requestContext.correlationId,
 *     tenantId: requestContext.tenantId,
 *     userId: requestContext.userId,
 *   },
 * );
 *
 * // Publish to message broker
 * await messageBroker.publish('payments.processed', paymentProcessedEvent);
 *
 * // Use with typed event data
 * interface InventoryUpdatedData {
 *   productId: string;
 *   previousQuantity: number;
 *   newQuantity: number;
 * }
 *
 * const inventoryEvent = createCloudEvent<InventoryUpdatedData>(
 *   crypto.randomUUID(),
 *   'inventory.updated',
 *   '/inventory-service',
 *   { productId: 'prod_001', previousQuantity: 100, newQuantity: 95 },
 * );
 * ```
 *
 * @see {@link CloudEvent} for CloudEvents structure
 * @see {@link CLOUD_EVENT_CONTENT_TYPES} for content type constants
 * @see {@link toCloudEvent} for converting domain events
 */
export const createCloudEvent = <T = unknown>(
  id: string,
  type: string,
  source: string,
  data: T,
  metadata?: Readonly<{
    subject?: string;
    correlationId?: string;
    causationId?: string;
    tenantId?: string;
    userId?: string;
    contentType?: string;
  }>
): CloudEventWithExtensions<T> => {
  const cloudEvent: CloudEventWithExtensions<T> = {
    id,
    source,
    specversion: '1.0',
    type,
    time: new Date().toISOString(),
    datacontenttype: metadata?.contentType || CLOUD_EVENT_CONTENT_TYPES.JSON,
    data,
    ...(metadata?.subject && { subject: metadata.subject }),
    ...(metadata?.correlationId && { correlationid: metadata.correlationId }),
    ...(metadata?.causationId && { causationid: metadata.causationId }),
    ...(metadata?.tenantId && { tenantid: metadata.tenantId }),
    ...(metadata?.userId && { userid: metadata.userId })
  };

  return cloudEvent;
};

/**
 * Batch of CloudEvents for bulk operations.
 *
 * A readonly array of CloudEvents used for batch publishing or processing.
 * Useful for transactional event publishing where multiple events should
 * be treated as a unit.
 *
 * @template T - The type of the event data payload, defaults to unknown
 *
 * @example
 * ```typescript
 * // Create a batch of events
 * const eventBatch: CloudEventBatch<OrderEventData> = [
 *   createCloudEvent(crypto.randomUUID(), 'order.item.added', '/order-service', { itemId: 'item_1' }),
 *   createCloudEvent(crypto.randomUUID(), 'order.item.added', '/order-service', { itemId: 'item_2' }),
 *   createCloudEvent(crypto.randomUUID(), 'order.total.updated', '/order-service', { total: 199.99 }),
 * ];
 *
 * // Publish batch atomically
 * await messageBroker.publishBatch('order.events', eventBatch);
 *
 * // Process batch of incoming events
 * async function processBatch(events: CloudEventBatch) {
 *   for (const event of events) {
 *     await processEvent(event);
 *   }
 * }
 * ```
 *
 * @see {@link CloudEvent} for individual event structure
 * @see {@link toCloudEventBatch} for batch conversion from domain events
 * @see {@link fromCloudEventBatch} for batch conversion to domain events
 */
export type CloudEventBatch<T = unknown> = readonly CloudEvent<T>[];

/**
 * Convert multiple domain events to CloudEvents batch.
 *
 * Transforms an array of domain events into a CloudEvents batch for
 * bulk publishing. All events share the same source identifier.
 *
 * @param domainEvents - Array of domain events to convert
 * @param source - Event source URI for all events
 * @returns CloudEventBatch ready for publishing
 *
 * @example
 * ```typescript
 * // Convert aggregate events to CloudEvents batch
 * class OrderAggregate {
 *   private uncommittedEvents: DomainEvent[] = [];
 *
 *   publishEvents() {
 *     const batch = toCloudEventBatch(
 *       this.uncommittedEvents,
 *       '/order-service'
 *     );
 *     this.uncommittedEvents = [];
 *     return batch;
 *   }
 * }
 *
 * // Publish batch after command handling
 * const order = await orderRepository.load(orderId);
 * order.addItem(itemDto);
 * order.updateShipping(shippingDto);
 *
 * const eventBatch = toCloudEventBatch(order.getUncommittedEvents(), '/order-service');
 * await eventBus.publishBatch(eventBatch);
 * ```
 *
 * @see {@link toCloudEvent} for single event conversion
 * @see {@link CloudEventBatch} for batch type
 * @see {@link fromCloudEventBatch} for reverse conversion
 */
export const toCloudEventBatch = (
  domainEvents: ReadonlyArray<CloudEventSourceEvent>,
  source: string
): CloudEventBatch => {
  return domainEvents.map((event) => toCloudEvent(event, source));
};

/**
 * Convert CloudEvents batch to domain events.
 *
 * Transforms a batch of CloudEvents into domain events for processing
 * in event handlers. Useful for consuming batches from message brokers.
 *
 * @param cloudEvents - Batch of CloudEvents to convert
 * @returns Array of domain events with eventType and data
 *
 * @example
 * ```typescript
 * // Process incoming batch from message broker
 * messageBroker.subscribeBatch('events.*', async (batch: CloudEventBatch) => {
 *   const domainEvents = fromCloudEventBatch(batch);
 *
 *   for (const event of domainEvents) {
 *     const handler = eventHandlers.get(event.eventType);
 *     if (handler) {
 *       await handler.handle(event);
 *     }
 *   }
 * });
 *
 * // Replay events from event store
 * async function replayEvents(fromPosition: number) {
 *   const storedEvents = await eventStore.readFrom(fromPosition);
 *   const domainEvents = fromCloudEventBatch(storedEvents);
 *
 *   for (const event of domainEvents) {
 *     await projectionHandler.apply(event);
 *   }
 * }
 * ```
 *
 * @see {@link fromCloudEvent} for single event conversion
 * @see {@link CloudEventBatch} for batch type
 * @see {@link toCloudEventBatch} for reverse conversion
 */
export const fromCloudEventBatch = (
  cloudEvents: CloudEventBatch
): ReadonlyArray<IEvent & { eventType: string; data?: unknown }> => {
  return cloudEvents.map(fromCloudEvent);
};

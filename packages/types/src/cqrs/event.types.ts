/**
 * CQRS Event types
 *
 * This module provides the core types for implementing the Event pattern
 * in a CQRS (Command Query Responsibility Segregation) architecture. Events
 * represent facts that have occurred in the system and are used for event
 * sourcing, domain event publishing, and integration between bounded contexts.
 *
 * @module cqrs/event.types
 */

/**
 * Base event interface for domain events in the CQRS pattern.
 *
 * Events represent immutable facts that have occurred in the system. They are
 * past-tense (e.g., "UserCreated", "OrderPlaced") and contain all the data
 * needed to understand what happened. Events support the outbox pattern for
 * reliable event publishing.
 *
 * @example
 * ```typescript
 * // Define a domain event
 * interface UserCreatedEvent extends IEvent {
 *   readonly userId: string;
 *   readonly email: string;
 *   readonly name: string;
 * }
 *
 * // Create an event instance (no need to set _brand at runtime)
 * const event: UserCreatedEvent = {
 *   aggregateId: 'user-123',
 *   occurredAt: new Date(),
 *   version: 1,
 *   eventId: 'evt-456',
 *   correlationId: 'req-789',
 *   userId: 'user-123',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Event with CloudEvents-compatible structure
 * interface OrderPlacedEvent extends IEvent {
 *   readonly orderId: string;
 *   readonly customerId: string;
 *   readonly totalAmount: number;
 *   readonly items: ReadonlyArray<OrderItem>;
 * }
 * ```
 *
 * @see {@link IEventHandler} for handling events
 * @see {@link EventMetadata} for additional event context
 * @see {@link DomainEvent} for events with metadata
 */
export interface IEvent {
  /**
   * TypeScript branding property to distinguish events from other CQRS types.
   * This is a compile-time only marker and does not need to be set at runtime.
   * @internal
   */
  readonly _brand?: 'event';
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly version: number;
  // Outbox pattern support fields
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Event metadata for tracking context and correlation.
 *
 * Metadata provides additional context about an event without being part of
 * the core event data. This supports distributed tracing, multi-tenancy,
 * and audit logging.
 *
 * @example
 * ```typescript
 * // Create metadata for an event
 * const metadata: EventMetadata = {
 *   correlationId: 'req-123',      // Links related operations
 *   causationId: 'cmd-456',        // The command that caused this event
 *   userId: 'user-789',            // Who triggered the action
 *   tenantId: 'org-001',           // Tenant context for multi-tenancy
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Using metadata in event handlers for logging
 * class OrderEventHandler implements IEventHandler<OrderPlacedEvent> {
 *   async handle(event: DomainEvent & OrderPlacedEvent): Promise<void> {
 *     const { correlationId, userId, tenantId } = event.metadata ?? {};
 *     this.logger.info('Processing order', {
 *       orderId: event.orderId,
 *       correlationId,
 *       userId,
 *       tenantId,
 *     });
 *   }
 * }
 * ```
 *
 * @see {@link IEvent} for the base event interface
 * @see {@link DomainEvent} for events with metadata attached
 */
export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
}

/**
 * Domain event with metadata attached.
 *
 * DomainEvent extends the base IEvent interface with optional metadata,
 * providing a complete event type suitable for domain-driven design patterns.
 * Use this type when you need to track correlation, causation, or tenant context.
 *
 * @example
 * ```typescript
 * // Create a domain event with full metadata (no need to set _brand at runtime)
 * const event: DomainEvent & UserCreatedEvent = {
 *   aggregateId: 'user-123',
 *   occurredAt: new Date(),
 *   version: 1,
 *   eventId: 'evt-456',
 *   correlationId: 'req-789',
 *   userId: 'user-123',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   metadata: {
 *     correlationId: 'req-789',
 *     causationId: 'cmd-create-user',
 *     userId: 'admin-001',
 *     tenantId: 'org-123',
 *   },
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Define a typed domain event factory
 * function createUserCreatedEvent(
 *   user: User,
 *   metadata: EventMetadata
 * ): DomainEvent & UserCreatedEvent {
 *   return {
 *     aggregateId: user.id,
 *     occurredAt: new Date(),
 *     version: 1,
 *     eventId: generateEventId(),
 *     userId: user.id,
 *     email: user.email,
 *     name: user.name,
 *     metadata,
 *   };
 * }
 * ```
 *
 * @see {@link IEvent} for the base event interface
 * @see {@link EventMetadata} for metadata structure
 */
export interface DomainEvent extends IEvent {
  readonly metadata?: EventMetadata;
}

/**
 * Event handler interface for processing domain events.
 *
 * Event handlers implement the logic to react to domain events. They can
 * update read models, trigger side effects, publish integration events,
 * or coordinate sagas. Handlers should be idempotent to handle retries.
 *
 * @template TEvent - The type of event this handler processes. Must extend IEvent.
 *
 * @example
 * ```typescript
 * // Implement an event handler
 * class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
 *   constructor(
 *     private readonly emailService: EmailService,
 *     private readonly analyticsService: AnalyticsService,
 *   ) {}
 *
 *   async handle(event: UserCreatedEvent): Promise<void> {
 *     // Send welcome email
 *     await this.emailService.sendWelcomeEmail({
 *       to: event.email,
 *       name: event.name,
 *     });
 *
 *     // Track analytics
 *     await this.analyticsService.track('user_created', {
 *       userId: event.userId,
 *       timestamp: event.occurredAt,
 *     });
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Handler with synchronous processing
 * class OrderReadModelUpdater implements IEventHandler<OrderPlacedEvent> {
 *   handle(event: OrderPlacedEvent): void {
 *     // Synchronous update to in-memory read model
 *     this.readModel.addOrder({
 *       id: event.orderId,
 *       customerId: event.customerId,
 *       total: event.totalAmount,
 *       placedAt: event.occurredAt,
 *     });
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Handler with idempotency check
 * class PaymentProcessedHandler implements IEventHandler<PaymentProcessedEvent> {
 *   async handle(event: PaymentProcessedEvent): Promise<void> {
 *     // Check if already processed (idempotency)
 *     if (await this.isProcessed(event.eventId)) {
 *       return;
 *     }
 *
 *     // Process the event
 *     await this.processPayment(event);
 *
 *     // Mark as processed
 *     await this.markProcessed(event.eventId);
 *   }
 * }
 * ```
 *
 * @see {@link IEvent} for the base event interface
 */
export interface IEventHandler<TEvent extends IEvent> {
  handle(event: TEvent): Promise<void> | void;
}

/**
 * Domain-Driven Design: Aggregate Root types
 *
 * This module provides the base class for aggregate roots following Domain-Driven
 * Design (DDD) principles. Aggregates are consistency boundaries that group related
 * entities and value objects together. Only the aggregate root can be accessed from
 * outside the aggregate, ensuring invariants are always protected.
 *
 * Key concepts:
 * - **Consistency boundary**: All changes within an aggregate are atomic
 * - **Single entry point**: Only the aggregate root is directly accessible
 * - **Event sourcing support**: Aggregates track domain events for persistence
 * - **Optimistic concurrency**: Version numbers prevent concurrent modifications
 *
 * @module domain/aggregate.types
 */

import type { IEvent } from '../cqrs/event.types';

// Re-export aggregate repository from repository.types to avoid duplication
export type { IAggregateRepository } from './repository.types';

/**
 * Base event data type for domain events created via addEvent.
 *
 * Event data must be one of:
 * - A simple object with a `type` string property for discriminating events in handlers
 * - A class instance implementing IEvent (which already has required IEvent properties)
 *
 * This type rejects arbitrary objects without a discriminant, ensuring events
 * can be properly identified and handled.
 *
 * @example
 * ```typescript
 * // Simple object event data with type discriminant (recommended for most cases)
 * this.addEvent({
 *   type: 'OrderCreated',
 *   orderId: 'order-123',
 *   customerId: 'cust-456',
 * });
 *
 * // Class-based event that implements IEvent
 * class OrderCreatedEvent implements IEvent {
 *   readonly aggregateId: string;
 *   readonly occurredAt: Date;
 *   readonly version: number;
 *   constructor(public readonly orderId: string, public readonly customerId: string) {
 *     this.aggregateId = orderId;
 *     this.occurredAt = new Date();
 *     this.version = 1;
 *   }
 * }
 * this.addEvent(new OrderCreatedEvent('order-123', 'cust-456'));
 * ```
 */
export type EventData = { readonly type: string } | IEvent;

/**
 * Abstract base class for aggregate roots.
 *
 * Aggregates are clusters of domain objects that can be treated as a unit for
 * data changes. The aggregate root is the entry point for accessing and modifying
 * the aggregate. This class provides infrastructure for event sourcing, including
 * tracking uncommitted events and rebuilding state from event history.
 *
 * @template T - The JSON representation type for serialization. This is the shape
 *               returned by `toJSON()` for persistence or API responses.
 *
 * @example
 * ```typescript
 * // Define the JSON representation
 * interface OrderJSON {
 *   readonly id: string;
 *   readonly customerId: string;
 *   readonly items: ReadonlyArray<OrderItemJSON>;
 *   readonly status: OrderStatus;
 *   readonly totalAmount: number;
 * }
 *
 * // Implement an aggregate root
 * class Order extends AggregateRoot<OrderJSON> {
 *   private _customerId: string;
 *   private _items: OrderItem[] = [];
 *   private _status: OrderStatus = OrderStatus.Draft;
 *
 *   private constructor(id: string, customerId: string) {
 *     super(id);
 *     this._customerId = customerId;
 *   }
 *
 *   // Factory method for creating new orders
 *   static create(id: string, customerId: string): Order {
 *     const order = new Order(id, customerId);
 *     order.addEvent({
 *       type: 'OrderCreated',
 *       orderId: id,
 *       customerId,
 *     });
 *     return order;
 *   }
 *
 *   // Business method that enforces invariants
 *   addItem(productId: string, quantity: number, price: number): void {
 *     if (this._status !== OrderStatus.Draft) {
 *       throw new Error('Cannot add items to a non-draft order');
 *     }
 *
 *     const item = new OrderItem(productId, quantity, price);
 *     this._items.push(item);
 *
 *     this.addEvent({
 *       type: 'ItemAddedToOrder',
 *       orderId: this.id,
 *       productId,
 *       quantity,
 *       price,
 *     });
 *   }
 *
 *   // Submit order - transitions state
 *   submit(): void {
 *     if (this._items.length === 0) {
 *       throw new Error('Cannot submit empty order');
 *     }
 *     this._status = OrderStatus.Submitted;
 *     this.addEvent({
 *       type: 'OrderSubmitted',
 *       orderId: this.id,
 *       totalAmount: this.totalAmount,
 *     });
 *   }
 *
 *   get totalAmount(): number {
 *     return this._items.reduce((sum, item) => sum + item.total, 0);
 *   }
 *
 *   toJSON(): OrderJSON {
 *     return {
 *       id: this.id,
 *       customerId: this._customerId,
 *       items: this._items.map(item => item.toJSON()),
 *       status: this._status,
 *       totalAmount: this.totalAmount,
 *     };
 *   }
 *
 *   // Apply events for rebuilding from history
 *   protected applyEvent(event: IEvent): void {
 *     super.applyEvent(event);
 *     const eventData = event as unknown as { type: string };
 *
 *     switch (eventData.type) {
 *       case 'OrderCreated':
 *         // Initial state already set in constructor
 *         break;
 *       case 'ItemAddedToOrder':
 *         // Rebuild item from event data
 *         break;
 *       case 'OrderSubmitted':
 *         this._status = OrderStatus.Submitted;
 *         break;
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using the aggregate with a repository
 * class OrderService {
 *   constructor(private readonly orderRepository: IAggregateRepository<Order, OrderJSON>) {}
 *
 *   async createOrder(customerId: string): Promise<Order> {
 *     const order = Order.create(generateId(), customerId);
 *     await this.orderRepository.save(order);
 *     return order;
 *   }
 *
 *   async addItemToOrder(orderId: string, item: OrderItemDTO): Promise<void> {
 *     const order = await this.orderRepository.findById(orderId);
 *     if (!order) throw new Error('Order not found');
 *
 *     order.addItem(item.productId, item.quantity, item.price);
 *     await this.orderRepository.save(order);
 *   }
 * }
 * ```
 *
 * @see {@link IEvent} for the event interface used by aggregates
 * @see {@link IAggregateRepository} for persisting aggregates
 */
export abstract class AggregateRoot<T> {
  /**
   * The unique identifier of this aggregate root.
   * Protected to allow subclasses to access but not external code.
   */
  protected readonly _id: string;

  /**
   * The current version number for optimistic concurrency control.
   * Incremented each time events are committed.
   */
  private _version: number = 0;

  /**
   * Events that have been raised but not yet persisted.
   * These are cleared when `markEventsAsCommitted()` is called.
   */
  private _uncommittedEvents: IEvent[] = [];

  /**
   * Creates a new aggregate root instance.
   *
   * @param id - The unique identifier for this aggregate
   *
   * @example
   * ```typescript
   * class Order extends AggregateRoot<OrderJSON> {
   *   private constructor(id: string) {
   *     super(id);
   *   }
   *
   *   static create(id: string): Order {
   *     return new Order(id);
   *   }
   * }
   * ```
   */
  protected constructor(id: string) {
    this._id = id;
  }

  /**
   * Gets the unique identifier of this aggregate root.
   */
  get id(): string {
    return this._id;
  }

  /**
   * Gets the current version number for optimistic concurrency control.
   * The version is incremented each time events are committed.
   */
  get version(): number {
    return this._version;
  }

  /**
   * Gets a copy of the uncommitted events.
   * Returns a new array to prevent external modification.
   */
  get uncommittedEvents(): ReadonlyArray<IEvent> {
    return [...this._uncommittedEvents];
  }

  /**
   * Adds a domain event to the uncommitted events list.
   *
   * This method should be called by aggregate methods when state changes occur.
   * The event will be persisted when the aggregate is saved through the repository.
   *
   * @param data - The event data object containing the event payload. Should include
   *               a `type` property to identify the event kind (e.g., 'OrderCreated').
   * @param metadata - Optional metadata for tracing and multi-tenancy support
   * @param metadata.correlationId - ID linking related operations across services
   * @param metadata.causationId - ID of the command/event that caused this event
   * @param metadata.userId - ID of the user who triggered this action
   * @param metadata.tenantId - Tenant/organization context for multi-tenancy
   *
   * @example
   * ```typescript
   * class Order extends AggregateRoot<OrderJSON> {
   *   submit(): void {
   *     // Business logic validation
   *     if (this._items.length === 0) {
   *       throw new Error('Cannot submit empty order');
   *     }
   *
   *     this._status = OrderStatus.Submitted;
   *
   *     // Record the domain event
   *     this.addEvent(
   *       { type: 'OrderSubmitted', orderId: this.id },
   *       { correlationId: 'req-123', userId: 'user-456' }
   *     );
   *   }
   * }
   * ```
   *
   * @see {@link EventData} for the event data type
   * @see {@link IEvent} for the event structure
   * @see {@link uncommittedEvents} to access raised events
   */
  protected addEvent<TData extends EventData>(
    data: TData,
    metadata?: Readonly<{
      correlationId?: string;
      causationId?: string;
      userId?: string;
      tenantId?: string;
    }>
  ): void {
    // Build event by composing event data with required IEvent properties
    // Event data is spread first, then IEvent properties are applied to ensure
    // required fields (aggregateId, occurredAt, version) have correct values
    // Version is calculated to be unique for each uncommitted event
    // Note: userId and tenantId are metadata fields added for tracing/multi-tenancy
    const event: IEvent = {
      ...data,
      _brand: 'event' as const,
      aggregateId: this._id,
      occurredAt: new Date(),
      version: this._version + this._uncommittedEvents.length + 1,
      correlationId: metadata?.correlationId,
      causationId: metadata?.causationId,
      metadata: metadata
        ? {
            correlationId: metadata.correlationId,
            causationId: metadata.causationId,
            userId: metadata.userId,
            tenantId: metadata.tenantId
          }
        : undefined
    } as unknown as IEvent;

    this._uncommittedEvents.push(event);
  }

  /**
   * Marks all uncommitted events as committed.
   *
   * This method should be called by the repository after successfully persisting
   * the events. It clears the uncommitted events list and increments the version.
   *
   * @example
   * ```typescript
   * // In repository implementation
   * class OrderRepository implements IAggregateRepository<Order, OrderJSON> {
   *   async save(aggregate: Order): Promise<void> {
   *     const events = aggregate.uncommittedEvents;
   *
   *     // Persist events to event store
   *     await this.eventStore.append(aggregate.id, events);
   *
   *     // Publish events to message bus
   *     await this.eventBus.publishAll(events);
   *
   *     // Mark events as committed
   *     aggregate.markEventsAsCommitted();
   *   }
   * }
   * ```
   *
   * @see {@link uncommittedEvents} to access events before committing
   */
  markEventsAsCommitted(): void {
    const committedCount = this._uncommittedEvents.length;
    this._uncommittedEvents = [];
    this._version += committedCount;
  }

  /**
   * Converts the aggregate to its JSON representation for serialization.
   *
   * This method must be implemented by subclasses to define how the aggregate
   * state is serialized. The returned object should be suitable for persistence
   * or API responses.
   *
   * @returns The JSON representation of the aggregate
   *
   * @example
   * ```typescript
   * class Order extends AggregateRoot<OrderJSON> {
   *   toJSON(): OrderJSON {
   *     return {
   *       id: this.id,
   *       customerId: this._customerId,
   *       items: this._items.map(item => item.toJSON()),
   *       status: this._status,
   *       totalAmount: this.totalAmount,
   *     };
   *   }
   * }
   * ```
   */
  abstract toJSON(): T;

  /**
   * Rebuilds an aggregate from a sequence of events (event sourcing).
   *
   * This static method creates a new aggregate instance and replays all events
   * to rebuild the current state. It's used when loading aggregates from an
   * event store rather than a snapshot.
   *
   * @template T - The aggregate type (must extend AggregateRoot)
   * @template U - The JSON representation type
   * @param AggregateClass - The constructor for the aggregate class
   * @param events - The sequence of events to replay, in order
   * @returns The rebuilt aggregate with state reflecting all events
   * @throws Error if events array is empty or first event lacks aggregateId
   *
   * @example
   * ```typescript
   * // In repository implementation
   * class OrderRepository implements IAggregateRepository<Order, OrderJSON> {
   *   async loadFromHistory(id: string): Promise<Order | null> {
   *     const events = await this.eventStore.getEvents(id);
   *     if (events.length === 0) return null;
   *
   *     // Rebuild aggregate from event history
   *     return AggregateRoot.rebuildFromEvents(Order, events);
   *   }
   * }
   *
   * // Event sourcing allows temporal queries
   * async function getOrderStateAtTime(
   *   orderId: string,
   *   timestamp: Date
   * ): Promise<Order | null> {
   *   const events = await eventStore.getEvents(orderId);
   *   const eventsUpToTime = events.filter(e => e.occurredAt <= timestamp);
   *
   *   if (eventsUpToTime.length === 0) return null;
   *   return AggregateRoot.rebuildFromEvents(Order, eventsUpToTime);
   * }
   * ```
   *
   * @see The protected `applyEvent` method for how individual events are applied
   * @see {@link IAggregateRepository.loadFromHistory} for repository usage
   */
  public static rebuildFromEvents<T extends AggregateRoot<U>, U>(
    AggregateClass: new (id: string) => T,
    events: IEvent[]
  ): T {
    if (events.length === 0) {
      throw new Error('Cannot rebuild aggregate from empty events');
    }

    const firstEvent = events[0];
    if (!firstEvent?.aggregateId) {
      throw new Error('First event must have aggregateId');
    }
    const aggregate = new AggregateClass(firstEvent.aggregateId);

    for (const event of events) {
      aggregate.applyEvent(event);
    }

    return aggregate;
  }

  /**
   * Applies a single event to update the aggregate state.
   *
   * This method is called during event replay (rebuilding from history).
   * Subclasses should override this to handle specific event types and
   * update internal state accordingly.
   *
   * @param event - The event to apply to the aggregate state
   *
   * @example
   * ```typescript
   * class Order extends AggregateRoot<OrderJSON> {
   *   protected applyEvent(event: IEvent): void {
   *     // Always call super to update version
   *     super.applyEvent(event);
   *
   *     const eventData = event as unknown as OrderEvent;
   *
   *     switch (eventData.type) {
   *       case 'OrderCreated':
   *         this._customerId = eventData.customerId;
   *         this._status = OrderStatus.Draft;
   *         break;
   *
   *       case 'ItemAddedToOrder':
   *         this._items.push(new OrderItem(
   *           eventData.productId,
   *           eventData.quantity,
   *           eventData.price
   *         ));
   *         break;
   *
   *       case 'OrderSubmitted':
   *         this._status = OrderStatus.Submitted;
   *         break;
   *     }
   *   }
   * }
   * ```
   *
   * @see {@link rebuildFromEvents} for the full replay process
   */
  protected applyEvent(event: IEvent): void {
    // Override in subclass to apply event-specific logic
    this._version = event.version;
  }
}

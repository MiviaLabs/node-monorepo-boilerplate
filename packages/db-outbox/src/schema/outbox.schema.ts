/**
 * Transactional Outbox Pattern Schema
 *
 * This module implements the **Transactional Outbox Pattern** for reliable event publishing.
 * It ensures that domain events are persisted atomically with business state changes,
 * providing guaranteed delivery to message brokers (Kafka, RabbitMQ, etc.).
 *
 * ## What This Is (Transactional Outbox)
 *
 * The outbox pattern solves the dual-write problem: when a service needs to both update
 * its database AND publish an event, doing both operations separately risks inconsistency
 * if either fails. The outbox stores events in the same transaction as the state change,
 * and a background poller publishes them asynchronously.
 *
 * ## What This Is NOT (Event Sourcing)
 *
 * This is NOT event sourcing. In event sourcing, events are the source of truth and
 * aggregate state is derived by replaying events. This pattern stores events purely
 * for reliable delivery - the aggregate's current state lives in regular domain tables.
 * The replay functionality here is for debugging/recovery, not state reconstruction.
 *
 * ## Architecture Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    SAME DATABASE TRANSACTION                       │
 * │  ┌──────────────────────┐    ┌────────────────────────┐           │
 * │  │  Domain Table        │    │  Outbox Table          │           │
 * │  │  (orders, users)     │    │  (pending events)      │           │
 * │  │  UPDATE state        │ +  │  INSERT event          │           │
 * │  └──────────────────────┘    └────────────────────────┘           │
 * └─────────────────────────────────────────────────────────────────────┘
 *                                          │
 *                                          ▼
 *                              ┌───────────────────────┐
 *                              │  Background Poller    │
 *                              │  (OutboxPollerService)│
 *                              └───────────────────────┘
 *                                          │
 *                                          ▼
 *                              ┌───────────────────────┐
 *                              │  Message Broker       │
 *                              │  (Kafka/RabbitMQ)     │
 *                              └───────────────────────┘
 * ```
 *
 * ## Status State Machine
 *
 * ```
 *   ┌─────────┐
 *   │ PENDING │ ◄── Initial state when event is created
 *   └────┬────┘
 *        │ Poller picks up
 *        ▼
 *   ┌────────────┐
 *   │ PROCESSING │ ◄── Locked by a worker, being published
 *   └────┬───────┘
 *        │
 *    ┌───┴───┐
 *    │       │
 *    ▼       ▼
 * ┌─────────┐ ┌────────┐
 * │PUBLISHED│ │ FAILED │ ◄── After max retries exceeded
 * └─────────┘ └────────┘
 *                 │
 *                 ▼ (if deadLetteredAt set)
 *           Dead Letter Queue
 * ```
 *
 * @module @package/db-outbox/schema/outbox
 * @see {@link https://microservices.io/patterns/data/transactional-outbox.html} Transactional Outbox Pattern
 *
 * @example
 * ```typescript
 * // Inserting an event within a transaction
 * await db.transaction(async (tx) => {
 *   // Update domain state
 *   await tx.update(orders).set({ status: 'confirmed' }).where(eq(orders.id, orderId));
 *
 *   // Insert event into outbox (same transaction)
 *   await tx.insert(outbox).values({
 *     eventId: crypto.randomUUID(),
 *     eventType: 'order.confirmed',
 *     aggregateId: orderId,
 *     payload: { orderId, confirmedAt: new Date().toISOString() },
 *     tenantId: tenantId
 *   });
 * });
 * ```
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  index,
  unique,
  pgEnum,
  integer
} from 'drizzle-orm/pg-core';

/**
 * Outbox message status enumeration.
 *
 * Represents the lifecycle state of an outbox event. Events flow through
 * these states as they are processed by the background poller.
 *
 * @description State machine for outbox event processing:
 * - `PENDING` → Initial state, awaiting pickup by poller
 * - `PROCESSING` → Locked by a worker, currently being published
 * - `PUBLISHED` → Successfully delivered to message broker
 * - `FAILED` → Exceeded retry limit, requires manual intervention or dead-lettering
 *
 * @remarks
 * Must be a regular enum (not `const enum`) because this package
 * is imported directly from source in the monorepo. Const enums
 * would be inlined and cause issues with cross-package imports.
 *
 * @example
 * ```typescript
 * import { OutboxStatus } from '@package/db-outbox';
 *
 * // Check if event needs processing
 * if (event.status === OutboxStatus.PENDING) {
 *   await processEvent(event);
 * }
 *
 * // Query for failed events
 * const failedEvents = await db
 *   .select()
 *   .from(outbox)
 *   .where(eq(outbox.status, OutboxStatus.FAILED));
 * ```
 */
export enum OutboxStatus {
  /** Event created, waiting to be picked up by the poller */
  PENDING = 'pending',
  /** Event locked by a worker, currently being published to broker */
  PROCESSING = 'processing',
  /** Event successfully published to message broker */
  PUBLISHED = 'published',
  /** Event failed after max retries, may be dead-lettered */
  FAILED = 'failed'
}

/**
 * PostgreSQL enum for outbox status.
 *
 * Defines the database-side enum type that maps to {@link OutboxStatus}.
 * This enum is created in PostgreSQL via migration and ensures type safety
 * at the database level.
 *
 * @description Creates the `outbox_status` enum type in PostgreSQL with values:
 * `'pending'`, `'processing'`, `'published'`, `'failed'`
 */
export const outboxStatusEnum = pgEnum('outbox_status', [
  OutboxStatus.PENDING,
  OutboxStatus.PROCESSING,
  OutboxStatus.PUBLISHED,
  OutboxStatus.FAILED
]);

/**
 * Outbox table for transactional event publishing.
 *
 * Stores domain events that need to be published to a message broker (Kafka, RabbitMQ).
 * Events are inserted within the same database transaction as the domain state change,
 * ensuring atomicity and preventing the dual-write problem.
 *
 * A background poller service (OutboxPollerService) continuously polls this table
 * for pending events, publishes them to the message broker, and updates their status.
 *
 * @description Column groups:
 * - **Identity**: `id`, `eventId`, `eventType`, `aggregateId`, `aggregateVersion`
 * - **Payload**: `payload`, `schemaVersion`
 * - **Correlation**: `correlationId`, `causationId`, `tenantId`
 * - **Processing**: `status`, `publishedAt`, `lockedAt`, `lockedBy`
 * - **Retry**: `retryCount`, `lastRetryAt`, `nextRetryAt`, `errorMessage`
 * - **Dead Letter**: `deadLetteredAt`, `deadLetterReason`
 * - **Replay**: `replayedAt`, `replayedCount`, `lastReplayId`
 * - **Timestamps**: `createdAt`, `updatedAt`
 *
 * @example
 * ```typescript
 * // Typical outbox record structure (all fields)
 * const outboxRecord = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   eventId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
 *   eventType: 'user.registered',
 *   aggregateId: 'user-123',
 *   aggregateVersion: '1',
 *   payload: {
 *     userId: 'user-123',
 *     email: 'user@example.com',
 *     registeredAt: '2024-01-15T10:30:00Z'
 *   },
 *   correlationId: 'req-abc-123',
 *   causationId: null,
 *   tenantId: 'tenant-xyz',
 *   schemaVersion: '1.0',
 *   status: 'pending',
 *   retryCount: 0,
 *   lastRetryAt: null,
 *   nextRetryAt: null,
 *   errorMessage: null,
 *   publishedAt: null,
 *   lockedAt: null,
 *   lockedBy: null,
 *   deadLetteredAt: null,
 *   deadLetterReason: null,
 *   replayedAt: null,
 *   replayedCount: 0,
 *   lastReplayId: null,
 *   createdAt: new Date('2024-01-15T10:30:00Z'),
 *   updatedAt: new Date('2024-01-15T10:30:00Z')
 * };
 * ```
 */
export const outbox = pgTable(
  'outbox',
  {
    /**
     * Primary key - auto-generated UUID for the outbox record.
     * @description Internal identifier for the outbox row, distinct from eventId.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Unique identifier for the domain event.
     * @description Client-generated UUID ensuring event idempotency. Used with
     * aggregateId in unique constraint to prevent duplicate event insertion.
     */
    eventId: uuid('event_id').notNull(),

    /**
     * Type/name of the domain event.
     * @description Dot-notation event type (e.g., 'order.created', 'user.registered').
     * Used by consumers for routing and deserialization.
     */
    eventType: varchar('event_type', { length: 255 }).notNull(),

    /**
     * Identifier of the aggregate that produced this event.
     * @description Links the event to its source entity (e.g., order ID, user ID).
     * Used for event replay and aggregate-scoped queries.
     */
    aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),

    /**
     * Version of the aggregate when this event was produced.
     * @description Optional optimistic concurrency control. Useful for ordering
     * events within an aggregate when strict ordering matters.
     */
    aggregateVersion: varchar('aggregate_version', { length: 50 }),

    /**
     * Event payload as JSON.
     * @description The actual event data. Structure depends on eventType.
     * Should be self-contained with all data needed by consumers.
     *
     * **PII Warning:** This schema does not enforce payload shape. Payloads may
     * contain PII (e.g., email, name). Event producers and consumers are responsible
     * for sanitizing or redacting PII before logging or emitting. Recommended:
     * hash/remove sensitive fields, avoid logging raw payloads.
     */
    payload: jsonb('payload').notNull(),

    /**
     * Correlation ID for distributed tracing.
     * @description Links related events across services. Typically propagated
     * from the original request that triggered the event chain.
     */
    correlationId: uuid('correlation_id'),

    /**
     * Causation ID linking to the parent event.
     * @description Points to the event that directly caused this event.
     * Enables building event causation chains for debugging.
     */
    causationId: uuid('causation_id'),

    /**
     * Tenant identifier for multi-tenancy isolation.
     * @description Ensures events are scoped to the correct tenant.
     * Used for tenant-filtered queries and access control.
     * Required field - all events must have tenant context.
     */
    tenantId: varchar('tenant_id', { length: 255 }).notNull(),

    /**
     * Schema version of the event payload.
     * @description Enables payload evolution. Consumers use this to select
     * the correct deserializer for the payload structure.
     */
    schemaVersion: varchar('schema_version', { length: 20 }).notNull().default('1.0'),

    /**
     * Current processing status of the event.
     * @description See {@link OutboxStatus} for state machine documentation.
     * Defaults to PENDING when event is created.
     */
    status: outboxStatusEnum('status').notNull().default(OutboxStatus.PENDING),

    /**
     * Number of publish attempts made.
     * @description Incremented on each failed attempt. Used to determine
     * when to stop retrying and dead-letter the event.
     */
    retryCount: integer('retry_count').default(0).notNull(),

    /**
     * Timestamp of the last retry attempt.
     * @description Used with nextRetryAt for exponential backoff calculation.
     */
    lastRetryAt: timestamp('last_retry_at'),

    /**
     * Scheduled time for next retry attempt.
     * @description Calculated using exponential backoff. Poller only picks up
     * events where nextRetryAt <= now() or nextRetryAt is null.
     */
    nextRetryAt: timestamp('next_retry_at'),

    /**
     * Error message from the last failed attempt.
     * @description Stores the error details for debugging. Updated on each
     * failed publish attempt.
     */
    errorMessage: text('error_message'),

    /**
     * Timestamp when event was successfully published.
     * @description Set when status transitions to PUBLISHED. Used by cleanup
     * jobs to identify events safe to archive or delete.
     */
    publishedAt: timestamp('published_at'),

    /**
     * Timestamp when event was locked for processing.
     * @description Used for optimistic locking. If a worker crashes, stale locks
     * (lockedAt older than timeout) can be reclaimed by other workers.
     */
    lockedAt: timestamp('locked_at'),

    /**
     * Identifier of the worker that locked this event.
     * @description Typically the worker's hostname or instance ID. Used for
     * debugging and identifying crashed workers.
     */
    lockedBy: varchar('locked_by', { length: 255 }),

    /**
     * Timestamp when event was moved to dead letter queue.
     * @description Set when event exceeds max retries and is dead-lettered.
     * Dead-lettered events require manual intervention or automated recovery.
     */
    deadLetteredAt: timestamp('dead_lettered_at'),

    /**
     * Reason code for dead-lettering.
     * @description Categorizes why the event was dead-lettered:
     * 'max_retries', 'invalid_payload', 'broker_unavailable', etc.
     */
    deadLetterReason: varchar('dead_letter_reason', { length: 50 }),

    /**
     * Timestamp of the last event replay.
     * @description Set when an event is manually replayed for debugging or
     * recovery purposes. NOT used for aggregate state reconstruction.
     * @remarks This is for operational recovery, not event sourcing.
     */
    replayedAt: timestamp('replayed_at'),

    /**
     * Number of times this event has been replayed.
     * @description Tracks replay history for auditing. Useful for identifying
     * events that required multiple replays due to downstream issues.
     */
    replayedCount: integer('replayed_count').default(0).notNull(),

    /**
     * ID of the replay operation that last processed this event.
     * @description Links to a replay audit log. Enables tracing which replay
     * batch included this event.
     */
    lastReplayId: uuid('last_replay_id'),

    /**
     * Timestamp when the outbox record was created.
     * @description Auto-set on insert. Used for FIFO ordering and metrics.
     */
    createdAt: timestamp('created_at').notNull().defaultNow(),

    /**
     * Timestamp when the outbox record was last updated.
     * @description Auto-set on insert, updated on status changes.
     */
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => ({
    /**
     * Index for polling pending events in FIFO order.
     * @description Optimizes the poller's main query:
     * `SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at`
     * Composite index on (status, created_at) enables efficient range scans.
     */
    pendingIdx: index('outbox_pending_idx').on(table.status, table.createdAt),

    /**
     * Index for tenant-scoped queries.
     * @description Enables efficient filtering by tenant for multi-tenant
     * deployments. Essential for tenant isolation and admin queries.
     */
    tenantIdx: index('outbox_tenant_idx').on(table.tenantId),

    /**
     * Composite index for tenant-scoped pending event queries.
     * @description Optimizes the common query pattern:
     * `SELECT * FROM outbox WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at`
     * This enables efficient tenant-filtered polling without full table scans.
     */
    tenantStatusCreatedIdx: index('outbox_tenant_status_created_idx').on(
      table.tenantId,
      table.status,
      table.createdAt
    ),

    /**
     * Index for aggregate-based event retrieval.
     * @description Enables querying all events for a specific aggregate,
     * ordered by creation time. Used for debugging and event replay
     * (for recovery purposes, not state reconstruction).
     */
    aggregateIdx: index('outbox_aggregate_idx').on(table.aggregateId, table.createdAt),

    /**
     * Index for cleanup job queries.
     * @description Optimizes identifying old published events for archival
     * or deletion: `WHERE status = 'published' AND published_at < ?`
     */
    cleanupIdx: index('outbox_cleanup_idx').on(table.status, table.publishedAt),

    /**
     * Index for dead letter queue queries.
     * @description Enables efficient retrieval of dead-lettered events
     * for manual review and recovery operations.
     */
    deadLetterIdx: index('outbox_dead_letter_idx').on(table.deadLetteredAt),

    /**
     * Index for tenant-filtered dead letter queries.
     * @description Composite index for querying dead-lettered events
     * within a specific tenant's scope.
     */
    deadLetterTenantIdx: index('outbox_dead_letter_tenant_idx').on(
      table.deadLetteredAt,
      table.tenantId
    ),

    /**
     * Index for replay tracking queries.
     * @description Enables querying events by replay batch ID for
     * audit and verification of replay operations.
     */
    replayIdx: index('outbox_replay_idx').on(table.lastReplayId),

    /**
     * Unique constraint preventing duplicate events per tenant.
     * @description Ensures idempotency: the same event (eventId) for the same
     * aggregate (aggregateId) within a tenant can only be inserted once. Prevents
     * duplicate publishes if the application retries a failed transaction.
     * Includes tenantId to ensure proper multi-tenant isolation.
     */
    uniqueEvent: unique('outbox_event_unique').on(table.eventId, table.aggregateId, table.tenantId)
  })
);

/**
 * TypeScript type for selecting outbox records from the database.
 *
 * @description Inferred from the outbox table schema. Use this type for
 * query results and when working with existing outbox records.
 *
 * @example
 * ```typescript
 * const events: OutboxRecord[] = await db.select().from(outbox);
 * ```
 */
export type OutboxRecord = typeof outbox.$inferSelect;

/**
 * TypeScript type for inserting new outbox records.
 *
 * @description Inferred from the outbox table schema with optional fields
 * excluded. Use this type when creating new outbox events.
 *
 * @example
 * ```typescript
 * const newEvent: NewOutboxRecord = {
 *   eventId: crypto.randomUUID(),
 *   eventType: 'order.created',
 *   aggregateId: orderId,
 *   payload: { orderId, items: [...] }
 * };
 * await db.insert(outbox).values(newEvent);
 * ```
 */
export type NewOutboxRecord = typeof outbox.$inferInsert;

/**
 * Type alias for backward compatibility.
 * @description Alias for {@link NewOutboxRecord}. Used by OutboxRepository.
 * @deprecated Will be removed in v2.0.0. Use {@link NewOutboxRecord} instead.
 * Migration: Replace `NewOutbox` with `NewOutboxRecord` in imports and type annotations.
 */
export type NewOutbox = NewOutboxRecord;

/**
 * Type alias for backward compatibility.
 * @description Alias for {@link OutboxRecord}. Used by OutboxPollerService.
 * @deprecated Will be removed in v2.0.0. Use {@link OutboxRecord} instead.
 * Migration: Replace `Outbox` with `OutboxRecord` in imports and type annotations.
 */
export type Outbox = OutboxRecord;

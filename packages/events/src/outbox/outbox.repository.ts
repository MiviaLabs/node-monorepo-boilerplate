import { Injectable } from '@nestjs/common';
import {
  db as eventsDb,
  outbox,
  type NewOutbox,
  type OutboxRecord,
  OutboxStatus
} from '@package/db-outbox';
import { eq, and, asc, lt, sql } from 'drizzle-orm';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptionalUuid(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return UUID_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Outbox repository for transactional event publishing
 *
 * This repository handles all database operations for the outbox pattern,
 * including inserting events within transactions, polling for pending events,
 * and managing event status transitions.
 *
 * @example
 * ```typescript
 * @CommandHandler(CreateUserCommand)
 * export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
 *   constructor(
 *     private readonly outboxRepo: OutboxRepository
 *   ) {}
 *
 *   async execute(command: CreateUserCommand) {
 *     return this.db.transaction(async (tx) => {
 *       const [user] = await tx.insert(users).values({...}).returning();
 *
 *       // Insert outbox record in same transaction
 *       await this.outboxRepo.insert(tx, {
 *         eventId: randomUUID(),
 *         eventType: 'user.created',
 *         aggregateId: user.id,
 *         payload: JSON.stringify({ userId: user.id, ... }),
 *         // ... other fields
 *       });
 *
 *       return user;
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class OutboxRepository {
  constructor(private readonly db: typeof eventsDb) {}

  /**
   * Insert outbox record within a transaction
   *
   * This should be called within the same transaction as the state change
   * to ensure atomicity. The event and state change will commit together.
   *
   * Note: The transaction parameter accepts any NodePgDatabase instance to allow
   * transactions from other schemas (e.g., db-core) to insert outbox records.
   * This works because both schemas typically use the same PostgreSQL database.
   *
   * @param tx - Database transaction (or db connection for non-transactional inserts)
   * @param data - Outbox record data to insert
   *
   * @example
   * ```typescript
   * await this.db.transaction(async (tx) => {
   *   await this.usersRepo.insert(tx, userData);
   *   await this.outboxRepo.insert(tx, outboxData);
   * });
   * ```
   */
  async insert(tx: NodePgDatabase, data: NewOutbox): Promise<void> {
    await tx.insert(outbox).values({
      ...data,
      correlationId: normalizeOptionalUuid(data.correlationId),
      causationId: normalizeOptionalUuid(data.causationId),
      status: data.status || OutboxStatus.PENDING,
      retryCount: data.retryCount ?? 0,
      createdAt: data.createdAt || new Date()
    });
  }

  /**
   * Poll for pending events to process
   *
   * Retrieves pending events ordered by creation time (FIFO).
   * Optionally filters by tenant ID for multi-tenancy.
   *
   * @param limit - Maximum number of events to fetch (default: 10)
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of pending outbox records
   *
   * @example
   * ```typescript
   * // Poll for all pending events
   * const events = await this.outboxRepo.pollPending(10);
   *
   * // Poll for specific tenant
   * const events = await this.outboxRepo.pollPending(10, 'tenant-123');
   * ```
   */
  async pollPending(limit: number = 10, tenantId?: string): Promise<OutboxRecord[]> {
    const conditions = [eq(outbox.status, OutboxStatus.PENDING)];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.createdAt))
      .limit(limit);
  }

  /**
   * Atomically claim pending events for processing
   *
   * Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent multiple workers
   * from claiming the same events. Combines SELECT + UPDATE in a single
   * transaction for atomic claim semantics.
   *
   * @param limit - Maximum number of events to claim (default: 10)
   * @param workerId - The worker identifier claiming the events
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of claimed outbox records (already marked as processing)
   *
   * @example
   * ```typescript
   * const events = await this.outboxRepo.claimPending(10, 'worker-123');
   * // Events are already marked as PROCESSING with worker lock
   * for (const event of events) {
   *   await this.processEvent(event);
   * }
   * ```
   */
  async claimPending(
    limit: number = 10,
    workerId: string,
    tenantId?: string
  ): Promise<OutboxRecord[]> {
    const tenantCondition = tenantId ? sql`AND ${outbox.tenantId} = ${tenantId}` : sql``;

    const result = await this.db.execute(sql`
      WITH claimable AS (
        SELECT ${outbox.eventId}
        FROM ${outbox}
        WHERE ${outbox.status} = ${OutboxStatus.PENDING}
        ${tenantCondition}
        ORDER BY ${outbox.createdAt} ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${outbox}
      SET
        status = ${OutboxStatus.PROCESSING},
        locked_by = ${workerId},
        locked_at = NOW()
      FROM claimable
      WHERE ${outbox.eventId} = claimable.event_id
      RETURNING ${outbox}.*
    `);

    // db.execute() returns raw PG rows with snake_case keys,
    // but OutboxRecord uses camelCase. Map the keys accordingly.
    return this.mapRowsToCamelCase(result.rows ?? []) as OutboxRecord[];
  }

  /**
   * Atomically claim retryable failed events for processing
   *
   * Uses PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent multiple workers
   * from claiming the same events. Claims failed events where nextRetryAt
   * is in the past.
   *
   * @param limit - Maximum number of events to claim (default: 10)
   * @param workerId - The worker identifier claiming the events
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of claimed outbox records (already marked as processing)
   */
  async claimRetryable(
    limit: number = 10,
    workerId: string,
    tenantId?: string
  ): Promise<OutboxRecord[]> {
    const tenantCondition = tenantId ? sql`AND ${outbox.tenantId} = ${tenantId}` : sql``;

    const result = await this.db.execute(sql`
      WITH claimable AS (
        SELECT ${outbox.eventId}
        FROM ${outbox}
        WHERE ${outbox.status} = ${OutboxStatus.FAILED}
        AND ${outbox.nextRetryAt} < NOW()
        ${tenantCondition}
        ORDER BY ${outbox.nextRetryAt} ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${outbox}
      SET
        status = ${OutboxStatus.PROCESSING},
        locked_by = ${workerId},
        locked_at = NOW()
      FROM claimable
      WHERE ${outbox.eventId} = claimable.event_id
      RETURNING ${outbox}.*
    `);

    // db.execute() returns raw PG rows with snake_case keys,
    // but OutboxRecord uses camelCase. Map the keys accordingly.
    return this.mapRowsToCamelCase(result.rows ?? []) as OutboxRecord[];
  }

  /**
   * Poll for failed events that are ready for retry
   *
   * Retrieves failed events where nextRetryAt is in the past.
   *
   * @param limit - Maximum number of events to fetch (default: 10)
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of failed outbox records ready for retry
   *
   * @example
   * ```typescript
   * const events = await this.outboxRepo.pollRetryable(10);
   * ```
   */
  async pollRetryable(limit: number = 10, tenantId?: string): Promise<OutboxRecord[]> {
    const conditions = [eq(outbox.status, OutboxStatus.FAILED), lt(outbox.nextRetryAt, new Date())];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.nextRetryAt))
      .limit(limit);
  }

  /**
   * Mark event as processing (worker lock)
   *
   * Sets the status to 'processing' and records the worker lock.
   * Only updates if the current status is 'pending' or 'failed' to prevent
   * multiple workers from processing the same event.
   *
   * @param eventId - The event ID to lock
   * @param workerId - The worker identifier acquiring the lock
   * @returns true if the event was claimed, false if already processing
   *
   * @example
   * ```typescript
   * const claimed = await this.outboxRepo.markAsProcessing(event.eventId, 'worker-123');
   * if (!claimed) {
   *   // Another worker already claimed this event
   *   return;
   * }
   * ```
   */
  async markAsProcessing(eventId: string, workerId: string): Promise<boolean> {
    const result = await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.PROCESSING,
        lockedAt: new Date(),
        lockedBy: workerId
      })
      .where(
        and(
          eq(outbox.eventId, eventId),
          sql`${outbox.status} IN (${OutboxStatus.PENDING}, ${OutboxStatus.FAILED})`
        )
      )
      .returning({ eventId: outbox.eventId });

    return result.length > 0;
  }

  /**
   * Mark event as published successfully
   *
   * Sets the status to 'published', records the publish timestamp,
   * and releases the worker lock.
   *
   * @param eventId - The event ID to mark as published
   *
   * @example
   * ```typescript
   * await this.outboxRepo.markAsPublished(event.eventId);
   * ```
   */
  async markAsPublished(eventId: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        lockedAt: null,
        lockedBy: null
      })
      .where(eq(outbox.eventId, eventId));
  }

  /**
   * Mark event as failed (will retry)
   *
   * Sets the status to 'failed', records the error message,
   * schedules the next retry time, increments retry count,
   * and releases the worker lock.
   *
   * @param eventId - The event ID to mark as failed
   * @param errorMessage - The error message for debugging
   * @param nextRetryAt - When the event should be retried
   *
   * @example
   * ```typescript
   * const nextRetryAt = new Date(Date.now() + 5000); // 5 seconds from now
   * await this.outboxRepo.markAsFailed(
   *   event.eventId,
   *   error.message,
   *   nextRetryAt
   * );
   * ```
   */
  async markAsFailed(eventId: string, errorMessage: string, nextRetryAt: Date): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.FAILED,
        errorMessage,
        nextRetryAt,
        lockedAt: null,
        lockedBy: null,
        retryCount: sql`${outbox.retryCount} + 1`
      })
      .where(eq(outbox.eventId, eventId));
  }

  /**
   * Clean up old published events
   *
   * Deletes published events older than the specified date.
   * This prevents the outbox table from growing indefinitely.
   *
   * @param olderThan - Delete events published before this date
   *
   * @example
   * ```typescript
   * // Clean up events older than 7 days
   * const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
   * await this.outboxRepo.cleanup(cutoffDate);
   * ```
   */
  async cleanup(olderThan: Date): Promise<void> {
    await this.db
      .delete(outbox)
      .where(and(eq(outbox.status, OutboxStatus.PUBLISHED), lt(outbox.publishedAt, olderThan)));
  }

  /**
   * Get event by ID
   *
   * Retrieves a single event by its event ID.
   *
   * @param eventId - The event ID to retrieve
   * @returns The outbox record or null if not found
   *
   * @example
   * ```typescript
   * const event = await this.outboxRepo.getById(eventId);
   * ```
   */
  async getById(eventId: string): Promise<OutboxRecord | null> {
    const results = await this.db.select().from(outbox).where(eq(outbox.eventId, eventId)).limit(1);

    return results[0] || null;
  }

  /**
   * Get events by aggregate ID
   *
   * Retrieves all events for a specific aggregate, ordered by creation time.
   * Useful for event replay and debugging.
   * Optionally filters by tenant ID for multi-tenancy.
   *
   * @param aggregateId - The aggregate ID to retrieve events for
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of outbox records for the aggregate
   *
   * @example
   * ```typescript
   * // Get all events for an aggregate
   * const events = await this.outboxRepo.getByAggregate('user-123');
   *
   * // Get events for a specific tenant
   * const tenantEvents = await this.outboxRepo.getByAggregate('user-123', 'tenant-456');
   * ```
   */
  async getByAggregate(aggregateId: string, tenantId?: string): Promise<OutboxRecord[]> {
    const conditions = [eq(outbox.aggregateId, aggregateId)];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.createdAt));
  }

  /**
   * Get pending events count
   *
   * Returns the number of pending events.
   * Useful for monitoring and health checks.
   *
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Count of pending events
   *
   * @example
   * ```typescript
   * const count = await this.outboxRepo.getPendingCount();
   * console.log(`Pending events: ${count}`);
   * ```
   */
  async getPendingCount(tenantId?: string): Promise<number> {
    const conditions = [eq(outbox.status, OutboxStatus.PENDING)];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outbox)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  }

  /**
   * Get failed events count
   *
   * Returns the number of failed events.
   * Useful for monitoring and alerting.
   *
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Count of failed events
   *
   * @example
   * ```typescript
   * const count = await this.outboxRepo.getFailedCount();
   * if (count > 100) {
   *   console.error('Too many failed events!');
   * }
   * ```
   */
  async getFailedCount(tenantId?: string): Promise<number> {
    const conditions = [eq(outbox.status, OutboxStatus.FAILED)];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outbox)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  }

  /**
   * Mark event as dead-lettered
   *
   * Sets the dead letter timestamp, reason, and releases the worker lock.
   * Requires tenant ID for multi-tenancy isolation.
   *
   * @param eventId - The event ID to mark as dead-lettered
   * @param tenantId - The tenant ID for multi-tenancy
   * @param reason - The dead letter reason code (e.g., 'network', 'timeout')
   *
   * @example
   * ```typescript
   * await this.outboxRepo.markAsDeadLettered(event.eventId, 'tenant-123', 'network');
   * ```
   */
  async markAsDeadLettered(eventId: string, tenantId: string, reason: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.FAILED,
        deadLetteredAt: new Date(),
        deadLetterReason: reason,
        // Clear nextRetryAt so claimRetryable cannot re-pick this row on
        // subsequent polls — otherwise the dead-letter alert fires every
        // poll cycle. See OutboxRepository.markAsDeadLettered unit test.
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null
      })
      .where(and(eq(outbox.eventId, eventId), eq(outbox.tenantId, tenantId)));
  }

  /**
   * Get dead-lettered events
   *
   * Retrieves events that have been marked as dead-lettered.
   *
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Array of dead-lettered outbox records
   *
   * @example
   * ```typescript
   * const deadEvents = await this.outboxRepo.getDeadLetteredEvents('tenant-123');
   * ```
   */
  async getDeadLetteredEvents(tenantId?: string, limit: number = 100): Promise<OutboxRecord[]> {
    const conditions = [sql`${outbox.deadLetteredAt} IS NOT NULL`];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.deadLetteredAt))
      .limit(limit);
  }

  /**
   * Get dead letter count
   *
   * Returns the number of dead-lettered events.
   *
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Count of dead-lettered events
   *
   * @example
   * ```typescript
   * const count = await this.outboxRepo.getDeadLetterCount();
   * console.log(`Dead lettered events: ${count}`);
   * ```
   */
  async getDeadLetterCount(tenantId?: string): Promise<number> {
    const conditions = [sql`${outbox.deadLetteredAt} IS NOT NULL`];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outbox)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  }

  /**
   * Reset dead-lettered event for retry
   *
   * Clears the dead letter fields and resets status to pending.
   * Requires tenant ID for multi-tenancy isolation.
   *
   * @param eventId - The event ID to reset
   * @param tenantId - The tenant ID for multi-tenancy
   *
   * @example
   * ```typescript
   * await this.outboxRepo.resetForRetry(event.eventId, 'tenant-123');
   * ```
   */
  async resetForRetry(eventId: string, tenantId: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.PENDING,
        deadLetteredAt: null,
        deadLetterReason: null,
        retryCount: 0,
        nextRetryAt: null,
        errorMessage: null,
        lockedAt: null,
        lockedBy: null
      })
      .where(and(eq(outbox.eventId, eventId), eq(outbox.tenantId, tenantId)));
  }

  /**
   * Clean up old dead-lettered events
   *
   * Deletes dead-lettered events older than the specified date.
   * Optionally filters by tenant ID for multi-tenancy.
   *
   * @param olderThan - Delete events dead-lettered before this date
   * @param tenantId - Optional tenant ID for multi-tenancy
   *
   * @example
   * ```typescript
   * // Clean up events older than 30 days for all tenants
   * const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * await this.outboxRepo.cleanupDeadLetters(cutoffDate);
   *
   * // Clean up for specific tenant
   * await this.outboxRepo.cleanupDeadLetters(cutoffDate, 'tenant-123');
   * ```
   */
  async cleanupDeadLetters(olderThan: Date, tenantId?: string): Promise<void> {
    const conditions = [
      sql`${outbox.deadLetteredAt} IS NOT NULL`,
      lt(outbox.deadLetteredAt, olderThan)
    ];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    await this.db.delete(outbox).where(and(...conditions));
  }

  /**
   * Delete a specific dead-lettered event
   *
   * Permanently removes a dead-lettered event by ID.
   * Requires tenant ID for multi-tenancy isolation.
   *
   * @param eventId - The event ID to delete
   * @param tenantId - The tenant ID for multi-tenancy
   * @returns true if the event was deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await this.outboxRepo.deleteDeadLetteredEvent('event-123', 'tenant-456');
   * if (deleted) {
   *   console.log('Event deleted successfully');
   * }
   * ```
   */
  async deleteDeadLetteredEvent(eventId: string, tenantId: string): Promise<boolean> {
    const result = await this.db
      .delete(outbox)
      .where(
        and(
          eq(outbox.eventId, eventId),
          eq(outbox.tenantId, tenantId),
          sql`${outbox.deadLetteredAt} IS NOT NULL`
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Mark event as replayed
   *
   * Sets the replay timestamp and increments the replay count.
   * Used by EventReplayService to track replay history.
   * Requires tenant ID for multi-tenancy isolation.
   *
   * @param eventId - The event ID to mark as replayed
   * @param tenantId - The tenant ID for multi-tenancy
   * @param replayId - The unique replay session ID
   *
   * @example
   * ```typescript
   * await this.outboxRepo.markAsReplayed(event.eventId, event.tenantId, replayId);
   * ```
   */
  async markAsReplayed(eventId: string, tenantId: string, replayId: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        replayedAt: new Date(),
        lastReplayId: replayId,
        replayedCount: sql`${outbox.replayedCount} + 1`
      })
      .where(and(eq(outbox.eventId, eventId), eq(outbox.tenantId, tenantId)));
  }

  /**
   * Get replayed events
   *
   * Retrieves events that have been replayed, optionally filtered by replay ID.
   *
   * @param replayId - Optional replay ID to filter by
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Array of replayed outbox records
   *
   * @example
   * ```typescript
   * const replayed = await this.outboxRepo.getReplayedEvents('replay-123');
   * ```
   */
  async getReplayedEvents(
    replayId?: string,
    tenantId?: string,
    limit: number = 100
  ): Promise<OutboxRecord[]> {
    const conditions = [sql`${outbox.replayedAt} IS NOT NULL`];

    if (replayId) {
      conditions.push(eq(outbox.lastReplayId, replayId));
    }

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.replayedAt))
      .limit(limit);
  }

  /**
   * Get replayable events for event replay
   *
   * Retrieves published events that can be replayed, with optional filtering.
   * Used by EventReplayService for non-aggregate replay queries.
   *
   * @param options - Query options for filtering replayable events
   * @returns Array of published outbox records available for replay
   *
   * @example
   * ```typescript
   * // Get all published events for replay
   * const events = await this.outboxRepo.getReplayableEvents({});
   *
   * // Get events for specific tenant and event type
   * const events = await this.outboxRepo.getReplayableEvents({
   *   tenantId: 'tenant-123',
   *   eventType: 'user.created',
   * });
   *
   * // Get events within date range
   * const events = await this.outboxRepo.getReplayableEvents({
   *   startDate: new Date('2024-01-01'),
   *   endDate: new Date('2024-01-31'),
   *   limit: 1000,
   * });
   * ```
   */
  async getReplayableEvents(options: {
    tenantId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<OutboxRecord[]> {
    const conditions = [eq(outbox.status, OutboxStatus.PUBLISHED)];

    if (options.tenantId) {
      conditions.push(eq(outbox.tenantId, options.tenantId));
    }

    if (options.eventType) {
      conditions.push(eq(outbox.eventType, options.eventType));
    }

    if (options.startDate) {
      conditions.push(sql`${outbox.createdAt} >= ${options.startDate}`);
    }

    if (options.endDate) {
      conditions.push(sql`${outbox.createdAt} <= ${options.endDate}`);
    }

    const limit = options.limit ?? 1000;

    return this.db
      .select()
      .from(outbox)
      .where(and(...conditions))
      .orderBy(asc(outbox.createdAt))
      .limit(limit);
  }

  /**
   * Clean up old replay metadata
   *
   * Clears replay tracking fields (replayedAt, replayedCount, lastReplayId)
   * from events where the replay occurred before the cutoff date.
   * This prevents unbounded growth of replay metadata while preserving
   * the actual event records.
   *
   * @param olderThan - Clear replay metadata older than this date
   * @param tenantId - Optional tenant ID for multi-tenancy
   *
   * @example
   * ```typescript
   * // Clear replay metadata older than 90 days for all tenants
   * const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
   * await this.outboxRepo.cleanupOldReplayMetadata(cutoffDate);
   *
   * // Clear replay metadata for specific tenant
   * await this.outboxRepo.cleanupOldReplayMetadata(cutoffDate, 'tenant-123');
   * ```
   */
  async cleanupOldReplayMetadata(olderThan: Date, tenantId?: string): Promise<void> {
    const conditions = [sql`${outbox.replayedAt} IS NOT NULL`, lt(outbox.replayedAt, olderThan)];

    if (tenantId) {
      conditions.push(eq(outbox.tenantId, tenantId));
    }

    await this.db
      .update(outbox)
      .set({
        replayedAt: null,
        replayedCount: 0,
        lastReplayId: null
      })
      .where(and(...conditions));
  }

  /**
   * Convert snake_case database row keys to camelCase
   *
   * Raw SQL via `db.execute()` returns rows with snake_case keys matching
   * PostgreSQL column names, but `OutboxRecord` uses camelCase properties.
   */
  private mapRowToCamelCase(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const camelKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
      result[camelKey] = value;
    }

    return result;
  }

  /**
   * Convert an array of snake_case database rows to camelCase objects
   */
  private mapRowsToCamelCase(rows: unknown[]): Record<string, unknown>[] {
    return (rows as Record<string, unknown>[]).map((row) => this.mapRowToCamelCase(row));
  }
}

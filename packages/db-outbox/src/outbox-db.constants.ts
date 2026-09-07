/**
 * NestJS dependency injection constants for the events database.
 *
 * These constants are used as injection tokens when working with NestJS
 * dependency injection. They provide type-safe tokens for injecting
 * the Drizzle database instance.
 *
 * @module @package/db-outbox/constants
 */

/**
 * Injection token for the main events database instance.
 *
 * Use this token with `@Inject()` decorator to inject the Drizzle ORM
 * database instance configured for the events/outbox database.
 *
 * @example
 * ```typescript
 * import { Inject, Injectable } from '@nestjs/common';
 * import { EVENT_STORE_DB, outbox, NewOutboxRecord } from '@package/db-outbox';
 * import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
 * import { eq } from 'drizzle-orm';
 *
 * @Injectable()
 * export class OutboxRepository {
 *   constructor(
 *     @Inject(EVENT_STORE_DB)
 *     private readonly db: NodePgDatabase
 *   ) {}
 *
 *   // Inserts an event into the outbox with tenant isolation.
 *   // The tenantId is required for multi-tenant data isolation.
 *   async insertEvent(event: NewOutboxRecord): Promise<void> {
 *     // tenantId must be included in the event for multi-tenant isolation
 *     await this.db.insert(outbox).values({
 *       ...event,
 *       tenantId: event.tenantId // Required for tenant isolation
 *     });
 *   }
 *
 *   // Queries outbox events filtered by tenant.
 *   // Always filter by tenantId to prevent cross-tenant data leakage.
 *   async getEventsByTenant(tenantId: string): Promise<OutboxRecord[]> {
 *     return this.db
 *       .select()
 *       .from(outbox)
 *       .where(eq(outbox.tenantId, tenantId)); // Required tenant filter
 *   }
 * }
 * ```
 *
 * @see {@link OutboxDbModule} - Module that provides this token
 */
export const EVENT_STORE_DB = 'EVENT_STORE_DB';


# @package/db-outbox

PostgreSQL database schema definitions and migration tools implementing the Transactional Outbox Pattern with Drizzle ORM.

## Purpose

`@package/db-outbox` provides the persistence layer and schema definitions for reliable asynchronous event publishing via the Transactional Outbox Pattern. By persisting domain events within the same relational database transaction as business entity modifications, it eliminates dual-write hazards and ensures guaranteed delivery to distributed message brokers (such as Apache Kafka or RabbitMQ).

Key capabilities:

- **Transactional Outbox Schema**: PostgreSQL outbox table definition with rich metadata (tracing correlation, causation, aggregate tracking, and JSONB payloads).
- **Strict Multi-Tenancy**: Built-in tenant isolation with indexed `tenant_id` partitioning.
- **NestJS Global Module**: Provides `@Inject(EVENT_STORE_DB)` dependency injection and automated lifecycle management.
- **Isolated Migration Runner**: Programmatic migration runner tracking migrations in a dedicated metadata schema (`drizzle.__drizzle_migrations_events`).
- **Connection Management**: Lazy-initialized connection pooling deferred until first query execution.

## Structure

```text
src/
├── schema/
│   ├── outbox.schema.ts      # Outbox table definition, statuses, and indices
│   └── index.ts              # Schema barrel export
├── migrations/
│   ├── cli.ts                # Command-line migration interface
│   ├── constants.ts          # Migration schema and table constants
│   └── runner.ts             # Programmatic migration executor
├── __tests__/                # Integration and unit tests
├── db.ts                     # Lazy-initialized Drizzle database instance and pool helpers
├── db-outbox.constants.ts    # NestJS DI injection tokens
├── db-outbox.module.ts       # Global NestJS module definition
├── schema.ts                 # Schema re-export entry
└── index.ts                  # Package public API export barrel
```

## Usage

### NestJS Dependency Injection

Register `OutboxDbModule` in your application module:

```typescript
import { Module } from '@nestjs/common';
import { OutboxDbModule } from '@package/db-outbox';

@Module({
  imports: [OutboxDbModule]
})
export class AppModule {}
```

Inject the database instance into repositories or services:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_STORE_DB, outbox, type NewOutboxRecord } from '@package/db-outbox';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class OutboxService {
  constructor(
    @Inject(EVENT_STORE_DB)
    private readonly db: NodePgDatabase
  ) {}

  async recordEvent(record: NewOutboxRecord): Promise<void> {
    await this.db.insert(outbox).values(record);
  }
}
```

### Direct Database Access and Atomic Transactions

```typescript
import { db, outbox, OutboxStatus } from '@package/db-outbox';
import { eq, and } from 'drizzle-orm';

// Atomically commit entity state changes and outbox event
await db.transaction(async (tx) => {
  await tx.update(orders).set({ status: 'confirmed' }).where(eq(orders.id, orderId));

  await tx.insert(outbox).values({
    tenantId: currentTenantId,
    eventId: crypto.randomUUID(),
    eventType: 'order.confirmed',
    aggregateId: orderId,
    aggregateVersion: '1',
    status: OutboxStatus.PENDING,
    payload: { orderId, confirmedAt: new Date().toISOString() }
  });
});

// Query pending events for delivery
const pendingEvents = await db
  .select()
  .from(outbox)
  .where(
    and(
      eq(outbox.tenantId, currentTenantId),
      eq(outbox.status, OutboxStatus.PENDING)
    )
  )
  .orderBy(outbox.createdAt)
  .limit(100);
```

### Running Migrations

```typescript
import { runMigrations } from '@package/db-outbox';

// Programmatic execution (CI/CD or integration test setup)
await runMigrations(process.env.EVENTS_DATABASE_URL);
```

```bash
# Command line execution
pnpm run db-outbox:migrate
```

## Key Exports

### Schema Definitions & Types
- `outbox` – Drizzle table definition with optimized composite indexes.
- `OutboxStatus` – Processing states: `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`.
- `OutboxRecord` / `Outbox` – Inferred type for retrieved outbox rows.
- `NewOutboxRecord` / `NewOutbox` – Inferred type for inserting new outbox rows.

### Database Client
- `db` – Lazy-initialized Drizzle ORM client proxy.
- `getPool()` – Direct access to the underlying `pg.Pool` instance.
- `resetPool()` – Resets and closes existing pool connections (ideal for test teardown).

### NestJS Module & Tokens
- `OutboxDbModule` – NestJS dynamic module providing the database instance.
- `EVENT_STORE_DB` – Injection token for the Drizzle database instance.

### Migrations
- `runMigrations(databaseUrl)` – Programmatic migration runner.
- `MIGRATIONS_TABLE` – Table name for migration records (`__drizzle_migrations_events`).
- `MIGRATIONS_SCHEMA` – Schema namespace for migration history (`drizzle`).

## Environment Variables

- `EVENTS_DATABASE_URL` – PostgreSQL connection string for the events database.
- `DATABASE_URL` – Fallback PostgreSQL connection string if `EVENTS_DATABASE_URL` is omitted.
- `AUTO_MIGRATE_EVENTS` – Set to `true` for automatic migration on startup, or `false` for CI/CD controlled execution.

## Development Commands

```bash
# Build package
pnpm nx build db-outbox

# Run unit tests
pnpm nx test db-outbox

# Lint package
pnpm nx lint db-outbox
```

## Associated Packages

- [`@package/events`](../events) – Event publishing, polling worker, and Kafka transport.
- [`@package/db-core`](../db-core) – Primary application entities and relations schema.
- [`@package/types`](../types) – Domain event interfaces and CQRS types.

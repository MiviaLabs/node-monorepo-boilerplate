# @package/db-outbox

Production-ready PostgreSQL database schema and migration toolkit implementing the Transactional Outbox Pattern with Drizzle ORM.

## Overview

`@package/db-outbox` provides the persistent outbox schema and database runtime for guaranteed, at-least-once asynchronous event delivery. By persisting events inside the same relational database transaction as domain entity modifications, it eliminates dual-write failures and ensures domain events are reliably delivered to message streaming platforms such as Apache Kafka.

## Key Features

- **Transactional Outbox Pattern**: Atomic database writes bridging business logic updates and event publication.
- **Drizzle ORM & PostgreSQL**: Type-safe query building with PostgreSQL JSONB support and high-performance indices.
- **Enterprise Multi-Tenancy**: Tenant-scoped partitioning with dedicated indexed fields.
- **Traceability & Correlation**: Native tracking for `correlation_id`, `causation_id`, `aggregate_id`, and schema versioning.
- **Retry & Lock State Management**: Worker polling coordination with worker lease locks, retry counters, and exponential backoff tracking.
- **Automated Migration Runner**: Dedicated schema isolation for migration state (`drizzle.__drizzle_migrations_events`).

## Installation

```bash
pnpm add @package/db-outbox
```

## Quick Start

```typescript
import { db, outbox, OutboxStatus } from '@package/db-outbox';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// Atomically save domain changes and record the outbox event
await db.transaction(async (tx) => {
  // 1. Business operation
  await tx.insert(orders).values({
    id: 'ord_12345',
    tenantId: 'tenant_001',
    totalAmount: '149.99'
  });

  // 2. Outbox event
  await tx.insert(outbox).values({
    eventId: randomUUID(),
    eventType: 'order.created',
    aggregateId: 'ord_12345',
    aggregateVersion: '1',
    tenantId: 'tenant_001',
    correlationId: randomUUID(),
    schemaVersion: '1.0',
    status: OutboxStatus.PENDING,
    payload: { orderId: 'ord_12345', amount: 149.99 }
  });
});

// Query pending events for publishing workers
const pendingEvents = await db
  .select()
  .from(outbox)
  .where(
    and(
      eq(outbox.tenantId, 'tenant_001'),
      eq(outbox.status, OutboxStatus.PENDING)
    )
  )
  .orderBy(outbox.createdAt)
  .limit(50);
```

## Database Schema & Table Structure

The `outbox` table is engineered for high-concurrency event publishing and reliable event ordering:

| Column | Type | Description |
| ------ | ---- | ----------- |
| `id` | `uuid` | Primary key generated via `gen_random_uuid()` |
| `event_id` | `varchar(255)` | Globally unique event UUID |
| `event_type` | `varchar(255)` | Event classification (e.g., `user.created`, `order.paid`) |
| `aggregate_id` | `varchar(255)` | Identifier of the aggregate root generating the event |
| `aggregate_version` | `varchar(64)` | Monotonic version for aggregate event sequencing |
| `payload` | `jsonb` | Serialized event payload |
| `correlation_id` | `varchar(255)` | Distributed trace correlation identifier |
| `causation_id` | `varchar(255)` | Causation event identifier for lineage tracing |
| `tenant_id` | `varchar(255)` | Multi-tenant tenant identifier |
| `schema_version` | `varchar(32)` | Event payload contract version |
| `status` | `varchar(32)` | Current state: `pending`, `processing`, `published`, `failed` |
| `retry_count` | `integer` | Total delivery attempts executed |
| `last_retry_at` | `timestamptz` | Timestamp of last attempt |
| `next_retry_at` | `timestamptz` | Timestamp when event becomes eligible for retry |
| `error_message` | `text` | Diagnostic message if event processing failed |
| `published_at` | `timestamptz` | Timestamp when event was confirmed published |
| `locked_at` | `timestamptz` | Polling worker lease acquisition timestamp |
| `locked_by` | `varchar(255)` | Worker node identifier holding active lease |
| `created_at` | `timestamptz` | Timestamp when outbox record was inserted |
| `updated_at` | `timestamptz` | Timestamp of last status or lock update |

### Database Indexes

The schema includes targeted composite indices to optimize worker polling and cleanup:

- `outbox_pending_idx` (`status`, `created_at`): Optimizes FIFO polling of pending events.
- `outbox_tenant_idx` (`tenant_id`): Enforces rapid tenant filtering and multi-tenant partitioning.
- `outbox_aggregate_idx` (`aggregate_id`, `created_at`): Accelerates event replay and audit trails by aggregate.
- `outbox_cleanup_idx` (`status`, `published_at`): Efficient pruning of historical published events.
- `outbox_event_unique` (`event_id`, `aggregate_id`): Ensures idempotency across write operations.

## Status Lifecycle

```text
[ pending ] ──> [ processing ] ──> [ published ]
                     │
                     └── (error/retry) ──> [ failed ]
```

- **`pending`**: Event is staged in database and awaiting dispatcher pickup.
- **`processing`**: Event lease is held by a poller worker process.
- **`published`**: Message broker acknowledged receipt; event lifecycle complete.
- **`failed`**: Exceeded max retries or encountered unrecoverable validation errors.

## TypeScript Inferred Types

```typescript
import type { OutboxRecord, NewOutboxRecord, Outbox, NewOutbox } from '@package/db-outbox';

// Inferred query result type
const event: OutboxRecord = await getOutboxRecord(id);

// Inferred insert payload type
const newEvent: NewOutboxRecord = {
  eventId: crypto.randomUUID(),
  eventType: 'payment.completed',
  aggregateId: 'inv_987',
  aggregateVersion: '1',
  tenantId: 'tenant_main',
  payload: { invoiceId: 'inv_987', status: 'PAID' }
};
```

## NestJS Module Integration

Register the global database module:

```typescript
import { Module } from '@nestjs/common';
import { OutboxDbModule } from '@package/db-outbox';

@Module({
  imports: [OutboxDbModule]
})
export class AppModule {}
```

Inject the Drizzle client into event publishers or outbox polling services:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EVENT_STORE_DB, outbox, OutboxStatus } from '@package/db-outbox';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

@Injectable()
export class OutboxDispatcher {
  constructor(
    @Inject(EVENT_STORE_DB)
    private readonly db: NodePgDatabase
  ) {}

  async markPublished(eventId: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(outbox.id, eventId));
  }
}
```

## Migrations

### Migration Execution

```bash
# Execute CLI migration
pnpm run db-outbox:migrate
```

### Programmatic Migrations

Execute database migrations during integration tests or CI/CD deployment pipelines:

```typescript
import { runMigrations } from '@package/db-outbox';

await runMigrations(process.env.EVENTS_DATABASE_URL);
```

### Schema Generation

```bash
# Generate migration files from schema changes
pnpm db:generate db-outbox
```

## Environment Configuration

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `EVENTS_DATABASE_URL` | No | PostgreSQL connection URI for the dedicated events database |
| `DATABASE_URL` | Fallback | Fallback connection URI if `EVENTS_DATABASE_URL` is unset |
| `AUTO_MIGRATE_EVENTS` | No | Automatically run migrations on module bootstrap (`true` default) |

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

- [`@package/events`](../events) – Event bus, message dispatcher, and Kafka publisher.
- [`@package/db-core`](../db-core) – Primary application entities and relations schema.
- [`@package/types`](../types) – Domain event interfaces and CQRS types.

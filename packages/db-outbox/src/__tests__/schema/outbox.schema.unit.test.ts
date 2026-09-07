/**
 * Unit tests for db-outbox schema
 *
 * Tests the outbox schema exports, types, column definitions, and constraints.
 * Includes behavioral validation for multi-tenancy (P0), defaults, and enum values.
 */

import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  outbox,
  outboxStatusEnum,
  OutboxStatus,
  type Outbox,
  type NewOutbox,
  type OutboxRecord,
  type NewOutboxRecord
} from '../../schema';

describe('db-outbox outbox schema', () => {
  describe('exports', () => {
    it('should export outbox table schema', () => {
      assert.ok(outbox);
      assert.strictEqual(typeof outbox, 'object');
    });

    it('should export outboxStatusEnum', () => {
      assert.ok(outboxStatusEnum);
      // Drizzle enums are functions
      assert.strictEqual(typeof outboxStatusEnum, 'function');
    });

    it('should export OutboxStatus TypeScript enum', () => {
      assert.ok(OutboxStatus);
      assert.strictEqual(typeof OutboxStatus, 'object');
    });
  });

  describe('outboxStatusEnum', () => {
    it('should contain exactly four status values', () => {
      const enumValues = outboxStatusEnum.enumValues;
      assert.ok(Array.isArray(enumValues));
      assert.strictEqual(enumValues.length, 4);
    });

    it('should include pending status', () => {
      assert.ok(outboxStatusEnum.enumValues.includes('pending'));
    });

    it('should include processing status', () => {
      assert.ok(outboxStatusEnum.enumValues.includes('processing'));
    });

    it('should include published status', () => {
      assert.ok(outboxStatusEnum.enumValues.includes('published'));
    });

    it('should include failed status', () => {
      assert.ok(outboxStatusEnum.enumValues.includes('failed'));
    });
  });

  describe('OutboxStatus enum', () => {
    it('should map PENDING to pending', () => {
      assert.strictEqual(OutboxStatus.PENDING, 'pending');
    });

    it('should map PROCESSING to processing', () => {
      assert.strictEqual(OutboxStatus.PROCESSING, 'processing');
    });

    it('should map PUBLISHED to published', () => {
      assert.strictEqual(OutboxStatus.PUBLISHED, 'published');
    });

    it('should map FAILED to failed', () => {
      assert.strictEqual(OutboxStatus.FAILED, 'failed');
    });
  });

  describe('outbox table columns', () => {
    it('should have all required columns defined', () => {
      assert.ok(outbox.id, 'id column should be defined');
      assert.ok(outbox.eventId, 'eventId column should be defined');
      assert.ok(outbox.eventType, 'eventType column should be defined');
      assert.ok(outbox.aggregateId, 'aggregateId column should be defined');
      assert.ok(outbox.payload, 'payload column should be defined');
      assert.ok(outbox.status, 'status column should be defined');
      assert.ok(outbox.retryCount, 'retryCount column should be defined');
      assert.ok(outbox.replayedCount, 'replayedCount column should be defined');
      assert.ok(outbox.tenantId, 'tenantId column should be defined');
      assert.ok(outbox.createdAt, 'createdAt column should be defined');
      assert.ok(outbox.updatedAt, 'updatedAt column should be defined');
    });

    it('should have optional columns defined', () => {
      assert.ok(outbox.correlationId, 'correlationId column should be defined');
      assert.ok(outbox.causationId, 'causationId column should be defined');
      assert.ok(outbox.aggregateVersion, 'aggregateVersion column should be defined');
      assert.ok(outbox.publishedAt, 'publishedAt column should be defined');
      assert.ok(outbox.lockedAt, 'lockedAt column should be defined');
      assert.ok(outbox.lockedBy, 'lockedBy column should be defined');
      assert.ok(outbox.errorMessage, 'errorMessage column should be defined');
      assert.ok(outbox.lastRetryAt, 'lastRetryAt column should be defined');
      assert.ok(outbox.nextRetryAt, 'nextRetryAt column should be defined');
      assert.ok(outbox.deadLetteredAt, 'deadLetteredAt column should be defined');
      assert.ok(outbox.deadLetterReason, 'deadLetterReason column should be defined');
      assert.ok(outbox.replayedAt, 'replayedAt column should be defined');
      assert.ok(outbox.lastReplayId, 'lastReplayId column should be defined');
    });

    it('should have uuid type for id column', () => {
      assert.strictEqual(outbox.id.columnType, 'PgUUID');
      assert.strictEqual(outbox.id.hasDefault, true);
      assert.strictEqual(outbox.id.notNull, true);
    });

    it('should enforce tenantId as NOT NULL (P0 multi-tenancy)', () => {
      assert.strictEqual(
        outbox.tenantId.notNull,
        true,
        'tenantId must be NOT NULL for multi-tenancy isolation'
      );
    });

    it('should enforce eventId as NOT NULL', () => {
      assert.strictEqual(outbox.eventId.notNull, true);
    });

    it('should enforce eventType as NOT NULL', () => {
      assert.strictEqual(outbox.eventType.notNull, true);
    });

    it('should enforce aggregateId as NOT NULL', () => {
      assert.strictEqual(outbox.aggregateId.notNull, true);
    });

    it('should enforce payload as NOT NULL', () => {
      assert.strictEqual(outbox.payload.notNull, true);
    });

    it('should enforce status as NOT NULL with default', () => {
      assert.strictEqual(outbox.status.notNull, true);
      assert.strictEqual(outbox.status.hasDefault, true);
    });

    it('should default retryCount to 0', () => {
      assert.strictEqual(outbox.retryCount.hasDefault, true);
      assert.strictEqual(outbox.retryCount.notNull, true);
    });

    it('should default replayedCount to 0', () => {
      assert.strictEqual(outbox.replayedCount.hasDefault, true);
      assert.strictEqual(outbox.replayedCount.notNull, true);
    });

    it('should have createdAt with default', () => {
      assert.strictEqual(outbox.createdAt.hasDefault, true);
      assert.strictEqual(outbox.createdAt.notNull, true);
    });

    it('should have updatedAt with default', () => {
      assert.strictEqual(outbox.updatedAt.hasDefault, true);
      assert.strictEqual(outbox.updatedAt.notNull, true);
    });

    it('should default schemaVersion to 1.0', () => {
      assert.strictEqual(outbox.schemaVersion.hasDefault, true);
      assert.strictEqual(outbox.schemaVersion.notNull, true);
    });

    it('should have nullable optional timestamp columns', () => {
      assert.strictEqual(outbox.publishedAt.notNull, false, 'publishedAt should be nullable');
      assert.strictEqual(outbox.lockedAt.notNull, false, 'lockedAt should be nullable');
      assert.strictEqual(outbox.lastRetryAt.notNull, false, 'lastRetryAt should be nullable');
      assert.strictEqual(outbox.nextRetryAt.notNull, false, 'nextRetryAt should be nullable');
      assert.strictEqual(outbox.deadLetteredAt.notNull, false, 'deadLetteredAt should be nullable');
      assert.strictEqual(outbox.replayedAt.notNull, false, 'replayedAt should be nullable');
    });

    it('should have jsonb type for payload', () => {
      assert.strictEqual(outbox.payload.dataType, 'json');
      assert.strictEqual(outbox.payload.columnType, 'PgJsonb');
    });
  });

  describe('outbox updatedAt auto-update behavior', () => {
    /**
     * The schema's JSDoc on `updatedAt` documents it as
     * "Timestamp of last update. Auto-set on insert, updated on status changes."
     * But drizzle-orm's `defaultNow()` only sets the column on INSERT; it has no
     * built-in `on update` semantics for PostgreSQL. The only way to honour the
     * documented contract is via a Postgres BEFORE UPDATE trigger that writes
     * the current time into `updated_at` whenever a row is updated.
     *
     * The test reads the migrations folder from disk and asserts that at least one
     * migration creates such a trigger on the `outbox` table. If no such trigger
     * exists, the documented auto-update contract is silently violated on every
     * markAsPublished / markAsFailed / markAsProcessing / markAsDeadLettered /
     * markAsReplayed / resetForRetry call (all of which leave updatedAt stale).
     */
    it('should have a migration that installs a BEFORE UPDATE trigger keeping updated_at fresh on the outbox table', () => {
      const migrationsFolder = resolve(__dirname, '..', '..', '..', 'drizzle');
      assert.ok(existsSync(migrationsFolder), `migrations folder not found at ${migrationsFolder}`);

      const files = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql'));
      assert.ok(files.length > 0, 'no .sql migrations found');

      const triggerMigrations = files.filter((file) => {
        const contents = readFileSync(join(migrationsFolder, file), 'utf8');
        // Match CREATE TRIGGER ... BEFORE UPDATE on the outbox table that touches NEW.updated_at.
        const beforeUpdateOnOutbox =
          /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER[\s\S]*?BEFORE\s+UPDATE[\s\S]*?ON\s+(?:"?public"?\.)?\"?outbox\"?/i.test(
            contents
          );
        const updatesUpdatedAtColumn =
          /NEW\.updated_at|NEW\.\"updated_at\"|updated_at\s*=\s*NOW\(\)/i.test(contents);
        return beforeUpdateOnOutbox && updatesUpdatedAtColumn;
      });

      assert.ok(
        triggerMigrations.length > 0,
        `Expected at least one migration creating a BEFORE UPDATE trigger on the outbox table that maintains updated_at. ` +
          `Found migrations: ${files.join(', ')}. ` +
          `Without such a trigger, every UPDATE to the outbox table leaves updatedAt at its original insert timestamp, ` +
          `silently violating the schema's documented "Auto-set on insert, updated on status changes" contract.`
      );
    });
  });

  describe('type compatibility', () => {
    it('should allow creating NewOutbox objects', () => {
      const newOutbox: NewOutbox = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { userId: '123', email: 'test@example.com' },
        schemaVersion: '1.0',
        tenantId: 'tenant-123'
      };

      assert.strictEqual(newOutbox.eventId, '123e4567-e89b-12d3-a456-426614174000');
      assert.strictEqual(newOutbox.eventType, 'user.created');
      assert.strictEqual(newOutbox.aggregateId, 'user-123');
      assert.deepStrictEqual(newOutbox.payload, {
        userId: '123',
        email: 'test@example.com'
      });
    });

    it('should allow creating Outbox objects', () => {
      const outboxRecord: Outbox = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: 'event-123',
        eventType: 'user.created',
        aggregateId: 'user-123',
        aggregateVersion: '1',
        payload: { userId: '123' },
        correlationId: 'corr-123',
        causationId: 'cause-123',
        tenantId: 'tenant-123',
        schemaVersion: '1.0',
        status: 'pending',
        retryCount: 0,
        publishedAt: null,
        lockedAt: null,
        lockedBy: null,
        errorMessage: null,
        lastRetryAt: null,
        nextRetryAt: null,
        deadLetteredAt: null,
        deadLetterReason: null,
        replayedAt: null,
        replayedCount: 0,
        lastReplayId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      assert.strictEqual(outboxRecord.id, '123e4567-e89b-12d3-a456-426614174000');
      assert.strictEqual(outboxRecord.status, 'pending');
      assert.strictEqual(outboxRecord.retryCount, 0);
    });

    it('should support all status values in type system', () => {
      const statuses: Array<'pending' | 'processing' | 'published' | 'failed'> = [
        'pending',
        'processing',
        'published',
        'failed'
      ];

      assert.strictEqual(statuses.length, 4);
      assert.strictEqual(statuses[0], 'pending');
      assert.strictEqual(statuses[1], 'processing');
      assert.strictEqual(statuses[2], 'published');
      assert.strictEqual(statuses[3], 'failed');
    });
  });

  describe('optional fields', () => {
    it('should allow optional correlationId', () => {
      const newOutbox: NewOutbox = {
        eventId: 'event-1',
        eventType: 'test.event',
        aggregateId: 'agg-1',
        payload: {},
        schemaVersion: '1.0',
        tenantId: 'tenant-123'
      };

      assert.strictEqual(newOutbox.correlationId, undefined);
    });

    it('should allow optional causationId', () => {
      const newOutbox: NewOutbox = {
        eventId: 'event-1',
        eventType: 'test.event',
        aggregateId: 'agg-1',
        payload: {},
        schemaVersion: '1.0',
        tenantId: 'tenant-123'
      };

      assert.strictEqual(newOutbox.causationId, undefined);
    });

    it('should require tenantId field', () => {
      const newOutbox: NewOutbox = {
        eventId: 'event-1',
        eventType: 'test.event',
        aggregateId: 'agg-1',
        payload: {},
        schemaVersion: '1.0',
        tenantId: 'tenant-123'
      };

      assert.strictEqual(newOutbox.tenantId, 'tenant-123');
    });

    it('should allow optional aggregateVersion', () => {
      const newOutbox: NewOutbox = {
        eventId: 'event-1',
        eventType: 'test.event',
        aggregateId: 'agg-1',
        payload: {},
        schemaVersion: '1.0',
        tenantId: 'tenant-123'
      };

      assert.strictEqual(newOutbox.aggregateVersion, undefined);
    });
  });

  describe('type aliases', () => {
    it('should have OutboxRecord alias to Outbox', () => {
      const outboxRec: Outbox = {} as unknown;
      const outboxRecord: OutboxRecord = outboxRec;

      assert.ok(outboxRecord);
    });

    it('should have NewOutboxRecord alias to NewOutbox', () => {
      const newOutbox: NewOutbox = {} as unknown;
      const newOutboxRecord: NewOutboxRecord = newOutbox;

      assert.ok(newOutboxRecord);
    });
  });
});

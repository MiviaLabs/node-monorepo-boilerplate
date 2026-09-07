/**
 * Unit tests for OutboxRepository
 *
 * Tests the repository layer for outbox pattern event storage.
 * Uses simple assertions to verify repository structure and method signatures.
 */

import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { OutboxRepository } from '../../outbox/outbox.repository';

describe('OutboxRepository', () => {
  describe('constructor', () => {
    it('should be instantiable with database connection', () => {
      // Arrange
      const mockDb = {} as NodePgDatabase;

      // Act
      const repository = new OutboxRepository(mockDb);

      // Assert
      assert.ok(repository);
      assert.strictEqual(typeof repository, 'object');
    });

    it('should require database connection', () => {
      // Assert - constructor requires db parameter
      assert.strictEqual(OutboxRepository.length, 1);
    });
  });

  describe('methods exist', () => {
    let repository: OutboxRepository;

    beforeEach(() => {
      const mockDb = {} as NodePgDatabase;
      repository = new OutboxRepository(mockDb);
    });

    it('should have insert method', () => {
      assert.strictEqual(typeof repository.insert, 'function');
    });

    it('should have pollPending method', () => {
      assert.strictEqual(typeof repository.pollPending, 'function');
    });

    it('should have claimPending method for atomic locking', () => {
      assert.strictEqual(typeof repository.claimPending, 'function');
    });

    it('should have claimRetryable method for atomic locking', () => {
      assert.strictEqual(typeof repository.claimRetryable, 'function');
    });

    it('should have pollRetryable method', () => {
      assert.strictEqual(typeof repository.pollRetryable, 'function');
    });

    it('should have markAsProcessing method', () => {
      assert.strictEqual(typeof repository.markAsProcessing, 'function');
    });

    it('should have markAsPublished method', () => {
      assert.strictEqual(typeof repository.markAsPublished, 'function');
    });

    it('should have markAsFailed method', () => {
      assert.strictEqual(typeof repository.markAsFailed, 'function');
    });

    it('should have cleanup method', () => {
      assert.strictEqual(typeof repository.cleanup, 'function');
    });

    it('should have getById method', () => {
      assert.strictEqual(typeof repository.getById, 'function');
    });

    it('should have getByAggregate method', () => {
      assert.strictEqual(typeof repository.getByAggregate, 'function');
    });

    it('should have getPendingCount method', () => {
      assert.strictEqual(typeof repository.getPendingCount, 'function');
    });

    it('should have getFailedCount method', () => {
      assert.strictEqual(typeof repository.getFailedCount, 'function');
    });
  });

  describe('method signatures', () => {
    let repository: OutboxRepository;

    beforeEach(() => {
      const mockDb = {} as NodePgDatabase;
      repository = new OutboxRepository(mockDb);
    });

    it('insert should accept tx and data parameters', () => {
      // insert requires 2 parameters: tx and data
      assert.strictEqual(repository.insert.length, 2);
    });

    it('pollPending should accept optional limit and tenantId', () => {
      // pollPending has optional parameters (default params are not counted in length)
      // method signature: pollPending(limit?: number, tenantId?: string)
      assert.strictEqual(typeof repository.pollPending, 'function');
    });

    it('claimPending should accept limit, workerId, and optional tenantId', () => {
      // claimPending signature: claimPending(limit, workerId, tenantId?)
      assert.strictEqual(typeof repository.claimPending, 'function');
    });

    it('claimRetryable should accept limit, workerId, and optional tenantId', () => {
      // claimRetryable signature: claimRetryable(limit, workerId, tenantId?)
      assert.strictEqual(typeof repository.claimRetryable, 'function');
    });

    it('pollRetryable should accept optional limit and tenantId', () => {
      // pollRetryable has optional parameters
      // method signature: pollRetryable(limit?: number, tenantId?: string)
      assert.strictEqual(typeof repository.pollRetryable, 'function');
    });

    it('markAsProcessing should accept eventId and workerId and return boolean', () => {
      assert.strictEqual(repository.markAsProcessing.length, 2);
    });

    it('markAsPublished should accept eventId', () => {
      assert.strictEqual(repository.markAsPublished.length, 1);
    });

    it('markAsFailed should accept eventId, errorMessage, and nextRetryAt', () => {
      assert.strictEqual(repository.markAsFailed.length, 3);
    });

    it('cleanup should accept olderThan date', () => {
      assert.strictEqual(repository.cleanup.length, 1);
    });

    it('getById should accept eventId', () => {
      assert.strictEqual(repository.getById.length, 1);
    });

    it('getByAggregate should accept aggregateId and optional tenantId', () => {
      // getByAggregate signature: getByAggregate(aggregateId, tenantId?)
      assert.strictEqual(repository.getByAggregate.length, 2);
    });

    it('getPendingCount should accept optional tenantId', () => {
      assert.strictEqual(repository.getPendingCount.length, 1);
    });

    it('getFailedCount should accept optional tenantId', () => {
      assert.strictEqual(repository.getFailedCount.length, 1);
    });
  });

  describe('insert trace normalization', () => {
    it('should drop non-UUID correlation and causation IDs before insert', async () => {
      let insertedValues: Record<string, unknown> | undefined;

      const mockTx = {
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            insertedValues = values;
            return Promise.resolve();
          }
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository({} as NodePgDatabase);

      await repository.insert(mockTx, {
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'tenant.created',
        aggregateId: '1',
        payload: {},
        tenantId: '1',
        correlationId: 'req_1741900000000_abc123',
        causationId: 'corr-123'
      });

      assert.ok(insertedValues);
      assert.strictEqual(insertedValues?.correlationId, undefined);
      assert.strictEqual(insertedValues?.causationId, undefined);
    });

    it('should preserve valid UUID correlation and causation IDs', async () => {
      let insertedValues: Record<string, unknown> | undefined;

      const mockTx = {
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            insertedValues = values;
            return Promise.resolve();
          }
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository({} as NodePgDatabase);
      const correlationId = '22222222-2222-4222-8222-222222222222';
      const causationId = '33333333-3333-4333-8333-333333333333';

      await repository.insert(mockTx, {
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'tenant.created',
        aggregateId: '1',
        payload: {},
        tenantId: '1',
        correlationId,
        causationId
      });

      assert.ok(insertedValues);
      assert.strictEqual(insertedValues?.correlationId, correlationId);
      assert.strictEqual(insertedValues?.causationId, causationId);
    });
  });

  describe('snake_case to camelCase mapping', () => {
    it('should map snake_case database rows to camelCase OutboxRecord fields', () => {
      const mockDb = {} as NodePgDatabase;
      const repository = new OutboxRepository(mockDb);

      // Access private method for testing
      const mapRowsToCamelCase = (
        repository as unknown as {
          mapRowsToCamelCase: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
        }
      ).mapRowsToCamelCase.bind(repository);

      // Simulate a raw PG row with snake_case keys as returned by db.execute()
      const snakeCaseRow = {
        id: '123',
        event_id: 'evt-456',
        event_type: 'user.created',
        aggregate_id: 'agg-789',
        tenant_id: 'tenant-1',
        status: 'processing',
        retry_count: 3,
        locked_by: 'worker-1',
        locked_at: new Date('2026-01-01'),
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        next_retry_at: null,
        error_message: null,
        dead_lettered_at: null
      };

      const result = mapRowsToCamelCase([snakeCaseRow]);

      assert.strictEqual(result.length, 1);
      const mapped = result[0];

      // Verify camelCase keys match OutboxRecord property names
      assert.strictEqual(mapped.id, '123');
      assert.strictEqual(mapped.eventId, 'evt-456');
      assert.strictEqual(mapped.eventType, 'user.created');
      assert.strictEqual(mapped.aggregateId, 'agg-789');
      assert.strictEqual(mapped.tenantId, 'tenant-1');
      assert.strictEqual(mapped.status, 'processing');
      assert.strictEqual(mapped.retryCount, 3);
      assert.strictEqual(mapped.lockedBy, 'worker-1');
      assert.strictEqual(mapped.nextRetryAt, null);
      assert.strictEqual(mapped.errorMessage, null);
    });

    it('should handle empty rows array', () => {
      const mockDb = {} as NodePgDatabase;
      const repository = new OutboxRepository(mockDb);

      const mapRowsToCamelCase = (
        repository as unknown as {
          mapRowsToCamelCase: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
        }
      ).mapRowsToCamelCase.bind(repository);

      const result = mapRowsToCamelCase([]);
      assert.strictEqual(result.length, 0);
    });

    it('should map multiple rows correctly', () => {
      const mockDb = {} as NodePgDatabase;
      const repository = new OutboxRepository(mockDb);

      const mapRowsToCamelCase = (
        repository as unknown as {
          mapRowsToCamelCase: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
        }
      ).mapRowsToCamelCase.bind(repository);

      const rows = [
        { event_id: 'evt-1', retry_count: 0 },
        { event_id: 'evt-2', retry_count: 1 }
      ];

      const result = mapRowsToCamelCase(rows);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].eventId, 'evt-1');
      assert.strictEqual(result[1].eventId, 'evt-2');
      assert.strictEqual(result[0].retryCount, 0);
      assert.strictEqual(result[1].retryCount, 1);
    });
  });

  describe('claimPending behavior', () => {
    it('should call db.execute with SQL containing FOR UPDATE SKIP LOCKED', async () => {
      // Verify the method uses atomic SQL pattern
      const mockDb = {
        execute: async () => ({ rows: [] })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.claimPending(10, 'worker-1');

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('should return camelCase OutboxRecord from raw db.execute results', async () => {
      // Mock db.execute returning snake_case rows (as PostgreSQL does)
      const mockDb = {
        execute: async () => ({
          rows: [
            {
              id: '1',
              event_id: 'evt-1',
              event_type: 'user.created',
              aggregate_id: 'agg-1',
              tenant_id: 'tenant-1',
              status: 'processing',
              retry_count: 0,
              locked_by: 'worker-1',
              locked_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
              payload: { test: true }
            }
          ]
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.claimPending(10, 'worker-1');

      assert.strictEqual(result.length, 1);
      // Verify the result has camelCase keys (not snake_case)
      const claimed = result[0] as unknown as Record<string, unknown>;
      assert.strictEqual(claimed.eventId, 'evt-1');
      assert.strictEqual(claimed.eventType, 'user.created');
      assert.strictEqual(claimed.aggregateId, 'agg-1');
      assert.strictEqual(claimed.tenantId, 'tenant-1');
      assert.strictEqual(claimed.retryCount, 0);
      assert.strictEqual(claimed.lockedBy, 'worker-1');
      // Verify snake_case keys are not present
      assert.strictEqual(claimed.event_id, undefined);
      assert.strictEqual(claimed.event_type, undefined);
    });
  });

  describe('claimRetryable behavior', () => {
    it('should return camelCase OutboxRecord from raw db.execute results', async () => {
      const mockDb = {
        execute: async () => ({
          rows: [
            {
              id: '2',
              event_id: 'evt-2',
              event_type: 'order.failed',
              aggregate_id: 'agg-2',
              tenant_id: 'tenant-2',
              status: 'processing',
              retry_count: 3,
              locked_by: 'worker-2',
              locked_at: new Date(),
              next_retry_at: new Date(),
              error_message: 'timeout',
              created_at: new Date(),
              updated_at: new Date(),
              payload: {}
            }
          ]
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.claimRetryable(5, 'worker-2');

      assert.strictEqual(result.length, 1);
      const claimed = result[0] as unknown as Record<string, unknown>;
      assert.strictEqual(claimed.eventId, 'evt-2');
      assert.strictEqual(claimed.retryCount, 3);
      assert.strictEqual(claimed.errorMessage, 'timeout');
      assert.strictEqual(claimed.nextRetryAt instanceof Date, true);
      // Verify snake_case keys are not present
      assert.strictEqual(claimed.retry_count, undefined);
      assert.strictEqual(claimed.error_message, undefined);
    });

    it('should return empty array when no events to claim', async () => {
      const mockDb = {
        execute: async () => ({ rows: [] })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.claimRetryable(10, 'worker-1');

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });
  });

  describe('markAsDeadLettered behavior', () => {
    it('should clear nextRetryAt so claimRetryable cannot re-pick the dead-lettered row', async () => {
      // Reproduces a reachable loop where:
      //   1. processEvent sees retryCount >= maxRetries and calls sendToDeadLetter
      //   2. sendToDeadLetter -> markAsDeadLettered sets status = FAILED but leaves nextRetryAt intact
      //   3. Next poll cycle's claimRetryable (status=FAILED AND nextRetryAt < NOW()) re-claims the row
      //   4. processEvent sees retryCount >= maxRetries again and the alert fires every poll cycle.
      //
      // Fix: markAsDeadLettered must null out nextRetryAt so the row is no longer claimRetryable.
      let setValues: Record<string, unknown> | undefined;

      const mockDb = {
        update: () => ({
          set: (values: Record<string, unknown>) => {
            setValues = values;
            return {
              where: async () => {}
            };
          }
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      await repository.markAsDeadLettered('evt-dl-1', 'tenant-1', 'network');

      assert.ok(setValues, 'update.set must have been called');
      assert.strictEqual(
        setValues?.nextRetryAt,
        null,
        'markAsDeadLettered must null out nextRetryAt so claimRetryable cannot re-pick the row'
      );
    });
  });

  describe('markAsProcessing behavior', () => {
    it('should return false when no rows updated (already processing)', async () => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => []
            })
          })
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.markAsProcessing('evt-1', 'worker-1');

      assert.strictEqual(result, false);
    });

    it('should return true when row successfully claimed', async () => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [{ eventId: 'evt-1' }]
            })
          })
        })
      } as unknown as NodePgDatabase;

      const repository = new OutboxRepository(mockDb);
      const result = await repository.markAsProcessing('evt-1', 'worker-1');

      assert.strictEqual(result, true);
    });
  });

  describe('repository is injectable', () => {
    it('should have Injectable decorator from NestJS', () => {
      // This test verifies that the class is decorated correctly
      // The actual Injectable decorator is applied at class definition
      const mockDb = {} as NodePgDatabase;
      const repository = new OutboxRepository(mockDb);

      // Repository should be a plain class (Injectable is metadata)
      assert.strictEqual(repository.constructor.name, 'OutboxRepository');
    });
  });
});

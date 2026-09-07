/**
 * Bug A4 Regression Tests
 *
 * DataMigrationService.migrateEntities() reads `total` once before the loop
 * and advances `offset` by `batchSize` regardless of the number of rows
 * returned. Two real-world consequences:
 *
 *   (a) Rows inserted DURING the migration are silently skipped — the loop
 *       exits when offset >= pre-sampled total, never visiting the new rows.
 *   (b) Rows deleted during the migration cause the loop to terminate
 *       early (offset advances past total even though a batch returned
 *       empty) — but progress tracking doesn't reflect that data went
 *       missing.
 *
 * The fix is to detect end-of-data by checking the actual returned batch
 * size rather than the pre-sampled count. Rows that appear during the
 * migration are then picked up by the next iteration.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import {
  DataMigrationService,
  type IEntityRepository
} from '../../../services/data-migration.service';

interface Row extends Record<string, unknown> {
  id: string;
  email: string;
}

class LiveRepo implements IEntityRepository<Row> {
  entityName = 'Live';
  rows: Row[];

  constructor(initial: Row[]) {
    this.rows = [...initial];
  }

  async findAll(_org: string, opts?: { limit?: number; offset?: number }): Promise<Row[]> {
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? this.rows.length;
    return this.rows.slice(offset, offset + limit);
  }

  async save(_org: string, _row: Row): Promise<Row> {
    return _row;
  }
  async saveBatch(_org: string, rows: Row[]): Promise<Row[]> {
    return rows;
  }
  async count(_org: string): Promise<number> {
    return this.rows.length;
  }
}

describe('DataMigrationService.migrateEntities end-of-data sentinel (Bug A4)', () => {
  let service: DataMigrationService;

  beforeEach(() => {
    const mockKms = createMockKmsProvider({ name: 'mock-kms' });
    const providerMap = new Map([['mock-kms', mockKms]]);
    service = new DataMigrationService(
      (name?: string) => (name ? providerMap.get(name) : undefined),
      'mock-kms'
    );
  });

  it('processes rows inserted DURING the migration (concurrent insert scenario)', async () => {
    // Simulate: total=2 (pre-sampled). Migration starts. Between batch 1
    // and batch 2, a new row is appended. The current loop terminates
    // when offset >= 2 (after batch 1, offset=2, 2 < 2 is false). The new
    // row is never visited.
    const repo = new LiveRepo([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@x' }
    ]);

    const original = repo.findAll.bind(repo);
    let injected = false;
    repo.findAll = jest.fn(async (org: string, opts?: { limit?: number; offset?: number }) => {
      const result = await original(org, opts);
      // After batch 1 (offset=0), inject a new row.
      if (!injected && opts?.offset === 0) {
        repo.rows.push({ id: '3', email: 'c@x' });
        injected = true;
      }
      return result;
    });

    const result = await service.migrateEntities(repo, {
      organizationId: 'org',
      oldKeyId: 'old',
      newKeyId: 'new',
      batchSize: 1
    });

    // With Bug A4 present, the loop processes only 2 rows (batch 1 then
    // offset=2 >= total=2 exits). With the fix, it must also visit id=3.
    // We assert findAll was called more than 2 times (one per batch, plus
    // a 3rd call for the injected row).
    expect(repo.findAll.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.batchesProcessed).toBeGreaterThanOrEqual(3);
  });

  it('terminates immediately when findAll returns an empty batch even if total > 0', async () => {
    // This simulates a delete-during-migration scenario: total says 5 but
    // findAll keeps returning empty arrays. The loop must not spin forever.
    const repo = new LiveRepo([{ id: '1', email: 'a@x' }]);

    // Make findAll always return [] regardless of what's in the store.
    repo.findAll = jest.fn(async () => []);

    const result = await service.migrateEntities(repo, {
      organizationId: 'org',
      oldKeyId: 'old',
      newKeyId: 'new',
      batchSize: 2
    });

    expect(result.success).toBe(true);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    // Service must terminate promptly, not spin on stale total.
    expect(result.batchesProcessed).toBeLessThan(100);
  });
});

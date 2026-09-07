/**
 * Bug A5 Regression Tests
 *
 * DataMigrationService.processEntity returns {processed: 1, succeeded: 0,
 * failed: 0} for entities that have no @Encrypted() fields. That count is
 * added to `processed` but to neither `succeeded` nor `failed`, breaking
 * the invariant `total == succeeded + failed + skipped`. Audit dashboards
 * that sum the columns under-report completion.
 *
 * The fix adds a `skipped` counter so the invariant holds.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import {
  DataMigrationService,
  MigrationState,
  type IEntityRepository
} from '../../../services/data-migration.service';

interface Row extends Record<string, unknown> {
  id: string;
  email: string;
}

class InMemRepo implements IEntityRepository<Row> {
  entityName = 'Test';
  rows: Row[];

  constructor(rows: Row[]) {
    this.rows = [...rows];
  }

  async findAll(_org: string, opts?: { limit?: number; offset?: number }): Promise<Row[]> {
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? this.rows.length;
    return this.rows.slice(offset, offset + limit);
  }

  async save(_org: string, row: Row): Promise<Row> {
    return row;
  }
  async saveBatch(_org: string, rows: Row[]): Promise<Row[]> {
    return rows;
  }
  async count(_org: string): Promise<number> {
    return this.rows.length;
  }
}

describe('DataMigrationService metric semantics (Bug A5)', () => {
  let service: DataMigrationService;

  beforeEach(() => {
    const mockKms = createMockKmsProvider({ name: 'mock-kms' });
    const providerMap = new Map([['mock-kms', mockKms]]);
    service = new DataMigrationService(
      (name?: string) => (name ? providerMap.get(name) : undefined),
      'mock-kms'
    );
  });

  it('reports skipped count so total == succeeded + failed + skipped', async () => {
    // All rows are plain (no encrypted fields), so they all go through
    // the no-encrypted-fields branch and should be tracked as skipped.
    const repo = new InMemRepo([
      { id: '1', email: 'a@x' },
      { id: '2', email: 'b@x' },
      { id: '3', email: 'c@x' },
      { id: '4', email: 'd@x' }
    ]);

    const result = await service.migrateEntities(repo, {
      organizationId: 'org',
      oldKeyId: 'old',
      newKeyId: 'new',
      batchSize: 2
    });

    // Invariant: every processed row is accounted for in exactly one bucket.
    expect(result.total).toBe(result.succeeded + result.failed + result.skipped);
    expect(result.skipped).toBe(4);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
    expect(result.state).toBe(MigrationState.COMPLETED);
  });

  it('skipped is reported as a numeric field on IDataMigrationResult', async () => {
    const repo = new InMemRepo([{ id: '1', email: 'x@x' }]);
    const result = await service.migrateEntities(repo, {
      organizationId: 'org',
      oldKeyId: 'old',
      newKeyId: 'new',
      batchSize: 1
    });
    expect(typeof result.skipped).toBe('number');
    expect(result.skipped).toBe(1);
  });
});

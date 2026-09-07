import { inspect } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ROTATION_STATUS, keyRotationState, encryptedStoreEntries } from '@package/db-core';

import { EncryptedStoreService } from '../encrypted-store.service';

import type { EncryptedStoreKeyService } from '../encrypted-store-key.service';
import type { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import type { EncryptionService } from '@package/encryption';
import type { OutboxRepository } from '@package/events';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type VaultEntryRow = {
  id: number;
  organizationId: number;
  keyId: string;
  ciphertext: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
};

type RotationStateRow = {
  id: number;
  organizationId: number;
  oldKeyId: string;
  newKeyId: string;
  status: string;
  totalEntries: number;
  processedEntries: number;
  failedEntries: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  lastCursor: string | null;
};

function createMockInsertBuilder<T>(rows: T[]): {
  values: jest.Mock;
  onConflictDoNothing: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  returning: jest.Mock;
} {
  return {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    returning: jest.fn(async () => rows)
  };
}

function buildServiceHarness(options?: {
  existingStates?: Array<RotationStateRow | undefined>;
  countResponses?: number[];
  batches?: VaultEntryRow[][];
  failReencrypt?: boolean;
}): {
  service: EncryptedStoreService;
  db: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  encryption: jest.Mocked<Partial<EncryptionService>> & EncryptionService;
  insertBuilder: {
    values: jest.Mock;
    onConflictDoNothing: jest.Mock;
    onConflictDoUpdate: jest.Mock;
    returning: jest.Mock;
  };
  dbStateUpdates: Array<Record<string, unknown>>;
  txUpdateSetCalls: Array<Record<string, unknown>>;
  stateLookupWhere: jest.Mock;
  batchWhere: jest.Mock;
} {
  const now = new Date();
  const existingStates = options?.existingStates ?? [];
  const countResponses = options?.countResponses ?? [0];
  const batches = options?.batches ?? [[]];

  const dbStateUpdates: Array<Record<string, unknown>> = [];
  const txUpdateSetCalls: Array<Record<string, unknown>> = [];

  const stateLookupLimit = jest.fn().mockImplementation(async () => {
    const next = existingStates.shift();
    return next ? [next] : [];
  });
  const stateLookupWhere = jest.fn().mockReturnValue({
    orderBy: jest.fn().mockReturnValue({ limit: stateLookupLimit })
  });

  const countWhere = jest
    .fn()
    .mockImplementation(async () => [{ count: countResponses.shift() ?? 0 }]);
  const batchLimit = jest.fn().mockImplementation(async () => batches.shift() ?? []);
  const batchWhere = jest.fn().mockReturnValue({
    limit: batchLimit
  });

  const insertRows: RotationStateRow[] = [
    {
      id: 999,
      organizationId: 0,
      oldKeyId: '',
      newKeyId: '',
      status: ROTATION_STATUS.IN_PROGRESS,
      totalEntries: 0,
      processedEntries: 0,
      failedEntries: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      lastCursor: null
    }
  ];
  const insertBuilder = createMockInsertBuilder(insertRows);

  const db = {
    select: jest.fn().mockImplementation((selection?: unknown) => ({
      from: jest.fn().mockImplementation((table: unknown) => {
        if (selection && typeof selection === 'object' && 'count' in (selection as object)) {
          return {
            where: countWhere
          };
        }

        if (table === keyRotationState) {
          return {
            where: stateLookupWhere
          };
        }

        if (table === encryptedStoreEntries) {
          return {
            where: batchWhere
          };
        }

        return {
          where: jest.fn()
        };
      })
    })),
    insert: jest.fn().mockImplementation(() => insertBuilder),
    update: jest.fn().mockImplementation(() => ({
      set: jest.fn().mockImplementation((values) => {
        dbStateUpdates.push(values as Record<string, unknown>);
        const mockWhere = {
          returning: jest.fn(async () => [values]),
          catch: jest.fn().mockReturnThis()
        };
        return {
          where: jest.fn().mockReturnValue(mockWhere),
          catch: jest.fn().mockReturnThis()
        };
      })
    })),
    transaction: jest.fn().mockImplementation(async (...args: unknown[]) => {
      const callback = args[0] as (tx: NodePgDatabase) => Promise<void>;
      const mockTx = {
        update: jest.fn().mockImplementation(() => ({
          set: jest.fn().mockImplementation((values) => {
            txUpdateSetCalls.push(values as Record<string, unknown>);
            return {
              where: jest.fn(async () => undefined)
            };
          })
        }))
      } as unknown as NodePgDatabase;

      await callback(mockTx);
    })
  } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

  // Fix 7: rotateKey now uses reencryptDataKey (DEK rewrap) instead of
  // decryptFromBase64 + encryptToBase64 – no plaintext data is exposed.
  const reencryptDataKey = options?.failReencrypt
    ? jest.fn(async () => {
        throw new Error('reencrypt failed');
      })
    : jest.fn(async () => ({
        encryptedDataKey: Buffer.from('new-edk-buffer'),
        oldKeyId: '',
        newKeyId: ''
      }));

  const encryption = {
    reencryptDataKey
  } as unknown as jest.Mocked<Partial<EncryptionService>> & EncryptionService;

  const outbox = {
    insert: jest.fn(),
    pollPending: jest.fn(),
    pollRetryable: jest.fn(),
    markAsProcessing: jest.fn(),
    markAsDelivered: jest.fn(),
    markAsFailed: jest.fn(),
    findById: jest.fn(),
    findByAggregateId: jest.fn(),
    cleanupOldReplayMetadata: jest.fn(),
    createReplayMetadata: jest.fn(),
    getReplayMetadata: jest.fn(),
    updateReplayMetadata: jest.fn(),
    getPendingCount: jest.fn(),
    getFailedCount: jest.fn(),
    getRetryableCount: jest.fn()
  } as unknown as jest.Mocked<OutboxRepository>;

  // Mock EncryptedStoreKeyService with explicit async functions
  const encryptedStoreKeyService = {
    getPrimaryKeyId: jest.fn(async () => 'primary-encryption-key'),
    getPrimaryKeyIdWithVersion: jest.fn(async () => ({
      keyId: 'primary-encryption-key',
      keyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
    })),
    getTenantKeyId: jest.fn(async () => 'primary-encryption-key'),
    validateTenantKey: jest.fn(async () => true),
    scheduleKeyDeletion: jest.fn(() => undefined),
    validatePrimaryKey: jest.fn(async () => true),
    schedulePrimaryKeyDeletion: jest.fn(() => undefined)
  };

  const auditOutbox = {
    insert: jest.fn()
  } as unknown as jest.Mocked<AuditOutboxPublisher>;

  // Constructor signature: (encryption, encryptedStoreKeyService, outbox, auditOutbox, db)
  const service = new EncryptedStoreService(
    encryption,
    encryptedStoreKeyService as unknown as EncryptedStoreKeyService,
    outbox,
    auditOutbox,
    db
  );

  return {
    service,
    db,
    encryption,
    insertBuilder,
    dbStateUpdates,
    txUpdateSetCalls,
    stateLookupWhere,
    batchWhere
  };
}

describe('EncryptedStoreService – rotation state management', () => {
  const oldKeyId = 'tenant-10-v1';
  const newKeyId = 'tenant-10-v2';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when old and new key ids are equal', async () => {
    const harness = buildServiceHarness();

    await expect(
      harness.service.rotateKey({
        tenantId: 10,
        actorId: 0,
        oldKeyId: 'tenant-10-v1',
        newKeyId: 'tenant-10-v1'
      })
    ).rejects.toThrow('oldKeyId and newKeyId must be different');
  });

  it('creates in_progress state, processes batches, and marks completed for a new rotation', async () => {
    // No existing state → INSERT is called, succeeds
    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [2],
      batches: [
        [
          {
            id: 1,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-1',
            encryptedDataKey: Buffer.from('edk-1').toString('base64'),
            iv: 'iv-1',
            authTag: 'tag-1'
          },
          {
            id: 2,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-2',
            encryptedDataKey: Buffer.from('edk-2').toString('base64'),
            iv: 'iv-2',
            authTag: 'tag-2'
          }
        ],
        []
      ]
    });

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    // Verify INSERT was called with onConflictDoUpdate (atomic upsert)
    expect(harness.db.insert).toHaveBeenCalledWith(keyRotationState);
    expect(harness.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 10,
        oldKeyId,
        newKeyId,
        status: ROTATION_STATUS.IN_PROGRESS
        // totalEntries is calculated from count query inside the service
      })
    );
    expect(harness.insertBuilder.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({ updatedAt: expect.any(Date) })
      })
    );
    // Fix 7: reencryptDataKey (DEK rewrap) is used instead of decrypt+reencrypt
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalledTimes(2);
    // Per-batch progress updates happen in the transaction
    // 2 vault entry updates + 1 rotation state update = 3 total
    expect(harness.txUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lastCursor: '2' }),
        expect.objectContaining({ processedEntries: expect.anything() })
      ])
    );
    // 2 entry updates (re-encryption) + 1 state update (progress tracking)
    expect(harness.txUpdateSetCalls.length).toBeGreaterThanOrEqual(3);
    // Fix 6: completion update does NOT overwrite processedEntries (DB counter is authoritative)
    const completedUpdate = harness.dbStateUpdates.find(
      (u) => u['status'] === ROTATION_STATUS.COMPLETED
    );
    expect(completedUpdate).toBeDefined();
    expect(completedUpdate).not.toHaveProperty('processedEntries');
  });

  it('returns early on completed replay without reencrypt operations', async () => {
    const now = new Date();
    const completedState: RotationStateRow = {
      id: 100,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.COMPLETED,
      totalEntries: 3,
      processedEntries: 3,
      failedEntries: 0,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (by onConflictDoUpdate)
      completedAt: new Date(now.getTime() - 5000),
      lastCursor: '3'
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [3],
      batches: [[]]
    });
    // Mock onConflictDoUpdate returning existing COMPLETED state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([completedState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    // onConflictDoUpdate is always called, but processing is skipped for COMPLETED
    expect(harness.insertBuilder.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    // Fix 7: verify reencryptDataKey not called (not decrypt/encrypt either)
    expect(harness.encryption.reencryptDataKey).not.toHaveBeenCalled();
  });

  it('resumes from failed state by setting status to in_progress and then completing', async () => {
    const now = new Date();
    const failedState: RotationStateRow = {
      id: 101,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.FAILED,
      totalEntries: 1,
      processedEntries: 0,
      failedEntries: 1,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (by onConflictDoUpdate)
      completedAt: null,
      lastCursor: null
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [1],
      batches: [
        [
          {
            id: 10,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-10',
            encryptedDataKey: Buffer.from('edk-10').toString('base64'),
            iv: 'iv-10',
            authTag: 'tag-10'
          }
        ],
        []
      ]
    });
    // Mock onConflictDoUpdate returning existing FAILED state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([failedState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    // onConflictDoUpdate is always called
    expect(harness.insertBuilder.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(harness.dbStateUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: ROTATION_STATUS.IN_PROGRESS }),
        expect.objectContaining({ status: ROTATION_STATUS.COMPLETED })
      ])
    );
    // Fix 6: completion update must not contain processedEntries
    const completedUpdate = harness.dbStateUpdates.find(
      (u) => u['status'] === ROTATION_STATUS.COMPLETED
    );
    expect(completedUpdate).not.toHaveProperty('processedEntries');
    // Fix 7: DEK rewrap was used
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalled();
  });

  it('reuses existing in-progress state via onConflictDoUpdate and completes processing', async () => {
    const now = new Date();
    const inProgressState: RotationStateRow = {
      id: 102,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.IN_PROGRESS,
      totalEntries: 2,
      processedEntries: 1,
      failedEntries: 0,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (by onConflictDoUpdate)
      completedAt: null,
      lastCursor: '1'
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [1],
      batches: [
        [
          {
            id: 11,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-11',
            encryptedDataKey: Buffer.from('edk-11').toString('base64'),
            iv: 'iv-11',
            authTag: 'tag-11'
          }
        ],
        []
      ]
    });
    // Mock onConflictDoUpdate returning existing IN_PROGRESS state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([inProgressState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    // With onConflictDoUpdate, INSERT is always called
    expect(harness.insertBuilder.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(harness.dbStateUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: ROTATION_STATUS.COMPLETED })])
    );
    // Fix 6: completion update must not contain processedEntries
    const completedUpdate = harness.dbStateUpdates.find(
      (u) => u['status'] === ROTATION_STATUS.COMPLETED
    );
    expect(completedUpdate).not.toHaveProperty('processedEntries');
    expect(harness.txUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lastCursor: '11' }),
        expect.objectContaining({ processedEntries: expect.anything() })
      ])
    );
  });

  it('treats cancelled state as no-op replay and skips processing', async () => {
    const now = new Date();
    const cancelledState: RotationStateRow = {
      id: 103,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.CANCELLED,
      totalEntries: 2,
      processedEntries: 1,
      failedEntries: 0,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (by onConflictDoUpdate)
      completedAt: null,
      lastCursor: '1'
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [2],
      batches: [
        [
          {
            id: 12,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-12',
            encryptedDataKey: Buffer.from('edk-12').toString('base64'),
            iv: 'iv-12',
            authTag: 'tag-12'
          }
        ]
      ]
    });
    // Mock onConflictDoUpdate returning existing CANCELLED state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([cancelledState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    expect(harness.encryption.reencryptDataKey).not.toHaveBeenCalled();
    expect(harness.dbStateUpdates).toHaveLength(0);
  });

  it('treats existing COMPLETED state from onConflictDoUpdate as noop', async () => {
    // When onConflictDoUpdate returns an existing COMPLETED state, isNoopReplay must be true.
    const now = new Date();
    const existingCompletedState: RotationStateRow = {
      id: 777,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.COMPLETED,
      totalEntries: 0,
      processedEntries: 0,
      failedEntries: 0,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (touched by onConflictDoUpdate)
      completedAt: new Date(now.getTime() - 5000),
      lastCursor: null
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [0],
      batches: [[]]
    });
    // Mock onConflictDoUpdate returning existing COMPLETED state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([existingCompletedState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    expect(harness.insertBuilder.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    // COMPLETED state → isNoopReplay=true → no processing
    expect(harness.encryption.reencryptDataKey).not.toHaveBeenCalled();
  });

  it('continues processing when onConflictDoUpdate returns existing IN_PROGRESS state', async () => {
    // When onConflictDoUpdate returns existing IN_PROGRESS state, processing continues.
    const now = new Date();
    const existingInProgressState: RotationStateRow = {
      id: 888,
      organizationId: 10,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.IN_PROGRESS,
      totalEntries: 1,
      processedEntries: 0,
      failedEntries: 0,
      createdAt: new Date(now.getTime() - 10000), // Created 10 seconds ago
      updatedAt: now, // Updated just now (touched by onConflictDoUpdate)
      completedAt: null,
      lastCursor: null
    };

    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [1],
      batches: [
        [
          {
            id: 50,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-50',
            encryptedDataKey: Buffer.from('edk-50').toString('base64'),
            iv: 'iv-50',
            authTag: 'tag-50'
          }
        ],
        []
      ]
    });
    // Mock onConflictDoUpdate returning existing IN_PROGRESS state
    // @ts-expect-error - Mock type inference issue with non-empty array
    (harness.insertBuilder.returning as jest.Mock).mockResolvedValueOnce([existingInProgressState]);

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    // IN_PROGRESS → isNoopReplay=false → processing happens
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalled();
  });

  it('marks rotation state as failed when reencryptDataKey throws, then rethrows', async () => {
    // Fix 7: failure path uses reencryptDataKey, not encryptToBase64
    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [1],
      failReencrypt: true,
      batches: [
        [
          {
            id: 20,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-20',
            encryptedDataKey: Buffer.from('edk-20').toString('base64'),
            iv: 'iv-20',
            authTag: 'tag-20'
          }
        ]
      ]
    });

    await expect(
      harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId })
    ).rejects.toThrow('reencrypt failed');

    expect(harness.dbStateUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: ROTATION_STATUS.FAILED,
          failedEntries: expect.anything()
        })
      ])
    );
  });

  it('keeps tenant rotations isolated when state lookups occur for different tenants', async () => {
    const completedTenantBState: RotationStateRow = {
      id: 200,
      organizationId: 22,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.COMPLETED,
      totalEntries: 1,
      processedEntries: 1,
      failedEntries: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
      lastCursor: '1'
    };

    const harness = buildServiceHarness({
      existingStates: [
        // Tenant A sees no existing state
        undefined,
        // Tenant B sees completed state
        completedTenantBState
      ],
      countResponses: [1, 1],
      batches: [
        [
          {
            id: 30,
            organizationId: 11,
            keyId: oldKeyId,
            ciphertext: 'cipher-30',
            encryptedDataKey: Buffer.from('edk-30').toString('base64'),
            iv: 'iv-30',
            authTag: 'tag-30'
          }
        ],
        []
      ]
    });

    await harness.service.rotateKey({ tenantId: 11, actorId: 0, oldKeyId, newKeyId });
    await harness.service.rotateKey({ tenantId: 22, actorId: 0, oldKeyId, newKeyId });

    expect(harness.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 11 })
    );
    // Fix 7: only tenant 11 processes entries (tenant 22 is noop replay)
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalledTimes(1);
  });

  it('uses tenant scope with keyId != newKeyId predicate for mixed-version batches', async () => {
    const legacyKeyId = 'tenant-10-v0';
    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [2],
      batches: [
        [
          {
            id: 61,
            organizationId: 10,
            keyId: oldKeyId,
            ciphertext: 'cipher-61',
            encryptedDataKey: Buffer.from('edk-61').toString('base64'),
            iv: 'iv-61',
            authTag: 'tag-61'
          },
          {
            id: 62,
            organizationId: 10,
            keyId: legacyKeyId,
            ciphertext: 'cipher-62',
            encryptedDataKey: Buffer.from('edk-62').toString('base64'),
            iv: 'iv-62',
            authTag: 'tag-62'
          }
        ],
        []
      ]
    });

    await harness.service.rotateKey({ tenantId: 10, actorId: 0, oldKeyId, newKeyId });

    const whereClause = (harness.batchWhere.mock.calls[0] ?? [])[0];
    const whereText = inspect(whereClause, { depth: 6 });
    expect(whereText).toContain('organization_id');
    expect(whereText).toContain('key_id');
    expect(whereText).toContain('value: 10');
    expect(whereText).not.toContain(`value: '${oldKeyId}'`);
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalledTimes(2);
    expect(harness.encryption.reencryptDataKey).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      oldKeyId,
      newKeyId
    );
    expect(harness.encryption.reencryptDataKey).toHaveBeenNthCalledWith(
      2,
      expect.any(Buffer),
      legacyKeyId,
      newKeyId
    );
  });

  it('normalizes full resource key IDs for state upsert and reencryptDataKey calls', async () => {
    const fullResourceOldKeyId =
      'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/11';
    const fullResourceNewKeyId =
      'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/12';
    const harness = buildServiceHarness({
      existingStates: [],
      countResponses: [1],
      batches: [
        [
          {
            id: 101,
            organizationId: 10,
            keyId: fullResourceOldKeyId,
            ciphertext: 'cipher-101',
            encryptedDataKey: Buffer.from('edk-101').toString('base64'),
            iv: 'iv-101',
            authTag: 'tag-101'
          }
        ],
        []
      ]
    });

    await harness.service.rotateKey({
      tenantId: 10,
      actorId: 0,
      oldKeyId: fullResourceOldKeyId,
      newKeyId: fullResourceNewKeyId
    });

    expect(harness.insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        oldKeyId: 'primary-encryption-key/cryptoKeyVersions/11',
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/12'
      })
    );
    expect(harness.encryption.reencryptDataKey).toHaveBeenCalledWith(
      expect.any(Buffer),
      'primary-encryption-key/cryptoKeyVersions/11',
      'primary-encryption-key/cryptoKeyVersions/12'
    );
  });
});

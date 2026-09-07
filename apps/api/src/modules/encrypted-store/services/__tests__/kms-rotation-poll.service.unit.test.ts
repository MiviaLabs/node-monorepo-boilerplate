import { beforeEach, describe, expect, it } from '@jest/globals';

import { RotationTriggerSource } from '../../jobs/encrypted-store-key-rotation.job';
import { KmsRotationPollService } from '../kms-rotation-poll.service';

import type { EncryptedStoreKeyService } from '../../encrypted-store-key.service';
import type { KmsRotationOrchestratorService } from '../kms-rotation-orchestrator.service';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('KmsRotationPollService', () => {
  let service: KmsRotationPollService;
  let db: jest.Mocked<NodePgDatabase>;
  let tx: {
    insert: jest.Mock;
    select: jest.Mock;
    update: jest.Mock;
    execute: jest.Mock;
  };
  let insertBuilder: {
    values: jest.Mock;
    onConflictDoNothing: jest.Mock;
    returning: jest.Mock;
  };
  let selectBuilder: {
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    for: jest.Mock;
  };
  let updateBuilder: {
    set: jest.Mock;
    where: jest.Mock;
  };
  let encryptedStoreKeyService: jest.Mocked<EncryptedStoreKeyService>;
  let kmsRotationOrchestrator: jest.Mocked<KmsRotationOrchestratorService>;

  beforeEach(() => {
    insertBuilder = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn()
    };

    selectBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      for: jest.fn()
    };

    updateBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined)
    };

    tx = {
      insert: jest.fn().mockReturnValue(insertBuilder),
      select: jest.fn().mockReturnValue(selectBuilder),
      update: jest.fn().mockReturnValue(updateBuilder),
      execute: jest.fn().mockResolvedValue({ rows: [] })
    };

    db = {
      transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx)
      )
    } as unknown as jest.Mocked<NodePgDatabase>;

    encryptedStoreKeyService = {
      getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
        keyId: 'primary-encryption-key',
        keyVersion: 'primary-encryption-key/cryptoKeyVersions/8'
      })
    } as unknown as jest.Mocked<EncryptedStoreKeyService>;

    kmsRotationOrchestrator = {
      orchestrateRotation: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<KmsRotationOrchestratorService>;

    service = new KmsRotationPollService(db, encryptedStoreKeyService, kmsRotationOrchestrator);
  });

  it('initializes the checkpoint on cold start without triggering rotation', async () => {
    insertBuilder.returning.mockResolvedValue([{ id: 1 }]);
    selectBuilder.for.mockResolvedValue([
      {
        id: 1,
        keyName: 'primary-encryption-key',
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/8'
      }
    ]);

    const result = await service.pollForRotation('poll-job-1');

    expect(result).toEqual({
      status: 'initialized',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      requestId: undefined,
      correlationId: 'poll-job-1',
      causationId: 'poll-job-1'
    });
    expect(kmsRotationOrchestrator.orchestrateRotation).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('queues a catch-up rotation on cold start when an older version already exists in persisted data', async () => {
    insertBuilder.returning.mockResolvedValue([{ id: 2 }]);
    selectBuilder.for.mockResolvedValue([
      {
        id: 2,
        keyName: 'primary-encryption-key',
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/8'
      }
    ]);
    tx.execute.mockResolvedValue({
      rows: [{ version: 'primary-encryption-key/cryptoKeyVersions/7' }]
    });

    const result = await service.pollForRotation('poll-job-bootstrap-catchup');

    expect(kmsRotationOrchestrator.orchestrateRotation).toHaveBeenCalledWith({
      oldKeyVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      newKeyVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      requestId: undefined,
      correlationId: 'poll-job-bootstrap-catchup',
      causationId: 'poll-job-bootstrap-catchup',
      triggerSource: RotationTriggerSource.Scheduled
    });
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastProcessedFromVersion: 'primary-encryption-key/cryptoKeyVersions/7',
        lastProcessedToVersion: 'primary-encryption-key/cryptoKeyVersions/8',
        lastRotatedAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    );
    expect(result).toEqual({
      status: 'rotated',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      requestId: undefined,
      correlationId: 'poll-job-bootstrap-catchup',
      causationId: 'poll-job-bootstrap-catchup'
    });
  });

  it('updates timestamps only when the primary version is unchanged', async () => {
    insertBuilder.returning.mockResolvedValue([]);
    selectBuilder.for.mockResolvedValue([
      {
        id: 7,
        keyName: 'primary-encryption-key',
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/8'
      }
    ]);

    const result = await service.pollForRotation('poll-job-2');

    expect(result).toEqual({
      status: 'noop',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      requestId: undefined,
      correlationId: 'poll-job-2',
      causationId: 'poll-job-2'
    });
    expect(kmsRotationOrchestrator.orchestrateRotation).not.toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastCheckedAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    );
  });

  it('delegates rotation orchestration and persists the processed transition', async () => {
    insertBuilder.returning.mockResolvedValue([]);
    selectBuilder.for.mockResolvedValue([
      {
        id: 9,
        keyName: 'primary-encryption-key',
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/7'
      }
    ]);

    const result = await service.pollForRotation('poll-job-3');

    expect(kmsRotationOrchestrator.orchestrateRotation).toHaveBeenCalledWith({
      oldKeyVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      newKeyVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      requestId: undefined,
      correlationId: 'poll-job-3',
      causationId: 'poll-job-3',
      triggerSource: RotationTriggerSource.Scheduled
    });
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/8',
        lastProcessedFromVersion: 'primary-encryption-key/cryptoKeyVersions/7',
        lastProcessedToVersion: 'primary-encryption-key/cryptoKeyVersions/8',
        lastCheckedAt: expect.any(Date),
        lastRotatedAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    );
    expect(result).toEqual({
      status: 'rotated',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      requestId: undefined,
      correlationId: 'poll-job-3',
      causationId: 'poll-job-3'
    });
  });

  it('does not advance the checkpoint when orchestration fails', async () => {
    insertBuilder.returning.mockResolvedValue([]);
    selectBuilder.for.mockResolvedValue([
      {
        id: 11,
        keyName: 'primary-encryption-key',
        lastSeenVersion: 'primary-encryption-key/cryptoKeyVersions/7'
      }
    ]);
    kmsRotationOrchestrator.orchestrateRotation.mockRejectedValueOnce(
      new Error('Redis connection refused')
    );

    await expect(service.pollForRotation('poll-job-rollback')).rejects.toThrow(
      'Redis connection refused'
    );

    expect(updateBuilder.set).not.toHaveBeenCalled();
  });

  it('returns unavailable and leaves the checkpoint untouched when KMS lookup fails', async () => {
    encryptedStoreKeyService.getPrimaryKeyIdWithVersion.mockRejectedValueOnce(
      new Error('KMS service unavailable')
    );

    const result = await service.pollForRotation('poll-job-kms-down');

    expect(result).toEqual({
      status: 'unavailable',
      keyName: 'primary-encryption-key',
      requestId: undefined,
      correlationId: 'poll-job-kms-down',
      causationId: 'poll-job-kms-down'
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(kmsRotationOrchestrator.orchestrateRotation).not.toHaveBeenCalled();
  });

  it('throws when the checkpoint row cannot be loaded after initialization race handling', async () => {
    insertBuilder.returning.mockResolvedValue([]);
    selectBuilder.for.mockResolvedValue([]);

    await expect(service.pollForRotation('poll-job-4')).rejects.toThrow(
      'Failed to load KMS rotation checkpoint for key primary-encryption-key'
    );
  });
});

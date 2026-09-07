import { beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('@package/queues', () => ({
  addJob: jest.fn().mockResolvedValue({
    id: 'test-job-id',
    data: {}
  }),
  createQueue: jest.fn(),
  JobHandler: jest.fn(() => (_target: unknown, _propertyKey: string) => {
    return (target: unknown) => target;
  })
}));

jest.mock('@package/events', () => ({
  OutboxRepository: jest.fn()
}));

import { RotationTriggerSource } from '../../jobs/encrypted-store-key-rotation.job';
import { KmsRotationOrchestratorService } from '../kms-rotation-orchestrator.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('KmsRotationOrchestratorService', () => {
  let service: KmsRotationOrchestratorService;
  let db: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  let tenantLookupRows: Array<{ organizationId: number }>;

  beforeEach(() => {
    jest.clearAllMocks();

    tenantLookupRows = [{ organizationId: 42 }];
    let hasReturnedTenantBatch = false;

    db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockImplementation(() => {
                if (!hasReturnedTenantBatch) {
                  hasReturnedTenantBatch = true;
                  return Promise.resolve(tenantLookupRows);
                }
                return Promise.resolve([]);
              })
            })
          })
        })
      })
    } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    service = new KmsRotationOrchestratorService(db);
  });

  it('creates required queues on module init', () => {
    const queuesModule = jest.requireMock('@package/queues') as {
      createQueue: jest.Mock;
    };

    service.onModuleInit();

    expect(queuesModule.createQueue).toHaveBeenNthCalledWith(1, {
      name: 'encrypted-store-key-rotation'
    });
    expect(queuesModule.createQueue).toHaveBeenNthCalledWith(2, {
      name: 'inline-field-rotation'
    });
  });

  it('queues one encrypted-store rotation per tenant and one inline field rotation job', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    tenantLookupRows = [{ organizationId: 101 }, { organizationId: 202 }];

    await service.orchestrateRotation({
      oldKeyVersion:
        'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/5',
      newKeyVersion:
        'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/6',
      correlationId: 'corr-123',
      triggerSource: RotationTriggerSource.PubSub
    });

    expect(addJob).toHaveBeenCalledTimes(3);
    expect(addJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queueName: 'encrypted-store-key-rotation',
        jobName: 'rotate-encrypted-store-key',
        data: expect.objectContaining({
          organizationId: 101,
          oldKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
          newKeyId: 'primary-encryption-key/cryptoKeyVersions/6',
          triggerSource: 'pubsub',
          correlationId: 'corr-123'
        }),
        options: expect.objectContaining({
          jobId:
            'kms-rotation-101-primary-encryption-key/cryptoKeyVersions/5-primary-encryption-key/cryptoKeyVersions/6'
        })
      })
    );
    expect(addJob).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        queueName: 'inline-field-rotation',
        jobName: 'rotate-inline-fields',
        data: expect.objectContaining({
          oldKeyVersion: 'primary-encryption-key/cryptoKeyVersions/5',
          newKeyVersion: 'primary-encryption-key/cryptoKeyVersions/6',
          correlationId: 'corr-123'
        }),
        options: expect.objectContaining({
          jobId:
            'inline-rotation-primary-encryption-key/cryptoKeyVersions/5-primary-encryption-key/cryptoKeyVersions/6'
        })
      })
    );
  });

  it('queues a single tenant-scoped manual rotation job without inline field work', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.queueTenantRotation({
      tenantId: 321,
      oldKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
      newKeyId: 'primary-encryption-key/cryptoKeyVersions/6',
      actorId: 77,
      requestId: 'req-rotate',
      correlationId: 'corr-rotate',
      causationId: 'cause-rotate',
      triggerSource: RotationTriggerSource.Manual
    });

    expect(addJob).toHaveBeenCalledTimes(1);
    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'encrypted-store-key-rotation',
        jobName: 'rotate-encrypted-store-key',
        data: expect.objectContaining({
          organizationId: 321,
          oldKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
          newKeyId: 'primary-encryption-key/cryptoKeyVersions/6',
          actorId: 77,
          requestId: 'req-rotate',
          correlationId: 'corr-rotate',
          causationId: 'cause-rotate',
          triggerSource: RotationTriggerSource.Manual
        })
      })
    );
  });

  it('preserves BullMQ retry and backoff options', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.orchestrateRotation({
      oldKeyVersion: 'key/cryptoKeyVersions/1',
      newKeyVersion: 'key/cryptoKeyVersions/2',
      triggerSource: RotationTriggerSource.PubSub
    });

    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: 5000
          }),
          removeOnFail: false
        })
      })
    );
  });

  it('treats duplicate encrypted-store job errors as idempotent success', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');
    (addJob as jest.Mock)
      .mockRejectedValueOnce(
        new Error('Job rotate-encrypted-store-key already exists for the provided jobId')
      )
      .mockResolvedValueOnce({ id: 'encrypted-store-2' })
      .mockResolvedValueOnce({ id: 'inline-1' });

    tenantLookupRows = [{ organizationId: 42 }, { organizationId: 43 }];

    await expect(
      service.orchestrateRotation({
        oldKeyVersion: 'key/cryptoKeyVersions/1',
        newKeyVersion: 'key/cryptoKeyVersions/2',
        triggerSource: RotationTriggerSource.PubSub
      })
    ).resolves.toBeUndefined();
  });

  it('treats duplicate inline field job errors as idempotent success', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');
    (addJob as jest.Mock)
      .mockResolvedValueOnce({ id: 'encrypted-store-1' })
      .mockRejectedValueOnce(new Error('Job rotate-inline-fields already waiting'));

    await expect(
      service.orchestrateRotation({
        oldKeyVersion: 'key/cryptoKeyVersions/1',
        newKeyVersion: 'key/cryptoKeyVersions/2',
        triggerSource: RotationTriggerSource.PubSub
      })
    ).resolves.toBeUndefined();
  });

  it('does not enqueue inline field rotation when no active tenants are found', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');
    tenantLookupRows = [];

    await service.orchestrateRotation({
      oldKeyVersion: 'key/cryptoKeyVersions/1',
      newKeyVersion: 'key/cryptoKeyVersions/2',
      triggerSource: RotationTriggerSource.PubSub
    });

    expect(addJob).not.toHaveBeenCalled();
  });

  it('rethrows non-duplicate queue failures', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');
    (addJob as jest.Mock).mockRejectedValueOnce(new Error('Redis connection refused'));

    await expect(
      service.orchestrateRotation({
        oldKeyVersion: 'key/cryptoKeyVersions/1',
        newKeyVersion: 'key/cryptoKeyVersions/2',
        triggerSource: RotationTriggerSource.PubSub
      })
    ).rejects.toThrow('Redis connection refused');
  });
});

import assert from 'node:assert/strict';

import { eq, kmsRotationCheckpoint, organizations, tenants } from '@package/db-core';

jest.mock('@package/queues', () => ({
  addJob: jest.fn().mockResolvedValue({ id: 'test-job-id', data: {} }),
  createQueue: jest.fn(),
  JobHandler: jest.fn(() => (_target: unknown, _propertyKey: string) => {
    return (target: unknown) => target;
  })
}));

import { RotationTriggerSource } from '../../jobs/encrypted-store-key-rotation.job';
import { KmsRotationOrchestratorService } from '../kms-rotation-orchestrator.service';
import { KmsRotationPollService } from '../kms-rotation-poll.service';

import type { EncryptedStoreKeyService } from '../../encrypted-store-key.service';

jest.setTimeout(60000);

describe('KmsRotationPollService Integration Tests', () => {
  type PollServiceDb = ConstructorParameters<typeof KmsRotationPollService>[0];
  let db: PollServiceDb;
  let teardownDb: () => Promise<void> = async () => {};
  let service: KmsRotationPollService;
  let encryptedStoreKeyService: jest.Mocked<Pick<EncryptedStoreKeyService, 'getPrimaryKeyIdWithVersion'>>;
  let organizationIds: number[] = [];

  beforeAll(async () => {
    const testUtils = await import('@package/test-utils');
    await testUtils.setupTestDatabaseJest();
    db = testUtils.getTestDb().db as unknown as PollServiceDb;
    teardownDb = testUtils.teardownTestDatabase;

    const [tenant] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning({ id: tenants.id });
    assert.ok(tenant);

    const insertedOrganizations = await db
      .insert(organizations)
      .values([
        {
          tenantId: tenant.id,
          name: 'KMS Poll Test Org A',
          slug: `kms-poll-test-a-${Date.now()}`,
          isActive: true
        },
        {
          tenantId: tenant.id,
          name: 'KMS Poll Test Org B',
          slug: `kms-poll-test-b-${Date.now()}`,
          isActive: true
        }
      ])
      .returning({ id: organizations.id });

    organizationIds = insertedOrganizations.map((organization) => organization.id);
    assert.equal(organizationIds.length, 2);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    encryptedStoreKeyService = {
      getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
        keyId: 'primary-encryption-key',
        keyVersion: 'primary-encryption-key/cryptoKeyVersions/7'
      })
    };

    const orchestrator = new KmsRotationOrchestratorService(db);
    service = new KmsRotationPollService(
      db,
      encryptedStoreKeyService as unknown as EncryptedStoreKeyService,
      orchestrator
    );
  });

  beforeEach(async () => {
    await db.delete(kmsRotationCheckpoint);
  });

  afterAll(async () => {
    await teardownDb();
  });

  it('initializes the checkpoint from the current primary version without enqueueing rotation', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    const result = await service.pollForRotation('poll-init');

    assert.deepEqual(result, {
      status: 'initialized',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      requestId: undefined,
      correlationId: 'poll-init',
      causationId: 'poll-init'
    });

    const checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/7');
    assert.equal(checkpoints[0]?.lastProcessedFromVersion ?? null, null);
    assert.equal(checkpoints[0]?.lastProcessedToVersion ?? null, null);
    expect(addJob).not.toHaveBeenCalled();
  });

  it('emits one encrypted-store job per active tenant and one inline job when the primary version changes', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.pollForRotation('poll-bootstrap');
    encryptedStoreKeyService.getPrimaryKeyIdWithVersion.mockResolvedValue({
      keyId: 'primary-encryption-key',
      keyVersion: 'primary-encryption-key/cryptoKeyVersions/8'
    });

    const result = await service.pollForRotation('poll-rotate');

    assert.deepEqual(result, {
      status: 'rotated',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      requestId: undefined,
      correlationId: 'poll-rotate',
      causationId: 'poll-rotate'
    });

    expect(addJob).toHaveBeenCalledTimes(organizationIds.length + 1);
    for (const organizationId of organizationIds) {
      expect(addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: 'encrypted-store-key-rotation',
          jobName: 'rotate-encrypted-store-key',
          data: expect.objectContaining({
            organizationId,
            oldKeyId: 'primary-encryption-key/cryptoKeyVersions/7',
            newKeyId: 'primary-encryption-key/cryptoKeyVersions/8',
            triggerSource: RotationTriggerSource.Scheduled,
            correlationId: 'poll-rotate'
          }),
          options: expect.objectContaining({
            jobId: `kms-rotation-${organizationId}-primary-encryption-key/cryptoKeyVersions/7-primary-encryption-key/cryptoKeyVersions/8`
          })
        })
      );
    }
    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'inline-field-rotation',
        jobName: 'rotate-inline-fields',
        data: expect.objectContaining({
          oldKeyVersion: 'primary-encryption-key/cryptoKeyVersions/7',
          newKeyVersion: 'primary-encryption-key/cryptoKeyVersions/8',
          correlationId: 'poll-rotate'
        }),
        options: expect.objectContaining({
          jobId:
            'inline-rotation-primary-encryption-key/cryptoKeyVersions/7-primary-encryption-key/cryptoKeyVersions/8'
        })
      })
    );

    const checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/8');
    assert.equal(
      checkpoints[0]?.lastProcessedFromVersion,
      'primary-encryption-key/cryptoKeyVersions/7'
    );
    assert.equal(
      checkpoints[0]?.lastProcessedToVersion,
      'primary-encryption-key/cryptoKeyVersions/8'
    );
    assert.ok(checkpoints[0]?.lastRotatedAt instanceof Date);
  });

  it('does not enqueue duplicate jobs on repeated polls after the same version bump', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.pollForRotation('poll-bootstrap');
    encryptedStoreKeyService.getPrimaryKeyIdWithVersion.mockResolvedValue({
      keyId: 'primary-encryption-key',
      keyVersion: 'primary-encryption-key/cryptoKeyVersions/8'
    });

    await service.pollForRotation('poll-rotate');
    addJob.mockClear();

    const result = await service.pollForRotation('poll-repeat');

    assert.deepEqual(result, {
      status: 'noop',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      requestId: undefined,
      correlationId: 'poll-repeat',
      causationId: 'poll-repeat'
    });

    expect(addJob).not.toHaveBeenCalled();

    const checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/8');
    assert.equal(
      checkpoints[0]?.lastProcessedFromVersion,
      'primary-encryption-key/cryptoKeyVersions/7'
    );
    assert.equal(
      checkpoints[0]?.lastProcessedToVersion,
      'primary-encryption-key/cryptoKeyVersions/8'
    );
  });

  it('emits the transition only once when two polls race on the same version bump', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.pollForRotation('poll-bootstrap');
    addJob.mockClear();
    encryptedStoreKeyService.getPrimaryKeyIdWithVersion.mockResolvedValue({
      keyId: 'primary-encryption-key',
      keyVersion: 'primary-encryption-key/cryptoKeyVersions/8'
    });

    const [firstResult, secondResult] = await Promise.all([
      service.pollForRotation('poll-race-1'),
      service.pollForRotation('poll-race-2')
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual(['noop', 'rotated']);
    expect(addJob).toHaveBeenCalledTimes(organizationIds.length + 1);

    const checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/8');
    assert.equal(
      checkpoints[0]?.lastProcessedFromVersion,
      'primary-encryption-key/cryptoKeyVersions/7'
    );
    assert.equal(
      checkpoints[0]?.lastProcessedToVersion,
      'primary-encryption-key/cryptoKeyVersions/8'
    );
  });

  it('recovers safely after a partial tenant enqueue failure without advancing the checkpoint early', async () => {
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');

    await service.pollForRotation('poll-bootstrap');
    encryptedStoreKeyService.getPrimaryKeyIdWithVersion.mockResolvedValue({
      keyId: 'primary-encryption-key',
      keyVersion: 'primary-encryption-key/cryptoKeyVersions/8'
    });

    addJob.mockImplementation(
      async (payload: { queueName: string; data: { organizationId?: number } }) => {
        if (
          payload.queueName === 'encrypted-store-key-rotation' &&
          payload.data.organizationId === organizationIds[1]
        ) {
          throw new Error('Redis connection refused');
        }

        return { id: 'partial-success', data: payload.data };
      }
    );

    await expect(service.pollForRotation('poll-partial-failure')).rejects.toThrow(
      'Redis connection refused'
    );

    let checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/7');
    assert.equal(checkpoints[0]?.lastProcessedFromVersion ?? null, null);
    assert.equal(checkpoints[0]?.lastProcessedToVersion ?? null, null);

    addJob.mockReset();
    addJob.mockImplementation(
      async (payload: { queueName: string; data: { organizationId?: number } }) => {
        if (
          payload.queueName === 'encrypted-store-key-rotation' &&
          payload.data.organizationId === organizationIds[0]
        ) {
          throw new Error('Job rotate-encrypted-store-key already exists for the provided jobId');
        }

        return { id: 'retry-success', data: payload.data };
      }
    );

    const retryResult = await service.pollForRotation('poll-partial-retry');

    assert.deepEqual(retryResult, {
      status: 'rotated',
      keyName: 'primary-encryption-key',
      observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
      previousVersion: 'primary-encryption-key/cryptoKeyVersions/7',
      requestId: undefined,
      correlationId: 'poll-partial-retry',
      causationId: 'poll-partial-retry'
    });

    checkpoints = await db
      .select()
      .from(kmsRotationCheckpoint)
      .where(eq(kmsRotationCheckpoint.keyName, 'primary-encryption-key'));

    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.lastSeenVersion, 'primary-encryption-key/cryptoKeyVersions/8');
    assert.equal(
      checkpoints[0]?.lastProcessedFromVersion,
      'primary-encryption-key/cryptoKeyVersions/7'
    );
    assert.equal(
      checkpoints[0]?.lastProcessedToVersion,
      'primary-encryption-key/cryptoKeyVersions/8'
    );
  });
});

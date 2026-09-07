import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { RotationTriggerSource, EncryptedStoreKeyRotationJob } from '../encrypted-store-key-rotation.job';

jest.mock('@package/queues', () => ({
  JobHandler: jest.fn(() => (_target: unknown, _propertyKey: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target: any) => target;
  }),
  addJob: jest.fn(async () => undefined),
  createQueue: jest.fn()
}));

describe('EncryptedStoreKeyRotationJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should pass oldKeyId and newKeyId to encrypted-store rotation service', async () => {
    const rotateKey = jest.fn(async (..._args: unknown[]) => undefined);
    const job = new EncryptedStoreKeyRotationJob({
      rotateKey
    } as unknown as ConstructorParameters<typeof EncryptedStoreKeyRotationJob>[0]);

    await job.process({
      data: {
        organizationId: 42,
        oldKeyId: 'projects/p/locations/us/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        newKeyId: 'projects/p/locations/us/keyRings/r/cryptoKeys/k/cryptoKeyVersions/2',
        triggerSource: RotationTriggerSource.PubSub,
        correlationId: 'corr-1'
      }
    } as never);

    expect(rotateKey).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        oldKeyId: 'projects/p/locations/us/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        newKeyId: 'projects/p/locations/us/keyRings/r/cryptoKeys/k/cryptoKeyVersions/2'
      })
    );
  });

  it('logs job id and attempts metadata when job processing fails', async () => {
    const rotateKey = jest.fn(async (..._args: unknown[]) => {
      throw new Error('rotation failed');
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const job = new EncryptedStoreKeyRotationJob({
      rotateKey
    } as unknown as ConstructorParameters<typeof EncryptedStoreKeyRotationJob>[0]);

    await expect(
      job.process({
        id: 'job-123',
        attemptsMade: 1,
        opts: { attempts: 5 },
        data: {
          organizationId: 42,
          oldKeyId: 'old-key-id',
          newKeyId: 'new-key-id',
          triggerSource: RotationTriggerSource.PubSub,
          correlationId: 'corr-1'
        }
      } as never)
    ).rejects.toThrow('rotation failed');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-123',
        attemptsMade: 1,
        maxAttempts: 5
      })
    );
  });

  it('logs isLastAttempt=true when attempts are exhausted', async () => {
    const rotateKey = jest.fn(async (..._args: unknown[]) => {
      throw new Error('final retry failed');
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { addJob, createQueue } = jest.requireMock<{
      addJob: jest.Mock;
      createQueue: jest.Mock;
    }>('@package/queues');
    const job = new EncryptedStoreKeyRotationJob({
      rotateKey
    } as unknown as ConstructorParameters<typeof EncryptedStoreKeyRotationJob>[0]);

    await expect(
      job.process({
        id: 'job-final',
        attemptsMade: 4,
        opts: { attempts: 5 },
        data: {
          organizationId: 99,
          oldKeyId: 'old-key-id',
          newKeyId: 'new-key-id',
          triggerSource: RotationTriggerSource.PubSub
        }
      } as never)
    ).rejects.toThrow('final retry failed');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isLastAttempt: true,
        message: 'Vault key rotation exhausted all retry attempts – job will enter failed/DLQ state'
      })
    );
    expect(createQueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'encrypted-store-key-rotation:dead' })
    );
    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'encrypted-store-key-rotation:dead',
        jobName: 'rotate-encrypted-store-key-dead-letter',
        options: expect.objectContaining({
          attempts: 1,
          removeOnFail: false
        })
      })
    );
  });

  it('logs isLastAttempt=false on intermediate failures', async () => {
    const rotateKey = jest.fn(async (..._args: unknown[]) => {
      throw new Error('temporary failure');
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { addJob } = jest.requireMock<{ addJob: jest.Mock }>('@package/queues');
    const job = new EncryptedStoreKeyRotationJob({
      rotateKey
    } as unknown as ConstructorParameters<typeof EncryptedStoreKeyRotationJob>[0]);

    await expect(
      job.process({
        id: 'job-retry',
        attemptsMade: 1,
        opts: { attempts: 5 },
        data: {
          organizationId: 99,
          oldKeyId: 'old-key-id',
          newKeyId: 'new-key-id',
          triggerSource: RotationTriggerSource.PubSub
        }
      } as never)
    ).rejects.toThrow('temporary failure');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isLastAttempt: false,
        message: 'Vault key rotation attempt failed – BullMQ will retry'
      })
    );
    expect(addJob).not.toHaveBeenCalled();
  });
});

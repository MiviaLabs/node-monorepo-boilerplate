import { beforeEach, describe, expect, it } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { KmsRotationPollStatus } from '../../services/kms-rotation-poll.service';
import { KmsRotationPollJob, KMS_ROTATION_POLL_QUEUE } from '../kms-rotation-poll.job';

import type { KmsRotationPollService } from '../../services/kms-rotation-poll.service';
import type { EncryptedStoreKeyService } from '../../encrypted-store-key.service';

jest.mock('@package/queues', () => ({
  addCronJob: jest.fn(),
  createQueue: jest.fn(),
  JobHandler: () => {
    return (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
  }
}));

jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined)
}));

describe('KmsRotationPollJob', () => {
  let job: KmsRotationPollJob;
  let kmsRotationPollService: jest.Mocked<KmsRotationPollService>;
  let encryptedStoreKeyService: jest.Mocked<Pick<EncryptedStoreKeyService, 'isGcpKmsProvider'>>;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['KMS_ROTATION_POLL_ENABLED'] = 'true';
    delete process.env['KMS_ROTATION_POLL_CRON'];

    kmsRotationPollService = {
      pollForRotation: jest.fn().mockResolvedValue({
        status: 'noop',
        keyName: 'primary-encryption-key',
        observedVersion: 'primary-encryption-key/cryptoKeyVersions/8',
        previousVersion: 'primary-encryption-key/cryptoKeyVersions/8'
      })
    } as unknown as jest.Mocked<KmsRotationPollService>;

    encryptedStoreKeyService = {
      isGcpKmsProvider: jest.fn().mockReturnValue(false)
    };

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    job = new KmsRotationPollJob(
      kmsRotationPollService,
      encryptedStoreKeyService as unknown as EncryptedStoreKeyService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the expected queue name', () => {
    expect(KMS_ROTATION_POLL_QUEUE).toBe('kms-rotation-poll');
  });

  it('registers the repeatable poll cron job', async () => {
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
      createQueue: jest.Mock;
    };
    queuesModule.addCronJob.mockResolvedValue(undefined);

    await job.onModuleInit();

    expect(queuesModule.createQueue).toHaveBeenCalledWith({
      name: 'kms-rotation-poll'
    });
    expect(queuesModule.addCronJob).toHaveBeenCalledWith({
      queueName: 'kms-rotation-poll',
      jobName: 'poll-kms-primary-version',
      cron: '*/5 * * * *',
      data: {},
      options: { tz: 'UTC' }
    });
  });

  it('skips cron registration when polling is disabled', async () => {
    process.env['KMS_ROTATION_POLL_ENABLED'] = 'false';
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
      createQueue: jest.Mock;
    };

    await job.onModuleInit();

    expect(queuesModule.createQueue).not.toHaveBeenCalled();
    expect(queuesModule.addCronJob).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'KMS rotation poll cron job registration skipped because polling is disabled',
        enabled: false
      })
    );
  });

  it('uses a custom cron schedule from env when provided', async () => {
    process.env['KMS_ROTATION_POLL_CRON'] = '0 * * * *';
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
    };
    queuesModule.addCronJob.mockResolvedValue(undefined);

    await job.onModuleInit();

    expect(queuesModule.addCronJob).toHaveBeenCalledWith(
      expect.objectContaining({
        cron: '0 * * * *'
      })
    );
  });

  it('auto-enables polling for GCP KMS even when the explicit env flag is absent', async () => {
    delete process.env['KMS_ROTATION_POLL_ENABLED'];
    encryptedStoreKeyService.isGcpKmsProvider.mockReturnValue(true);
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
    };
    queuesModule.addCronJob.mockResolvedValue(undefined);

    await job.onModuleInit();

    expect(queuesModule.addCronJob).toHaveBeenCalled();
  });

  it('honors an explicit env opt-out even when GCP KMS is the default provider', async () => {
    process.env['KMS_ROTATION_POLL_ENABLED'] = 'false';
    encryptedStoreKeyService.isGcpKmsProvider.mockReturnValue(true);
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
      createQueue: jest.Mock;
    };

    await job.onModuleInit();

    expect(queuesModule.createQueue).not.toHaveBeenCalled();
    expect(queuesModule.addCronJob).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'KMS rotation poll cron job registration skipped because polling is disabled',
        enabled: false
      })
    );
  });

  it('retries queue-not-found registration races with bounded attempts', async () => {
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
    };
    queuesModule.addCronJob
      .mockRejectedValueOnce(new Error('Queue kms-rotation-poll not found'))
      .mockResolvedValueOnce(undefined);

    await job.onModuleInit();

    expect(queuesModule.addCronJob).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'KMS rotation poll queue registration raced with startup ordering, retrying',
        attempt: 1,
        maxAttempts: 3
      })
    );
  });

  it('fails startup when cron registration still cannot be established', async () => {
    const queuesModule = jest.requireMock('@package/queues') as {
      addCronJob: jest.Mock;
    };
    queuesModule.addCronJob.mockRejectedValue(new Error('Redis unavailable'));

    await expect(job.onModuleInit()).rejects.toThrow('Redis unavailable');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to register KMS rotation poll cron job',
        attempt: 1,
        maxAttempts: 3
      })
    );
  });

  it('delegates processing to the poll service with the BullMQ job id as correlation id', async () => {
    await job.process({ id: 'poll-job-123', data: {} } as never);

    expect(kmsRotationPollService.pollForRotation).toHaveBeenCalledWith({
      correlationId: 'poll-job-123',
      causationId: 'poll-job-123'
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'KMS rotation poll completed',
        jobId: 'poll-job-123',
        status: 'noop'
      })
    );
  });

  it('logs completion when the poll is skipped because KMS is unavailable', async () => {
    kmsRotationPollService.pollForRotation.mockResolvedValueOnce({
      status: KmsRotationPollStatus.Unavailable,
      keyName: 'primary-encryption-key',
      correlationId: 'poll-job-456'
    });

    await job.process({ id: 'poll-job-456', data: {} } as never);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'KMS rotation poll completed',
        jobId: 'poll-job-456',
        status: 'unavailable',
        keyName: 'primary-encryption-key'
      })
    );
  });
});

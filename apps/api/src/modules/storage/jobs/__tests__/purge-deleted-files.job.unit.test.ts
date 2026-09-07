import { addCronJob } from '@package/queues';

import { PurgeDeletedFilesJob } from '../purge-deleted-files.job';

import type { ConfigService } from '@nestjs/config';

jest.mock('@package/queues', () => ({
  addCronJob: jest.fn().mockResolvedValue(undefined)
}));

describe('PurgeDeletedFilesJob', () => {
  const addCronJobMock = addCronJob as jest.MockedFunction<typeof addCronJob>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules the storage purge job with retention and stale-upload settings', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          STORAGE_PURGE_ENABLED: 'true',
          STORAGE_DELETE_RETENTION_HOURS: '48',
          STORAGE_PENDING_UPLOAD_STALE_HOURS: '36',
          STORAGE_PURGE_CRON: '30 * * * *',
          STORAGE_PURGE_DRY_RUN: 'true',
          STORAGE_PURGE_BATCH_SIZE: '25'
        };
        return values[key] ?? defaultValue;
      })
    } as unknown as ConfigService;

    const job = new PurgeDeletedFilesJob(config);
    await job.onModuleInit();

    expect(addCronJobMock).toHaveBeenCalledWith({
      queueName: 'maintenance',
      jobName: 'purge-deleted-files',
      cron: '30 * * * *',
      data: {
        retentionHours: 48,
        stalePendingUploadHours: 36,
        dryRun: true,
        batchSize: 25
      }
    });
  });
});

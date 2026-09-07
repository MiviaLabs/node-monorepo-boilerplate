import { addCronJob } from '@package/queues';

import { PurgeSoftDeletedAccountsJob } from '../purge-soft-deleted-accounts.job';

import type { ConfigService } from '@nestjs/config';

jest.mock('@package/queues', () => ({
  addCronJob: jest.fn().mockResolvedValue(undefined)
}));

describe('PurgeSoftDeletedAccountsJob', () => {
  const addCronJobMock = addCronJob as jest.MockedFunction<typeof addCronJob>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('always schedules the purge job with configurable retention', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          SOFT_DELETE_RETENTION_DAYS: '45',
          SOFT_DELETE_PURGE_CRON: '15 1 * * *',
          SOFT_DELETE_PURGE_DRY_RUN: 'false',
          SOFT_DELETE_PURGE_BATCH_SIZE: '250'
        };
        return values[key] ?? defaultValue;
      })
    } as unknown as ConfigService;

    const job = new PurgeSoftDeletedAccountsJob(config);
    await job.onModuleInit();

    expect(addCronJobMock).toHaveBeenCalledWith({
      queueName: 'maintenance',
      jobName: 'purge-soft-deleted-accounts',
      cron: '15 1 * * *',
      data: {
        retentionDays: 45,
        dryRun: false,
        batchSize: 250
      }
    });
  });
});

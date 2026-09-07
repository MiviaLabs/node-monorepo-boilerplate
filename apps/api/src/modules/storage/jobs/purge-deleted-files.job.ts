import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addCronJob } from '@package/queues';

export interface PurgeDeletedFilesJobData {
  retentionHours: number;
  stalePendingUploadHours: number;
  dryRun: boolean;
  batchSize: number;
}

@Injectable()
export class PurgeDeletedFilesJob implements OnModuleInit {
  private readonly logger = new Logger(PurgeDeletedFilesJob.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<string>('STORAGE_PURGE_ENABLED', 'true') !== 'false';
    if (!enabled) {
      this.logger.log('Storage purge scheduling disabled by STORAGE_PURGE_ENABLED=false');
      return;
    }

    const retentionHours = Number(this.config.get<string>('STORAGE_DELETE_RETENTION_HOURS', '24'));
    const stalePendingUploadHours = Number(
      this.config.get<string>('STORAGE_PENDING_UPLOAD_STALE_HOURS', '24')
    );
    const cron = this.config.get<string>('STORAGE_PURGE_CRON', '15 * * * *');
    const dryRun = this.config.get<string>('STORAGE_PURGE_DRY_RUN', 'false') === 'true';
    const batchSize = Number(this.config.get<string>('STORAGE_PURGE_BATCH_SIZE', '100'));

    try {
      await addCronJob({
        queueName: 'maintenance',
        jobName: 'purge-deleted-files',
        cron,
        data: {
          retentionHours,
          stalePendingUploadHours,
          dryRun,
          batchSize
        } satisfies PurgeDeletedFilesJobData
      });

      this.logger.log(
        `Scheduled storage purge job: cron="${cron}", retentionHours=${retentionHours}, stalePendingUploadHours=${stalePendingUploadHours}, dryRun=${dryRun}, batchSize=${batchSize}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule storage purge job: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

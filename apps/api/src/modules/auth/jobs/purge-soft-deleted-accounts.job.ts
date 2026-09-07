import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addCronJob } from '@package/queues';

/**
 * Scheduled job to purge expired soft-deleted accounts
 *
 * Registers a cron job on module initialization if enabled
 */
@Injectable()
export class PurgeSoftDeletedAccountsJob implements OnModuleInit {
  private readonly logger = new Logger(PurgeSoftDeletedAccountsJob.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const retentionDays = Number(this.config.get<string>('SOFT_DELETE_RETENTION_DAYS', '90'));

    const cron = this.config.get<string>('SOFT_DELETE_PURGE_CRON', '0 2 * * *');

    const dryRun = this.config.get<string>('SOFT_DELETE_PURGE_DRY_RUN') === 'true';

    const batchSize = Number(this.config.get<string>('SOFT_DELETE_PURGE_BATCH_SIZE', '100'));

    try {
      await addCronJob({
        queueName: 'maintenance',
        jobName: 'purge-soft-deleted-accounts',
        cron,
        data: {
          retentionDays,
          dryRun,
          batchSize
        }
      });

      this.logger.log(
        `✅ Scheduled soft-delete purge job: cron="${cron}", retentionDays=${retentionDays}, dryRun=${dryRun}, batchSize=${batchSize}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule purge job: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

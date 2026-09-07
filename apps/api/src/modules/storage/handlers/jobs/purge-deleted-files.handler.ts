import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobHandler } from '@package/queues';

import { StorageFilesService } from '../../services';

import type { PurgeDeletedFilesJobData } from '../../jobs/purge-deleted-files.job';
import type { Pool, PoolClient } from 'pg';

import { DATABASE_PROVIDER } from '@/common/database/database.constants';

@Injectable()
export class PurgeDeletedFilesHandler {
  private static readonly PURGE_JOB_ADVISORY_LOCK_KEY = 8_643_305;
  private readonly logger = new Logger(PurgeDeletedFilesHandler.name);
  private advisoryLockClient: PoolClient | null = null;

  constructor(
    private readonly storageFilesService: StorageFilesService,
    @Inject(DATABASE_PROVIDER)
    private readonly databaseConnection: { pool: Pool }
  ) {}

  @JobHandler({
    queueName: 'maintenance',
    jobName: 'purge-deleted-files'
  })
  async handle(job: unknown): Promise<{
    success: boolean;
    dryRun: boolean;
    purgedCount: number;
    failedPendingUploadCount: number;
    recoveredPendingUploadCount: number;
    errors: string[];
  }> {
    const data = (job as { data: PurgeDeletedFilesJobData }).data;
    const requestId = `job:purge-deleted-files:${randomUUID()}`;
    const correlationId = randomUUID();
    const causationId = correlationId;

    this.logger.log(
      `Starting storage purge job: retentionHours=${data.retentionHours}, stalePendingUploadHours=${data.stalePendingUploadHours}, dryRun=${data.dryRun}, batchSize=${data.batchSize}`
    );

    const lockAcquired = await this.tryAcquireJobLock();
    if (!lockAcquired) {
      this.logger.log('Skipping storage purge job because another instance already holds the lock');
      return {
        success: true,
        dryRun: data.dryRun,
        purgedCount: 0,
        failedPendingUploadCount: 0,
        recoveredPendingUploadCount: 0,
        errors: []
      };
    }

    try {
      const purgeResult = await this.storageFilesService.purgeDeletedFiles({
        retentionHours: data.retentionHours,
        batchSize: data.batchSize,
        dryRun: data.dryRun,
        trace: { requestId, correlationId, causationId }
      });
      const staleUploadResult = await this.storageFilesService.reconcileStalePendingUploads({
        staleHours: data.stalePendingUploadHours,
        batchSize: data.batchSize,
        dryRun: data.dryRun,
        trace: { requestId, correlationId, causationId }
      });

      const errors = [...purgeResult.errors, ...staleUploadResult.errors];
      this.logger.log(
        `Storage purge job completed: purged=${purgeResult.purgedCount}, recoveredPendingUploads=${staleUploadResult.recoveredCount}, failedPendingUploads=${staleUploadResult.failedCount}, errors=${errors.length}`
      );

      return {
        success: true,
        dryRun: data.dryRun,
        purgedCount: purgeResult.purgedCount,
        failedPendingUploadCount: staleUploadResult.failedCount,
        recoveredPendingUploadCount: staleUploadResult.recoveredCount,
        errors
      };
    } finally {
      await this.releaseJobLock();
    }
  }

  private async tryAcquireJobLock(): Promise<boolean> {
    const client = await this.databaseConnection.pool.connect();

    try {
      const result = await client.query<{ acquired: boolean }>(
        'select pg_try_advisory_lock($1) as acquired',
        [PurgeDeletedFilesHandler.PURGE_JOB_ADVISORY_LOCK_KEY]
      );

      if (result.rows[0]?.acquired === true) {
        this.advisoryLockClient = client;
        return true;
      }

      client.release();
      return false;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  private async releaseJobLock(): Promise<void> {
    if (!this.advisoryLockClient) {
      return;
    }

    try {
      await this.advisoryLockClient.query('select pg_advisory_unlock($1)', [
        PurgeDeletedFilesHandler.PURGE_JOB_ADVISORY_LOCK_KEY
      ]);
    } catch (error) {
      this.logger.warn(
        `Failed to release storage purge advisory lock: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.advisoryLockClient.release();
      this.advisoryLockClient = null;
    }
  }
}

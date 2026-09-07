import { setTimeout as sleep } from 'node:timers/promises';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { addCronJob, createQueue, JobHandler } from '@package/queues';

import { KmsRotationPollService } from '../services/kms-rotation-poll.service';
import { EncryptedStoreKeyService } from '../encrypted-store-key.service';

import type { Job } from 'bullmq';

export type KmsRotationPollJobData = Record<string, never>;

export const KMS_ROTATION_POLL_QUEUE = 'kms-rotation-poll';

@Injectable()
export class KmsRotationPollJob implements OnModuleInit {
  private static readonly DEFAULT_CRON_SCHEDULE = '*/5 * * * *';
  private static readonly CRON_JOB_NAME = 'poll-kms-primary-version';
  private static readonly REGISTRATION_ATTEMPTS = 3;
  private static readonly REGISTRATION_RETRY_DELAY_MS = 250;

  private readonly logger = new Logger(KmsRotationPollJob.name);

  constructor(
    private readonly kmsRotationPollService: KmsRotationPollService,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.isPollingEnabled()) {
      this.logger.log({
        message: 'KMS rotation poll cron job registration skipped because polling is disabled',
        enabled: false
      });
      return;
    }

    const cronSchedule = this.getCronSchedule();

    for (let attempt = 1; attempt <= KmsRotationPollJob.REGISTRATION_ATTEMPTS; attempt += 1) {
      try {
        createQueue({
          name: KMS_ROTATION_POLL_QUEUE
        });

        await addCronJob({
          queueName: KMS_ROTATION_POLL_QUEUE,
          jobName: KmsRotationPollJob.CRON_JOB_NAME,
          cron: cronSchedule,
          data: {},
          options: { tz: 'UTC' }
        });

        this.logger.log({
          message: 'KMS rotation poll cron job registered',
          schedule: cronSchedule,
          jobName: KmsRotationPollJob.CRON_JOB_NAME,
          queueName: KMS_ROTATION_POLL_QUEUE,
          timezone: 'UTC'
        });
        return;
      } catch (error) {
        const hasRemainingAttempts = attempt < KmsRotationPollJob.REGISTRATION_ATTEMPTS;
        const isRetryableRace = hasRemainingAttempts && this.isQueueRegistrationRace(error);

        if (isRetryableRace) {
          this.logger.warn({
            message: 'KMS rotation poll queue registration raced with startup ordering, retrying',
            attempt,
            maxAttempts: KmsRotationPollJob.REGISTRATION_ATTEMPTS,
            error: error instanceof Error ? error.message : String(error)
          });

          await sleep(KmsRotationPollJob.REGISTRATION_RETRY_DELAY_MS * attempt);
          continue;
        }

        this.logger.error({
          message: 'Failed to register KMS rotation poll cron job',
          attempt,
          maxAttempts: KmsRotationPollJob.REGISTRATION_ATTEMPTS,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }

  @JobHandler({
    queueName: KMS_ROTATION_POLL_QUEUE,
    jobName: KmsRotationPollJob.CRON_JOB_NAME,
    concurrency: 1
  })
  async process(job: Job<KmsRotationPollJobData>): Promise<void> {
    this.logger.log({
      message: 'KMS rotation poll started',
      jobId: job.id
    });

    const result = await this.kmsRotationPollService.pollForRotation(
      typeof job.id === 'string'
        ? {
            correlationId: job.id,
            causationId: job.id
          }
        : undefined
    );

    this.logger.log({
      message: 'KMS rotation poll completed',
      jobId: job.id,
      status: result.status,
      keyName: result.keyName,
      observedVersion: result.observedVersion,
      previousVersion: result.previousVersion
    });
  }

  private isQueueRegistrationRace(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const normalized = error.message.toLowerCase();
    return (
      normalized.includes('queue') &&
      (normalized.includes('not found') || normalized.includes('missing'))
    );
  }

  private isPollingEnabled(): boolean {
    const envValue = process.env['KMS_ROTATION_POLL_ENABLED'];

    if (envValue === 'false') {
      return false;
    }

    if (envValue === 'true') {
      return true;
    }

    return this.encryptedStoreKeyService.isGcpKmsProvider();
  }

  private getCronSchedule(): string {
    return process.env['KMS_ROTATION_POLL_CRON'] ?? KmsRotationPollJob.DEFAULT_CRON_SCHEDULE;
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { addCronJob, createQueue, JobHandler } from '@package/queues';

import type { Job } from 'bullmq';

/**
 * BullMQ queue name for scheduled rotation check jobs.
 */
export const SCHEDULED_ROTATION_CHECK_QUEUE = 'scheduled-rotation-check';

/**
 * Scheduled rotation check job.
 *
 * Cron-based watchdog that periodically runs to detect stalled or
 * interrupted address key rotations and logs them for operator awareness.
 * This is a **safety net** for the primary Pub/Sub → BullMQ rotation pipeline.
 * It ensures that missed rotation events are surfaced even if the Pub/Sub
 * consumer is temporarily unavailable.
 *
 * ## Schedule
 * Runs every hour (cron: `0 * * * *`, UTC). Configurable by changing the
 * cron expression in `onModuleInit`.
 *
 * ## Future Enhancement
 * Query `key_rotation_state` for `IN_PROGRESS` records older than a staleness
 * threshold and re-enqueue them for resumption via `AddressKeyRotationService.resumeRotation()`.
 * This requires cross-tenant admin access, which must be explicitly designed with
 * P0 tenant-isolation guarantees.
 *
 * ## P0 Security
 * - No PII or encrypted values in log output.
 * - Cron registration is idempotent (BullMQ uses Redis to deduplicate repeatable jobs).
 */
@Injectable()
export class ScheduledRotationCheckJob implements OnModuleInit {
  private static readonly CRON_SCHEDULE = '0 * * * *'; // Every hour
  private static readonly CRON_JOB_NAME = 'check-rotation-stalled';

  private readonly logger = new Logger(ScheduledRotationCheckJob.name);

  /**
   * Register the cron job in BullMQ on module initialization.
   *
   * BullMQ stores repeatable job definitions in Redis, making registration
   * idempotent across container restarts and multi-instance deployments.
   * A non-critical error here is logged but does not fail startup.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Ensure queue exists before scheduler registration to avoid startup race
      // with @JobHandler auto-discovery/queue registration order.
      createQueue({
        name: SCHEDULED_ROTATION_CHECK_QUEUE
      });

      await addCronJob({
        queueName: SCHEDULED_ROTATION_CHECK_QUEUE,
        jobName: ScheduledRotationCheckJob.CRON_JOB_NAME,
        cron: ScheduledRotationCheckJob.CRON_SCHEDULE,
        data: {},
        options: { tz: 'UTC' }
      });

      this.logger.log({
        message: 'Scheduled rotation check cron job registered',
        schedule: ScheduledRotationCheckJob.CRON_SCHEDULE,
        jobName: ScheduledRotationCheckJob.CRON_JOB_NAME,
        queueName: SCHEDULED_ROTATION_CHECK_QUEUE,
        timezone: 'UTC'
      });
    } catch (error) {
      // Non-fatal: log and continue. The rotation pipeline still works via
      // the primary Pub/Sub path. This cron is a safety net only.
      this.logger.warn({
        message:
          'Failed to register scheduled rotation check cron job — manual monitoring required',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Process a scheduled rotation check.
   *
   * Runs on the cron schedule to detect stalled or missed rotations.
   * Currently logs a heartbeat to confirm the cron is running.
   *
   * TODO: Implement active rotation detection by querying `key_rotation_state`
   * for `IN_PROGRESS` records older than a staleness threshold and re-enqueuing
   * them.
   *
   * @param job - BullMQ scheduled job.
   */
  @JobHandler({
    queueName: SCHEDULED_ROTATION_CHECK_QUEUE,
    jobName: ScheduledRotationCheckJob.CRON_JOB_NAME,
    concurrency: 1
  })
  process(job: Job): void {
    this.logger.log({
      message: 'Scheduled rotation check started',
      jobId: job.id,
      runAt: new Date().toISOString()
    });

    // NOTE: Active stall detection is not implemented yet.
    // Current behaviour: heartbeat log confirms the cron is running.
    // Operators can monitor key_rotation_state (status=IN_PROGRESS, updatedAt stale)
    // via the database directly for now.

    this.logger.log({
      message: 'Scheduled rotation check completed',
      jobId: job.id,
      note: 'Monitor key_rotation_state for stalled IN_PROGRESS records if rotation events are missed.'
    });
  }
}

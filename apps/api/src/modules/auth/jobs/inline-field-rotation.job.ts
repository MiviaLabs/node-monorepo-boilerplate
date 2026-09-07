import { Injectable, Logger } from '@nestjs/common';
import { JobHandler } from '@package/queues';

import { InlineFieldKeyRotationService } from '../services/inline-field-key-rotation.service';

import type { Job } from 'bullmq';

/**
 * BullMQ queue name for inline field key rotation jobs.
 *
 * - Producer: Manual admin trigger or automated KMS rotation event handler.
 * - Consumer: InlineFieldRotationJob (this file).
 */
export const INLINE_FIELD_ROTATION_QUEUE = 'inline-field-rotation';

/**
 * Job payload for inline field key rotation.
 *
 * ## P0 Security
 * - NEVER include encrypted values, key material, or PII in this payload.
 * - `oldKeyVersion` / `newKeyVersion` are KMS key version identifiers (not key material).
 */
export interface InlineFieldRotationJobData {
  /** Old KMS key version being rotated from. Not key material. */
  oldKeyVersion: string;
  /** New KMS key version being rotated to. Not key material. */
  newKeyVersion: string;
  /** Number of records to process per batch (default: 100). */
  batchSize?: number;
  /** Optional correlation ID for distributed tracing across services. */
  correlationId?: string;
}

/**
 * Job result for inline field key rotation.
 *
 * Contains per-table rotation statistics and overall totals.
 */
export interface InlineFieldRotationJobResult {
  /** Users table rotation statistics. */
  users: { processed: number; failed: number };
  /** User identities table rotation statistics. */
  userIdentities: { processed: number; failed: number };
  /** Invitations table rotation statistics. */
  invitations: { processed: number; failed: number };
  /** Total records processed across all tables. */
  totalProcessed: number;
  /** Total records failed across all tables. */
  totalFailed: number;
  /** Correlation ID for distributed tracing. */
  correlationId?: string;
}

/**
 * BullMQ job processor for inline field key rotation.
 *
 * Processes rotation jobs from the `inline-field-rotation` queue.
 * Rotates inline encrypted fields in auth-related tables (users, user_identities, invitations)
 * during KMS key rotation operations.
 *
 * ## Architecture
 * ```
 * KMS Key Rotation Event
 *           ↓
 *   BullMQ Queue: inline-field-rotation
 *           ↓
 *   InlineFieldRotationJob.process()   ← this class
 *           ↓
 *   InlineFieldKeyRotationService.rotateAllInlineFields()
 *           ↓
 *   users / user_identities / invitations (re-encrypted DEKs)
 * ```
 *
 * ## Key Design Decisions
 *
 * 1. **Concurrency=1**: Only one rotation job at a time to prevent race conditions
 * 2. **Batch Processing**: Processes records in configurable batches (default: 100)
 * 3. **Continue-on-Error**: Collects errors but continues rotation by default
 * 4. **Comprehensive Logging**: Logs progress and completion with correlation IDs
 *
 * ## P0 Security
 * - No PII, encrypted values, or key material appear in any log output.
 * - Rotation operates on key version identifiers only.
 *
 * @see InlineFieldKeyRotationService for the rotation implementation.
 */
@Injectable()
export class InlineFieldRotationJob {
  private readonly logger = new Logger(InlineFieldRotationJob.name);

  constructor(private readonly inlineRotationService: InlineFieldKeyRotationService) {}

  /**
   * Process an inline field key rotation job.
   *
   * Called automatically by BullMQ when a job is dequeued.
   * Re-throws errors so BullMQ can apply retry / dead-letter logic.
   *
   * @param job - BullMQ job containing rotation parameters (no PII).
   * @returns Rotation result with per-table statistics.
   * @throws Re-throws any error from the rotation service to trigger BullMQ retry/DLQ.
   */
  @JobHandler({
    queueName: INLINE_FIELD_ROTATION_QUEUE,
    jobName: 'rotate-inline-fields',
    concurrency: 1 // Only one rotation at a time to prevent race conditions
  })
  async process(job: Job<InlineFieldRotationJobData>): Promise<InlineFieldRotationJobResult> {
    const { oldKeyVersion, newKeyVersion, batchSize = 100, correlationId } = job.data;

    // P0: Log IDs and metadata only — no encrypted values, no PII
    this.logger.log({
      message: 'Processing inline field rotation job',
      jobId: job.id,
      oldKeyVersion,
      newKeyVersion,
      batchSize,
      correlationId,
      attemptsMade: job.attemptsMade
    });

    await job.updateProgress(0);

    try {
      const opts = { batchSize, continueOnError: true };

      // Rotate each table separately to get per-table statistics
      const usersResult = await this.inlineRotationService.rotateUsersTable(
        oldKeyVersion,
        newKeyVersion,
        opts
      );

      const userIdentitiesResult = await this.inlineRotationService.rotateUserIdentitiesTable(
        oldKeyVersion,
        newKeyVersion,
        opts
      );

      const invitationsResult = await this.inlineRotationService.rotateInvitationsTable(
        oldKeyVersion,
        newKeyVersion,
        opts
      );

      await job.updateProgress(100);

      const jobResult: InlineFieldRotationJobResult = {
        users: {
          processed: usersResult.processedCount,
          failed: usersResult.failedCount
        },
        userIdentities: {
          processed: userIdentitiesResult.processedCount,
          failed: userIdentitiesResult.failedCount
        },
        invitations: {
          processed: invitationsResult.processedCount,
          failed: invitationsResult.failedCount
        },
        totalProcessed:
          usersResult.processedCount +
          userIdentitiesResult.processedCount +
          invitationsResult.processedCount,
        totalFailed:
          usersResult.failedCount +
          userIdentitiesResult.failedCount +
          invitationsResult.failedCount,
        correlationId
      };

      // P0: Log counts and status only — no PII
      this.logger.log({
        message: 'Inline field rotation job completed',
        jobId: job.id,
        ...jobResult,
        isComplete: jobResult.totalFailed === 0
      });

      if (jobResult.totalFailed > 0) {
        this.logger.warn({
          message: 'Inline field rotation completed with partial failures — manual review required',
          jobId: job.id,
          totalFailed: jobResult.totalFailed,
          totalProcessed: jobResult.totalProcessed,
          correlationId
        });
      }

      return jobResult;
    } catch (error) {
      // P0: Log error message only — no stack frames containing PII, no key material
      this.logger.error({
        message: 'Inline field rotation job failed',
        jobId: job.id,
        oldKeyVersion,
        newKeyVersion,
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Re-throw so BullMQ retries according to queue config, then routes to DLQ
      throw error;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { JobHandler } from '@package/queues';

import { AddressKeyRotationService } from '../services/address-key-rotation.service';

import type { Job } from 'bullmq';

/**
 * BullMQ queue name for address key rotation jobs.
 *
 * - Producer (manual path): UserAddressesAdminController — admin-triggered via POST /api/v1/users/addresses/rotate-key.
 * - Consumer: AddressKeyRotationJob (this file).
 */
export const ADDRESS_KEY_ROTATION_QUEUE = 'address-key-rotation';

/**
 * Job payload for address key rotation.
 *
 * ## P0 Security
 * - NEVER include encrypted values, key material, or PII in this payload.
 * - `oldKeyId` / `newKeyId` are KMS key resource identifiers (not key material).
 * - `organizationId` scopes all rotation operations to the owning tenant.
 */

/**
 * Trigger source for address key rotation jobs.
 * Used in job payloads and audit logs to distinguish initiation paths.
 */
// eslint-disable-next-line no-restricted-syntax
export const enum RotationTriggerSource {
  Manual = 'manual',
  Scheduled = 'scheduled',
  PubSub = 'pubsub'
}

export interface AddressKeyRotationJobPayload {
  /** Tenant (organization) ID — scopes the rotation to a single tenant. */
  organizationId: number;
  /** Old KMS key resource ID being rotated from. Not key material. */
  oldKeyId: string;
  /** New KMS key resource ID being rotated to. Not key material. */
  newKeyId: string;
  /** Actor performing rotation. Undefined means a system (automated) actor. */
  actorId?: number;
  /** Trigger source for audit trail and observability. */
  triggerSource: RotationTriggerSource;
  /** Optional inbound request ID for end-to-end trace continuity. */
  requestId?: string;
  /** Optional correlation ID for distributed tracing across services. */
  correlationId?: string;
  /** Optional causation ID for distributed tracing across services. */
  causationId?: string;
}

/**
 * BullMQ job processor for address encrypted-store key rotation.
 *
 * Processes rotation jobs from the `address-key-rotation` queue.
 * Supports distributed execution across multiple container instances via BullMQ
 * distributed locking (concurrency=1 ensures one job at a time per worker).
 * Job state is persisted to the `key_rotation_state` table by `AddressKeyRotationService`
 * for restart recovery on container failure.
 *
 * ## Architecture
 * ```
 * Rotation trigger
 *                       ↓
 *               BullMQ Queue: address-key-rotation
 *                       ↓
 *               AddressKeyRotationJob.process()   ← this class
 *                       ↓
 *               AddressKeyRotationService.rotateVaultEntries()
 *                       ↓
 *               encryptedStore_entries (re-encrypted DEKs)
 * ```
 *
 * ## P0 Security
 * - All service calls include `organizationId` for tenant isolation.
 * - No PII, encrypted values, or key material appear in any log output.
 * - Authorization is enforced at the producer side.
 *
 * @see AddressKeyRotationService for the rotation implementation and state persistence.
 * @see TriggerKeyRotationDto for the admin HTTP request DTO.
 */
@Injectable()
export class AddressKeyRotationJob {
  private readonly logger = new Logger(AddressKeyRotationJob.name);

  constructor(private readonly rotationService: AddressKeyRotationService) {}

  /**
   * Process an address key rotation job.
   *
   * Called automatically by BullMQ when a job is dequeued.
   * Reports progress (0 → 100) for external status tracking.
   * Re-throws errors so BullMQ can apply retry / dead-letter logic.
   *
   * @param job - BullMQ job containing rotation parameters (no PII).
   * @throws Re-throws any error from the rotation service to trigger BullMQ retry/DLQ.
   */
  @JobHandler({
    queueName: ADDRESS_KEY_ROTATION_QUEUE,
    jobName: 'rotate-address-key',
    concurrency: 1 // BullMQ distributed locking; only one job processed at a time per worker
  })
  async process(job: Job<AddressKeyRotationJobPayload>): Promise<void> {
    const {
      organizationId,
      oldKeyId,
      newKeyId,
      actorId,
      triggerSource,
      requestId,
      correlationId,
      causationId
    } = job.data;

    // P0: Log IDs and metadata only — no encrypted values, no PII
    this.logger.log({
      message: 'Processing address key rotation job',
      jobId: job.id,
      organizationId,
      oldKeyId,
      newKeyId,
      triggerSource,
      requestId,
      correlationId,
      causationId,
      attemptsMade: job.attemptsMade
    });

    await job.updateProgress(0);

    try {
      const result = await this.rotationService.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        requestId,
        correlationId,
        causationId
      });

      await job.updateProgress(100);

      // P0: Log counts and status only — no PII
      this.logger.log({
        message: 'Address key rotation job completed',
        jobId: job.id,
        organizationId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        totalCount: result.totalCount,
        isComplete: result.isComplete,
        requestId,
        correlationId
      });

      if (result.failedCount > 0) {
        this.logger.warn({
          message: 'Address key rotation completed with partial failures — manual review required',
          jobId: job.id,
          organizationId,
          failedCount: result.failedCount,
          totalCount: result.totalCount,
          requestId,
          correlationId
        });
      }
    } catch (error) {
      // P0: Log error message only — no stack frames containing PII, no key material
      this.logger.error({
        message: 'Address key rotation job failed',
        jobId: job.id,
        organizationId,
        oldKeyId,
        newKeyId,
        triggerSource,
        requestId,
        correlationId,
        causationId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Re-throw so BullMQ retries according to queue config, then routes to DLQ
      throw error;
    }
  }
}

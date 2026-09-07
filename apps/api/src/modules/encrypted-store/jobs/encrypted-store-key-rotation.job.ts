/**
 * @fileoverview Vault key rotation job
 *
 * BullMQ job processor for re-encrypting ALL vault entries when a KMS key
 * rotation occurs. This job is queued by the internal rotation orchestrator
 * after a manual request or a scheduled KMS poll detects a version change.
 *
 * ## Architecture
 * ```
 * KMS rotation trigger
 *                      ↓
 *     KmsRotationOrchestratorService.orchestrateRotation()
 *                      ↓
 *              Queue BullMQ job
 *                      ↓
 *         EncryptedStoreKeyRotationJob processes
 *                      ↓
 *         EncryptedStoreService.rotateKey()
 * ```
 *
 * ## P0 Security
 * - No PII, encrypted values, or key material in logs
 * - organizationId from event scopes all rotation operations to tenant
 * - Job payload contains only IDs and metadata, not sensitive data
 *
 * @module modules/encrypted-store/jobs/vault-key-rotation.job
 */

import { Injectable, Logger } from '@nestjs/common';
import { withSpan } from '@package/core';
import { JobHandler, addJob, createQueue } from '@package/queues';

import { EncryptedStoreService } from '../encrypted-store.service';

import type { Span } from '@opentelemetry/api';
import type { Job } from 'bullmq';

/**
 * Rotation trigger source
 */
export enum RotationTriggerSource {
  /** Legacy Pub/Sub trigger source retained for payload compatibility */
  PubSub = 'pubsub',
  /** Manual rotation triggered by admin */
  Manual = 'manual',
  /** Scheduled rotation check */
  Scheduled = 'scheduled'
}

/**
 * Vault key rotation job payload
 *
 * Contains only metadata and IDs - no PII, encrypted values, or key material.
 */
export interface VaultKeyRotationJobPayload {
  /** Organization (tenant) ID - scopes rotation to this tenant */
  organizationId: number;

  /** Old KMS key ID being rotated from */
  oldKeyId: string;

  /** New KMS key ID being rotated to */
  newKeyId: string;

  /** What triggered this rotation */
  triggerSource: RotationTriggerSource;

  /** Optional correlation ID for distributed tracing */
  correlationId?: string;

  /** Optional request ID from an upstream traced request */
  requestId?: string;

  /** Optional direct-cause ID from an upstream traced request or job */
  causationId?: string;

  /** User ID who triggered the rotation (undefined for system-triggered) */
  actorId?: number;
}

/**
 * Queue name for vault key rotation jobs
 */
export const ENCRYPTED_STORE_KEY_ROTATION_QUEUE = 'encrypted-store-key-rotation';
export const VAULT_KEY_ROTATION_DLQ = `${ENCRYPTED_STORE_KEY_ROTATION_QUEUE}:dead`;

/**
 * Vault key rotation job
 *
 * Processes BullMQ jobs to rotate encryption keys and re-encrypt ALL vault entries
 * for a tenant. This job is triggered by:
 * 1. Admin manual rotation requests
 * 2. Scheduled rotation checks
 *
 * ## Error Handling
 * - Transient errors: Job is retried by BullMQ with exponential backoff
 * - Permanent errors: Job is moved to dead letter queue (DLQ)
 *
 * ## P0 Security
 * - Logs only contain IDs, timestamps, and status (no PII)
 * - Job payload contains only metadata, not sensitive data
 * - organizationId ensures tenant-scoped rotation
 */
@Injectable()
export class EncryptedStoreKeyRotationJob {
  private readonly logger = new Logger(EncryptedStoreKeyRotationJob.name);
  private readonly jobName = 'EncryptedStoreKeyRotationJob';

  constructor(private readonly encryptedStoreService: EncryptedStoreService) {}

  private async enqueueDeadLetterJob(
    job: Job<VaultKeyRotationJobPayload>,
    error: unknown
  ): Promise<void> {
    createQueue({
      name: VAULT_KEY_ROTATION_DLQ
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    const dlqJobId = `dlq-${job.id ?? `org-${job.data.organizationId}`}-${job.attemptsMade + 1}`;

    await addJob({
      queueName: VAULT_KEY_ROTATION_DLQ,
      jobName: 'rotate-encrypted-store-key-dead-letter',
      data: {
        organizationId: job.data.organizationId,
        oldKeyId: job.data.oldKeyId,
        newKeyId: job.data.newKeyId,
        triggerSource: job.data.triggerSource,
        requestId: job.data.requestId,
        correlationId: job.data.correlationId,
        causationId: job.data.causationId,
        actorId: job.data.actorId,
        failedJobId: job.id,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts ?? 1,
        failedAt: new Date().toISOString(),
        error: errorMessage
      },
      options: {
        jobId: dlqJobId,
        attempts: 1,
        removeOnFail: false
      }
    });
  }

  /**
   * Process vault key rotation job
   *
   * Re-encrypts ALL vault entries for the tenant using the new key.
   * This operation is idempotent - safe to retry if interrupted.
   *
   * @param job - BullMQ job with rotation metadata
   * @throws Re-throws errors to trigger BullMQ retry/DLQ
   */
  @JobHandler({
    queueName: ENCRYPTED_STORE_KEY_ROTATION_QUEUE,
    jobName: 'rotate-encrypted-store-key',
    concurrency: 1 // Only one rotation per tenant at a time
  })
  async process(job: Job<VaultKeyRotationJobPayload>): Promise<void> {
    const data = job.data;

    return withSpan(`${this.jobName}.process`, async (span: Span) => {
      span.setAttributes({
        'vault.rotation.organizationId': String(data.organizationId),
        'vault.rotation.oldKeyId': data.oldKeyId,
        'vault.rotation.newKeyId': data.newKeyId,
        'vault.rotation.triggerSource': data.triggerSource,
        'vault.rotation.correlationId': data.correlationId ?? 'none'
      });

      // P0: Log only IDs and metadata (no PII, no key material)
      this.logger.log({
        message: 'Processing vault key rotation job',
        organizationId: data.organizationId,
        oldKeyId: data.oldKeyId,
        newKeyId: data.newKeyId,
        triggerSource: data.triggerSource,
        correlationId: data.correlationId
      });

      try {
        // Use actorId from job if provided, otherwise use system user (0)
        const actorId = data.actorId ?? 0;

        // Rotate key using EncryptedStoreService (handles vault entries scoped to oldKeyId)
        await this.encryptedStoreService.rotateKey({
          tenantId: data.organizationId,
          actorId,
          oldKeyId: data.oldKeyId,
          newKeyId: data.newKeyId,
          requestId: data.requestId,
          correlationId: data.correlationId,
          causationId: data.causationId,
          emitAuditEvent: true,
          triggerSource: data.triggerSource
        });

        // P0: Log only success status (no PII)
        this.logger.log({
          message: 'Vault key rotation completed successfully',
          organizationId: data.organizationId,
          oldKeyId: data.oldKeyId,
          newKeyId: data.newKeyId,
          triggerSource: data.triggerSource
        });

        span.setStatus({ code: 1 }); // OK
      } catch (error) {
        const isLastAttempt = job.attemptsMade >= (job.opts?.attempts ?? 1) - 1;
        span.setAttributes({
          'vault.rotation.retry.exhausted': String(isLastAttempt),
          'vault.rotation.attempts.made': String(job.attemptsMade),
          'vault.rotation.attempts.max': String(job.opts?.attempts ?? 1)
        });
        if (isLastAttempt) {
          try {
            await this.enqueueDeadLetterJob(job, error);
          } catch (dlqError) {
            this.logger.error({
              message: 'Failed to enqueue vault key rotation dead-letter job',
              jobId: job.id,
              organizationId: data.organizationId,
              oldKeyId: data.oldKeyId,
              newKeyId: data.newKeyId,
              correlationId: data.correlationId,
              error: dlqError instanceof Error ? dlqError.message : String(dlqError)
            });
          }
        }

        this.logger.error({
          message: isLastAttempt
            ? 'Vault key rotation exhausted all retry attempts – job will enter failed/DLQ state'
            : 'Vault key rotation attempt failed – BullMQ will retry',
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts?.attempts ?? 1,
          isLastAttempt,
          organizationId: data.organizationId,
          oldKeyId: data.oldKeyId,
          newKeyId: data.newKeyId,
          correlationId: data.correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
        span.setStatus({
          code: 2,
          message: error instanceof Error ? error.message : String(error)
        });

        // Re-throw to trigger BullMQ retry or move to DLQ
        throw error;
      }
    });
  }
}

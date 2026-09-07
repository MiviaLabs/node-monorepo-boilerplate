import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gt, organizations } from '@package/db-core';
import { addJob, createQueue } from '@package/queues';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '../../../common/database/database.constants';
import {
  INLINE_FIELD_ROTATION_QUEUE,
  type InlineFieldRotationJobData
} from '../../auth/jobs/inline-field-rotation.job';
import {
  RotationTriggerSource,
  ENCRYPTED_STORE_KEY_ROTATION_QUEUE,
  type VaultKeyRotationJobPayload
} from '../jobs/encrypted-store-key-rotation.job';
import { normalizeEncryptedStoreKeyId } from '../key-id-normalization.util';

export interface KmsRotationOrchestratorInput {
  oldKeyVersion: string;
  newKeyVersion: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  triggerSource: RotationTriggerSource;
}

export interface TenantRotationQueueInput {
  tenantId: number;
  oldKeyId: string;
  newKeyId: string;
  actorId?: number;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  triggerSource: RotationTriggerSource;
}

@Injectable()
export class KmsRotationOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(KmsRotationOrchestratorService.name);
  private static readonly BATCH_SIZE = 100;

  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  onModuleInit(): void {
    this.ensureQueuesExist();
  }

  async orchestrateRotation(input: KmsRotationOrchestratorInput): Promise<void> {
    this.ensureQueuesExist();

    const normalizedOldKeyVersion = normalizeEncryptedStoreKeyId(input.oldKeyVersion);
    const normalizedNewKeyVersion = normalizeEncryptedStoreKeyId(input.newKeyVersion);

    let lastId = 0;
    let totalTenants = 0;
    let queuedTenantJobs = 0;
    let duplicateTenantJobs = 0;

    while (true) {
      const batch = await this.db
        .select({ organizationId: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.isActive, true), gt(organizations.id, lastId)))
        .orderBy(asc(organizations.id))
        .limit(KmsRotationOrchestratorService.BATCH_SIZE);

      if (batch.length === 0) {
        break;
      }

      const enqueueResults = await Promise.all(
        batch.map(async (tenant) =>
          this.queueRotationJob({
            organizationId: tenant.organizationId,
            oldKeyId: normalizedOldKeyVersion,
            newKeyId: normalizedNewKeyVersion,
            requestId: input.requestId,
            correlationId: input.correlationId,
            causationId: input.causationId,
            triggerSource: input.triggerSource
          })
        )
      );

      totalTenants += batch.length;
      queuedTenantJobs += enqueueResults.filter((result) => result === 'queued').length;
      duplicateTenantJobs += enqueueResults.filter((result) => result === 'duplicate').length;
      const lastTenant = batch.at(-1);
      if (!lastTenant) {
        break;
      }
      lastId = lastTenant.organizationId;
    }

    if (totalTenants === 0) {
      this.logger.log({
        message: 'No active tenants found for KMS rotation orchestration',
        oldKeyVersion: normalizedOldKeyVersion,
        newKeyVersion: normalizedNewKeyVersion,
        triggerSource: input.triggerSource,
        correlationId: input.correlationId
      });
      return;
    }

    const inlineFieldResult = await this.queueInlineFieldRotation(
      normalizedOldKeyVersion,
      normalizedNewKeyVersion,
      input.correlationId
    );

    this.logger.log({
      message: 'KMS rotation orchestration completed',
      oldKeyVersion: normalizedOldKeyVersion,
      newKeyVersion: normalizedNewKeyVersion,
      triggerSource: input.triggerSource,
      correlationId: input.correlationId,
      affectedTenantCount: totalTenants,
      queuedTenantJobs,
      duplicateTenantJobs,
      inlineFieldJobStatus: inlineFieldResult
    });
  }

  async queueTenantRotation(input: TenantRotationQueueInput): Promise<void> {
    this.ensureQueuesExist();

    await this.queueRotationJob({
      organizationId: input.tenantId,
      oldKeyId: normalizeEncryptedStoreKeyId(input.oldKeyId),
      newKeyId: normalizeEncryptedStoreKeyId(input.newKeyId),
      actorId: input.actorId,
      requestId: input.requestId,
      correlationId: input.correlationId,
      causationId: input.causationId,
      triggerSource: input.triggerSource
    });
  }

  private ensureQueuesExist(): void {
    createQueue({
      name: ENCRYPTED_STORE_KEY_ROTATION_QUEUE
    });
    createQueue({
      name: INLINE_FIELD_ROTATION_QUEUE
    });
  }

  private isDuplicateJobError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const normalized = error.message.toLowerCase();
    return (
      (normalized.includes('job') &&
        normalized.includes('already') &&
        normalized.includes('exist')) ||
      (normalized.includes('job') &&
        normalized.includes('already') &&
        normalized.includes('waiting'))
    );
  }

  private async queueRotationJob(event: {
    organizationId: number;
    oldKeyId: string;
    newKeyId: string;
    actorId?: number;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    triggerSource: RotationTriggerSource;
  }): Promise<'queued' | 'duplicate'> {
    const jobPayload: VaultKeyRotationJobPayload = {
      organizationId: event.organizationId,
      oldKeyId: event.oldKeyId,
      newKeyId: event.newKeyId,
      triggerSource: event.triggerSource,
      actorId: event.actorId,
      requestId: event.requestId,
      correlationId: event.correlationId,
      causationId: event.causationId
    };

    const deterministicJobId = `kms-rotation-${event.organizationId}-${event.oldKeyId}-${event.newKeyId}`;

    try {
      await addJob({
        queueName: ENCRYPTED_STORE_KEY_ROTATION_QUEUE,
        jobName: 'rotate-encrypted-store-key',
        data: jobPayload,
        options: {
          jobId: deterministicJobId,
          priority: 5,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnFail: false
        }
      });
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        this.logger.debug({
          message: 'Rotation job already queued - treating as idempotent duplicate delivery',
          jobId: deterministicJobId,
          organizationId: event.organizationId,
          oldKeyId: event.oldKeyId,
          newKeyId: event.newKeyId,
          correlationId: event.correlationId,
          triggerSource: event.triggerSource
        });
        return 'duplicate';
      }
      throw error;
    }

    this.logger.debug({
      message: 'Queued vault key rotation job',
      jobId: deterministicJobId,
      organizationId: event.organizationId,
      triggerSource: event.triggerSource,
      correlationId: event.correlationId
    });

    return 'queued';
  }

  private async queueInlineFieldRotation(
    oldKeyVersion: string,
    newKeyVersion: string,
    correlationId?: string
  ): Promise<'queued' | 'duplicate'> {
    const jobData: InlineFieldRotationJobData = {
      oldKeyVersion,
      newKeyVersion,
      correlationId
    };

    const deterministicJobId = `inline-rotation-${oldKeyVersion}-${newKeyVersion}`;

    try {
      await addJob({
        queueName: INLINE_FIELD_ROTATION_QUEUE,
        jobName: 'rotate-inline-fields',
        data: jobData,
        options: {
          jobId: deterministicJobId,
          priority: 5,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnFail: false
        }
      });
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        this.logger.debug({
          message:
            'Inline field rotation job already queued - treating as idempotent duplicate delivery',
          jobId: deterministicJobId,
          oldKeyVersion,
          newKeyVersion,
          correlationId
        });
        return 'duplicate';
      }
      throw error;
    }

    this.logger.debug({
      message: 'Queued inline field rotation job',
      jobId: deterministicJobId,
      oldKeyVersion,
      newKeyVersion,
      correlationId
    });

    return 'queued';
  }
}

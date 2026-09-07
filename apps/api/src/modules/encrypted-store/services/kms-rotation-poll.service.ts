import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, kmsRotationCheckpoint } from '@package/db-core';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '../../../common/database/database.constants';
import { RotationTriggerSource } from '../jobs/encrypted-store-key-rotation.job';
import { normalizeEncryptedStoreKeyId } from '../key-id-normalization.util';
import { EncryptedStoreKeyService } from '../encrypted-store-key.service';
import { KmsRotationOrchestratorService } from './kms-rotation-orchestrator.service';

export const enum KmsRotationPollStatus {
  Initialized = 'initialized',
  Noop = 'noop',
  Rotated = 'rotated',
  Unavailable = 'unavailable'
}

export interface KmsRotationPollResult {
  status: KmsRotationPollStatus;
  keyName: string;
  observedVersion?: string;
  previousVersion?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

@Injectable()
export class KmsRotationPollService {
  private readonly logger = new Logger(KmsRotationPollService.name);
  private static readonly CHECKPOINT_KEY_NAME = 'primary-encryption-key';
  private static readonly VERSION_PATH_MARKER = '/cryptoKeyVersions/';

  constructor(
    @Inject(MAIN_DB) private readonly db: NodePgDatabase,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService,
    private readonly kmsRotationOrchestrator: KmsRotationOrchestratorService
  ) {}

  async pollForRotation(
    traceOrCorrelationId?:
      | string
      | {
          readonly requestId?: string;
          readonly correlationId?: string;
          readonly causationId?: string;
        }
  ): Promise<KmsRotationPollResult> {
    const trace =
      typeof traceOrCorrelationId === 'string'
        ? { correlationId: traceOrCorrelationId, causationId: traceOrCorrelationId }
        : traceOrCorrelationId;
    const requestId = trace?.requestId;
    const correlationId = trace?.correlationId;
    const causationId = trace?.causationId ?? correlationId;
    const now = new Date();
    let keyName = KmsRotationPollService.CHECKPOINT_KEY_NAME;
    let observedVersion: string;

    try {
      const primaryKey = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();
      keyName = primaryKey.keyId ?? KmsRotationPollService.CHECKPOINT_KEY_NAME;
      observedVersion = normalizeEncryptedStoreKeyId(primaryKey.keyVersion);
    } catch (error) {
      this.logger.warn({
        message:
          'KMS rotation poll skipped because the current primary version could not be loaded',
        keyName,
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: KmsRotationPollStatus.Unavailable,
        keyName,
        requestId,
        correlationId,
        causationId
      };
    }

    return this.db.transaction(async (tx) => {
      const insertedCheckpoint = await tx
        .insert(kmsRotationCheckpoint)
        .values({
          keyName,
          lastSeenVersion: observedVersion,
          lastCheckedAt: now,
          updatedAt: now
        })
        .onConflictDoNothing({
          target: [kmsRotationCheckpoint.keyName]
        })
        .returning({
          id: kmsRotationCheckpoint.id
        });

      const [checkpoint] = await tx
        .select()
        .from(kmsRotationCheckpoint)
        .where(eq(kmsRotationCheckpoint.keyName, keyName))
        .limit(1)
        .for('update');

      if (!checkpoint) {
        throw new Error(`Failed to load KMS rotation checkpoint for key ${keyName}`);
      }

      if (insertedCheckpoint.length > 0) {
        const bootstrapPreviousVersion = await this.detectBootstrapPreviousVersion(
          tx as NodePgDatabase,
          observedVersion
        );

        if (bootstrapPreviousVersion) {
          await this.kmsRotationOrchestrator.orchestrateRotation({
            oldKeyVersion: bootstrapPreviousVersion,
            newKeyVersion: observedVersion,
            requestId,
            correlationId,
            causationId,
            triggerSource: RotationTriggerSource.Scheduled
          });

          await tx
            .update(kmsRotationCheckpoint)
            .set({
              lastProcessedFromVersion: bootstrapPreviousVersion,
              lastProcessedToVersion: observedVersion,
              lastRotatedAt: now,
              updatedAt: now
            })
            .where(eq(kmsRotationCheckpoint.id, checkpoint.id));

          this.logger.log({
            message:
              'Initialized KMS rotation checkpoint and queued catch-up rotation for a pre-existing primary version change',
            keyName,
            previousVersion: bootstrapPreviousVersion,
            observedVersion,
            correlationId
          });

          return {
            status: KmsRotationPollStatus.Rotated,
            keyName,
            observedVersion,
            previousVersion: bootstrapPreviousVersion,
            requestId,
            correlationId,
            causationId
          };
        }

        this.logger.log({
          message: 'Initialized KMS rotation checkpoint from current primary version',
          keyName,
          observedVersion,
          correlationId
        });

        return {
          status: KmsRotationPollStatus.Initialized,
          keyName,
          observedVersion,
          requestId,
          correlationId,
          causationId
        };
      }

      const previousVersion = normalizeEncryptedStoreKeyId(checkpoint.lastSeenVersion);

      if (previousVersion === observedVersion) {
        await tx
          .update(kmsRotationCheckpoint)
          .set({
            lastCheckedAt: now,
            updatedAt: now
          })
          .where(eq(kmsRotationCheckpoint.id, checkpoint.id));

        this.logger.debug({
          message: 'KMS rotation poll detected no primary version change',
          keyName,
          observedVersion,
          correlationId
        });

        return {
          status: KmsRotationPollStatus.Noop,
          keyName,
          observedVersion,
          previousVersion,
          requestId,
          correlationId,
          causationId
        };
      }

      await this.kmsRotationOrchestrator.orchestrateRotation({
        oldKeyVersion: previousVersion,
        newKeyVersion: observedVersion,
        requestId,
        correlationId,
        causationId,
        triggerSource: RotationTriggerSource.Scheduled
      });

      await tx
        .update(kmsRotationCheckpoint)
        .set({
          lastSeenVersion: observedVersion,
          lastProcessedFromVersion: previousVersion,
          lastProcessedToVersion: observedVersion,
          lastCheckedAt: now,
          lastRotatedAt: now,
          updatedAt: now
        })
        .where(eq(kmsRotationCheckpoint.id, checkpoint.id));

      this.logger.log({
        message: 'KMS rotation poll detected a new primary version and queued rotation',
        keyName,
        previousVersion,
        observedVersion,
        correlationId
      });

      return {
        status: KmsRotationPollStatus.Rotated,
        keyName,
        observedVersion,
        previousVersion,
        requestId,
        correlationId,
        causationId
      };
    });
  }

  private async detectBootstrapPreviousVersion(
    tx: NodePgDatabase,
    observedVersion: string
  ): Promise<string | null> {
    if (!observedVersion.includes(KmsRotationPollService.VERSION_PATH_MARKER)) {
      return null;
    }

    const result = await tx.execute(sql<{ version: string }>`
      select distinct version
      from (
        select encryption_key_version as version
        from users
        where encryption_key_version <> ${observedVersion}
        union
        select encryption_key_version as version
        from user_identities
        where encryption_key_version <> ${observedVersion}
        union
        select encryption_key_version as version
        from invitations
        where encryption_key_version <> ${observedVersion}
        union
        select key_version as version
        from vault_entries
        where key_version is not null
          and key_version <> ${observedVersion}
      ) stale_versions
      limit 2
    `);

    const staleVersions = result.rows
      .map((row) => row['version'])
      .filter((version): version is string => Boolean(version))
      .map((version) => normalizeEncryptedStoreKeyId(version));

    if (staleVersions.length === 0) {
      return null;
    }

    if (staleVersions.length > 1) {
      throw new Error(
        `Detected multiple pre-existing KMS key versions without a checkpoint: ${staleVersions.join(', ')}`
      );
    }

    return staleVersions[0] ?? null;
  }
}

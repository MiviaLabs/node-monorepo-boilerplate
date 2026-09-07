import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNull,
  keyRotationState,
  NewKeyRotationState,
  ROTATION_STATUS,
  sql,
  type IRotationError,
  type KeyRotationState,
  type NodePgDatabase,
  type RotationStatus,
  encryptedStoreEntries
} from '@package/db-core';
import { DataMigrationService, EncryptionService } from '@package/encryption';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { buildUserAuditEvent } from '../events/user-audit-event';

/**
 * Rotation progress result
 *
 * Returned from rotateVaultEntries with summary statistics.
 */
export interface RotationProgress {
  /** Number of entries successfully rotated */
  processedCount: number;
  /** Number of entries that failed to rotate */
  failedCount: number;
  /** Total number of entries to rotate */
  totalCount: number;
  /** Whether rotation is complete */
  isComplete: boolean;
  /** Errors from failed rotations (continue-on-error mode) */
  errors: RotationError[];
}

/**
 * Result from rotateAddressKey command
 */
export interface RotateAddressKeyResult extends RotationProgress {
  /** ID of the created rotation state */
  rotationStateId: number;
}

/**
 * Result from resumeRotation command
 */
export interface ResumeRotationResult extends RotationProgress {
  /** ID of the resumed rotation state */
  rotationStateId: number;
}

/**
 * Rotation error detail
 *
 * Individual error from failed vault entry rotation.
 */
export interface RotationError {
  /** Vault entry ID that failed */
  entryId: number;
  /** Entity type (e.g., 'user_address') */
  entityType: string;
  /** Entity ID (e.g., address ID) */
  entityId: string;
  /** Field path that failed */
  fieldPath: string;
  /** Error message */
  error: string;
}

/**
 * Rotation configuration options
 *
 * Configurable options for key rotation operations.
 */
export interface RotationOptions {
  /** Number of entries to process per batch (default: 100) */
  batchSize?: number;
  /** Continue processing on errors instead of stopping (default: true) */
  continueOnError?: boolean;
  /** Whether to verify rotation by checking for stale entries (default: true) */
  verifyAfterRotation?: boolean;
  /** ID of user triggering rotation (for audit logging) */
  actorId?: number;
  /** Request-scoped trace metadata propagated from the caller. */
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Default rotation options
 */
const DEFAULT_ROTATION_OPTIONS: Pick<
  Required<RotationOptions>,
  'batchSize' | 'continueOnError' | 'verifyAfterRotation' | 'actorId'
> = {
  batchSize: 100,
  continueOnError: true,
  verifyAfterRotation: true,
  actorId: 0 // System actor
};

const ADDRESS_KEY_ROTATION_EVENT_TYPE = {
  INITIATED: 'user.address.key.rotation.initiated.audit',
  COMPLETED: 'user.address.key.rotation.completed.audit',
  FAILED: 'user.address.key.rotation.failed.audit',
  CANCELLED: 'user.address.key.rotation.cancelled.audit'
} as const;

/**
 * Rotation trigger type
 */
type RotationTriggerType = (typeof ROTATION_TRIGGER_TYPE)[keyof typeof ROTATION_TRIGGER_TYPE];

type AddressKeyRotationEventType =
  (typeof ADDRESS_KEY_ROTATION_EVENT_TYPE)[keyof typeof ADDRESS_KEY_ROTATION_EVENT_TYPE];

const ROTATION_TRIGGER_TYPE = {
  MANUAL: 'manual',
  RESUME: 'resume',
  CANCEL: 'cancel'
};

interface AddressKeyRotationAuditData {
  tenantId: string;
  rotationStateId: string;
  actorId: string;
  processedCount: number;
  failedCount: number;
  totalCount: number;
  status: RotationStatus;
  triggerType: RotationTriggerType;
  timestamp: string;
}

/**
 * Address Key Rotation Service
 *
 * Service for rotating vault encryption keys for user address PII.
 * Extends the DataMigrationService pattern with address-specific vault operations.
 *
 * ## Purpose
 *
 * When KMS keys are rotated, all vault entries encrypted with the old key must be
 * re-encrypted with the new key. This service handles that rotation for user address
 * vault entries with the following features:
 *
 * - **Resumable Operations**: State persisted to key_rotation_state table for recovery
 * - **Batch Processing**: Processes entries in configurable batches (default: 100)
 * - **Continue-on-Error**: Collects errors but doesn't stop rotation
 * - **Verification**: Post-rotation count check for stale old-key entries
 * - **Multi-tenancy**: All operations scoped to organizationId
 * - **Audit Logging**: Emits events without PII exposure
 *
 * ## Architecture Note: Direct Database Access
 *
 * This service uses direct database access (`this.db`) instead of the repository pattern
 * for performance-critical batch operations. This is an intentional deviation from the
 * standard pattern for the following reasons:
 *
 * 1. **Cursor-based pagination**: The rotation queries use cursor-based streaming
 *    (see `streamEntriesWithCursor`) optimized for processing large datasets without
 *    loading all records into memory.
 *
 * 2. **Row-level locking**: Uses `SELECT FOR UPDATE SKIP LOCKED` pattern for distributed-safe
 *    batch processing across multiple application containers (see `processRotationBatch`).
 *
 * 3. **Batched CASE updates**: Uses SQL CASE expressions for bulk updates instead of
 *    individual UPDATE statements, significantly reducing database round-trips.
 *
 * 4. **Transaction control**: Requires fine-grained transaction management for atomic
 *    progress tracking alongside vault entry updates.
 *
 * **TODO**: Consider creating `EncryptedStoreEntryRepository` extending `BaseRepository` for
 * better testability and centralized query logic. This would require refactoring the
 * batch processing methods to work with repository abstractions while maintaining
 * the performance characteristics of the current implementation.
 *
 * @see BaseRepository - Standard repository pattern for CRUD operations
 *
 * ## Key Design Decisions
 *
 * 1. **State Persistence**: Rotation state stored in key_rotation_state table for recovery
 * 2. **Batch Size**: 100 entries per batch (configurable)
 * 3. **Continue-on-Error**: Collect errors but don't stop rotation
 * 4. **Verification**: Post-rotation count check for stale old-key entries
 *
 * ## Usage
 *
 * ```typescript
 * // Start a rotation operation
 * const progress = await addressKeyRotationService.rotateVaultEntries({
 *   organizationId: 1,
 *   oldKeyId: 'primary-encryption-key',
 *   newKeyId: 'tenant-123-rotated-1701234567890',
 *   actorId: userId
 * });
 *
 * // Resume a rotation after interruption (with tenant scoping)
 * const resumed = await addressKeyRotationService.resumeRotation(organizationId, rotationStateId, userId);
 *
 * // Get rotation status
 * const status = await addressKeyRotationService.getRotationStatus(organizationId, rotationStateId);
 * ```
 *
 * @example Rotation triggered by Pub/Sub message
 * ```typescript
 * // Pub/Sub message handler
 * subscription.on('message', async (message) => {
 *   const data = JSON.parse(message.data.toString());
 *
 *   await addressKeyRotationService.rotateVaultEntries({
 *     organizationId: data.organizationId,
 *     oldKeyId: data.oldKeyId,
 *     newKeyId: data.newKeyId,
 *     actorId: data.actorId
 *   });
 *
 *   message.ack();
 * });
 * ```
 *
 * @see EncryptedStoreService - Used for vault entry retrieval and storage
 * @see EncryptionService - Used for key rotation operations
 * @see UserAddressRepository - Repository being rotated
 */
@Injectable()
export class AddressKeyRotationService extends DataMigrationService {
  private readonly logger = new Logger(AddressKeyRotationService.name);
  // DbType alias for injected database with schema
  private readonly db: NodePgDatabase;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    @Inject('MAIN_DB' as string) db: NodePgDatabase,
    private readonly encryption: EncryptionService,
    private readonly outboxRepo: OutboxRepository
  ) {
    super((providerName?: string) => encryption.getProvider(providerName));
    this.db = db;
  }

  /**
   * Rotate all vault entries for user addresses from old key to new key.
   *
   * ## Process
   *
   * 1. Create rotation state record in key_rotation_state table
   * 2. Query vault_entries by organizationId and oldKeyId (entityType='user_address')
   * 3. Process entries in batches (configurable size)
   * 4. For each entry:
   *    - Retrieve and decrypt data with old key
   *    - Re-encrypt with new key using EncryptionService.rotateKey()
   *    - Update vault_entries with new encryptedDataKey, keyId, and rotatedAt
   * 5. Update rotation state progress after each batch
   * 6. Verify rotation completed (no stale entries with old key)
   * 7. Mark rotation state as completed
   *
   * ## Error Handling
   *
   * - **Continue-on-error mode** (default): Collect errors but continue rotation
   * - **Stop-on-error mode**: Abort rotation on first error
   *
   * ## Resumable Operations
   *
   * If rotation is interrupted (container restart, crash), call
   * `resumeRotation(stateId)` to continue from last processed batch.
   *
   * @param params - Rotation parameters
   * @param params.organizationId - Organization ID (tenant) for scoping
   * @param params.oldKeyId - Old KMS key ID to rotate from
   * @param params.newKeyId - New KMS key ID to rotate to
   * @param params.actorId - ID of user triggering rotation (for audit logging)
   * @param params.options - Optional rotation configuration
   * @returns Rotation progress summary
   *
   * @example
   * ```typescript
   * const progress = await addressKeyRotationService.rotateVaultEntries({
   *   organizationId: 1,
   *   oldKeyId: 'primary-encryption-key',
   *   newKeyId: 'tenant-123-rotated',
   *   actorId: 456,
   *   options: {
   *     batchSize: 50,
   *     continueOnError: true
   *   }
   * });
   *
   * console.log(`Rotated ${progress.processedCount}/${progress.totalCount} entries`);
   * // Output: "Rotated 150/150 entries"
   * ```
   */
  // eslint-disable-next-line complexity
  async rotateVaultEntries(params: {
    organizationId: number;
    oldKeyId: string;
    newKeyId: string;
    actorId?: number;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    options?: RotationOptions;
  }): Promise<RotateAddressKeyResult> {
    const {
      organizationId,
      oldKeyId,
      newKeyId,
      actorId,
      requestId,
      correlationId,
      causationId,
      options
    } = params;
    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };

    this.logger.log(
      `Starting key rotation for tenant ${organizationId}: ${oldKeyId} -> ${newKeyId}`
    );

    // Step 1: Count total entries to rotate
    const result = await this.db
      .select({ count: count() })
      .from(encryptedStoreEntries)
      .where(
        and(
          eq(encryptedStoreEntries.organizationId, organizationId),
          eq(encryptedStoreEntries.keyId, oldKeyId),
          eq(encryptedStoreEntries.entityType, 'user_address')
        )
      );

    const totalCount = result[0]?.count ?? 0;

    if (totalCount === 0) {
      this.logger.warn(`No vault entries found for rotation with key ${oldKeyId}`);
      await this.publishRotationAuditEvent(
        this.db,
        ADDRESS_KEY_ROTATION_EVENT_TYPE.COMPLETED,
        {
          tenantId: String(organizationId),
          rotationStateId: '0',
          actorId: String(actorId ?? opts.actorId),
          processedCount: 0,
          failedCount: 0,
          totalCount: 0,
          status: ROTATION_STATUS.COMPLETED,
          triggerType: ROTATION_TRIGGER_TYPE.MANUAL,
          timestamp: new Date().toISOString()
        },
        { requestId, correlationId, causationId }
      );
      return {
        rotationStateId: 0,
        processedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isComplete: true,
        errors: []
      };
    }

    this.logger.debug(`Found ${totalCount} vault entries to rotate`);

    // Step 2: Create rotation state record (idempotent – concurrent workers may race on the
    // unique index: (organization_id, old_key_id, new_key_id)).
    const insertedState = await this.db
      .insert(keyRotationState)
      .values({
        organizationId,
        oldKeyId,
        newKeyId,
        status: ROTATION_STATUS.IN_PROGRESS,
        totalEntries: totalCount,
        processedEntries: 0,
        failedEntries: 0,
        errors: [],
        metadata: {
          batch_size: opts.batchSize,
          continue_on_error: opts.continueOnError,
          verify_enabled: opts.verifyAfterRotation,
          trigger_type: 'manual'
        }
      } as NewKeyRotationState)
      .onConflictDoNothing({
        target: [
          keyRotationState.organizationId,
          keyRotationState.oldKeyId,
          keyRotationState.newKeyId
        ]
      })
      .returning();

    let rotationState = insertedState[0];

    if (!rotationState) {
      // A concurrent worker already created the state row – fall back to SELECT.
      const [existingState] = await this.db
        .select()
        .from(keyRotationState)
        .where(
          and(
            eq(keyRotationState.organizationId, organizationId),
            eq(keyRotationState.oldKeyId, oldKeyId),
            eq(keyRotationState.newKeyId, newKeyId)
          )
        )
        .limit(1);
      rotationState = existingState;
    }

    if (!rotationState) {
      throw new Error('Failed to create rotation state: no rows returned');
    }

    this.logger.debug(`Created rotation state ${rotationState.id}`);

    if (insertedState[0]) {
      await this.publishRotationAuditEvent(
        this.db,
        ADDRESS_KEY_ROTATION_EVENT_TYPE.INITIATED,
        {
          tenantId: String(organizationId),
          rotationStateId: String(rotationState.id),
          actorId: String(actorId ?? opts.actorId),
          processedCount: 0,
          failedCount: 0,
          totalCount,
          status: ROTATION_STATUS.IN_PROGRESS,
          triggerType: ROTATION_TRIGGER_TYPE.MANUAL,
          timestamp: new Date().toISOString()
        },
        { requestId, correlationId, causationId }
      );
    }

    // Step 3: Process entries in batches using cursor-based streaming (PERF-001 fix)
    let processedCount = 0;
    let failedCount = 0;
    const errors: RotationError[] = [];
    let shouldStopRotation = false;

    await this.streamEntriesWithCursor(organizationId, oldKeyId, opts.batchSize, async (batch) => {
      // Stop processing if previous batch had errors in stop-on-error mode
      if (shouldStopRotation) {
        return;
      }

      this.logger.debug(`Processing batch of ${batch.length} entries`);

      // Process batch using helper method
      const batchResult = await this.processRotationBatch(
        batch,
        newKeyId,
        actorId ?? opts.actorId,
        opts.continueOnError,
        rotationState!.id
      );
      processedCount += batchResult.processed;
      failedCount += batchResult.failed;
      errors.push(...batchResult.errors);

      // Log any errors
      for (const error of batchResult.errors) {
        this.logger.error(`Failed to rotate vault entry ${error.entryId}: ${error.error}`);
      }

      // Stop rotation if stop-on-error mode and error occurred
      if (!opts.continueOnError && batchResult.errors.length > 0) {
        shouldStopRotation = true;
      }
    });

    // Step 4: Verify rotation completed (if enabled)
    let verificationPassed = true;
    if (opts.verifyAfterRotation) {
      verificationPassed = await this.verifyRotation(organizationId, oldKeyId);
      if (!verificationPassed) {
        this.logger.warn(
          `Rotation verification failed: found entries still using old key ${oldKeyId}`
        );
      }
    }

    // Step 5: Mark rotation state as completed or failed
    const finalStatus =
      failedCount > 0 && !opts.continueOnError
        ? ROTATION_STATUS.FAILED
        : verificationPassed
          ? ROTATION_STATUS.COMPLETED
          : ROTATION_STATUS.FAILED;

    const timestamp = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(keyRotationState)
        .set({
          status: finalStatus,
          processedEntries: processedCount,
          failedEntries: failedCount,
          errors: errors.map((e) => ({
            entryId: e.entryId,
            entityType: e.entityType,
            entityId: e.entityId,
            fieldPath: e.fieldPath,
            errorMessage: e.error,
            timestamp: timestamp.toISOString()
          })) as IRotationError[],
          completedAt: timestamp,
          updatedAt: timestamp
        })
        .where(eq(keyRotationState.id, rotationState.id));

      await this.publishRotationAuditEvent(
        tx,
        finalStatus === ROTATION_STATUS.COMPLETED
          ? ADDRESS_KEY_ROTATION_EVENT_TYPE.COMPLETED
          : ADDRESS_KEY_ROTATION_EVENT_TYPE.FAILED,
        {
          tenantId: String(organizationId),
          rotationStateId: String(rotationState.id),
          actorId: String(actorId ?? opts.actorId),
          processedCount,
          failedCount,
          totalCount,
          status: finalStatus,
          triggerType: ROTATION_TRIGGER_TYPE.MANUAL,
          timestamp: timestamp.toISOString()
        },
        { requestId, correlationId, causationId }
      );
    });

    this.logger.log(
      `Rotation ${rotationState.id} ${finalStatus}: ${processedCount}/${totalCount} processed, ${failedCount} failed`
    );

    return {
      rotationStateId: rotationState.id,
      processedCount,
      failedCount,
      totalCount,
      isComplete: finalStatus === ROTATION_STATUS.COMPLETED,
      errors
    };
  }

  /**
   * Resume a rotation operation that was interrupted.
   *
   * ## Process
   *
   * 1. Load rotation state by ID
   * 2. Verify state is 'in_progress'
   * 3. Continue processing from last cursor position
   * 4. Update progress as batches complete
   * 5. Mark as completed when all entries processed
   *
   * @param organizationId - Organization ID (tenant) for ownership verification
   * @param rotationStateId - Rotation state ID to resume
   * @param actorId - ID of user resuming rotation (for audit logging)
   * @param options - Optional rotation configuration
   * @returns Rotation progress summary
   *
   * @example
   * ```typescript
   * // Resume rotation with tenant scoping
   * const progress = await addressKeyRotationService.resumeRotation(
   *   organizationId,
   *   rotationStateId,
   *   userId
   * );
   *
   * console.log(`Resumed rotation: ${progress.processedCount}/${progress.totalCount}`);
   * ```
   */
  async resumeRotation(
    organizationId: number,
    rotationStateId: number,
    actorId: number,
    options?: RotationOptions
  ): Promise<RotationProgress> {
    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };

    // Load rotation state
    const [rotationState] = await this.db
      .select()
      .from(keyRotationState)
      .where(
        and(
          eq(keyRotationState.id, rotationStateId),
          eq(keyRotationState.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!rotationState) {
      throw Errors.databaserecordNotFound004({ entity: 'RotationState' });
    }

    if (rotationState.status !== ROTATION_STATUS.IN_PROGRESS) {
      throw Errors.businesscannotModifyEntity002({
        entity: 'RotationState',
        status: rotationState.status
      });
    }

    this.logger.log(`Resuming rotation ${rotationStateId} from cursor ${rotationState.lastCursor}`);

    const { oldKeyId, newKeyId, totalEntries, processedEntries, failedEntries } = rotationState;

    let currentProcessed = processedEntries;
    let currentFailed = failedEntries;
    const errors: RotationError[] =
      (rotationState.errors as unknown as RotationError[] | null) ?? [];
    let cursor = rotationState.lastCursor;

    // Continue processing from last cursor
    while (currentProcessed < totalEntries) {
      const batch = await this.getEntriesBatch(organizationId, oldKeyId, opts.batchSize, cursor);

      if (batch.length === 0) {
        break;
      }

      // Process batch using helper method
      const batchResult = await this.processRotationBatch(
        batch,
        newKeyId,
        actorId,
        opts.continueOnError,
        rotationStateId
      );
      currentProcessed += batchResult.processed;
      currentFailed += batchResult.failed;
      errors.push(...batchResult.errors);
      cursor = batchResult.cursor;

      if (!opts.continueOnError && batchResult.errors.length > 0) {
        break;
      }
    }

    // Verify rotation completed
    const verificationPassed = opts.verifyAfterRotation
      ? await this.verifyRotation(organizationId, oldKeyId)
      : true;

    // Mark rotation state as completed
    const finalStatus = verificationPassed ? ROTATION_STATUS.COMPLETED : ROTATION_STATUS.FAILED;

    const timestamp = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(keyRotationState)
        .set({
          status: finalStatus,
          processedEntries: currentProcessed,
          failedEntries: currentFailed,
          errors: errors.map((e) => ({
            entryId: e.entryId,
            entityType: e.entityType,
            entityId: e.entityId,
            fieldPath: e.fieldPath,
            errorMessage: e.error,
            timestamp: timestamp.toISOString()
          })) as IRotationError[],
          completedAt: timestamp,
          updatedAt: timestamp
        })
        .where(eq(keyRotationState.id, rotationStateId));

      await this.publishRotationAuditEvent(
        tx,
        finalStatus === ROTATION_STATUS.COMPLETED
          ? ADDRESS_KEY_ROTATION_EVENT_TYPE.COMPLETED
          : ADDRESS_KEY_ROTATION_EVENT_TYPE.FAILED,
        {
          tenantId: String(organizationId),
          rotationStateId: String(rotationStateId),
          actorId: String(actorId),
          processedCount: currentProcessed,
          failedCount: currentFailed,
          totalCount: totalEntries,
          status: finalStatus,
          triggerType: ROTATION_TRIGGER_TYPE.RESUME,
          timestamp: timestamp.toISOString()
        },
        {
          requestId: options?.requestId,
          correlationId: options?.correlationId,
          causationId: options?.causationId
        }
      );
    });

    this.logger.log(
      `Resumed rotation ${rotationStateId} ${finalStatus}: ${currentProcessed}/${totalEntries} processed`
    );

    return {
      processedCount: currentProcessed,
      failedCount: currentFailed,
      totalCount: totalEntries,
      isComplete: finalStatus === ROTATION_STATUS.COMPLETED,
      errors
    };
  }

  /**
   * Get rotation status by rotation state ID.
   *
   * @param organizationId - Organization ID (tenant) for ownership verification
   * @param rotationStateId - Rotation state ID
   * @returns Rotation state or null if not found
   */
  async getRotationStatus(
    organizationId: number,
    rotationStateId: number
  ): Promise<KeyRotationState | null> {
    const [state] = await this.db
      .select()
      .from(keyRotationState)
      .where(
        and(
          eq(keyRotationState.id, rotationStateId),
          eq(keyRotationState.organizationId, organizationId)
        )
      )
      .limit(1);

    return state ?? null;
  }

  /**
   * Get all active (in-progress) rotations for an organization.
   *
   * @param organizationId - Organization ID
   * @returns List of in-progress rotation states
   */
  async getActiveRotations(organizationId: number): Promise<KeyRotationState[]> {
    return this.db
      .select()
      .from(keyRotationState)
      .where(
        and(
          eq(keyRotationState.organizationId, organizationId),
          eq(keyRotationState.status, ROTATION_STATUS.IN_PROGRESS)
        )
      )
      .orderBy(keyRotationState.createdAt);
  }

  /**
   * Cancel an in-progress rotation.
   *
   * @param organizationId - Organization ID (tenant) for ownership verification
   * @param rotationStateId - Rotation state ID to cancel
   * @param actorId - ID of user cancelling rotation (for audit logging)
   */
  async cancelRotation(
    organizationId: number,
    rotationStateId: number,
    actorId: number,
    options?: Pick<RotationOptions, 'requestId' | 'correlationId' | 'causationId'>
  ): Promise<void> {
    const [rotationState] = await this.db
      .select()
      .from(keyRotationState)
      .where(
        and(
          eq(keyRotationState.id, rotationStateId),
          eq(keyRotationState.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!rotationState) {
      throw Errors.databaserecordNotFound004({ entity: 'RotationState' });
    }

    if (rotationState.status !== ROTATION_STATUS.IN_PROGRESS) {
      throw Errors.businesscannotModifyEntity002({
        entity: 'RotationState',
        status: rotationState.status
      });
    }

    const timestamp = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(keyRotationState)
        .set({
          status: ROTATION_STATUS.CANCELLED,
          completedAt: timestamp,
          updatedAt: timestamp
        })
        .where(eq(keyRotationState.id, rotationStateId));

      await this.publishRotationAuditEvent(
        tx,
        ADDRESS_KEY_ROTATION_EVENT_TYPE.CANCELLED,
        {
          tenantId: String(rotationState.organizationId),
          rotationStateId: String(rotationState.id),
          actorId: String(actorId),
          processedCount: rotationState.processedEntries,
          failedCount: rotationState.failedEntries,
          totalCount: rotationState.totalEntries,
          status: ROTATION_STATUS.CANCELLED,
          triggerType: ROTATION_TRIGGER_TYPE.CANCEL,
          timestamp: timestamp.toISOString()
        },
        options
      );
    });

    this.logger.log(`Rotation ${rotationStateId} cancelled by user ${actorId}`);
  }

  /**
   * Process a batch of vault entries for rotation.
   *
   * ## Distributed-Safe Batch Processing
   *
   * Uses `SELECT FOR UPDATE SKIP LOCKED` pattern to enable safe parallel processing
   * across multiple application containers:
   *
   * 1. **Lock rows with SKIP LOCKED**: Each container locks and processes different rows
   * 2. **Re-encrypt keys in parallel**: CPU-intensive crypto operations outside transaction
   * 3. **Atomic updates in transaction**: Progress and vault entry updates are atomic
   *
   * ## Why SKIP LOCKED?
   *
   * - Other containers skip rows already locked by this container
   * - Prevents deadlocks and contention in distributed environment
   * - Enables horizontal scaling for large rotation jobs
   *
   * @param batch - Batch of vault entries to process
   * @param newKeyId - New key ID to rotate to
   * @param _actorId - ID of user performing rotation (reserved for future audit logging)
   * @param _continueOnError - Whether to continue on individual errors (reserved for future use)
   * @param rotationStateId - Rotation state ID for progress tracking
   * @returns Object with processed count, failed count, and new cursor
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async processRotationBatch(
    batch: Array<typeof encryptedStoreEntries.$inferSelect>,
    newKeyId: string,
    // Parameters retained for interface compatibility and future use
    // TODO: Use actorId for audit logging in outbox events
    _actorId: number,
    continueOnError: boolean,
    rotationStateId: number
  ): Promise<{
    processed: number;
    failed: number;
    errors: RotationError[];
    cursor: string | null;
  }> {
    if (batch.length === 0) {
      return { processed: 0, failed: 0, errors: [], cursor: null };
    }

    const organizationId = batch[0]?.organizationId ?? 0;

    // STEP 1: Rewrap DEKs (parallel safe – no DB access, no plaintext data exposed).
    // Perform CPU-intensive crypto operations OUTSIDE the transaction so the transaction
    // window stays short (fast DB-only operations only).
    const cryptoResults = await Promise.all(
      batch.map(async (entry) => {
        try {
          const encryptedDataKeyBuffer = Buffer.from(entry.encryptedDataKey, 'base64');
          const { encryptedDataKey: rotatedKey } = await this.encryption.reencryptDataKey(
            encryptedDataKeyBuffer,
            entry.keyId,
            newKeyId
          );

          // keyId stays as 'primary-encryption-key' (unversioned) - never changes
          // Only keyVersion tracks which KMS CryptoKeyVersion encrypted the DEK
          const keyVersion = newKeyId.includes('/cryptoKeyVersions/') ? newKeyId : null;

          return {
            success: true,
            id: entry.id,
            encryptedDataKey: rotatedKey.toString('base64'),
            keyVersion,
            rotatedAt: new Date(),
            updatedAt: new Date()
          };
        } catch (error) {
          return {
            success: false,
            id: entry.id,
            entityType: entry.entityType,
            entityId: String(entry.entityId),
            fieldPath: entry.fieldPath,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    // Index crypto results by entry ID for fast lookup inside the transaction.
    const cryptoById = new Map(cryptoResults.map((r) => [r.id, r]));

    // STEP 2: Lock rows AND apply updates in a single transaction.
    // The SELECT FOR UPDATE SKIP LOCKED is issued INSIDE the transaction so the
    // row-level locks are held until commit – making SKIP LOCKED effective across
    // concurrent workers (outside-transaction locks are released immediately).
    return this.db.transaction(async (tx) => {
      // Re-acquire the batch rows with row-level locks inside the transaction.
      // SKIP LOCKED: rows already locked by another worker are silently skipped.
      const lockedEntries = await tx
        .select()
        .from(encryptedStoreEntries)
        .where(
          and(
            inArray(
              encryptedStoreEntries.id,
              batch.map((e) => e.id)
            ),
            eq(encryptedStoreEntries.organizationId, organizationId)
          )
        )
        .for('update', { skipLocked: true }); // CRITICAL: lock held until transaction commits

      // If no rows locked (another container processed them), return empty result
      if (lockedEntries.length === 0) {
        this.logger.debug(`No entries locked – another container may have processed them`);
        return { processed: 0, failed: 0, errors: [], cursor: null };
      }

      // Separate locked entries into successful crypto-results and failures
      const successfulUpdates = lockedEntries
        .map((e) => cryptoById.get(e.id))
        .filter((r): r is NonNullable<typeof r> & { success: true } => r?.success === true);

      const failedUpdates = lockedEntries
        .map((e) => cryptoById.get(e.id))
        .filter((r): r is NonNullable<typeof r> & { success: false } => r?.success === false);

      // Build error list
      const errors: RotationError[] = failedUpdates.map((u) => ({
        entryId: u.id,
        entityType: u.entityType ?? 'user_address',
        entityId: u.entityId ?? '',
        fieldPath: u.fieldPath ?? '',
        error: u.error ?? 'Unknown error'
      }));

      // Update all successfully re-keyed vault entries in a SINGLE batched UPDATE.
      // PERFORMANCE: Batched CASE update instead of N individual UPDATEs.
      // NOTE: key_id is NOT updated – it remains 'primary-encryption-key' (unversioned) always.
      // Only key_version changes to track which version encrypted the DEK.
      if (successfulUpdates.length > 0) {
        await tx.execute(sql`
          UPDATE vault_entries
          SET
            encrypted_data_key = CASE id
              ${sql.join(
                successfulUpdates.map((u) => sql`WHEN ${u.id} THEN ${u.encryptedDataKey}`),
                sql` `
              )}
            END,
            key_version = CASE id
              ${sql.join(
                successfulUpdates.map((u) => sql`WHEN ${u.id} THEN ${u.keyVersion}`),
                sql` `
              )}
            END,
            rotated_at = CASE id
              ${sql.join(
                successfulUpdates.map((u) => sql`WHEN ${u.id} THEN ${u.rotatedAt}::timestamp`),
                sql` `
              )}
            END,
            updated_at = CASE id
              ${sql.join(
                successfulUpdates.map((u) => sql`WHEN ${u.id} THEN ${u.updatedAt}::timestamp`),
                sql` `
              )}
            END
          WHERE id IN (${sql.join(
            successfulUpdates.map((u) => sql`${u.id}`),
            sql`, `
          )})
            AND organization_id = ${organizationId}
        `);
      }

      // Determine safe cursor based on continueOnError setting:
      // - If continueOnError is true: advance cursor past all processed entries (including failures)
      //   to avoid infinite retry loops
      // - If continueOnError is false: regress cursor to before failed entry for retry on next run
      let safeCursor: string | null;
      if (failedUpdates.length > 0 && !continueOnError) {
        // Stop-on-error mode: regress cursor so failed entries can be retried
        const minFailedId = Math.min(...failedUpdates.map((u) => u.id));
        const safeCursorId = minFailedId - 1;
        safeCursor = safeCursorId > 0 ? safeCursorId.toString() : null;
      } else {
        // Continue-on-error mode or no failures: advance cursor past all locked entries
        const lastLockedEntry = lockedEntries[lockedEntries.length - 1];
        safeCursor = lastLockedEntry ? lastLockedEntry.id.toString() : null;
      }

      // Update progress atomically in same transaction
      await tx
        .update(keyRotationState)
        .set({
          processedEntries: sql`processed_entries + ${successfulUpdates.length}`,
          failedEntries: sql`failed_entries + ${failedUpdates.length}`,
          lastCursor: safeCursor,
          updatedAt: new Date()
        })
        .where(eq(keyRotationState.id, rotationStateId));

      this.logger.debug(
        `Batch processed: ${successfulUpdates.length} succeeded, ${failedUpdates.length} failed, cursor=${safeCursor}`
      );

      return {
        processed: successfulUpdates.length,
        failed: failedUpdates.length,
        errors,
        cursor: safeCursor
      };
    });
  }

  /**
   * Stream vault entries for rotation by fetching all rows in one query.
   *
   * PERFORMANCE FIX (PERF-001): Eliminates N+1 query pattern from self-draining pagination.
   * For 1M entries with batch size 100:
   * - Old approach: 10,000 SELECT queries (~20-50s overhead)
   * - New approach: 1 SELECT query + in-memory batching (~0.5-2s overhead)
   *
   * Memory optimization: Fetches rows as stream from PostgreSQL result set,
   * processes in batches, so only batchSize rows are in memory at once.
   *
   * NOTE: This fetch does NOT use FOR UPDATE because:
   * 1. Locks need to be held in separate transactions (processRotationBatch)
   * 2. Crypto operations are done outside transaction to minimize lock time
   * 3. Actual locking happens inside transaction in processRotationBatch()
   *
   * Multiple workers may fetch the same rows and do redundant crypto work,
   * but the second SELECT FOR UPDATE inside the transaction ensures only one
   * worker updates each row (others skip via SKIP LOCKED).
   *
   * @param organizationId - Organization ID for tenant scoping
   * @param oldKeyId - Old key ID to filter entries
   * @param batchSize - Number of entries to fetch per batch
   * @param onBatch - Callback to process each batch
   * @returns Total number of batches processed
   */
  private async streamEntriesWithCursor(
    organizationId: number,
    oldKeyId: string,
    batchSize: number,
    onBatch: (batch: Array<typeof encryptedStoreEntries.$inferSelect>) => Promise<void>
  ): Promise<number> {
    let batchCount = 0;
    let lastId = 0;

    while (true) {
      // TRUE cursor pagination - fetch only batchSize rows at a time
      const batch = await this.db
        .select()
        .from(encryptedStoreEntries)
        .where(
          and(
            eq(encryptedStoreEntries.organizationId, organizationId),
            eq(encryptedStoreEntries.keyId, oldKeyId),
            eq(encryptedStoreEntries.entityType, 'user_address'),
            gt(encryptedStoreEntries.id, lastId)
          )
        )
        .orderBy(asc(encryptedStoreEntries.id))
        .limit(batchSize);

      if (batch.length === 0) {
        break;
      }

      await onBatch(batch);
      batchCount++;
      lastId = batch[batch.length - 1]!.id;
    }

    return batchCount;
  }

  /**
   * Get a batch of vault entries to rotate (DEPRECATED: Use streamEntriesWithCursor).
   *
   * @deprecated Use streamEntriesWithCursor for better performance
   * @param organizationId - Organization ID for scoping
   * @param oldKeyId - Old key ID to filter entries
   * @param limit - Maximum number of entries to return
   * @param cursor - Optional cursor ID for pagination
   * @returns Vault entries to rotate (unlocked)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async getEntriesBatch(
    organizationId: number,
    oldKeyId: string,
    limit: number,
    cursor?: string | null
  ): Promise<Array<typeof encryptedStoreEntries.$inferSelect>> {
    const baseConditions = and(
      eq(encryptedStoreEntries.organizationId, organizationId),
      eq(encryptedStoreEntries.keyId, oldKeyId),
      eq(encryptedStoreEntries.entityType, 'user_address')
    );

    const cursorCondition = cursor ? gt(encryptedStoreEntries.id, Number(cursor)) : undefined;

    const finalCondition = cursorCondition ? and(baseConditions, cursorCondition) : baseConditions;

    // Drizzle query chaining produces complex types - disabling unsafe type rules
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    return this.db
      .select()
      .from(encryptedStoreEntries)
      .where(finalCondition)
      .limit(limit)
      .orderBy(asc(encryptedStoreEntries.id));
    // NO .for('update') here - see NOTE above
  }

  /**
   * Verify that all vault entries have been rotated.
   *
   * In single-key architecture:
   * - keyId stays constant ('primary-encryption-key')
   * - keyVersion tracks the specific KMS version
   * - Verification checks that no entries have null keyVersion after rotation
   *   (since rotation populates keyVersion with the new version)
   *
   * NOTE: This is a simplified verification. In production, you might want to:
   * - Track the old keyVersion before rotation
   * - Verify no entries still have the old keyVersion
   *
   * @param organizationId - Organization ID for scoping
   * @param _oldKeyId - Old key ID (unused in single-key architecture, keyId stays constant)
   * @returns true if no stale entries found, false otherwise
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async verifyRotation(organizationId: number, _oldKeyId: string): Promise<boolean> {
    // In single-key architecture, keyId remains 'primary-encryption-key' always.
    // We verify rotation by checking that all user_address entries have a keyVersion set.
    // Entries without keyVersion are pre-rotation entries that haven't been rotated yet.
    const result = await this.db
      .select({ count: count() })
      .from(encryptedStoreEntries)
      .where(
        and(
          eq(encryptedStoreEntries.organizationId, organizationId),
          eq(encryptedStoreEntries.entityType, 'user_address'),
          isNull(encryptedStoreEntries.keyVersion)
        )
      );

    const staleCount = result[0]?.count ?? 0;

    if (staleCount > 0) {
      this.logger.warn(`Found ${staleCount} vault entries without keyVersion - may need rotation`);
      return false;
    }

    return true;
  }

  private async publishRotationAuditEvent(
    tx: NodePgDatabase,
    eventType: AddressKeyRotationEventType,
    payload: AddressKeyRotationAuditData,
    trace?: Pick<RotationOptions, 'requestId' | 'correlationId' | 'causationId'>
  ): Promise<void> {
    const actionByEventType: Record<AddressKeyRotationEventType, string> = {
      [ADDRESS_KEY_ROTATION_EVENT_TYPE.INITIATED]: 'ROTATE_USER_ADDRESS_KEYS',
      [ADDRESS_KEY_ROTATION_EVENT_TYPE.COMPLETED]: 'COMPLETE_USER_ADDRESS_KEY_ROTATION',
      [ADDRESS_KEY_ROTATION_EVENT_TYPE.FAILED]: 'FAIL_USER_ADDRESS_KEY_ROTATION',
      [ADDRESS_KEY_ROTATION_EVENT_TYPE.CANCELLED]: 'CANCEL_USER_ADDRESS_KEY_ROTATION'
    };

    await this.outboxRepo.insert(
      tx,
      buildUserAuditEvent({
        eventType,
        tenantId: payload.tenantId,
        actorId: payload.actorId,
        requestId: trace?.requestId,
        aggregateId: payload.rotationStateId,
        action: actionByEventType[eventType],
        target: {
          entityType: 'address_key_rotation',
          entityId: payload.rotationStateId
        },
        details: {
          processedCount: payload.processedCount,
          failedCount: payload.failedCount,
          totalCount: payload.totalCount,
          status: payload.status,
          triggerType: payload.triggerType
        },
        correlationId: trace?.correlationId,
        causationId: trace?.causationId
      })
    );
  }
}

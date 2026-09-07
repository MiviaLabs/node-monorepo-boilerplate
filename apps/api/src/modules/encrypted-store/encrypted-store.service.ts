/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxStatus } from '@package/db-outbox';
import {
  AccessLogAction,
  encryptedStoreEntries,
  and,
  eq,
  keyRotationState,
  ROTATION_STATUS,
  sql
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';
import { OutboxRepository } from '@package/events';

import { buildEncryptedStoreAuditEvent } from './events';
import { normalizeEncryptedStoreKeyId } from './key-id-normalization.util';
import { EncryptedStoreKeyService } from './encrypted-store-key.service';
import { MAIN_DB } from '../../common/database/database.constants';

import type {
  NewEncryptedStoreEntry,
  EntityType,
  DataClassification,
  DataCategory,
  KeyRotationState,
  NewKeyRotationState
} from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Vault service options
 */
export interface VaultServiceOptions {
  readonly tenantId: number;
  readonly entityType: string;
  readonly entityId: number;
  readonly fieldPath: string;
  readonly value: string;
  readonly storedBy: number;
  readonly classification?: string;
  readonly tx?: NodePgDatabase; // Optional external transaction for atomicity
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly emitAuditEvent?: boolean;
}

/**
 * PII Vault Service
 *
 * Handles secure storage and retrieval of classified PII data using envelope encryption.
 * Uses a single primary encryption key shared across all tenants, with tenant isolation
 * maintained through unique DEKs (Data Encryption Keys) per vault entry.
 *
 * ## Key Architecture
 *
 * **Single Primary Key**: All tenants share `primary-encryption-key`
 * - **KEK (Key Encryption Key)**: GCP KMS `primary-encryption-key` (shared)
 * - **DEK (Data Encryption Key)**: Unique per vault entry (tenant-isolated)
 * - **Multi-tenancy**: Preserved via unique DEKs and database `organizationId` scoping
 *
 * ## Why Single Key?
 *
 * - **Cost**: $1/month vs $1M+/month for 1M tenant-specific keys
 * - **Simplicity**: One key to manage, rotate, and monitor
 * - **Security**: Tenant isolation via unique DEKs (not KEKs)
 *
 * ## Features
 *
 * - Envelope encryption with shared primary key from @package/encryption
 * - Automatic data classification using @package/types
 * - Transactional operations with outbox events via @package/events
 * - Access logging for compliance (SOC2, GDPR)
 * - Key rotation support with atomic re-encryption
 */
@Injectable()
export class EncryptedStoreService {
  private readonly logger = new Logger(EncryptedStoreService.name);

  constructor(
    // EncryptionService is available globally from EncryptionModule (@Global())
    private readonly encryption: EncryptionService,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService,
    private readonly outbox: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Store classified PII data in vault
   *
   * PERF-001 fix: Returns vault entry ID to eliminate separate SELECT query.
   * Callers can now capture the returned ID instead of querying for it.
   *
   * BUG-002 fix: Supports external transaction for atomicity across multiple operations.
   * If `tx` is provided in options, uses that transaction instead of creating a new one.
   * This allows vault storage to be part of a larger atomic operation (e.g., creating address with vault).
   *
   * @param options - Vault storage options (with optional tx for atomicity)
   * @returns {Promise<number>} The ID of the created vault entry
   */
  async store(options: VaultServiceOptions): Promise<number> {
    const {
      tenantId,
      entityType,
      entityId,
      fieldPath,
      value,
      storedBy,
      classification,
      tx: externalTx,
      requestId,
      correlationId,
      causationId,
      emitAuditEvent
    } = options;

    this.logger.debug(
      `Storing vault entry for tenant ${tenantId}, entity ${entityType}:${entityId}, field ${fieldPath}`
    );

    // Default to 'internal' classification if not provided
    const finalClassification: DataClassification =
      (classification as DataClassification) ?? 'internal';

    // Get primary encryption key ID with version (for version tracking)
    const { keyId, keyVersion } = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();

    // Envelope encryption - returns string values
    const envelopeResult = await this.encryption.encryptToBase64(value, {
      keyId
    });

    // Build access log entry
    const accessLogEntry = {
      timestamp: new Date().toISOString(),
      accessedBy: storedBy,
      action: AccessLogAction.STORED
    };

    // Use external transaction if provided (BUG-002 fix), otherwise create new transaction
    const transactionCallback = async (tx: NodePgDatabase): Promise<number> => {
      // PERF-002 fix: Include accessLog in initial INSERT instead of separate UPDATE
      const insertValues: NewEncryptedStoreEntry = {
        organizationId: tenantId,
        entityType: entityType as EntityType,
        entityId,
        fieldPath,
        ciphertext: envelopeResult.ciphertext,
        encryptedDataKey: envelopeResult.encryptedDataKey,
        iv: envelopeResult.iv,
        authTag: envelopeResult.authTag,
        keyId, // Primary encryption key (same for all tenants)
        keyVersion, // Version of key used for encryption (for precise decryption)
        classification: finalClassification,
        category: 'pii' as DataCategory,
        accessLog: [accessLogEntry] // Include initial access log entry directly
      };
      const [entry] = await tx.insert(encryptedStoreEntries).values(insertValues).returning();

      if (!entry) {
        throw new Error('Failed to create vault entry');
      }

      // Publish event to outbox
      await this.outbox.insert(tx, {
        eventId: randomUUID(),
        eventType: 'vault.entry.created',
        aggregateId: String(entry.id),
        aggregateVersion: '1',
        tenantId: String(tenantId),
        payload: JSON.stringify({
          tenantId,
          entityType,
          entityId,
          fieldPath,
          storedBy,
          classification: finalClassification
        }),
        correlationId,
        causationId,
        status: OutboxStatus.PENDING,
        createdAt: new Date()
      });

      if (emitAuditEvent) {
        await this.auditOutbox.insert(
          tx,
          buildEncryptedStoreAuditEvent({
            eventType: 'vault.entry.stored.audit',
            tenantId,
            actorId: String(storedBy),
            requestId,
            aggregateId: entry.id,
            action: 'STORE_VAULT_ENTRY',
            target: {
              entityType,
              entityId: String(entityId)
            },
            details: {
              classification: finalClassification,
              vaultEntryId: String(entry.id),
              category: 'pii'
            },
            correlationId,
            causationId
          })
        );
      }

      this.logger.log(`Vault entry ${entry.id} created for tenant ${tenantId}`);

      // PERF-001 fix: Return vault entry ID to eliminate separate SELECT query
      return entry.id;
    };

    // BUG-002 fix: Use external transaction if provided, otherwise create new transaction
    return externalTx ? transactionCallback(externalTx) : this.db.transaction(transactionCallback);
  }

  /**
   * Retrieve decrypted PII data from the vault
   */
  async retrieve(options: {
    readonly tenantId: number;
    readonly entityType: string;
    readonly entityId: number;
    readonly fieldPath: string;
    readonly requestedBy: number;
    readonly requestId?: string;
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly emitAuditEvent?: boolean;
  }): Promise<string> {
    const {
      tenantId,
      entityType,
      entityId,
      fieldPath,
      requestedBy,
      requestId,
      correlationId,
      causationId,
      emitAuditEvent
    } = options;

    this.logger.debug(
      `Retrieving vault entry for tenant ${tenantId}, entity ${entityType}:${entityId}, field ${fieldPath}`
    );

    return this.db.transaction(async (tx) => {
      // Lock matching row to avoid concurrent read/modify/write access-log races.
      const result = await tx.execute<{
        id: number;
        ciphertext: string;
        encryptedDataKey: string;
        iv: string;
        authTag: string;
        keyId: string;
        keyVersion: string | null;
      }>(sql`
        SELECT
          ${encryptedStoreEntries.id} as "id",
          ${encryptedStoreEntries.ciphertext} as "ciphertext",
          ${encryptedStoreEntries.encryptedDataKey} as "encryptedDataKey",
          ${encryptedStoreEntries.iv} as "iv",
          ${encryptedStoreEntries.authTag} as "authTag",
          ${encryptedStoreEntries.keyId} as "keyId",
          ${encryptedStoreEntries.keyVersion} as "keyVersion"
        FROM ${encryptedStoreEntries}
        WHERE ${encryptedStoreEntries.organizationId} = ${tenantId}
          AND ${encryptedStoreEntries.entityType} = ${entityType as EntityType}
          AND ${encryptedStoreEntries.entityId} = ${entityId}
          AND ${encryptedStoreEntries.fieldPath} = ${fieldPath}
        FOR UPDATE
      `);

      const entry = result.rows[0];
      if (!entry) {
        throw new Error(`Vault entry not found: ${entityType}:${entityId}:${fieldPath}`);
      }

      // Decrypt using envelope encryption with keyVersion fallback
      const decrypted = await this.decryptWithVersionFallback(
        entry.ciphertext,
        entry.encryptedDataKey,
        entry.iv,
        entry.authTag,
        entry.keyId,
        entry.keyVersion
      );

      // Update access log
      const accessLogEntry = {
        timestamp: new Date().toISOString(),
        accessedBy: requestedBy,
        action: AccessLogAction.RETRIEVED
      };

      await tx
        .update(encryptedStoreEntries)
        .set({
          accessLog: sql`COALESCE(${encryptedStoreEntries.accessLog}, '[]'::jsonb) || ${JSON.stringify(accessLogEntry)}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(encryptedStoreEntries.id, entry.id));

      if (emitAuditEvent) {
        await this.auditOutbox.insert(
          tx,
          buildEncryptedStoreAuditEvent({
            eventType: 'vault.entry.viewed.audit',
            tenantId,
            actorId: String(requestedBy),
            requestId,
            aggregateId: entry.id,
            action: 'VIEW_VAULT_ENTRY',
            target: {
              entityType,
              entityId: String(entityId)
            },
            details: {
              vaultEntryId: String(entry.id),
              accessPath: 'entity_lookup',
              result: 'found'
            },
            correlationId,
            causationId
          })
        );
      }

      this.logger.log(`Vault entry ${entry.id} retrieved for tenant ${tenantId}`);

      return decrypted;
    });
  }

  /**
   * Retrieve decrypted PII data by vault entry ID.
   *
   * This avoids ambiguity when multiple historical entries exist for the same
   * entity+fieldPath pair after rotations/updates.
   */
  async retrieveById(options: {
    readonly tenantId: number;
    readonly vaultEntryId: number;
    readonly requestedBy: number;
  }): Promise<string> {
    const { tenantId, vaultEntryId, requestedBy } = options;

    this.logger.debug(`Retrieving vault entry ${vaultEntryId} for tenant ${tenantId}`);

    return this.db.transaction(async (tx) => {
      const result = await tx.execute<{
        id: number;
        entityType: string;
        entityId: number;
        fieldPath: string;
        ciphertext: string;
        encryptedDataKey: string;
        iv: string;
        authTag: string;
        keyId: string;
        keyVersion: string | null;
      }>(sql`
        SELECT
          ${encryptedStoreEntries.id} as "id",
          ${encryptedStoreEntries.entityType} as "entityType",
          ${encryptedStoreEntries.entityId} as "entityId",
          ${encryptedStoreEntries.fieldPath} as "fieldPath",
          ${encryptedStoreEntries.ciphertext} as "ciphertext",
          ${encryptedStoreEntries.encryptedDataKey} as "encryptedDataKey",
          ${encryptedStoreEntries.iv} as "iv",
          ${encryptedStoreEntries.authTag} as "authTag",
          ${encryptedStoreEntries.keyId} as "keyId",
          ${encryptedStoreEntries.keyVersion} as "keyVersion"
        FROM ${encryptedStoreEntries}
        WHERE ${encryptedStoreEntries.organizationId} = ${tenantId}
          AND ${encryptedStoreEntries.id} = ${vaultEntryId}
        FOR UPDATE
      `);

      const entry = result.rows[0];
      if (!entry) {
        throw new Error(`Vault entry not found: ${vaultEntryId}`);
      }

      // Decrypt using envelope encryption with keyVersion fallback
      const decrypted = await this.decryptWithVersionFallback(
        entry.ciphertext,
        entry.encryptedDataKey,
        entry.iv,
        entry.authTag,
        entry.keyId,
        entry.keyVersion
      );

      const accessLogEntry = {
        timestamp: new Date().toISOString(),
        accessedBy: requestedBy,
        action: AccessLogAction.RETRIEVED
      };

      await tx
        .update(encryptedStoreEntries)
        .set({
          accessLog: sql`COALESCE(${encryptedStoreEntries.accessLog}, '[]'::jsonb) || ${JSON.stringify(accessLogEntry)}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(encryptedStoreEntries.id, entry.id));

      this.logger.log(`Vault entry ${entry.id} retrieved for tenant ${tenantId}`);
      return decrypted;
    });
  }

  /**
   * Decrypt vault entry with keyVersion fallback strategy
   *
   * Attempts decryption using the stored keyVersion first (for precise decryption),
   * then falls back to unversioned decryption if that fails or if no version is stored.
   *
   * ## Decryption Strategy
   * 1. If keyVersion exists: Try decrypt with versioned key path
   * 2. If versioned decrypt fails OR no keyVersion: Fallback to unversioned (let KMS auto-detect)
   *
   * @param ciphertext - Encrypted data (base64)
   * @param encryptedDataKey - Encrypted DEK (base64)
   * @param iv - Initialization vector (base64)
   * @param authTag - Authentication tag (base64)
   * @param keyId - Key identifier (e.g., 'primary-encryption-key')
   * @param keyVersion - Optional versioned key path (e.g., 'primary-encryption-key/cryptoKeyVersions/5')
   * @returns Decrypted plaintext
   */
  private async decryptWithVersionFallback(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string,
    keyId: string,
    keyVersion: string | null
  ): Promise<string> {
    // Strategy 1: Try with versioned key if available
    if (keyVersion) {
      try {
        const decrypted = await this.encryption.decryptFromBase64(
          ciphertext,
          encryptedDataKey,
          iv,
          authTag,
          { keyId: keyVersion } // Use full versioned path for precise decryption
        );
        this.logger.debug(`Decrypted vault entry using versioned key: ${keyVersion}`);
        return decrypted;
      } catch (error) {
        // Versioned decrypt failed, fall through to unversioned
        this.logger.warn(
          `Versioned decrypt failed for key ${keyVersion}, falling back to unversioned: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Strategy 2: Fallback to unversioned decrypt (let KMS auto-detect version)
    const decrypted = await this.encryption.decryptFromBase64(
      ciphertext,
      encryptedDataKey,
      iv,
      authTag,
      { keyId } // Unversioned key ID
    );
    this.logger.debug(`Decrypted vault entry using unversioned key: ${keyId}`);
    return decrypted;
  }

  /**
   * Rotate encryption key for a tenant and re-encrypt all vault entries not yet on newKeyId.
   *
   * Uses deterministic key IDs from the KMS event (no synthetic Date.now() generation).
   * Filters entries by organizationId + (keyId != newKeyId) for idempotent replay safety: entries
   * already re-encrypted to newKeyId are skipped automatically.
   *
   * Self-draining pagination: processed entries move out of the result set (keyId changes from
   * oldKeyId → newKeyId), so we repeatedly fetch the first batch until exhausted. This removes
   * the 1000-entry hard cap and handles tenants with arbitrarily many vault entries.
   *
   * @param options.tenantId    - Tenant whose entries are rotated
   * @param options.actorId     - Actor ID for access log (0 = system)
   * @param options.oldKeyId    - KMS key ID currently used by entries to rotate
   * @param options.newKeyId    - KMS key ID to re-encrypt entries under
   */
  // nosemgrep: multiwrite-db-flow-should-use-transaction
  // False positive: All writes are properly wrapped in this.db.transaction() at line 537
  // nosemgrep: multiwrite-db-flow-should-use-transaction -- Batch updates ARE wrapped in transaction at line 537 (this.db.transaction)
  async rotateKey(options: {
    readonly tenantId: number;
    readonly actorId: number;
    readonly oldKeyId: string;
    readonly newKeyId: string;
    readonly requestId?: string;
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly emitAuditEvent?: boolean;
    readonly triggerSource?: string;
  }): Promise<void> {
    const { tenantId, actorId, requestId, correlationId, causationId, emitAuditEvent } = options;
    const oldKeyId = normalizeEncryptedStoreKeyId(options.oldKeyId);
    const newKeyId = normalizeEncryptedStoreKeyId(options.newKeyId);
    const triggerSource = options.triggerSource ?? 'internal';
    if (oldKeyId === newKeyId) {
      throw new Error('oldKeyId and newKeyId must be different for rotation');
    }
    const BATCH_SIZE = 50; // Process in batches to limit transaction duration

    this.logger.debug(`Rotating vault key for tenant ${tenantId}: ${oldKeyId} → ${newKeyId}`);

    // PERF-003 fix: Skip unbounded COUNT query (5-10s for 1M entries).
    // Rotation uses self-draining pagination, so exact count is not operationally required.
    // Progress tracking uses 0 as initial estimate and increments after each batch.
    const totalEntries = 0;
    const { rotationState, isNoopReplay } = await this._getOrCreateRotationState(
      tenantId,
      oldKeyId,
      newKeyId,
      totalEntries
    );

    if (isNoopReplay) {
      if (emitAuditEvent) {
        await this.auditOutbox.insert(
          this.db,
          buildEncryptedStoreAuditEvent({
            eventType: 'vault.key.rotated.audit',
            tenantId,
            actorId: String(actorId),
            requestId,
            aggregateId: tenantId,
            action: 'ROTATE_VAULT_KEY',
            target: {
              entityType: 'vault_tenant',
              entityId: String(tenantId)
            },
            details: {
              triggerSource,
              result: 'noop_replay',
              rotatedEntryCount: 0
            },
            correlationId,
            causationId
          })
        );
      }
      return;
    }
    let totalRotated = rotationState.processedEntries ?? 0;

    // Use newKeyId as the keyVersion after rotation
    // The DEK is encrypted with newKeyId, so this is the version needed for decryption
    const newKeyVersion = newKeyId;
    this.logger.debug(`Using key version for rotation: ${newKeyVersion}`);

    try {
      // Self-draining pagination: once an entry is rotated, keyVersion is set to newKeyId.
      // Comparing COALESCE(keyVersion, keyId) avoids reprocessing entries whose logical keyId
      // remains stable while still catching legacy rows without keyVersion.
      for (;;) {
        const batch = await this.db
          .select()
          .from(encryptedStoreEntries)
          .where(
            and(
              eq(encryptedStoreEntries.organizationId, tenantId),
              sql`COALESCE(${encryptedStoreEntries.keyVersion}, ${encryptedStoreEntries.keyId}) <> ${newKeyId}`
            )
          )
          .limit(BATCH_SIZE);

        if (batch.length === 0) {
          break;
        }

        // Step 1: Rewrap DEKs (outside transaction – no plaintext data decrypted)
        // Rotate only the encrypted data key wrapper; ciphertext/iv/authTag are unchanged.
        const reWrappedBatch = await Promise.all(
          batch.map(async (entry) => {
            const encryptedDataKeyBuffer = Buffer.from(entry.encryptedDataKey, 'base64');
            // Use keyVersion (if available) or fall back to keyId for source key
            // After rotation, the DEK is encrypted with keyVersion, not keyId
            // The encryption service will pass this to the provider, which handles version normalization
            const sourceKeyId = normalizeEncryptedStoreKeyId(entry.keyVersion ?? entry.keyId);
            const { encryptedDataKey: rewrappedKey } = await this.encryption.reencryptDataKey(
              encryptedDataKeyBuffer,
              sourceKeyId,
              newKeyId
            );

            return {
              entryId: entry.id,
              updateValues: {
                // ciphertext, iv, authTag are intentionally omitted – only the DEK wrapper changes
                encryptedDataKey: rewrappedKey.toString('base64'),
                // keyId is NOT updated – it remains 'primary-encryption-key' (unversioned) always
                // Only keyVersion changes to track which version encrypted the DEK
                keyVersion: newKeyVersion, // Store version for precise decryption
                rotatedAt: new Date(),
                updatedAt: new Date()
              }
            };
          })
        );

        // Step 2: Apply updates in a single transaction (fast DB operations only)
        // PERF-002 fix: Use Promise.all for parallel UPDATE execution within transaction.
        // This reduces query count from N sequential UPDATEs to parallel execution.
        await this.db.transaction(async (tx) => {
          const accessLogEntry = {
            timestamp: new Date().toISOString(),
            accessedBy: actorId,
            action: AccessLogAction.ROTATED
          };

          // Execute all UPDATE operations in parallel within the transaction
          await Promise.all(
            reWrappedBatch.map(({ entryId, updateValues }) =>
              tx
                .update(encryptedStoreEntries)
                .set({
                  ...updateValues,
                  accessLog: sql`COALESCE(${encryptedStoreEntries.accessLog}, '[]'::jsonb) || ${JSON.stringify(accessLogEntry)}::jsonb`
                })
                .where(eq(encryptedStoreEntries.id, entryId))
            )
          );

          const lastEntry = batch[batch.length - 1];
          await tx
            .update(keyRotationState)
            .set({
              processedEntries: sql`${keyRotationState.processedEntries} + ${batch.length}`,
              lastCursor: lastEntry ? String(lastEntry.id) : null,
              updatedAt: new Date()
            })
            .where(eq(keyRotationState.id, rotationState.id));
        });

        totalRotated += batch.length;

        this.logger.debug(
          `Rotated batch of ${batch.length} entries for tenant ${tenantId} (total so far: ${totalRotated})`
        );

        // Short-circuit: if we received fewer entries than the batch size, we've exhausted
        // all remaining entries that still need rewrap – next query would return empty.
        if (batch.length < BATCH_SIZE) {
          break;
        }
      }

      // Do NOT overwrite processedEntries here – the DB counter is already
      // authoritative (incremented atomically per-batch via SQL expression).
      // Using the local totalRotated variable would produce a stale/non-atomic write.
      await this.db
        .update(keyRotationState)
        .set({
          status: ROTATION_STATUS.COMPLETED,
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(keyRotationState.id, rotationState.id));

      if (totalRotated === 0) {
        this.logger.log(
          `No vault entries found for tenant ${tenantId} requiring rotation to keyId=${newKeyId}, rotation is a no-op`
        );
        if (emitAuditEvent) {
          await this.auditOutbox.insert(
            this.db,
            buildEncryptedStoreAuditEvent({
              eventType: 'vault.key.rotated.audit',
              tenantId,
              actorId: String(actorId),
              requestId,
              aggregateId: tenantId,
              action: 'ROTATE_VAULT_KEY',
              target: {
                entityType: 'vault_tenant',
                entityId: String(tenantId)
              },
              details: {
                triggerSource,
                result: 'noop',
                rotatedEntryCount: 0
              },
              correlationId,
              causationId
            })
          );
        }
        return;
      }

      this.logger.log(
        `Rotated ${totalRotated} vault entries for tenant ${tenantId} (${oldKeyId} → ${newKeyId})`
      );

      if (emitAuditEvent) {
        await this.auditOutbox.insert(
          this.db,
          buildEncryptedStoreAuditEvent({
            eventType: 'vault.key.rotated.audit',
            tenantId,
            actorId: String(actorId),
            requestId,
            aggregateId: tenantId,
            action: 'ROTATE_VAULT_KEY',
            target: {
              entityType: 'vault_tenant',
              entityId: String(tenantId)
            },
            details: {
              triggerSource,
              result: 'completed',
              rotatedEntryCount: totalRotated
            },
            correlationId,
            causationId
          })
        );
      }
    } catch (error) {
      await this.db
        .update(keyRotationState)
        .set({
          status: ROTATION_STATUS.FAILED,
          failedEntries: sql`${keyRotationState.failedEntries} + 1`,
          updatedAt: new Date()
        })
        .where(eq(keyRotationState.id, rotationState.id))
        .catch((stateUpdateError: unknown) => {
          this.logger.error({
            message: 'Failed to mark vault key rotation state as failed',
            rotationStateId: rotationState.id,
            organizationId: tenantId,
            error:
              stateUpdateError instanceof Error
                ? stateUpdateError.message
                : String(stateUpdateError)
          });
        });

      throw error;
    }
  }

  // nosemgrep: multiwrite-db-flow-should-use-transaction
  // False positive: Uses atomic INSERT...ON CONFLICT DO UPDATE (single operation)
  // The conditional UPDATE at line 680 is in a different execution branch (FAILED status retry)
  // nosemgrep: multiwrite-db-flow-should-use-transaction -- Single atomic upsert (line 647) + optional single UPDATE (line 680), not multiple writes in same path
  // nosemgrep: multiwrite-db-flow-should-use-transaction -- Uses single atomic upsert; subsequent UPDATE is in separate execution path
  private async _getOrCreateRotationState(
    tenantId: number,
    oldKeyId: string,
    newKeyId: string,
    totalEntries: number
  ): Promise<{ rotationState: KeyRotationState; isNoopReplay: boolean }> {
    const newState: NewKeyRotationState = {
      organizationId: tenantId,
      oldKeyId,
      newKeyId,
      status: ROTATION_STATUS.IN_PROGRESS,
      totalEntries,
      processedEntries: 0,
      failedEntries: 0
    };

    // Atomic INSERT...ON CONFLICT DO UPDATE pattern eliminates race window
    // The unique index on (organizationId, oldKeyId, newKeyId) ensures
    // only one state row exists per rotation tuple.
    const [state] = await this.db
      .insert(keyRotationState)
      .values(newState)
      .onConflictDoUpdate({
        target: [
          keyRotationState.organizationId,
          keyRotationState.oldKeyId,
          keyRotationState.newKeyId
        ],
        // No-op update: touch updatedAt to detect existing vs new
        set: { updatedAt: new Date() }
      })
      .returning();

    if (!state) {
      throw new Error('Failed to create or retrieve key rotation state record');
    }

    // Determine if this was a replay by checking if the row already existed
    // If createdAt !== updatedAt after the upsert, then the row existed before
    const isExistingState = state.createdAt.getTime() !== state.updatedAt.getTime();

    // Handle existing state by status
    if (isExistingState) {
      if (state.status === ROTATION_STATUS.COMPLETED) {
        this.logger.log(
          `Vault key rotation replay is a no-op for tenant ${tenantId} (${oldKeyId} → ${newKeyId})`
        );
        return { rotationState: state, isNoopReplay: true };
      }

      if (state.status === ROTATION_STATUS.FAILED) {
        // Atomically reset FAILED → IN_PROGRESS for retry
        const [updatedState] = await this.db
          .update(keyRotationState)
          .set({
            status: ROTATION_STATUS.IN_PROGRESS,
            updatedAt: new Date()
          })
          .where(eq(keyRotationState.id, state.id))
          .returning();
        return {
          rotationState: updatedState || state,
          isNoopReplay: false
        };
      }

      if (state.status === ROTATION_STATUS.CANCELLED) {
        this.logger.warn(
          `Vault key rotation is cancelled for tenant ${tenantId} (${oldKeyId} → ${newKeyId}), skipping replay`
        );
        return { rotationState: state, isNoopReplay: true };
      }

      if (
        state.status === ROTATION_STATUS.IN_PROGRESS &&
        typeof state.processedEntries === 'number' &&
        state.processedEntries > 0
      ) {
        this.logger.log(
          `Resuming vault key rotation after restart for tenant ${tenantId}, processed entries: ${state.processedEntries}`
        );
      }

      return { rotationState: state, isNoopReplay: false };
    }

    // New state created
    return { rotationState: state, isNoopReplay: false };
  }
}

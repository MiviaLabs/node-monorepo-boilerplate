import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gt,
  invitations,
  userIdentities,
  users,
  type NodePgDatabase
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

/**
 * Rotation error for inline field key rotation
 */
export interface InlineRotationError {
  /** Table name (e.g., 'users', 'user_identities', 'invitations') */
  tableName: string;
  /** Record ID that failed */
  recordId: number;
  /** Field name that failed */
  fieldName: string;
  /** Error message */
  error: string;
}

/**
 * Rotation progress result
 */
export interface InlineRotationProgress {
  /** Number of records successfully rotated */
  processedCount: number;
  /** Number of records that failed to rotate */
  failedCount: number;
  /** Total number of records to rotate */
  totalCount: number;
  /** Whether rotation is complete */
  isComplete: boolean;
  /** Errors from failed rotations */
  errors: InlineRotationError[];
}

/**
 * Rotation options
 */
export interface InlineRotationOptions {
  /** Number of records to process per batch (default: 100) */
  batchSize?: number;
  /** Continue processing on errors instead of stopping (default: true) */
  continueOnError?: boolean;
}

/**
 * Default rotation options
 */
const DEFAULT_ROTATION_OPTIONS: Required<InlineRotationOptions> = {
  batchSize: 100,
  continueOnError: true
};

/**
 * Number of parts in a valid encryption envelope
 * Format: ciphertext:encryptedDataKey:iv:authTag
 */
const ENVELOPE_PARTS_COUNT = 4;

/**
 * Inline Field Key Rotation Service
 *
 * Service for rotating inline encrypted fields in auth-related tables
 * during KMS key rotation operations.
 *
 * ## Purpose
 *
 * When KMS keys are rotated, the encrypted Data Encryption Keys (DEKs)
 * stored in envelope format within inline encrypted fields must be
 * re-encrypted (rewrapped) with the new key version. This service handles
 * that rotation for:
 *
 * - `users` table: emailEncrypted, firstNameEncrypted, lastNameEncrypted, phoneNumberEncrypted
 * - `user_identities` table: providerEmailEncrypted, phoneNumberEncrypted
 * - `invitations` table: emailEncrypted
 *
 * ## Architecture Note: Direct Database Access
 *
 * This service uses direct database access (`this.db`) instead of the repository pattern
 * for performance-critical batch operations, similar to AddressKeyRotationService.
 * This is intentional for:
 *
 * 1. **Batch processing**: Processes records in configurable batches
 * 2. **Cursor-based pagination**: Optimized for large datasets
 * 3. **Transaction control**: Fine-grained transaction management for atomic updates
 *
 * ## Key Design Decisions
 *
 * 1. **Envelope Format**: `ciphertext:encryptedDataKey:iv:authTag` (base64, colon-separated)
 * 2. **Rotation Process**: Only re-encrypts DEK, ciphertext/iv/authTag remain unchanged
 * 3. **Batch Processing**: Processes in batches of 100 (configurable)
 * 4. **Continue-on-Error**: Collects errors but continues rotation by default
 *
 * ## Usage
 *
 * ```typescript
 * // Rotate all inline encrypted fields
 * const result = await inlineFieldKeyRotationService.rotateAllInlineFields(
 *   oldKeyVersion,
 *   newKeyVersion
 * );
 *
 * console.log(`Rotated ${result.processedCount}/${result.totalCount} records`);
 * ```
 *
 * @see AddressKeyRotationService - encrypted-store entry rotation pattern
 * @see EncryptionService - Used for DEK re-encryption
 */
@Injectable()
export class InlineFieldKeyRotationService implements OnModuleInit {
  private readonly logger = new Logger(InlineFieldKeyRotationService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: NodePgDatabase,
    private readonly encryptionService: EncryptionService
  ) {}

  onModuleInit(): void {
    this.logger.log('InlineFieldKeyRotationService initialized');
  }

  /**
   * Rotate all inline encrypted fields across all auth-related tables.
   *
   * Processes users, user_identities, and invitations tables in sequence,
   * rotating each inline encrypted field's DEK to the new key version.
   *
   * @param oldKeyVersion - Old KMS key version (e.g., 'primary-encryption-key/cryptoKeyVersions/1')
   * @param newKeyVersion - New KMS key version (e.g., 'primary-encryption-key/cryptoKeyVersions/2')
   * @param options - Rotation options (batchSize, continueOnError)
   * @returns Combined rotation progress across all tables
   */
  async rotateAllInlineFields(
    oldKeyVersion: string,
    newKeyVersion: string,
    options?: InlineRotationOptions
  ): Promise<InlineRotationProgress> {
    this.logger.log(`Starting inline field key rotation: ${oldKeyVersion} -> ${newKeyVersion}`);

    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };
    const allErrors: InlineRotationError[] = [];
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalRecords = 0;

    // Rotate users table
    this.logger.log('Rotating users table...');
    const usersResult = await this.rotateUsersTable(oldKeyVersion, newKeyVersion, opts);
    totalProcessed += usersResult.processedCount;
    totalFailed += usersResult.failedCount;
    totalRecords += usersResult.totalCount;
    allErrors.push(...usersResult.errors);
    this.logger.log(
      `Users table: ${usersResult.processedCount}/${usersResult.totalCount} processed, ${usersResult.failedCount} failed`
    );

    // Rotate user_identities table
    this.logger.log('Rotating user_identities table...');
    const identitiesResult = await this.rotateUserIdentitiesTable(
      oldKeyVersion,
      newKeyVersion,
      opts
    );
    totalProcessed += identitiesResult.processedCount;
    totalFailed += identitiesResult.failedCount;
    totalRecords += identitiesResult.totalCount;
    allErrors.push(...identitiesResult.errors);
    this.logger.log(
      `User identities table: ${identitiesResult.processedCount}/${identitiesResult.totalCount} processed, ${identitiesResult.failedCount} failed`
    );

    // Rotate invitations table
    this.logger.log('Rotating invitations table...');
    const invitationsResult = await this.rotateInvitationsTable(oldKeyVersion, newKeyVersion, opts);
    totalProcessed += invitationsResult.processedCount;
    totalFailed += invitationsResult.failedCount;
    totalRecords += invitationsResult.totalCount;
    allErrors.push(...invitationsResult.errors);
    this.logger.log(
      `Invitations table: ${invitationsResult.processedCount}/${invitationsResult.totalCount} processed, ${invitationsResult.failedCount} failed`
    );

    this.logger.log(
      `Rotation complete: ${totalProcessed}/${totalRecords} total processed, ${totalFailed} failed`
    );

    return {
      processedCount: totalProcessed,
      failedCount: totalFailed,
      totalCount: totalRecords,
      isComplete: totalFailed === 0 || opts.continueOnError,
      errors: allErrors
    };
  }

  /**
   * Rotate all inline encrypted fields in the users table.
   *
   * Re-encrypts DEKs for: emailEncrypted, firstNameEncrypted, lastNameEncrypted, phoneNumberEncrypted
   *
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   * @param options - Rotation options
   * @returns Rotation progress
   */
  async rotateUsersTable(
    oldKeyVersion: string,
    newKeyVersion: string,
    options?: InlineRotationOptions
  ): Promise<InlineRotationProgress> {
    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };

    // Count total records to rotate
    const result = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.encryptionKeyVersion, oldKeyVersion));

    const totalCount = result[0]?.count ?? 0;

    if (totalCount === 0) {
      this.logger.debug('No users found for rotation with old key version');
      return {
        processedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isComplete: true,
        errors: []
      };
    }

    this.logger.debug(`Found ${totalCount} users to rotate`);

    let processedCount = 0;
    let failedCount = 0;
    const errors: InlineRotationError[] = [];

    // Process in batches with cursor-based pagination
    await this.streamUsersWithCursor(oldKeyVersion, opts.batchSize, async (batch) => {
      for (const user of batch) {
        try {
          await this.rotateUserRecord(user, oldKeyVersion, newKeyVersion);
          processedCount++;
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to rotate user ${user.id}: ${errorMessage}`);
          errors.push({
            tableName: 'users',
            recordId: user.id,
            fieldName: 'multiple',
            error: errorMessage
          });

          if (!opts.continueOnError) {
            return;
          }
        }
      }
    });

    return {
      processedCount,
      failedCount,
      totalCount,
      isComplete: failedCount === 0 || opts.continueOnError,
      errors
    };
  }

  /**
   * Rotate all inline encrypted fields in the user_identities table.
   *
   * Re-encrypts DEKs for: providerEmailEncrypted, phoneNumberEncrypted
   *
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   * @param options - Rotation options
   * @returns Rotation progress
   */
  async rotateUserIdentitiesTable(
    oldKeyVersion: string,
    newKeyVersion: string,
    options?: InlineRotationOptions
  ): Promise<InlineRotationProgress> {
    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };

    // Count total records to rotate
    const result = await this.db
      .select({ count: count() })
      .from(userIdentities)
      .where(eq(userIdentities.encryptionKeyVersion, oldKeyVersion));

    const totalCount = result[0]?.count ?? 0;

    if (totalCount === 0) {
      this.logger.debug('No user identities found for rotation with old key version');
      return {
        processedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isComplete: true,
        errors: []
      };
    }

    this.logger.debug(`Found ${totalCount} user identities to rotate`);

    let processedCount = 0;
    let failedCount = 0;
    const errors: InlineRotationError[] = [];

    // Process in batches with cursor-based pagination
    await this.streamUserIdentitiesWithCursor(oldKeyVersion, opts.batchSize, async (batch) => {
      for (const identity of batch) {
        try {
          await this.rotateUserIdentityRecord(identity, oldKeyVersion, newKeyVersion);
          processedCount++;
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to rotate user identity ${identity.id}: ${errorMessage}`);
          errors.push({
            tableName: 'user_identities',
            recordId: identity.id,
            fieldName: 'multiple',
            error: errorMessage
          });

          if (!opts.continueOnError) {
            return;
          }
        }
      }
    });

    return {
      processedCount,
      failedCount,
      totalCount,
      isComplete: failedCount === 0 || opts.continueOnError,
      errors
    };
  }

  /**
   * Rotate all inline encrypted fields in the invitations table.
   *
   * Re-encrypts DEKs for: emailEncrypted
   *
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   * @param options - Rotation options
   * @returns Rotation progress
   */
  async rotateInvitationsTable(
    oldKeyVersion: string,
    newKeyVersion: string,
    options?: InlineRotationOptions
  ): Promise<InlineRotationProgress> {
    const opts = { ...DEFAULT_ROTATION_OPTIONS, ...options };

    // Count total records to rotate
    const result = await this.db
      .select({ count: count() })
      .from(invitations)
      .where(eq(invitations.encryptionKeyVersion, oldKeyVersion));

    const totalCount = result[0]?.count ?? 0;

    if (totalCount === 0) {
      this.logger.debug('No invitations found for rotation with old key version');
      return {
        processedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isComplete: true,
        errors: []
      };
    }

    this.logger.debug(`Found ${totalCount} invitations to rotate`);

    let processedCount = 0;
    let failedCount = 0;
    const errors: InlineRotationError[] = [];

    // Process in batches with cursor-based pagination
    await this.streamInvitationsWithCursor(oldKeyVersion, opts.batchSize, async (batch) => {
      for (const invitation of batch) {
        try {
          await this.rotateInvitationRecord(invitation, oldKeyVersion, newKeyVersion);
          processedCount++;
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to rotate invitation ${invitation.id}: ${errorMessage}`);
          errors.push({
            tableName: 'invitations',
            recordId: invitation.id,
            fieldName: 'emailEncrypted',
            error: errorMessage
          });

          if (!opts.continueOnError) {
            return;
          }
        }
      }
    });

    return {
      processedCount,
      failedCount,
      totalCount,
      isComplete: failedCount === 0 || opts.continueOnError,
      errors
    };
  }

  /**
   * Rotate a single user record's encrypted fields.
   *
   * @param user - User record to rotate
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   */
  private async rotateUserRecord(
    user: typeof users.$inferSelect,
    oldKeyVersion: string,
    newKeyVersion: string
  ): Promise<void> {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date()
    };

    // Rotate emailEncrypted
    if (user.emailEncrypted) {
      updateData.emailEncrypted = await this.rotateEnvelopeField(
        user.emailEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Rotate firstNameEncrypted
    if (user.firstNameEncrypted) {
      updateData.firstNameEncrypted = await this.rotateEnvelopeField(
        user.firstNameEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Rotate lastNameEncrypted
    if (user.lastNameEncrypted) {
      updateData.lastNameEncrypted = await this.rotateEnvelopeField(
        user.lastNameEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Rotate phoneNumberEncrypted
    if (user.phoneNumberEncrypted) {
      updateData.phoneNumberEncrypted = await this.rotateEnvelopeField(
        user.phoneNumberEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Update key version
    updateData.encryptionKeyVersion = newKeyVersion;

    // Update the record
    await this.db.update(users).set(updateData).where(eq(users.id, user.id));

    this.logger.debug(`Rotated user ${user.id}`);
  }

  /**
   * Rotate a single user identity record's encrypted fields.
   *
   * @param identity - User identity record to rotate
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   */
  private async rotateUserIdentityRecord(
    identity: typeof userIdentities.$inferSelect,
    oldKeyVersion: string,
    newKeyVersion: string
  ): Promise<void> {
    const updateData: Partial<typeof userIdentities.$inferInsert> = {
      updatedAt: new Date()
    };

    // Rotate providerEmailEncrypted
    if (identity.providerEmailEncrypted) {
      updateData.providerEmailEncrypted = await this.rotateEnvelopeField(
        identity.providerEmailEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Rotate phoneNumberEncrypted
    if (identity.phoneNumberEncrypted) {
      updateData.phoneNumberEncrypted = await this.rotateEnvelopeField(
        identity.phoneNumberEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Update key version
    updateData.encryptionKeyVersion = newKeyVersion;

    // Update the record
    await this.db.update(userIdentities).set(updateData).where(eq(userIdentities.id, identity.id));

    this.logger.debug(`Rotated user identity ${identity.id}`);
  }

  /**
   * Rotate a single invitation record's encrypted fields.
   *
   * @param invitation - Invitation record to rotate
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   */
  private async rotateInvitationRecord(
    invitation: typeof invitations.$inferSelect,
    oldKeyVersion: string,
    newKeyVersion: string
  ): Promise<void> {
    const updateData: Partial<typeof invitations.$inferInsert> = {
      updatedAt: new Date()
    };

    // Rotate emailEncrypted
    if (invitation.emailEncrypted) {
      updateData.emailEncrypted = await this.rotateEnvelopeField(
        invitation.emailEncrypted,
        oldKeyVersion,
        newKeyVersion
      );
    }

    // Update key version
    updateData.encryptionKeyVersion = newKeyVersion;

    // Update the record
    await this.db.update(invitations).set(updateData).where(eq(invitations.id, invitation.id));

    this.logger.debug(`Rotated invitation ${invitation.id}`);
  }

  /**
   * Rotate a single envelope field's DEK.
   *
   * Only re-encrypts the DEK component. The ciphertext, iv, and authTag remain unchanged
   * because the actual data encryption has not changed - only the key wrapping.
   *
   * @param envelope - Envelope string in format: ciphertext:encryptedDataKey:iv:authTag
   * @param oldKeyVersion - Old KMS key version
   * @param newKeyVersion - New KMS key version
   * @returns New envelope with re-encrypted DEK
   */
  private async rotateEnvelopeField(
    envelope: string,
    oldKeyVersion: string,
    newKeyVersion: string
  ): Promise<string> {
    // Parse envelope: ciphertext:encryptedDataKey:iv:authTag
    const parts = envelope.split(':');

    if (parts.length !== ENVELOPE_PARTS_COUNT) {
      throw Errors.validationinvalidValueFor002({
        field: 'envelope',
        expectedType: `format with ${ENVELOPE_PARTS_COUNT} colon-separated parts`
      });
    }

    const [ciphertext, encryptedDataKey, iv, authTag] = parts;

    if (!ciphertext || !encryptedDataKey || !iv || !authTag) {
      throw Errors.validationvalidationFailedField001({
        field: 'envelope'
      });
    }

    // Re-encrypt the DEK using encryption service
    const encryptedDataKeyBuffer = Buffer.from(encryptedDataKey, 'base64');
    const { encryptedDataKey: rotatedKey } = await this.encryptionService.reencryptDataKey(
      encryptedDataKeyBuffer,
      oldKeyVersion,
      newKeyVersion
    );

    // Return new envelope with re-encrypted DEK
    return `${ciphertext}:${rotatedKey.toString('base64')}:${iv}:${authTag}`;
  }

  /**
   * Stream users for rotation by fetching rows in cursor-based batches.
   *
   * @param oldKeyVersion - Old KMS key version to filter
   * @param batchSize - Number of records per batch
   * @param onBatch - Callback to process each batch
   */
  private async streamUsersWithCursor(
    oldKeyVersion: string,
    batchSize: number,
    onBatch: (batch: Array<typeof users.$inferSelect>) => Promise<void>
  ): Promise<void> {
    let lastId = 0;

    while (true) {
      const batch = await this.db
        .select()
        .from(users)
        .where(and(eq(users.encryptionKeyVersion, oldKeyVersion), gt(users.id, lastId)))
        .orderBy(asc(users.id))
        .limit(batchSize);

      if (batch.length === 0) {
        break;
      }

      await onBatch(batch);
      // Safe assertion: batch has at least one element (checked above)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lastId = batch[batch.length - 1]!.id;
    }
  }

  /**
   * Stream user identities for rotation by fetching rows in cursor-based batches.
   *
   * @param oldKeyVersion - Old KMS key version to filter
   * @param batchSize - Number of records per batch
   * @param onBatch - Callback to process each batch
   */
  private async streamUserIdentitiesWithCursor(
    oldKeyVersion: string,
    batchSize: number,
    onBatch: (batch: Array<typeof userIdentities.$inferSelect>) => Promise<void>
  ): Promise<void> {
    let lastId = 0;

    while (true) {
      const batch = await this.db
        .select()
        .from(userIdentities)
        .where(
          and(eq(userIdentities.encryptionKeyVersion, oldKeyVersion), gt(userIdentities.id, lastId))
        )
        .orderBy(asc(userIdentities.id))
        .limit(batchSize);

      if (batch.length === 0) {
        break;
      }

      await onBatch(batch);
      // Safe assertion: batch has at least one element (checked above)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lastId = batch[batch.length - 1]!.id;
    }
  }

  /**
   * Stream invitations for rotation by fetching rows in cursor-based batches.
   *
   * @param oldKeyVersion - Old KMS key version to filter
   * @param batchSize - Number of records per batch
   * @param onBatch - Callback to process each batch
   */
  private async streamInvitationsWithCursor(
    oldKeyVersion: string,
    batchSize: number,
    onBatch: (batch: Array<typeof invitations.$inferSelect>) => Promise<void>
  ): Promise<void> {
    let lastId = 0;

    while (true) {
      const batch = await this.db
        .select()
        .from(invitations)
        .where(and(eq(invitations.encryptionKeyVersion, oldKeyVersion), gt(invitations.id, lastId)))
        .orderBy(asc(invitations.id))
        .limit(batchSize);

      if (batch.length === 0) {
        break;
      }

      await onBatch(batch);
      // Safe assertion: batch has at least one element (checked above)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      lastId = batch[batch.length - 1]!.id;
    }
  }
}

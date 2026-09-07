import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EncryptionService } from '@package/encryption';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { ExportUserDataCommand } from '../../commands/export-user-data.command';
import { AuthEventType, buildAuthAuditEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Number of parts expected in a valid encryption envelope.
 * Format: ciphertext:encryptedDataKey:iv:authTag
 */
const ENVELOPE_PARTS_COUNT = 4;

/**
 * Number of characters to show from hash in fallback message
 */
const HASH_PREFIX_LENGTH = 16;

/**
 * Validate and convert user ID string to number
 *
 * @param userId - User ID as string
 * @returns User ID as number
 * @throws ValidationError if userId is not a valid positive integer
 */
function validateUserId(userId: string | number): number {
  // Convert to number if string
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId;

  // Check if conversion resulted in NaN
  if (Number.isNaN(userIdNum)) {
    throw Errors.validationinvalidValueFor002({
      field: 'userId',
      expectedType: 'positive integer'
    });
  }

  // Check if it's an integer
  if (!Number.isInteger(userIdNum)) {
    throw Errors.validationinvalidValueFor002({
      field: 'userId',
      expectedType: 'positive integer'
    });
  }

  // Check if it's positive (greater than 0)
  if (userIdNum <= 0) {
    throw Errors.validationinvalidValueFor002({
      field: 'userId',
      expectedType: 'positive integer'
    });
  }

  return userIdNum;
}

/**
 * User Data Export Interface
 *
 * Complete export of all user data for GDPR compliance
 */
export interface UserDataExport {
  user: {
    id: string;
    email: string;
    displayName: string;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;
    lastSignInAt: string | null;
  };
  identities: Array<{
    provider: string;
    displayName: string;
    emailVerified: boolean;
    createdAt: string;
  }>;
  organization: {
    id: string;
    name: string;
  };
  exportedAt: string;
  exportedBy: string;
}

/**
 * Export User Data Handler
 *
 * Exports all user data for GDPR compliance (Article 15 - Right of Access).
 * Includes user profile, identities, and organization information.
 * Decrypts PII fields (email, firstName, lastName) so users can read their own data.
 *
 * Persists USER_DATA_EXPORTED audit event via outbox after successful export.
 *
 * Authorization:
 * - Users can export their own data
 * - Admins can export any user's data (TODO: implement admin check)
 *
 * @example
 * ```typescript
 * const export = await commandBus.execute(
 *   new ExportUserDataCommand({
 *     tenantId: '123',
 *     userId: '456',
 *     actorId: '456'
 *   })
 * );
 * ```
 */
@CommandHandler(ExportUserDataCommand)
export class ExportUserDataHandler implements ICommandHandler<ExportUserDataCommand> {
  private readonly logger = new Logger(ExportUserDataHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly orgRepository: OrganizationRepository,
    private readonly encryptionService: EncryptionService,
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Decrypt envelope-encrypted field
   *
   * Parses the envelope format (ciphertext:encryptedDataKey:iv:authTag) and
   * decrypts using the EncryptionService.
   *
   * @param encryptedValue - Envelope format: ciphertext:encryptedDataKey:iv:authTag
   * @param fieldName - Field name for logging (no PII logged)
   * @returns Decrypted plaintext or null if decryption fails
   */
  private async decryptField(
    encryptedValue: string | null,
    fieldName: string
  ): Promise<string | null> {
    if (!encryptedValue) {
      return null;
    }

    try {
      // Parse envelope format
      const parts = encryptedValue.split(':');

      if (parts.length !== ENVELOPE_PARTS_COUNT) {
        this.logger.warn(
          `[ExportUserDataHandler] Invalid envelope format for ${fieldName}: expected ${ENVELOPE_PARTS_COUNT} parts, got ${parts.length}`
        );
        return null;
      }

      const [ciphertext, encryptedDataKey, iv, authTag] = parts;

      // Ensure all parts are non-empty
      if (!ciphertext || !encryptedDataKey || !iv || !authTag) {
        this.logger.warn(`[ExportUserDataHandler] Empty envelope part detected for ${fieldName}`);
        return null;
      }

      // Decrypt using EncryptionService
      const plaintext = await this.encryptionService.decryptFromBase64(
        ciphertext,
        encryptedDataKey,
        iv,
        authTag
      );

      return plaintext;
    } catch (error) {
      // Log error without PII (only field name and error type)
      this.logger.error(
        `[ExportUserDataHandler] Failed to decrypt ${fieldName}: ${error instanceof Error ? error.name : 'UnknownError'}`
      );
      return null;
    }
  }

  /**
   * Decrypt user email with fallback handling
   *
   * Attempts to decrypt the email from envelope format. If decryption fails,
   * returns a fallback message with truncated hash for user reference.
   *
   * @param user - User entity with emailEncrypted and emailHash fields
   * @returns Decrypted email or fallback message
   */
  private async decryptEmail(user: {
    emailEncrypted: string | null;
    emailHash: string | null;
  }): Promise<string> {
    // Try decrypting emailEncrypted first
    if (user.emailEncrypted) {
      const decrypted = await this.decryptField(user.emailEncrypted, 'email');

      if (decrypted) {
        return decrypted;
      }

      // Decryption failed, log warning (no PII)
      this.logger.warn('[ExportUserDataHandler] Email decryption failed, falling back to hash');
    }

    // Fallback to email hash with note
    if (user.emailHash) {
      return `[Email not available - hash: ${user.emailHash.substring(0, HASH_PREFIX_LENGTH)}...]`;
    }

    return '[Email not available]';
  }

  /**
   * Decrypt user name fields
   *
   * Decrypts firstName and lastName if they are encrypted.
   *
   * @param firstNameEncrypted - Encrypted first name
   * @param lastNameEncrypted - Encrypted last name
   * @returns Object with decrypted firstName and lastName (or null if not available)
   */
  private async decryptNames(
    firstNameEncrypted: string | null,
    lastNameEncrypted: string | null
  ): Promise<{ firstName: string | null; lastName: string | null }> {
    const firstName = firstNameEncrypted
      ? await this.decryptField(firstNameEncrypted, 'firstName')
      : null;

    const lastName = lastNameEncrypted
      ? await this.decryptField(lastNameEncrypted, 'lastName')
      : null;

    return { firstName, lastName };
  }

  async execute(command: ExportUserDataCommand): Promise<UserDataExport> {
    this.logger.log(
      `[ExportUserDataHandler] Exporting data for user ${command.userId} by actor ${command.actorId}`
    );

    // Step 1: Validate user ID format before querying database
    const userIdNum = validateUserId(command.userId);

    // Step 2: Get user data
    const user = await this.authRepository.findById(command.tenantId, userIdNum);

    if (!user) {
      throw Errors.useruserWithId001({ userId: command.userId });
    }

    // CRITICAL FIX #1: Verify user belongs to the same tenant as the actor
    // This prevents cross-tenant data export security breach
    if (user.organizationId?.toString() !== command.tenantId) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'users:export-cross-tenant'
      });
    }

    // Only allow users to export their own data (unless admin)
    if (command.actorId !== command.userId) {
      // TODO: Check if admin role when RBAC is implemented
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'users:export'
      });
    }

    // Step 3: Get all user identities
    const identities = await this.userIdentityRepository.findByUserId(user.id);

    // Step 4: Get organization
    const org = await this.orgRepository.findById(command.tenantId);

    if (!org) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    // Step 5: Decrypt PII for GDPR compliance (Article 15 - Right of Access)
    const decryptedEmail = await this.decryptEmail(user);

    // Decrypt name fields if present
    const { firstName, lastName } = await this.decryptNames(
      user.firstNameEncrypted,
      user.lastNameEncrypted
    );

    // Build full name from decrypted parts or fallback to displayName
    const decryptedFullName = [firstName, lastName].filter(Boolean).join(' ');
    const fullName = decryptedFullName.length > 0 ? decryptedFullName : (user.displayName ?? '');

    const exportedAt = new Date();

    const exportData: UserDataExport = {
      user: {
        id: String(user.id),
        email: decryptedEmail,
        displayName: fullName,
        isVerified: user.isVerified,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt?.toISOString() ?? null,
        lastSignInAt: user.lastSignInAt?.toISOString() ?? null
      },
      identities: identities.map((identity) => ({
        provider: identity.provider,
        displayName: identity.displayName ?? '',
        emailVerified: identity.emailVerified,
        createdAt: identity.createdAt.toISOString()
      })),
      organization: {
        id: String(org.id),
        name: org.name
      },
      exportedAt: exportedAt.toISOString(),
      exportedBy: command.actorId
    };

    // Step 6: Persist audit event for GDPR compliance tracking via outbox pattern
    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(
        tx,
        buildAuthAuditEvent({
          eventType: AuthEventType.USER_DATA_EXPORTED,
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: command.userId,
          action: 'EXPORT_USER_DATA',
          target: {
            entityType: 'user',
            entityId: command.userId
          },
          details: {
            exportFormat: 'json',
            selfService: command.actorId === command.userId
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(
      `[ExportUserDataHandler] Successfully exported data for user ${command.userId}`
    );

    return exportData;
  }
}

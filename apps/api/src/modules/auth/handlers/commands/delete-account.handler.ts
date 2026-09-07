import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthProviderFactory, AUTH_PROVIDER_FACTORY, type IAuthProvider } from '@package/auth';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';
import { chunk } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../common/services/tenant-resolution.service';
import { DeleteAccountCommand } from '../../commands/delete-account.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

import type { organizations, UserIdentity, users } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Auth event schema version constant
const AUTH_EVENT_SCHEMA_VERSION = '1.0' as const;

/**
 * Delete Account Handler
 *
 * Handles user account deletion with enhanced safeguards:
 *
 * **Business Rules:**
 * 1. Only owner can delete owner account (self-deletion only)
 * 2. Admin CANNOT delete owner accounts - owner must delete themselves
 * 3. Owner self-deletion with other members → REJECTED (require ownership transfer first)
 * 4. Owner self-deletion as sole member → Organization deleted
 * 5. Regular user deletion → Works as before
 *
 * **Implementation:**
 * - If user is organization owner AND NOT self-deletion → REJECT
 * - If owner self-deletion AND has other members → REJECT
 * - If owner self-deletion AND sole member → DELETE org (cascades to all users)
 * - If regular user → DELETE only that user
 *
 * All operations are performed within a database transaction for atomicity.
 * Audit logging is included via outbox events.
 *
 * **Security:**
 * - Reason field is sanitized to prevent XSS (HTML tags stripped, length limited)
 *
 * **TODO - Session Revocation:**
 * - Session revocation not implemented (no session service available)
 * - User remains logged in on other devices after account deletion
 * - Future enhancement: Implement SessionService.revokeAllSessions(userId)
 *
 * **TODO - CSRF Protection:**
 * - CSRF protection not configured for account deletion endpoint
 * - Future enhancement: Add CSRF guard to DELETE /auth/account/:id endpoint
 *
 * @example
 * ```typescript
 * const command = new DeleteAccountCommand({
 *   tenantId: 'org-123',
 *   actorId: 'user-123',
 *   targetUserId: 'user-456',
 *   reason: 'GDPR request'
 * });
 * await commandBus.execute(command);
 * ```
 */
@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<DeleteAccountCommand> {
  private readonly logger = new Logger(DeleteAccountHandler.name);
  private authProvider: IAuthProvider | null = null;
  // Soft delete mode (GDPR compliance): true = soft delete, false = hard delete
  private readonly USE_SOFT_DELETE = process.env['USE_SOFT_DELETE'] === 'true';
  // GCP Identity Platform deletion batch configuration
  // SAFER DEFAULTS: Lower values prevent memory spikes and rate limit issues
  private readonly GCP_DELETE_BATCH_SIZE = this.validateBatchSize(
    parseInt(process.env['GCP_DELETE_BATCH_SIZE'] ?? '10', 10)
  );
  private readonly GCP_DELETE_CONCURRENCY_LIMIT = this.validateConcurrencyLimit(
    parseInt(process.env['GCP_DELETE_CONCURRENCY_LIMIT'] ?? '2', 10)
  );

  /**
   * Validate batch size is within safe range
   * Min: 1 (must process at least one record)
   * Max: 50 (prevents memory issues with large batches)
   * Default: 10 (conservative default for reliability)
   */
  private validateBatchSize(value: number): number {
    const MIN_BATCH_SIZE = 1;
    const MAX_BATCH_SIZE = 50;
    const DEFAULT_BATCH_SIZE = 10;

    if (isNaN(value) || value < MIN_BATCH_SIZE || value > MAX_BATCH_SIZE) {
      this.logger.warn(
        `Invalid GCP_DELETE_BATCH_SIZE: ${value}. Using default: ${DEFAULT_BATCH_SIZE}. ` +
          `Valid range: ${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE}`
      );
      return DEFAULT_BATCH_SIZE;
    }

    return value;
  }

  /**
   * Validate concurrency limit is within safe range
   * Min: 1 (must process at least one record at a time)
   * Max: 10 (prevents overwhelming GCP API and hitting rate limits)
   * Default: 2 (conservative default for reliability)
   */
  private validateConcurrencyLimit(value: number): number {
    const MIN_CONCURRENCY = 1;
    const MAX_CONCURRENCY = 10;
    const DEFAULT_CONCURRENCY = 2;

    if (isNaN(value) || value < MIN_CONCURRENCY || value > MAX_CONCURRENCY) {
      this.logger.warn(
        `Invalid GCP_DELETE_CONCURRENCY_LIMIT: ${value}. Using default: ${DEFAULT_CONCURRENCY}. ` +
          `Valid range: ${MIN_CONCURRENCY}-${MAX_CONCURRENCY}`
      );
      return DEFAULT_CONCURRENCY;
    }

    return value;
  }

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly orgRepository: OrganizationRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    @Inject(AUTH_PROVIDER_FACTORY) private readonly authProviderFactory: AuthProviderFactory,
    private readonly outboxRepo: OutboxRepository,
    private readonly tenantResolutionService: TenantResolutionService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Get the default auth provider (lazy-loaded)
   */
  private getProvider(): IAuthProvider {
    if (!this.authProvider) {
      const provider = this.authProviderFactory.getDefaultProvider();
      if (!provider) {
        throw new Error('No auth provider configured. Please configure GCP Identity Platform.');
      }
      this.authProvider = provider;
    }
    return this.authProvider;
  }

  async execute(command: DeleteAccountCommand): Promise<void> {
    this.logger.log(
      `[DeleteAccountHandler] Starting account deletion: actor=${command.actorId}, target=${command.targetUserId}, tenant=${command.tenantId}`
    );

    const authProvider = this.getProvider();

    let deletedOrganizationId: number | null = null;
    let deletedOrganizationSlug: string | null = null;
    let organizationWasDeleted = false;

    await this.db.transaction(async (tx) => {
      // CRITICAL FIX #8: Fetch user and organization INSIDE transaction for consistency
      const { user, org } = await this.fetchUserAndOrganization(command, tx);
      deletedOrganizationId = org.id;
      deletedOrganizationSlug = org.slug;
      const isOwner = org.ownerId === user.id;
      const isSelfDeletion = command.actorId === command.targetUserId;

      // CRITICAL SAFEGUARD #1: Only owner can delete owner account (self-deletion only)
      if (isOwner && !isSelfDeletion) {
        this.logger.warn(
          `[DeleteAccountHandler] REJECTED: Admin ${command.actorId} attempted to delete owner ${command.targetUserId}`
        );
        throw Errors.businessoperationNotAllowed001({
          reason:
            'Only the organization owner can delete their own account. Admin cannot delete owner accounts.'
        });
      }

      // Query user count INSIDE transaction with row lock to prevent race conditions
      let deletedUserCount = 1;
      if (isOwner) {
        // CRITICAL FIX #3: Use SELECT FOR UPDATE to lock rows and prevent TOCTOU race condition
        const userCount = await this.authRepository.countByOrganizationWithLock(
          command.tenantId,
          tx
        );

        // If owner is NOT the sole member, REJECT deletion
        if (userCount > 1) {
          this.logger.warn(
            `[DeleteAccountHandler] REJECTED: Owner ${command.targetUserId} attempted self-deletion with ${userCount - 1} other member(s) remaining`
          );
          throw Errors.businessoperationNotAllowed001({
            reason: `Cannot delete owner account while ${userCount - 1} other member(s) exist. Please transfer ownership first.`
          });
        }

        deletedUserCount = userCount;
        this.logger.log(
          `[DeleteAccountHandler] Owner is sole member - proceeding with organization deletion`
        );
      }

      if (isOwner) {
        organizationWasDeleted = true;
        await this.deleteOrganizationOwner(tx, command, org, authProvider);
      } else {
        await this.deleteRegularUser(tx, command, user, org, authProvider);
      }

      // Audit log (in same transaction) with pre-computed user count
      await this.createAuditLog(tx, command, isOwner, deletedUserCount);

      this.logger.log(
        `[DeleteAccountHandler] Database transaction completed successfully for ${command.targetUserId}`
      );
    });

    if (organizationWasDeleted && deletedOrganizationId !== null) {
      await this.tenantResolutionService.invalidateTenantCache(deletedOrganizationId, {
        previousSlug: deletedOrganizationSlug
      });
    }

    this.logger.log(
      `[DeleteAccountHandler] Account deletion fully completed for ${command.targetUserId}`
    );
  }

  /**
   * Fetch user and organization, validate they exist
   * Now accepts optional transaction parameter for consistency
   */
  private async fetchUserAndOrganization(
    command: DeleteAccountCommand,
    tx?: NodePgDatabase
  ): Promise<{
    user: typeof users.$inferSelect;
    org: typeof organizations.$inferSelect;
  }> {
    const targetUserIdNum = this.validateTargetUserId(command.targetUserId);

    const user = (await this.fetchUserWithTransaction(tx, command.tenantId, targetUserIdNum)) as
      | typeof users.$inferSelect
      | null;

    if (!user) {
      this.logUserNotFoundDiagnostic(command.tenantId, targetUserIdNum);
      throw Errors.useruserWithId001({ userId: command.targetUserId });
    }

    const org = await this.fetchOrganizationWithTransaction(tx, command.tenantId);
    if (!org) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Organization not found'
      });
    }

    return { user: user as typeof users.$inferSelect, org };
  }

  private validateTargetUserId(targetUserId: string): number {
    const targetUserIdNum = Number(targetUserId);

    if (!Number.isInteger(targetUserIdNum) || targetUserIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'targetUserId',
        expectedType: 'positive integer'
      });
    }

    return targetUserIdNum;
  }

  private async fetchUserWithTransaction(
    tx: NodePgDatabase | undefined,
    tenantId: string,
    userId: number
  ): Promise<typeof users.$inferSelect | null> {
    return tx
      ? await this.authRepository.findByIdWithTransaction(tenantId, tx, userId)
      : await this.authRepository.findById(tenantId, userId);
  }

  private logUserNotFoundDiagnostic(tenantId: string, userId: number): void {
    this.logger.error('[DeleteAccountHandler] USER NOT FOUND - tenant-scoped diagnostic', {
      tenantId,
      userId
    });
  }

  private async fetchOrganizationWithTransaction(
    tx: NodePgDatabase | undefined,
    tenantId: string
  ): Promise<typeof organizations.$inferSelect | null> {
    return tx
      ? await this.orgRepository.findByIdWithTransaction(tenantId, tx)
      : await this.orgRepository.findById(tenantId);
  }

  /**
   * Delete organization owner (cascades to all users)
   * CRITICAL: GCP deletion happens INSIDE transaction BEFORE database deletion
   */
  private async deleteOrganizationOwner(
    tx: NodePgDatabase,
    command: DeleteAccountCommand,
    org: { id: number; gcpTenantId: string | null },
    authProvider: IAuthProvider
  ): Promise<void> {
    this.logger.log(
      `[DeleteAccountHandler] Deleting entire organization ${command.tenantId} (owner deletion) - mode: ${this.USE_SOFT_DELETE ? 'SOFT DELETE' : 'HARD DELETE'}`
    );

    // Get all users in organization (within transaction for consistency)
    const orgUsers = await this.authRepository.findByOrganizationWithTransaction(
      command.tenantId,
      tx
    );

    // CRITICAL: Delete from GCP BEFORE database deletion (only for hard delete)
    if (!this.USE_SOFT_DELETE && org.gcpTenantId) {
      this.logger.log(
        `[DeleteAccountHandler] Loading identities for ${orgUsers.length} users in organization`
      );

      // Batch load all primary identities
      const userIds = orgUsers.map((user) => user.id);
      const identities = await this.userIdentityRepository.findPrimaryByUserIds(userIds);

      // Delete users from GCP using batch processing - if ANY fails, transaction will rollback
      const identitiesWithProviderUid = identities.filter((i) => i.providerUid);
      const totalToDelete = identitiesWithProviderUid.length;
      let deletedCount = 0;

      this.logger.log(
        `[DeleteAccountHandler] Starting batch GCP deletion: ${totalToDelete} users, batch size=${this.GCP_DELETE_BATCH_SIZE}, concurrency=${this.GCP_DELETE_CONCURRENCY_LIMIT}`
      );

      // Group identities into batches for processing
      const chunkedIdentities = chunk(identitiesWithProviderUid, this.GCP_DELETE_BATCH_SIZE);

      for (const batch of chunkedIdentities) {
        // Process batch with concurrency control
        const promises = batch
          .filter(
            (identity): identity is typeof identity & { providerUid: string } =>
              identity.providerUid !== undefined
          )
          .slice(0, this.GCP_DELETE_CONCURRENCY_LIMIT)
          .map((identity) =>
            this.deleteUserFromGCP(identity.providerUid, org.gcpTenantId ?? '', authProvider)
          );

        await Promise.all(promises);
        deletedCount += batch.length;
      }

      this.logger.log(
        `[DeleteAccountHandler] Successfully deleted ${deletedCount} users from GCP Identity Platform in ${chunkedIdentities.length} batch(es)`
      );
    } else {
      // CRITICAL WARNING: Organization users will be deleted from database but remain in Firebase/GCP
      const skipReason = this.USE_SOFT_DELETE
        ? 'SOFT_DELETE_MODE - Organization and users remain in GCP for data retention'
        : !org.gcpTenantId
          ? 'NO_GCP_TENANT_ID - Organization missing GCP tenant, cannot delete users from GCP'
          : 'UNKNOWN';

      this.logger.warn(
        `[DeleteAccountHandler] SKIPPING GCP DELETION for org ${org.id}: ${skipReason}`
      );
    }

    // Delete organization (soft or hard delete)
    if (this.USE_SOFT_DELETE) {
      // CRITICAL FIX #4: Soft delete CASCADE - also soft delete all users
      await this.authRepository.softDeleteAllByOrganization(command.tenantId, tx);
      await this.orgRepository.softDeleteWithTransaction(tx, org.id);
      this.logger.log(
        `[DeleteAccountHandler] Successfully soft deleted organization ${command.tenantId} with ${orgUsers.length} users (data preserved)`
      );
    } else {
      // Hard delete - CASCADE will handle users
      await this.orgRepository.deleteWithTransaction(tx, org.id);
      this.logger.log(
        `[DeleteAccountHandler] Successfully hard deleted organization ${command.tenantId} with ${orgUsers.length} users`
      );
    }

    // Publish ORG_DELETED event to outbox
    await this.outboxRepo.insert(tx, {
      eventId: randomUUID(),
      eventType: 'organization.deleted',
      aggregateId: org.id.toString(),
      aggregateVersion: '1',
      payload: {
        tenantId: command.tenantId,
        organizationId: org.id.toString(),
        deletedUserCount: orgUsers.length,
        deletedBy: command.actorId,
        reason: this.sanitizeReason(command.reason),
        timestamp: new Date().toISOString()
      },
      correlationId: command.correlationId,
      causationId: command.causationId,
      tenantId: command.tenantId,
      schemaVersion: AUTH_EVENT_SCHEMA_VERSION
    });
  }

  /**
   * Delete regular user (not organization owner)
   * CRITICAL: GCP deletion happens INSIDE transaction BEFORE database deletion
   */
  private async deleteRegularUser(
    tx: NodePgDatabase,
    command: DeleteAccountCommand,
    user: { id: number },
    org: { gcpTenantId: string | null },
    authProvider: IAuthProvider
  ): Promise<void> {
    this.logger.log(
      `[DeleteAccountHandler] Deleting user ${command.targetUserId} - mode: ${this.USE_SOFT_DELETE ? 'SOFT DELETE' : 'HARD DELETE'}`
    );

    const identity = await this.userIdentityRepository.findPrimaryByUserId(user.id);
    this.logUserIdentityFetched(user.id, identity, org.gcpTenantId);

    await this.handleGCPUserDeletion(identity, org.gcpTenantId, authProvider, command.targetUserId);
    await this.deleteUserFromDatabase(tx, command.tenantId, user.id, command.targetUserId);
    await this.publishUserDeletedEvent(tx, command, user.id);
  }

  private logUserIdentityFetched(
    userId: number,
    identity: UserIdentity | null,
    gcpTenantId: string | null
  ): void {
    this.logger.debug('[DeleteAccountHandler] User identity fetched:', {
      userId,
      hasIdentity: !!identity,
      providerUid: identity?.providerUid ?? 'NONE',
      gcpTenantId: gcpTenantId ?? 'NONE',
      identityProvider: identity?.provider ?? 'NONE',
      willDeleteFromGCP: !this.USE_SOFT_DELETE && !!identity?.providerUid && !!gcpTenantId
    });
  }

  private async handleGCPUserDeletion(
    identity: UserIdentity | null,
    gcpTenantId: string | null,
    authProvider: IAuthProvider,
    targetUserId: string
  ): Promise<void> {
    if (!this.USE_SOFT_DELETE && identity?.providerUid && gcpTenantId) {
      this.logger.log(
        `[DeleteAccountHandler] Proceeding with GCP deletion: providerUid=${identity.providerUid}, tenantId=${gcpTenantId}`
      );
      await this.deleteUserFromGCP(identity.providerUid, gcpTenantId, authProvider);
    } else {
      this.logGCPDeletionSkipped(identity, gcpTenantId, targetUserId);
    }
  }

  private logGCPDeletionSkipped(
    identity: UserIdentity | null,
    gcpTenantId: string | null,
    targetUserId: string
  ): void {
    const skipReason = this.getGCPDeletionSkipReason(identity, gcpTenantId);
    const skipDetails = this.getGCPDeletionSkipDetails(
      identity,
      gcpTenantId,
      targetUserId,
      skipReason
    );

    this.logger.warn(
      `[DeleteAccountHandler] ⚠️ SKIPPING GCP DELETION for user ${targetUserId}: ${skipReason}`,
      skipDetails
    );
  }

  private getGCPDeletionSkipReason(
    identity: UserIdentity | null,
    gcpTenantId: string | null
  ): string {
    if (this.USE_SOFT_DELETE) {
      return 'SOFT_DELETE_MODE - User remains in GCP for data retention';
    }
    if (!identity?.providerUid) {
      return 'NO_PROVIDER_UID - User identity missing GCP link, cannot delete from GCP';
    }
    if (!gcpTenantId) {
      return 'NO_GCP_TENANT_ID - Organization missing GCP tenant, cannot delete from GCP';
    }
    return 'UNKNOWN';
  }

  private getGCPDeletionSkipDetails(
    identity: UserIdentity | null,
    gcpTenantId: string | null,
    targetUserId: string,
    skipReason: string
  ): Record<string, unknown> {
    return {
      reason: skipReason,
      softDeleteMode: this.USE_SOFT_DELETE,
      hasProviderUid: !!identity?.providerUid,
      providerUid: identity?.providerUid ?? 'NONE',
      hasGcpTenantId: !!gcpTenantId,
      gcpTenantId: gcpTenantId ?? 'NONE',
      userId: targetUserId,
      impact: this.USE_SOFT_DELETE
        ? 'Expected - user data preserved for retention period'
        : 'POTENTIAL ORPHAN - User may still exist in GCP Identity Platform'
    };
  }

  private async deleteUserFromDatabase(
    tx: NodePgDatabase,
    tenantId: string,
    userId: number,
    targetUserId: string
  ): Promise<void> {
    if (this.USE_SOFT_DELETE) {
      await this.authRepository.softDeleteWithTransaction(tenantId, tx, userId);
      this.logger.log(
        `[DeleteAccountHandler] Successfully soft deleted user ${targetUserId} (data preserved)`
      );
    } else {
      await this.authRepository.deleteWithTransaction(tenantId, tx, userId);
      this.logger.log(`[DeleteAccountHandler] Successfully hard deleted user ${targetUserId}`);
    }
  }

  private async publishUserDeletedEvent(
    tx: NodePgDatabase,
    command: DeleteAccountCommand,
    userId: number
  ): Promise<void> {
    await this.outboxRepo.insert(tx, {
      eventId: randomUUID(),
      eventType: 'user.deleted',
      aggregateId: userId.toString(),
      aggregateVersion: '1',
      payload: {
        tenantId: command.tenantId,
        userId: userId.toString(),
        deletedBy: command.actorId,
        reason: this.sanitizeReason(command.reason),
        timestamp: new Date().toISOString()
      },
      correlationId: command.correlationId,
      causationId: command.causationId,
      tenantId: command.tenantId,
      schemaVersion: AUTH_EVENT_SCHEMA_VERSION
    });
  }

  /**
   * Delete user from GCP Identity Platform
   * CRITICAL: This happens INSIDE transaction - if it fails, transaction rolls back
   */
  private async deleteUserFromGCP(
    providerUid: string,
    gcpTenantId: string,
    authProvider: IAuthProvider
  ): Promise<void> {
    try {
      this.logger.debug(
        `[DeleteAccountHandler] BEFORE GCP deletion - providerUid: ${providerUid}, tenantId: ${gcpTenantId}, provider: ${authProvider.name}, type: ${authProvider.type}`
      );

      // DEBUGGING: Log provider availability
      const isAvailable = await authProvider.isAvailable();
      this.logger.debug(
        `[DeleteAccountHandler] GCP provider availability check: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`
      );

      if (!isAvailable) {
        this.logger.error(
          `[DeleteAccountHandler] GCP provider is NOT AVAILABLE - deletion will fail`
        );
      }

      // DEBUGGING: Verify provider UID format
      if (!providerUid || providerUid.trim().length === 0) {
        throw new Error('Provider UID is empty or invalid');
      }

      // Attempt GCP deletion with detailed timing
      const startTime = Date.now();
      this.logger.log(
        `[DeleteAccountHandler] Starting GCP user deletion: providerUid=${providerUid}, tenantId=${gcpTenantId}`
      );

      await authProvider.deleteUser(providerUid, gcpTenantId);

      const duration = Date.now() - startTime;
      this.logger.log(
        `[DeleteAccountHandler] GCP user deletion SUCCESSFUL: providerUid=${providerUid}, duration=${duration}ms`
      );
    } catch (error) {
      // CRITICAL: Enhanced error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'No stack trace';
      const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';

      this.logger.error(
        `[DeleteAccountHandler] GCP deletion FAILED - providerUid: ${providerUid}, tenantId: ${gcpTenantId}`,
        {
          error: {
            name: errorName,
            message: errorMessage,
            stack: errorStack
          },
          context: {
            providerUid,
            gcpTenantId,
            providerName: authProvider.name,
            providerType: authProvider.type
          }
        }
      );

      // Re-throw with enhanced message
      throw new Error(
        `Failed to delete GCP user ${providerUid} from tenant ${gcpTenantId}: ${errorMessage} (error type: ${errorName})`
      );
    }
  }

  /**
   * Create audit log event
   */
  private async createAuditLog(
    tx: NodePgDatabase,
    command: DeleteAccountCommand,
    isOwner: boolean,
    deletedUserCount: number
  ): Promise<void> {
    await this.outboxRepo.insert(
      tx,
      buildAuthAuditEvent({
        eventType: 'account.deleted.audit',
        tenantId: command.tenantId,
        actorId: command.actorId,
        requestId: command.requestId,
        aggregateId: command.targetUserId,
        action: isOwner ? 'DELETE_ORGANIZATION' : 'DELETE_ACCOUNT',
        target: {
          entityType: isOwner ? 'organization' : 'user',
          entityId: command.targetUserId
        },
        details: {
          cascaded: isOwner,
          deletedUserCount,
          reasonProvided: Boolean(command.reason?.trim())
        },
        correlationId: command.correlationId,
        causationId: command.causationId
      })
    );
  }

  /**
   * Keep domain-event reason fields sanitized where they still exist, while
   * audit events stay metadata-only.
   */
  private sanitizeReason(reason: string | undefined): string | undefined {
    if (!reason) {
      return undefined;
    }

    const stripped = reason.replace(/<[^>]*>/g, '');
    const maxLength = 500;

    if (stripped.length > maxLength) {
      return `${stripped.slice(0, maxLength)}... (truncated)`;
    }

    return stripped;
  }
}

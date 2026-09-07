import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  count,
  and,
  eq,
  organizations,
  tenants,
  invitations,
  type NodePgDatabase,
  userTenants
} from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../common/services/tenant-resolution.service';
import { AuthRepository } from '../../../auth/repositories/auth.repository';
import { DeleteTenantCommand } from '../../commands/delete-tenant.command';
import { buildSystemAuditEvent } from '../../events';
import { TenantRepository } from '../../repositories/tenant.repository';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for deleting a tenant
 *
 * This is a DANGEROUS operation that:
 * 1. Validates tenant exists
 * 2. Captures the active member count for audit metadata
 * 3. Soft deletes memberships, invitations, users, organization, and tenant status
 * 4. Publishes TenantDeletedEvent via transactional outbox
 */
@CommandHandler(DeleteTenantCommand)
export class DeleteTenantHandler implements ICommandHandler<DeleteTenantCommand, void> {
  private readonly logger = new Logger(DeleteTenantHandler.name);

  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly authRepository: AuthRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly tenantResolutionService: TenantResolutionService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: DeleteTenantCommand): Promise<void> {
    this.logger.warn(`DELETING tenant ${command.targetTenantId} by actor ${command.actorId}`);

    // Validate targetTenantId is a valid number
    const targetTenantId = Number(command.targetTenantId);
    if (!Number.isInteger(targetTenantId) || targetTenantId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'targetTenantId',
        expectedType: 'positive integer'
      });
    }

    // Step 1: Validation (before transaction)
    // System operations are not tenant-scoped to a caller tenant.
    // Validate existence by target tenant id directly.
    await this.tenantRepo.findByIdOrThrow(targetTenantId, targetTenantId);

    // Capture active members for audit payloads before the soft delete.
    const [memberCountResult] = await this.db
      .select({ count: count() })
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, targetTenantId), eq(userTenants.isActive, true)));

    const activeMemberCount = Number(memberCountResult?.count ?? 0);

    if (activeMemberCount > 1) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Cannot delete a tenant with multiple active members'
      });
    }

    const [existingOrganization] = await this.db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.tenantId, targetTenantId))
      .limit(1);

    // Step 2: Single transaction for all writes
    await this.db.transaction(async (tx) => {
      const deletedAt = new Date();
      const [organizationRow] = await tx
        .select({ organizationId: organizations.id })
        .from(organizations)
        .where(eq(organizations.tenantId, targetTenantId))
        .limit(1);

      // 2a. Deactivate memberships so the tenant immediately disappears from access inventories.
      await tx
        .update(userTenants)
        .set({
          isActive: false,
          isDefault: false,
          updatedAt: deletedAt
        })
        .where(eq(userTenants.tenantId, targetTenantId));

      // 2b. Cancel any open invitations for the organization tied to this tenant.
      if (organizationRow) {
        await tx
          .update(invitations)
          .set({
            status: 'cancelled',
            updatedAt: deletedAt
          })
          .where(
            and(
              eq(invitations.organizationId, organizationRow.organizationId),
              eq(invitations.status, 'pending')
            )
          );
      }

      // 2c. Soft delete users in the organization.
      await this.authRepository.softDeleteAllByOrganization(String(targetTenantId), tx);

      // 2d. Soft delete organization (sets deletedAt, isActive = false)
      await tx
        .update(organizations)
        .set({
          deletedAt,
          isActive: false,
          updatedAt: deletedAt
        })
        .where(eq(organizations.tenantId, targetTenantId));

      // 2e. Mark tenant as deleted instead of hard-deleting the row.
      await tx
        .update(tenants)
        .set({
          status: 'deleted',
          updatedAt: deletedAt
        })
        .where(eq(tenants.id, targetTenantId));

      // 2f. Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.deleted',
        aggregateId: String(targetTenantId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(targetTenantId),
          deletedBy: command.actorId,
          memberCount: activeMemberCount,
          deletedAt: deletedAt.toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(targetTenantId),
        schemaVersion: '1.0'
      });

      await this.auditOutbox.insert(
        tx,
        buildSystemAuditEvent({
          eventType: 'system.tenant.deleted.audit',
          tenantId: targetTenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: targetTenantId,
          action: 'DELETE_SYSTEM_TENANT',
          target: {
            entityType: 'tenant',
            entityId: String(targetTenantId)
          },
          details: {
            activeMemberCount,
            cancelledPendingInvitations: Boolean(organizationRow),
            lifecycleState: 'deleted'
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    await this.tenantResolutionService.invalidateTenantCache(targetTenantId, {
      previousSlug: existingOrganization?.slug ?? null
    });

    this.logger.warn(`Tenant ${targetTenantId} deleted successfully`);
  }
}

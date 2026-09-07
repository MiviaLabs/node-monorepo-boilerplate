import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, organizations, type NodePgDatabase, userTenants } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UpdateMemberRoleCommand } from '../../commands/update-member-role.command';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';

/**
 * Update member role command handler
 *
 * Handles updating a tenant member's role and publishes the corresponding event
 */
@CommandHandler(UpdateMemberRoleCommand)
export class UpdateMemberRoleHandler implements ICommandHandler<UpdateMemberRoleCommand> {
  private readonly logger = new Logger(UpdateMemberRoleHandler.name);

  constructor(
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateMemberRoleCommand): Promise<{
    memberId: string;
    userId: number;
    tenantId: number;
    role: string;
    isActive: boolean;
    updatedAt: Date;
  }> {
    this.logger.debug(
      `Updating member ${command.memberId} role to ${command.role} in tenant: ${command.tenantId} by actor: ${command.actorId}`
    );

    // Validate tenantId is a valid number
    const organizationId = Number(command.tenantId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    // Validate memberId is a valid number
    const memberId = Number(command.memberId);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'memberId',
        expectedType: 'positive integer'
      });
    }

    // Step 1: Validation (before transaction)
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    // Get current membership to verify it exists
    const [currentMembership] = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, memberId), eq(userTenants.tenantId, organization.tenantId)))
      .limit(1);

    if (!currentMembership) {
      throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
    }

    // Cannot change owner role
    if (currentMembership.role === 'tenant_owner' && command.role !== 'tenant_owner') {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'Cannot change owner role'
      });
    }

    // Step 2: Single transaction for all writes
    const result = await this.db.transaction(async (tx) => {
      // Update the role
      const [updated] = await tx
        .update(userTenants)
        .set({
          role: command.role as 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer',
          updatedAt: new Date()
        })
        .where(
          and(eq(userTenants.userId, memberId), eq(userTenants.tenantId, organization.tenantId))
        )
        .returning();

      if (!updated) {
        throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
      }

      // Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.member.role.updated',
        aggregateId: String(memberId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(organizationId),
          userId: String(memberId),
          previousRole: currentMembership.role,
          newRole: command.role,
          updatedBy: command.actorId,
          updatedAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(organizationId),
        schemaVersion: '1.0'
      });

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.member.role.updated.audit',
          tenantId: organizationId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: memberId,
          action: 'UPDATE_MEMBER_ROLE',
          details: {
            userId: String(memberId),
            previousRole: currentMembership.role,
            newRole: command.role
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return updated;
    });

    this.logger.log(
      `Member ${memberId} role updated to ${command.role} in tenant ${organizationId}`
    );

    return {
      memberId: command.memberId,
      userId: result.userId,
      tenantId: result.tenantId,
      role: result.role,
      isActive: result.isActive,
      updatedAt: result.updatedAt
    };
  }
}

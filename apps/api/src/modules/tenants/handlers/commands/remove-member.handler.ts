import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, organizations } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AuthRepository } from '../../../auth/repositories/auth.repository';
import { RemoveMemberCommand } from '../../commands/remove-member.command';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';
import { UserTenantRepository } from '../../repositories/user-tenant.repository';

import type { NodePgDatabase } from '@package/db-core';

/**
 * Remove member command handler
 *
 * Handles removing a member from the tenant and publishes the corresponding event
 */
@CommandHandler(RemoveMemberCommand)
export class RemoveMemberHandler implements ICommandHandler<RemoveMemberCommand> {
  private readonly logger = new Logger(RemoveMemberHandler.name);

  constructor(
    private readonly userTenantRepo: UserTenantRepository,
    private readonly authRepository: AuthRepository,
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: RemoveMemberCommand): Promise<void> {
    this.logger.debug(
      `Removing member ${command.memberId} from tenant: ${command.tenantId} by actor: ${command.actorId}`
    );

    // Validate IDs are valid numbers
    const organizationId = Number(command.tenantId);
    const memberId = Number(command.memberId);

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'memberId',
        expectedType: 'positive integer'
      });
    }

    // Validate actor is not removing themselves
    const actorId = Number(command.actorId);
    if (actorId === memberId) {
      throw Errors.validationvalidationFailedField001({
        field: 'actorId'
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

    const membership = await this.userTenantRepo.findByUserAndTenant(
      organization.tenantId,
      memberId
    );

    // Organization owners cannot be removed even if they are legacy direct members without a
    // user_tenants row.
    if (membership?.role === 'tenant_owner' || organization.ownerId === memberId) {
      throw Errors.validationvalidationFailedField001({
        field: 'role'
      });
    }

    // Step 2: Single transaction for all writes
    await this.db.transaction(async (tx) => {
      // Members are listed by organization-scoped user rows, so removal must soft-delete the user
      // within the organization and let the repository deactivate any tenant memberships.
      await this.authRepository.softDeleteWithTransaction(String(organizationId), tx, memberId);

      // Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.member.removed',
        aggregateId: String(memberId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(organizationId),
          userId: String(memberId),
          removedBy: command.actorId,
          reason: 'Removed by tenant admin',
          removedAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(organizationId),
        schemaVersion: '1.0'
      });

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.member.removed.audit',
          tenantId: organizationId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: memberId,
          action: 'REMOVE_MEMBER',
          details: {
            userId: String(memberId),
            removedRole: membership?.role ?? 'tenant_user'
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(`Member ${memberId} removed from tenant ${organizationId} successfully`);
  }
}

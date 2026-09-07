import { createHash } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { InvitationRepository, UserTenantRepository } from '../../../tenants/repositories';
import { AcceptInvitationCommand } from '../../commands/accept-invitation.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';

import type { NodePgDatabase } from '@package/db-core';

interface AcceptInvitationResult {
  status: 'accepted';
  tenantId: string;
  invitationId: string;
  membershipCreated: boolean;
}

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<
  AcceptInvitationCommand,
  AcceptInvitationResult
> {
  private readonly logger = new Logger(AcceptInvitationHandler.name);

  constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly authRepository: AuthRepository,
    private readonly outboxRepository: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<AcceptInvitationResult> {
    const actorId = Number(command.actorId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'actorId',
        expectedType: 'positive integer'
      });
    }

    const invitationToken = command.invitationToken.trim();
    if (!invitationToken) {
      throw Errors.validationinvalidValueFor002({
        field: 'invitationToken',
        expectedType: 'non-empty string'
      });
    }

    const tokenHash = createHash('sha256').update(invitationToken).digest('hex');
    const invitation = await this.invitationRepository.findPendingByTokenHashGlobal(tokenHash);
    if (!invitation) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Invalid or already-used invitation token'
      });
    }
    const tenantId = invitation.organizationId;
    if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Invitation has expired'
      });
    }

    if (!invitation.emailHash) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Invitation is missing the required email binding'
      });
    }

    const invitedEmailHash = invitation.emailHash;
    const actorEmailHash = await this.resolveActorEmailHash(actorId, command.actorEmail);
    if (!actorEmailHash || invitedEmailHash !== actorEmailHash) {
      throw Errors.businessoperationNotAllowed001({
        reason: 'Invitation email does not match the authenticated account'
      });
    }

    const role = this.normalizeRole(invitation.role);
    const organization = await this.authRepository.findOrganizationById(invitation.organizationId);
    const resolvedMembershipTenantId = organization?.tenantId;
    if (!Number.isInteger(resolvedMembershipTenantId) || (resolvedMembershipTenantId ?? 0) <= 0) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }
    const membershipTenantId = resolvedMembershipTenantId as number;

    const result = await this.db.transaction(async (tx) => {
      const existingMembership = await this.userTenantRepository.findByUserAndTenant(
        membershipTenantId,
        actorId
      );
      let membershipCreated = false;

      if (!existingMembership) {
        await this.userTenantRepository.createMembershipWithTransaction(tx, {
          userId: actorId,
          tenantId: membershipTenantId,
          role,
          isActive: true,
          isDefault: false
        });
        membershipCreated = true;
      }

      const acceptedInvitation = await this.invitationRepository.markAsAcceptedWithTransaction(
        tx,
        tenantId,
        invitation.id
      );
      if (!acceptedInvitation) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invitation is no longer available'
        });
      }

      await this.outboxRepository.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.invitation.accepted.audit',
          tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: invitation.id,
          action: 'ACCEPT_INVITATION',
          target: {
            entityType: 'invitation',
            entityId: String(invitation.id)
          },
          details: {
            membershipCreated,
            role
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return {
        status: 'accepted' as const,
        tenantId: String(tenantId),
        invitationId: String(invitation.id),
        membershipCreated
      };
    });

    this.logger.log(
      `Accepted invitation=${result.invitationId} for tenant=${result.tenantId} actor=${command.actorId} membershipCreated=${result.membershipCreated}`
    );

    return result;
  }

  private normalizeRole(
    role: string | null | undefined
  ): 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer' {
    switch (role) {
      case 'tenant_owner':
      case 'tenant_admin':
      case 'tenant_viewer':
        return role;
      default:
        return 'tenant_user' as const;
    }
  }

  private async resolveActorEmailHash(
    actorId: number,
    actorEmail: string | undefined
  ): Promise<string | null> {
    const normalizedEmail = actorEmail?.trim().toLowerCase();
    if (normalizedEmail) {
      return hashEmail(normalizedEmail);
    }

    const actor = await this.authRepository.findByIdGlobal(actorId);
    return actor?.emailHash ?? null;
  }
}

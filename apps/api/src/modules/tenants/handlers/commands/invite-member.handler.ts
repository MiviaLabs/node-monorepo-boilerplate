import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, isNull, organizations, type NodePgDatabase, users } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { InviteMemberCommand } from '../../commands/invite-member.command';
import { MEMBER_INVITED_EVENT_VERSION } from '../../events/member-invited.event';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';
import { InvitationRepository, UserTenantRepository } from '../../repositories';

// eslint-disable-next-line local-rules/prefer-const-enum
export type TenantMemberRole = 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

export interface InviteMemberResult {
  userId: number | null;
  invitationId: number | null;
  invitationToken: string | null;
}

/**
 * Invite member command handler
 *
 * Handles tenant invitation record creation for both existing and new users.
 * The write operation and outbox insert are guaranteed in the same transaction.
 */
@CommandHandler(InviteMemberCommand)
export class InviteMemberHandler implements ICommandHandler<InviteMemberCommand> {
  private readonly logger = new Logger(InviteMemberHandler.name);

  constructor(
    private readonly userTenantRepo: UserTenantRepository,
    private readonly invitationRepo: InvitationRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly configService: ConfigService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: InviteMemberCommand): Promise<InviteMemberResult> {
    this.logger.debug(
      `Inviting member to tenant=${command.tenantId} by actor=${command.actorId} (PII redacted)`
    );

    const tenantId = Number(command.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);
    if (!organization) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    const normalizedEmail = command.invitation.email.trim().toLowerCase();
    const emailHash = hashEmail(normalizedEmail);
    const role = (command.invitation.roles?.[0] ?? 'tenant_user') as TenantMemberRole;
    const actorIdAsNumber = Number(command.actorId);
    const emailProvider = (this.configService.get<string>('EMAIL_PROVIDER') ?? '')
      .trim()
      .toLowerCase();
    const shouldPublishInvitationEvent = emailProvider !== '';
    const shouldDispatchEmail = emailProvider !== '' && emailProvider !== 'mock';

    const [existingUser] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.emailHash, emailHash), isNull(users.deletedAt)))
      .limit(1);

    if (existingUser) {
      const existingMembership = await this.userTenantRepo.findByUserAndTenant(
        organization.tenantId,
        existingUser.id
      );
      if (existingMembership) {
        throw Errors.databaserecordAlreadyExists003({ entity: 'UserTenant' });
      }
    }

    const result = await this.db.transaction(async (tx) => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const existingPendingInvitation = await this.invitationRepo.findPendingByEmailHash(
        tenantId,
        emailHash
      );

      const invitationResult = existingPendingInvitation
        ? {
            invitation:
              (await this.invitationRepo.updatePendingInvitationWithTransaction(
                tx,
                tenantId,
                existingPendingInvitation.id,
                {
                  role,
                  invitedByUserId: Number.isInteger(actorIdAsNumber) ? actorIdAsNumber : undefined,
                  expiresAt
                }
              )) ?? existingPendingInvitation,
            invitationToken: await this.invitationRepo.rotatePendingTokenWithTransaction(
              tx,
              tenantId,
              existingPendingInvitation.id
            )
          }
        : await this.invitationRepo.createInvitationWithTransaction(tx, {
            organizationId: tenantId,
            email: normalizedEmail,
            invitedByUserId: Number.isInteger(actorIdAsNumber) ? actorIdAsNumber : undefined,
            role,
            expiresAt
          });

      if (!invitationResult.invitationToken) {
        throw Errors.systeminternalServerError001({});
      }
      if (shouldPublishInvitationEvent) {
        const payload = existingUser
          ? {
              tenantId: String(tenantId),
              userId: String(existingUser.id),
              role,
              emailHash,
              invitedBy: command.actorId,
              invitedAt: invitationResult.invitation.createdAt.toISOString(),
              expiresAt: invitationResult.invitation.expiresAt?.toISOString()
            }
          : {
              tenantId: String(tenantId),
              invitationId: String(invitationResult.invitation.id),
              role,
              emailHash,
              invitedBy: command.actorId,
              invitedAt: invitationResult.invitation.createdAt.toISOString(),
              expiresAt: invitationResult.invitation.expiresAt?.toISOString()
            };

        await this.outboxRepo.insert(tx, {
          eventId: randomUUID(),
          eventType: 'tenant.member.invited',
          aggregateId: String(invitationResult.invitation.id),
          aggregateVersion: String(MEMBER_INVITED_EVENT_VERSION),
          payload,
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: String(tenantId),
          schemaVersion: '3.0'
        });
      }

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.member.invited.audit',
          tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: invitationResult.invitation.id,
          action: 'INVITE_MEMBER',
          details: {
            targetType: existingUser ? 'existing_account_invitation' : 'invitation',
            invitationId: String(invitationResult.invitation.id),
            ...(existingUser ? { userId: String(existingUser.id) } : {}),
            role
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return {
        userId: existingUser?.id ?? null,
        invitationId: invitationResult.invitation.id,
        invitationToken: shouldDispatchEmail ? null : invitationResult.invitationToken
      };
    });

    this.logger.log(
      `Member invitation processed for tenant=${tenantId}, userId=${result.userId ?? 'n/a'}, invitationId=${result.invitationId ?? 'n/a'}`
    );

    return result;
  }
}

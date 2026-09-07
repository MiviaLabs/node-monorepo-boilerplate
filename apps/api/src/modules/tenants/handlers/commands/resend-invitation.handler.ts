/* eslint-disable @typescript-eslint/no-unsafe-argument */
// ^ Disabled for tx parameter: NodePgDatabase<any> from BaseRepository.transaction()
//   is compatible with repository methods expecting NodePgDatabase<Record<string, never>>

import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, organizations, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { ResendInvitationCommand } from '../../commands/resend-invitation.command';
import { MEMBER_INVITED_EVENT_VERSION } from '../../events/member-invited.event';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';
import { InvitationRepository } from '../../repositories';

export interface ResendInvitationResult {
  invitationId: string;
  invitationToken?: string;
  emailDispatched: boolean;
}

@CommandHandler(ResendInvitationCommand)
export class ResendInvitationHandler implements ICommandHandler<ResendInvitationCommand> {
  private readonly logger = new Logger(ResendInvitationHandler.name);

  constructor(
    private readonly invitationRepo: InvitationRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly configService: ConfigService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: ResendInvitationCommand): Promise<ResendInvitationResult> {
    const tenantId = Number(command.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    const invitationId = Number(command.invitationId);
    if (!Number.isInteger(invitationId) || invitationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'invitationId',
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
    const invitation = await this.invitationRepo.findById(tenantId, invitationId);
    if (invitation?.status !== 'pending') {
      throw Errors.databaserecordNotFound004({ entity: 'Invitation' });
    }

    // Check if invitation is expired and extend expiresAt if needed
    const now = new Date();
    const isExpired = invitation.expiresAt && invitation.expiresAt <= now;

    const emailProvider = (this.configService.get<string>('EMAIL_PROVIDER') ?? '')
      .trim()
      .toLowerCase();
    const shouldDispatchEmail = emailProvider !== '' && emailProvider !== 'mock';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- tx type is NodePgDatabase<any> from BaseRepository.transaction()
    const result = await this.invitationRepo.transaction(async (tx) => {
      // Extend expiresAt if expired (similar to InviteMemberHandler)
      let updatedExpiresAt = invitation.expiresAt;
      if (isExpired) {
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await this.invitationRepo.updateExpiresAt(tx, tenantId, invitationId, newExpiresAt);
        updatedExpiresAt = newExpiresAt;
      }

      const rotatedInvitationToken = await this.invitationRepo.rotatePendingTokenWithTransaction(
        tx,
        tenantId,
        invitationId
      );

      if (!rotatedInvitationToken) {
        throw Errors.databaserecordNotFound004({ entity: 'Invitation' });
      }

      if (shouldDispatchEmail) {
        await this.outboxRepo.insert(tx, {
          eventId: randomUUID(),
          eventType: 'tenant.member.invited',
          aggregateId: String(invitation.id),
          aggregateVersion: String(MEMBER_INVITED_EVENT_VERSION),
          payload: {
            tenantId: String(tenantId),
            invitationId: String(invitation.id),
            role: invitation.role,
            emailHash: invitation.emailHash,
            invitedBy: command.actorId,
            invitedAt: new Date().toISOString(),
            expiresAt: updatedExpiresAt?.toISOString()
          },
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: String(tenantId),
          schemaVersion: '3.0'
        });
      }

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.invitation.resent.audit',
          tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: invitation.id,
          action: 'RESEND_INVITATION',
          details: {
            invitationId: String(invitation.id),
            role: invitation.role,
            emailDispatched: shouldDispatchEmail,
            expirationExtended: isExpired
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return {
        invitationId: String(invitationId),
        ...(!shouldDispatchEmail ? { invitationToken: rotatedInvitationToken } : {}),
        emailDispatched: shouldDispatchEmail
      };
    });

    this.logger.log(
      `Invitation resend processed for tenant=${tenantId}, invitationId=${invitationId}, emailDispatched=${shouldDispatchEmail}`
    );

    return result;
  }
}

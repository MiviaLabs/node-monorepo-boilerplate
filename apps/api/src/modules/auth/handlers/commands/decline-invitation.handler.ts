import { createHash } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { InvitationRepository } from '../../../tenants/repositories';
import { DeclineInvitationCommand } from '../../commands/decline-invitation.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';

import type { NodePgDatabase } from '@package/db-core';

interface DeclineInvitationResult {
  status: 'declined';
  tenantId: string;
  invitationId: string;
  membershipCreated: false;
}

@CommandHandler(DeclineInvitationCommand)
export class DeclineInvitationHandler implements ICommandHandler<
  DeclineInvitationCommand,
  DeclineInvitationResult
> {
  private readonly logger = new Logger(DeclineInvitationHandler.name);

  constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly authRepository: AuthRepository,
    private readonly outboxRepository: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: DeclineInvitationCommand): Promise<DeclineInvitationResult> {
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

    const result = await this.db.transaction(async (tx) => {
      const cancelledInvitation = await this.invitationRepository.markAsCancelledWithTransaction(
        tx,
        tenantId,
        invitation.id
      );
      if (!cancelledInvitation) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invitation is no longer available'
        });
      }

      await this.outboxRepository.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.invitation.declined.audit',
          tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: invitation.id,
          action: 'DECLINE_INVITATION',
          target: {
            entityType: 'invitation',
            entityId: String(invitation.id)
          },
          details: {
            invitationStateChanged: true
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return {
        status: 'declined' as const,
        tenantId: String(tenantId),
        invitationId: String(invitation.id),
        membershipCreated: false as const
      };
    });

    this.logger.log(
      `Declined invitation=${result.invitationId} for tenant=${result.tenantId} actor=${command.actorId}`
    );

    return result;
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

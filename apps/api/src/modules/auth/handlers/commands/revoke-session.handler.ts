import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { RevokeSessionCommand } from '../../commands/revoke-session.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthSessionStoreService } from '../../services/auth-session-store.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@CommandHandler(RevokeSessionCommand)
export class RevokeSessionHandler implements ICommandHandler<RevokeSessionCommand> {
  private readonly logger = new Logger(RevokeSessionHandler.name);

  constructor(
    private readonly authSessionStore: AuthSessionStoreService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: RevokeSessionCommand): Promise<{ success: boolean }> {
    if (!command.userId || command.userId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive number'
      });
    }

    if (!command.tenantId) {
      throw Errors.validationvalidationFailedField001({ field: 'tenantId' });
    }

    if (!command.sessionId.trim()) {
      throw Errors.validationvalidationFailedField001({ field: 'sessionId' });
    }

    const session = await this.authSessionStore.getSession(command.sessionId, command.tenantId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== String(command.userId)) {
      throw new NotFoundException('Session not found');
    }

    await this.authSessionStore.revokeSessionAccessToken(command.sessionId, command.tenantId);

    await this.db.transaction(async (tx) => {
      await this.authSessionStore.revokeSession(command.sessionId, command.tenantId);

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.session.revoked.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: String(command.userId),
          action: 'REVOKE_SESSION',
          target: {
            entityType: 'session',
            entityId: command.sessionId
          },
          details: {
            sessionId: command.sessionId,
            hadRefreshTokenReference: Boolean(session.tokenId)
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(`Session ${command.sessionId} revoked for user ${command.userId}`);

    return { success: true };
  }
}

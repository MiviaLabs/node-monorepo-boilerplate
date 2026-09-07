import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UnlinkIdentityCommand } from '../../commands/unlink-identity.command';
import {
  AuthEventType,
  AuthEventSchemaVersion,
  buildAuthAuditEvent,
  type IdentityUnlinkedData
} from '../../events';
import { AuthService } from '../../services/auth.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Unlink identity command handler
 *
 * Handles unlinking identity providers from users using transactional outbox pattern.
 *
 * NOTE: Uses transactional outbox pattern for reliable event publishing.
 * The identity unlinking and event publishing happen atomically within
 * a single transaction.
 */
@CommandHandler(UnlinkIdentityCommand)
export class UnlinkIdentityHandler implements ICommandHandler<UnlinkIdentityCommand> {
  private readonly logger = new Logger(UnlinkIdentityHandler.name);

  constructor(
    private readonly authService: AuthService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UnlinkIdentityCommand): Promise<{ success: boolean }> {
    this.logger.debug(`Processing unlink identity for user ${command.userId}`);

    // Input validation
    if (!command.userId || command.userId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive number'
      });
    }

    if (!command.tenantId) {
      throw Errors.validationvalidationFailedField001({ field: 'tenantId' });
    }

    if (!command.provider) {
      throw Errors.validationvalidationFailedField001({ field: 'provider' });
    }

    if (!command.providerUid) {
      throw Errors.validationvalidationFailedField001({ field: 'providerUid' });
    }

    // Unlink identity via auth service
    await this.authService.unlinkIdentity(command.userId, command.provider, command.providerUid);

    // Event data for outbox
    const eventData: IdentityUnlinkedData = {
      tenantId: command.tenantId,
      userId: String(command.userId),
      provider: command.provider,
      providerUid: command.providerUid,
      timestamp: new Date().toISOString()
    };

    // Execute event publishing in transaction
    await this.db.transaction(async (tx) => {
      // Save event to outbox
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: AuthEventType.IDENTITY_UNLINKED,
        aggregateId: String(command.userId),
        aggregateVersion: '1',
        payload: JSON.stringify(eventData),
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: command.tenantId,
        schemaVersion: AuthEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.identity.unlinked.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: String(command.userId),
          action: 'UNLINK_IDENTITY',
          target: {
            entityType: 'user',
            entityId: String(command.userId)
          },
          details: {
            provider: String(command.provider)
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(
      `Identity provider ${command.provider} unlinked successfully for user ${command.userId}`
    );

    return { success: true };
  }
}

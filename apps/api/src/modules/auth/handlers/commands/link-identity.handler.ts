import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { LinkIdentityCommand } from '../../commands/link-identity.command';
import {
  AuthEventType,
  AuthEventSchemaVersion,
  buildAuthAuditEvent,
  type IdentityLinkedData
} from '../../events';
import { AuthService } from '../../services/auth.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Link identity command handler
 *
 * Handles linking identity providers to users using transactional outbox pattern.
 *
 * NOTE: Uses transactional outbox pattern for reliable event publishing.
 * The identity linking and event publishing happen atomically within
 * a single transaction.
 */
@CommandHandler(LinkIdentityCommand)
export class LinkIdentityHandler implements ICommandHandler<LinkIdentityCommand> {
  private readonly logger = new Logger(LinkIdentityHandler.name);

  constructor(
    private readonly authService: AuthService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: LinkIdentityCommand): Promise<{ success: boolean }> {
    this.logger.debug(`Processing link identity for user ${command.userId}`);

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

    // Link identity via auth service
    await this.authService.linkIdentity(
      command.userId,
      command.tenantId,
      command.provider,
      command.providerUid,
      {
        provider: command.provider,
        providerUid: command.providerUid,
        ...(command.displayName !== undefined && { displayName: command.displayName }),
        ...(command.photoUrl !== undefined && { photoUrl: command.photoUrl })
      }
    );

    // Event data for outbox
    const eventData: IdentityLinkedData = {
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
        eventType: AuthEventType.IDENTITY_LINKED,
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
          eventType: 'auth.identity.linked.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: String(command.userId),
          action: 'LINK_IDENTITY',
          target: {
            entityType: 'user',
            entityId: String(command.userId)
          },
          details: {
            provider: String(command.provider),
            displayNamePresent: command.displayName !== undefined,
            photoUrlPresent: command.photoUrl !== undefined
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(
      `Identity provider ${command.provider} linked successfully for user ${command.userId}`
    );

    return { success: true };
  }
}

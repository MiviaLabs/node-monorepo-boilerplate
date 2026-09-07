import { randomUUID } from 'node:crypto';

import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { LogoutCommand } from '../../commands/logout.command';
import {
  AuthEventType,
  AuthEventSchemaVersion,
  buildAuthAuditEvent,
  type UserLoggedOutData
} from '../../events';
import { AuthService } from '../../services/auth.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Logout command handler
 *
 * Handles user logout and token invalidation using transactional outbox pattern.
 *
 * NOTE: Uses transactional outbox pattern for reliable event publishing.
 * The database write (logout via auth service) and event publishing happen
 * atomically within a single transaction.
 *
 * When events are disabled (EVENTS_ENABLED !== 'true'), the outbox insert is skipped.
 */
@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  private readonly logger = new Logger(LogoutHandler.name);

  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: LogoutCommand): Promise<{ success: boolean }> {
    this.logger.debug(`Processing logout for user ${command.userId}`);

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

    // Check if events are enabled at runtime (not in constructor)
    // This allows tests to enable events after server startup
    const eventsEnabled = process.env['EVENTS_ENABLED'] === 'true';

    // Generate session ID for event
    const sessionId = `session-${command.userId}`;

    // Event data for outbox
    const eventData: UserLoggedOutData = {
      tenantId: command.tenantId,
      userId: String(command.userId),
      sessionId,
      timestamp: new Date().toISOString()
    };

    // Execute logout and publish event in single transaction
    await this.db.transaction(async (tx) => {
      // Logout via auth service (revoke tokens with GCP)
      await this.authService.logout(
        command.userId,
        command.tenantId,
        command.refreshToken,
        command.accessToken
      );

      // Save event to outbox only if events are enabled
      if (eventsEnabled && this.outboxRepo) {
        await this.outboxRepo.insert(tx, {
          eventId: randomUUID(),
          eventType: AuthEventType.USER_LOGGED_OUT,
          aggregateId: String(command.userId),
          aggregateVersion: '1',
          payload: JSON.stringify(eventData),
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: command.tenantId,
          schemaVersion: AuthEventSchemaVersion.V1_0
        });
      }

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.session.revoked.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: String(command.userId),
          action: 'LOGOUT',
          target: {
            entityType: 'user',
            entityId: String(command.userId)
          },
          details: {
            sessionId,
            accessTokenPresent: Boolean(command.accessToken),
            refreshTokenPresent: command.refreshToken.length > 0
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(`User ${command.userId} logged out successfully`);

    return { success: true };
  }
}

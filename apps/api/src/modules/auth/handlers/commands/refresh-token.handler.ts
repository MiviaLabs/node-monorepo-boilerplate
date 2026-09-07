import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { RefreshTokenCommand } from '../../commands/refresh-token.command';
import {
  AuthEventType,
  AuthEventSchemaVersion,
  buildAuthAuditEvent,
  type TokenRefreshedData
} from '../../events';
import { AuthSessionStoreService } from '../../services/auth-session-store.service';
import { AuthService } from '../../services/auth.service';

import type { AuthResponseDto } from '../../dto/auth-response.dto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Refresh token command handler
 *
 * Handles token refresh operations using transactional outbox pattern
 */
@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly authSessionStore: AuthSessionStoreService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthResponseDto & { isNewUser: boolean }> {
    // Step 1: Validation happens BEFORE any operations
    if (!command.refreshToken) {
      throw Errors.validationvalidationFailedField001({ field: 'refreshToken' });
    }

    // tenantId is optional for public auth routes
    // The auth service will extract tenantId from the refresh token's JWT payload

    // Step 2: Refresh token via auth service (NO database writes)
    const authResult = await this.authService.refreshToken(command.tenantId, command.refreshToken);

    // Step 3: Validate userId
    const userId = Number(authResult.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw Errors.authauthenticationTokenIs003({});
    }

    const sessionInfo = await this.authSessionStore.getRefreshTokenInfo(
      authResult.refreshToken,
      authResult.user?.tenantId ?? command.tenantId
    );
    const sessionId = sessionInfo?.sessionId ?? randomUUID();

    // Step 4: Single transaction for event outbox
    await this.db.transaction(async (tx) => {
      // 4a. Save event to outbox
      const eventData: TokenRefreshedData = {
        tenantId: authResult.user?.tenantId ?? '',
        userId: String(userId),
        ...(command.ipAddress !== undefined && { ipAddress: command.ipAddress }),
        sessionId,
        timestamp: new Date().toISOString()
      };

      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: AuthEventType.TOKEN_REFRESHED,
        aggregateId: String(userId),
        aggregateVersion: '1',
        payload: eventData,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: authResult.user?.tenantId ?? '',
        schemaVersion: AuthEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.session.refreshed.audit',
          tenantId: authResult.user?.tenantId ?? '',
          actorId: String(userId),
          requestId: command.requestId,
          aggregateId: String(userId),
          action: 'REFRESH_SESSION',
          target: {
            entityType: 'user',
            entityId: String(userId)
          },
          details: {
            sessionId,
            ipAddressPresent: command.ipAddress !== undefined
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    return {
      ...authResult,
      user: authResult.user ?? {
        userId: '',
        username: '',
        email: '',
        roles: [],
        permissions: [],
        tenantId: ''
      },
      isNewUser: false
    } as AuthResponseDto & { isNewUser: boolean };
  }
}

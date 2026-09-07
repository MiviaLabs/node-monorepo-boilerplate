import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { LoginWithOAuthCommand } from '../../commands/login-with-oauth.command';
import {
  AuthEventType,
  AuthEventSchemaVersion,
  buildAuthAuditEvent,
  type UserLoggedInData
} from '../../events';
import { AuthSessionStoreService } from '../../services/auth-session-store.service';
import { AuthService } from '../../services/auth.service';

import type { AuthResponseDto } from '../../dto/auth-response.dto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Login with OAuth command handler
 *
 * Handles OAuth provider authentication (Google, Microsoft, etc.)
 * using transactional outbox pattern.
 *
 * NOTE: Uses transactional outbox pattern for reliable event publishing.
 * The authentication and event publishing happen atomically within
 * a single transaction.
 */
@CommandHandler(LoginWithOAuthCommand)
export class LoginWithOAuthHandler implements ICommandHandler<LoginWithOAuthCommand> {
  private readonly logger = new Logger(LoginWithOAuthHandler.name);

  constructor(
    private readonly authService: AuthService,
    private readonly authSessionStore: AuthSessionStoreService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: LoginWithOAuthCommand): Promise<AuthResponseDto & { isNewUser: boolean }> {
    this.logger.debug(`Processing OAuth login for tenant ${command.tenantId}`);

    // Input validation
    if (!command.tenantId) {
      throw Errors.validationvalidationFailedField001({ field: 'tenantId' });
    }

    if (!command.provider) {
      throw Errors.validationvalidationFailedField001({ field: 'provider' });
    }

    if (!command.idToken) {
      throw Errors.validationvalidationFailedField001({ field: 'idToken' });
    }

    // Authenticate via auth service
    const { authResult, userInfo, isNewUser } = await this.authService.authenticateWithOAuth(
      command.tenantId,
      command.provider,
      command.idToken,
      command.accessToken
    );

    // Validate and convert userId to number
    const userId = Number(userInfo.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive number'
      });
    }

    // Generate session ID
    const sessionId = randomUUID();
    await this.authSessionStore.createSession({
      tenantId: command.tenantId,
      userId: String(userId),
      sessionId,
      refreshToken: authResult.refreshToken,
      refreshExpiresIn: authResult.refreshExpiresIn,
      accessToken: authResult.accessToken,
      accessTokenExpiresIn: authResult.expiresIn
    });

    // Event data for outbox
    const eventData: UserLoggedInData = {
      tenantId: command.tenantId,
      userId: String(userId),
      provider: command.provider,
      ...(command.ipAddress !== undefined && { ipAddress: command.ipAddress }),
      ...(command.userAgent !== undefined && { userAgent: command.userAgent }),
      sessionId,
      timestamp: new Date().toISOString()
    };

    // Execute event publishing in transaction
    await this.db.transaction(async (tx) => {
      // Save event to outbox
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: AuthEventType.USER_LOGGED_IN,
        aggregateId: String(userId),
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
          eventType: 'auth.session.created.audit',
          tenantId: command.tenantId,
          actorId: String(userId),
          requestId: command.requestId,
          aggregateId: String(userId),
          action: 'LOGIN',
          target: {
            entityType: 'user',
            entityId: String(userId)
          },
          details: {
            provider: String(command.provider),
            sessionId,
            ipAddressPresent: command.ipAddress !== undefined,
            userAgentPresent: command.userAgent !== undefined
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    this.logger.log(`OAuth login successful for user ${userId} with provider ${command.provider}`);

    return {
      ...authResult,
      user: {
        userId: userInfo.userId ?? '',
        username: userInfo.username ?? userInfo.email ?? '',
        email: userInfo.email ?? '',
        emailVerified: userInfo.emailVerified,
        roles: userInfo.roles ?? [],
        permissions: userInfo.permissions ?? [],
        tenantId: userInfo.tenantId ?? ''
      },
      isNewUser
    };
  }
}

import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { PUBLIC_AUTH_TENANT_ID } from '../../auth.constants';
import { LoginCommand } from '../../commands/login.command';
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
 * Login command handler
 *
 * Handles email/password authentication
 */
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly authSessionStore: AuthSessionStoreService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: LoginCommand): Promise<AuthResponseDto & { isNewUser: boolean }> {
    // Step 1: Validation happens BEFORE transaction
    if (!command.email || !command.password) {
      throw Errors.authinvalidEmailOr001({});
    }

    // tenantId is optional for public auth routes
    // The auth service will look up the user's organization by email
    // and return the appropriate tenantId from the database

    // Step 2: Authenticate (NO database writes)
    const { authResult, userInfo, isNewUser } =
      await this.authService.authenticateWithEmailPassword(
        command.tenantId,
        command.email,
        command.password
      );

    // Step 3: Validate userId
    const userId = Number(userInfo.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw Errors.authinvalidEmailOr001({});
    }

    const sessionId = randomUUID();
    await this.authSessionStore.createSession({
      tenantId: userInfo.tenantId ?? PUBLIC_AUTH_TENANT_ID,
      userId: String(userId),
      sessionId,
      refreshToken: authResult.refreshToken,
      refreshExpiresIn: authResult.refreshExpiresIn,
      accessToken: authResult.accessToken,
      accessTokenExpiresIn: authResult.expiresIn
    });

    // Step 4: Single transaction for ALL database writes
    await this.db.transaction(async (tx) => {
      // 4a. Update last sign-in timestamp
      await this.authService.updateUserLastSignInWithTransaction(tx, userId);

      // 4b. Save event to outbox
      const eventData: UserLoggedInData = {
        tenantId: userInfo.tenantId ?? PUBLIC_AUTH_TENANT_ID,
        userId: String(userId),
        provider: 'email_password',
        sessionId,
        timestamp: new Date().toISOString(),
        ...(command.ipAddress !== undefined && { ipAddress: command.ipAddress }),
        ...(command.userAgent !== undefined && { userAgent: command.userAgent })
      };

      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: AuthEventType.USER_LOGGED_IN,
        aggregateId: String(userId),
        aggregateVersion: '1',
        payload: eventData,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: userInfo.tenantId ?? PUBLIC_AUTH_TENANT_ID,
        schemaVersion: AuthEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.session.created.audit',
          tenantId: userInfo.tenantId ?? PUBLIC_AUTH_TENANT_ID,
          actorId: String(userId),
          requestId: command.requestId,
          aggregateId: String(userId),
          action: 'LOGIN',
          target: {
            entityType: 'user',
            entityId: String(userId)
          },
          details: {
            provider: 'email_password',
            sessionId,
            ipAddressPresent: command.ipAddress !== undefined,
            userAgentPresent: command.userAgent !== undefined
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    return {
      ...authResult,
      user: {
        userId: userInfo.userId ?? '',
        username: userInfo.username ?? userInfo.email ?? '',
        email: userInfo.email ?? '',
        emailVerified: userInfo.emailVerified,
        roles: userInfo.roles ?? [],
        permissions: userInfo.permissions ?? [],
        tenantId: userInfo.tenantId ?? PUBLIC_AUTH_TENANT_ID
      },
      isNewUser
    };
  }
}

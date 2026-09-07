import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { RequestPasswordResetCommand } from '../../commands/request-password-reset.command';
import { buildAuthAuditEvent, PasswordResetRequestedEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { PasswordResetRepository } from '../../repositories/password-reset.repository';

import type { NodePgDatabase } from '@package/db-core';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Request Password Reset Handler
 *
 * Handles password reset request generation with security-first approach.
 * Only requires email - system automatically determines user's organization.
 *
 * Security measures:
 * 1. Always returns success to prevent user enumeration
 * 2. Never leaks if user exists
 * 3. Invalidates existing tokens before creating new one
 * 4. Hashes token before storage (SHA-256)
 * 5. Rate limiting via max active tokens check
 * 6. Tenant-scoped operations (token scoped to user's organization)
 *
 * Flow:
 * 1. Find user globally by email hash (no auth required)
 * 2. If user not found → return success (don't leak)
 * 3. Extract organizationId from user record
 * 4. Rate limiting check (email hash + organizationId)
 * 5. Invalidate all existing active tokens for user
 * 6. Generate secure random token (UUID)
 * 7. Hash token with SHA-256
 * 8. Store token hash + metadata in DB
 * 9. Publish PasswordResetRequestedEvent (for email sending)
 * 10. Return generic success message
 *
 * CRITICAL: This handler ALWAYS returns success regardless of outcome
 * to prevent attackers from enumerating valid email addresses.
 *
 * @example
 * ```typescript
 * const command = new RequestPasswordResetCommand({
 *   tenantId: 'public',
 *   email: 'user@example.com',
 *   requestIp: '192.168.1.1',
 *   requestUserAgent: 'Mozilla/5.0...'
 * });
 * const result = await commandBus.execute(command);
 * // Always: { success: true, message: 'If the email exists, a reset link has been sent' }
 * ```
 */
@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<RequestPasswordResetCommand> {
  private readonly logger = new Logger(RequestPasswordResetHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordResetRepository: PasswordResetRepository,
    private readonly eventBus: EventBus,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    command: RequestPasswordResetCommand
  ): Promise<{ success: boolean; message: string }> {
    const GENERIC_SUCCESS_MESSAGE = 'If the email exists, a reset link has been sent';
    const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
    const MAX_REQUESTS_PER_WINDOW = 3;

    try {
      // Step 1: Find user globally by email (no organization lookup needed)
      const user = await this.authRepository.findByEmail(undefined, command.email);

      if (!user) {
        // User not found - return success (don't leak)
        this.logger.debug('User not found globally for password reset request');
        return {
          success: true,
          message: GENERIC_SUCCESS_MESSAGE
        };
      }

      // Step 2: Extract organizationId from user record
      const organizationId = user.organizationId;

      // Step 3: Rate limiting check
      const emailHash = hashEmail(command.email);
      const recentRequestCount = await this.passwordResetRepository.countRecentByEmailHash(
        organizationId,
        emailHash,
        new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
      );

      if (recentRequestCount >= MAX_REQUESTS_PER_WINDOW) {
        this.logger.warn(
          `Password reset request rate-limited for user ${user.id} in organization ${organizationId}`
        );
        return {
          success: true,
          message: GENERIC_SUCCESS_MESSAGE
        };
      }

      // Step 4-7: Create token in transaction (invalidate existing + create new)
      const { resetToken, expiresAt } = await this.db.transaction(async (tx) => {
        // Step 4: Invalidate all existing active tokens for the user
        const invalidatedCount = await this.passwordResetRepository.invalidateAllForUser(
          organizationId,
          user.id,
          tx
        );

        if (invalidatedCount > 0) {
          this.logger.debug(`Invalidated ${invalidatedCount} existing tokens for user ${user.id}`);
        }

        // Step 5-6: Generate secure token and hash
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const { resetToken } = await this.passwordResetRepository.createTokenWithTransaction(tx, {
          organizationId,
          userId: user.id,
          emailHash,
          expiresAt,
          requestIp: command.requestIp,
          requestUserAgent: command.requestUserAgent
        });

        await this.auditOutbox.insert(
          tx,
          buildAuthAuditEvent({
            eventType: 'auth.password.reset.requested.audit',
            tenantId: organizationId,
            actorId: String(user.id),
            requestId: command.requestId,
            aggregateId: user.id,
            action: 'REQUEST_PASSWORD_RESET',
            target: {
              entityType: 'user',
              entityId: String(user.id)
            },
            details: {
              invalidatedExistingTokenCount: invalidatedCount,
              expiresInMinutes: 60
            },
            correlationId: command.correlationId,
            causationId: command.causationId
          })
        );

        return { resetToken, expiresAt };
      });

      // Step 7: Publish event for email sending after transaction commit
      await this.eventBus.publish(
        new PasswordResetRequestedEvent(
          String(organizationId),
          user.id,
          command.email,
          resetToken,
          expiresAt
        )
      );

      // Log success (with user ID, not email - no PII)
      this.logger.log(
        `Password reset requested for user ${user.id} in organization ${organizationId}`
      );

      // Step 8: Return generic success message
      return {
        success: true,
        message: GENERIC_SUCCESS_MESSAGE
      };
    } catch (error) {
      // CRITICAL: Log error but don't leak information to caller
      this.logger.error(
        `Password reset request failed: ${error instanceof Error ? error.message : String(error)}`
      );

      // Always return success to prevent user enumeration
      return {
        success: true,
        message: GENERIC_SUCCESS_MESSAGE
      };
    }
  }
}

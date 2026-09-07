import { createHash } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { AuthProviderFactory, AUTH_PROVIDER_FACTORY, type IAuthProvider } from '@package/auth';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UserRepository } from '../../../users/repositories/user.repository';
import { ResetPasswordCommand } from '../../commands/reset-password.command';
import { buildAuthAuditEvent, PasswordResetCompletedEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { PasswordResetRepository } from '../../repositories/password-reset.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

import type { NodePgDatabase } from '@package/db-core';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<ResetPasswordCommand> {
  private readonly logger = new Logger(ResetPasswordHandler.name);
  private authProvider: IAuthProvider | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordResetRepository: PasswordResetRepository,
    @Inject(AUTH_PROVIDER_FACTORY) private readonly authProviderFactory: AuthProviderFactory,
    private readonly eventBus: EventBus,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  private getProvider(): IAuthProvider {
    if (!this.authProvider) {
      const provider = this.authProviderFactory.getDefaultProvider();
      if (!provider) {
        throw Errors.systeminternalServerError001({});
      }
      this.authProvider = provider;
    }

    return this.authProvider;
  }

  async execute(command: ResetPasswordCommand): Promise<{ success: boolean; message: string }> {
    const tokenHash = createHash('sha256').update(command.token).digest('hex');
    const resetToken = await this.passwordResetRepository.findActiveByTokenHashGlobal(tokenHash);

    if (!resetToken) {
      throw Errors.authauthenticationTokenIs003({});
    }

    const organizationId = resetToken.organizationId;
    const user = await this.userRepository.findById(organizationId, resetToken.userId);

    if (!user) {
      throw Errors.useruserWithId001({ userId: String(resetToken.userId) });
    }

    const identity = await this.userIdentityRepository.findPrimaryByUserId(resetToken.userId);
    const providerUserId = identity?.providerUid;

    if (!providerUserId) {
      throw Errors.authauthenticationTokenIs003({});
    }

    const authProvider = this.getProvider();

    if (!authProvider.changePassword) {
      throw Errors.systeminternalServerError001({});
    }

    const organization = await this.authRepository.findOrganizationById(organizationId);

    // CRITICAL: Wrap ENTIRE operation in transaction to prevent partial success
    // If password change succeeds but token marking fails, token remains valid (security issue)
    await this.db.transaction(async (tx) => {
      // 1. Mark token as used FIRST (within transaction)
      const marked = await this.passwordResetRepository.markAsUsed(
        organizationId,
        resetToken.id,
        tx
      );
      if (!marked) {
        throw Errors.authauthenticationTokenIs003({});
      }

      // 2. THEN change password (so if this fails, token mark is rolled back)
      // Note: changePassword is optional in IAuthProvider interface
      if (!authProvider.changePassword) {
        throw Errors.systeminternalServerError001({});
      }
      await authProvider.changePassword(
        providerUserId,
        command.newPassword,
        organization?.gcpTenantId ?? undefined
      );

      // 3. Invalidate all other tokens for user
      await this.passwordResetRepository.invalidateAllForUser(
        organizationId,
        resetToken.userId,
        tx
      );

      await this.auditOutbox.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'auth.password.reset.completed.audit',
          tenantId: organizationId,
          actorId: String(resetToken.userId),
          requestId: command.requestId,
          aggregateId: resetToken.userId,
          action: 'COMPLETE_PASSWORD_RESET',
          target: {
            entityType: 'user',
            entityId: String(resetToken.userId)
          },
          details: {
            resetMethod: 'token'
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    // 4. Publish event AFTER transaction commits to avoid inconsistent state
    // Email event is best-effort and should not affect password reset success
    try {
      const userInfo = await authProvider.getUserInfo(
        providerUserId,
        organization?.gcpTenantId ?? 'default'
      );
      const recipientEmail = userInfo.email?.trim();
      if (recipientEmail) {
        await this.eventBus.publish(
          new PasswordResetCompletedEvent(
            String(organizationId),
            resetToken.userId,
            recipientEmail,
            'token'
          )
        );
      }
    } catch (error) {
      this.logger.warn(
        `Password reset completed but confirmation email event failed for user ${resetToken.userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - email failure shouldn't affect password reset success
    }

    return {
      success: true,
      message: 'Password reset successfully'
    };
  }
}

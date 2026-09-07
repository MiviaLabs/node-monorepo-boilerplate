import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EmailService } from '@package/email';

import { TrackedEmailService } from '../../../email-tracking/services/tracked-email.service';
import { buildPasswordResetEmailTemplate } from '../../email/password-reset-email.template';
import { PasswordResetRequestedEvent } from '../../events/password-reset-requested.event';

/**
 * Password Reset Requested Event Handler
 *
 * Sends password reset email when a user requests a password reset.
 *
 * ## Flow
 *
 * 1. Extract event data: userId, email, resetToken, expiresAt
 * 2. Get configuration: PASSWORD_RESET_WEBAPP_URL / WEBAPP_PUBLIC_URL / APP_URL / WEB_URL and BRAND_NAME
 * 3. Build reset URL: `${baseWebUrl}/auth/reset-password?token=${resetToken}`
 * 4. Send email via EmailService using sendPasswordReset()
 * 5. Log success/failure (userId only, no PII)
 *
 * ## Error Handling
 *
 * Email sending failures are logged but do NOT throw. This ensures the password
 * reset request flow completes successfully even if email delivery fails.
 * The user can request a new token if needed.
 *
 * ## P0 Compliance
 *
 * - No PII in logs (email addresses, tokens)
 * - Only userId logged for tracing
 * - Email addresses passed directly to EmailService (which handles sanitization)
 *
 * ## Security Note
 *
 * The event contains the raw reset token (UUID), which is only sent once via email.
 * The database stores only the SHA-256 hash of this token. When the user clicks
 * the reset link, the raw token is hashed and compared against the stored hash.
 *
 * @example Event publishing
 * ```typescript
 * await this.eventBus.publish(
 *   new PasswordResetRequestedEvent(
 *     tenantId,
 *     userId,
 *     email,
 *     resetToken,  // Raw token (UUID)
 *     expiresAt
 *   )
 * );
 * ```
 */
@Injectable()
@EventsHandler(PasswordResetRequestedEvent)
export class PasswordResetRequestedHandler implements IEventHandler<PasswordResetRequestedEvent> {
  private readonly logger = new Logger(PasswordResetRequestedHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly trackedEmailService: TrackedEmailService
  ) {}

  async handle(event: PasswordResetRequestedEvent): Promise<void> {
    try {
      // Get configuration
      const webUrl =
        this.configService.get<string>('PASSWORD_RESET_WEBAPP_URL')?.trim() ??
        this.configService.get<string>('WEBAPP_PUBLIC_URL')?.trim() ??
        this.configService.get<string>('APP_URL')?.trim() ??
        this.configService.get<string>('WEB_URL')?.trim() ??
        'http://localhost:3000';
      const brandName = this.configService.get<string>('BRAND_NAME', 'Monorepo Starter Kit');

      const encodedToken = encodeURIComponent(event.resetToken);
      const resetUrl = `${webUrl.replace(/\/$/, '')}/auth/reset-password?token=${encodedToken}`;

      const html = buildPasswordResetEmailTemplate({
        resetUrl,
        brandName,
        expiresAt: event.expiresAt
      });
      const organizationId = normalizeOrganizationId(event.tenantId);

      if (organizationId !== undefined) {
        await this.trackedEmailService.sendTrackedEmail({
          organizationId,
          correlationId: event.correlationId ?? event.eventId,
          causationId: event.causationId ?? event.eventId,
          request: {
            to: event.email,
            subject: 'Reset Your Password',
            html,
            emailTracking: {
              messageKind: 'password_reset_requested',
              referenceType: 'user',
              referenceId: String(event.userId),
              correlationKey: `password-reset-requested:${event.userId}`,
              safeMetadata: {
                expiresAt: event.expiresAt.toISOString()
              }
            }
          }
        });
      } else {
        await this.emailService.sendPasswordReset(event.email, event.resetToken, html);
      }

      // Log success (P0: no PII - only userId)
      this.logger.log(`Password reset email sent for user ${event.userId}`);
    } catch (error) {
      // Log error but don't throw - email failures shouldn't break the flow
      // User can request a new reset token if needed
      this.logger.error(
        `Failed to send password reset email for user ${event.userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Do NOT rethrow - email sending is best-effort
    }
  }
}

function normalizeOrganizationId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

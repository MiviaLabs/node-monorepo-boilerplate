import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { EmailService } from '@package/email';

import { TrackedEmailService } from '../../../email-tracking/services/tracked-email.service';
import { PasswordResetCompletedEvent } from '../../events/password-reset-completed.event';

/**
 * Password reset completed event handler
 *
 * Handles the side effect of sending a confirmation email when a user
 * successfully completes a password reset. This notification serves as:
 * - Confirmation that the password change was successful
 * - Security alert in case the user didn't initiate the reset
 *
 * Error Handling Approach:
 * Email failures are logged but do not throw - the password reset itself
 * has already succeeded, so email failures should not break the flow.
 * Failed emails can be retried via async queue if needed.
 *
 * P0 Compliance:
 * - No PII (email addresses) in logs, only userId
 * - Email addresses only used for sending, not logged
 *
 * @since 1.0.0
 */
@Injectable()
@EventsHandler(PasswordResetCompletedEvent)
export class PasswordResetCompletedHandler implements IEventHandler<PasswordResetCompletedEvent> {
  private readonly logger = new Logger(PasswordResetCompletedHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly trackedEmailService: TrackedEmailService
  ) {}

  /**
   * Handle password reset completed event
   *
   * Sends a confirmation email to the user notifying them that their
   * password was successfully reset. Includes a link to login and a
   * security notice if they didn't make this change.
   *
   * @param event - The password reset completed event
   */
  async handle(event: PasswordResetCompletedEvent): Promise<void> {
    try {
      // P0: Log only userId, not email
      this.logger.log(`Processing password reset confirmation for user ${event.userId}`);

      // Get configuration
      const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3000');
      const brandName = this.configService.get<string>('BRAND_NAME', 'Monorepo Starter Kit');

      const recipientEmail = event.email?.trim();
      if (!recipientEmail?.includes('@')) {
        this.logger.warn(
          `Skipping password reset confirmation email for user ${event.userId}: missing deliverable email`
        );
        return;
      }

      // Build login URL
      const loginUrl = `${webUrl}/auth/login`;

      // Build confirmation email HTML
      const emailHtml = this.buildConfirmationEmailHtml({
        brandName,
        loginUrl,
        resetMethod: event.resetMethod
      });

      const organizationId = normalizeOrganizationId(event.tenantId);
      if (organizationId !== undefined) {
        await this.trackedEmailService.sendTrackedEmail({
          organizationId,
          correlationId: event.correlationId ?? event.eventId,
          causationId: event.causationId ?? event.eventId,
          request: {
            to: recipientEmail,
            subject: `${brandName} - Password reset successful`,
            html: emailHtml,
            emailTracking: {
              messageKind: 'password_reset_completed',
              referenceType: 'user',
              referenceId: String(event.userId),
              correlationKey: `password-reset-completed:${event.userId}`,
              safeMetadata: {
                resetMethod: event.resetMethod
              }
            }
          }
        });
      } else {
        await this.emailService.sendEmail({
          to: recipientEmail,
          subject: `${brandName} - Password reset successful`,
          html: emailHtml
        });
      }

      // P0: Log success with userId only
      this.logger.log(`Password reset confirmation email sent to user ${event.userId}`);
    } catch (error) {
      // P0: Log error with userId context, not email
      this.logger.error(
        `Failed to send password reset confirmation email to user ${event.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Don't throw - email failure shouldn't break the password reset flow
      // The password reset has already succeeded, email is just a notification
    }
  }

  /**
   * Build password reset confirmation email HTML
   *
   * Creates a simple, dark-themed HTML email with:
   * - Success message
   * - Login link
   * - Security notice
   *
   * @param params - Template parameters
   * @returns Rendered HTML string
   */
  private buildConfirmationEmailHtml(params: {
    brandName: string;
    loginUrl: string;
    resetMethod: string;
  }): string {
    return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Password Reset Successful</title>
  </head>
  <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#09090b;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 14px 4px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;font-weight:600;">
                  ${this.escapeHtml(params.brandName)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#111113;border:1px solid #27272a;border-radius:16px;padding:28px 26px;">
                <div style="display:inline-block;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#22c55e;border:1px solid #166534;border-radius:999px;padding:4px 10px;margin-bottom:14px;">
                  Success
                </div>
                <h1 style="margin:0 0 10px 0;font-size:26px;line-height:1.25;font-weight:700;color:#fafafa;">
                  Password reset successful
                </h1>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">
                  Your password has been successfully reset using the <strong>${this.escapeHtml(params.resetMethod)}</strong> method. You can now log in with your new password.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#60a5fa,#22d3ee);">
                      <a href="${this.escapeHtml(params.loginUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#0b1120;text-decoration:none;border-radius:10px;">
                        Log in now
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:12px 14px;margin-bottom:18px;">
                  <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#fbbf24;font-weight:600;">
                    ⚠️ Security Notice
                  </p>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#cbd5e1;">
                    If you did not make this change, please contact support immediately and secure your account.
                  </p>
                </div>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${this.escapeHtml(params.loginUrl)}" style="color:#7dd3fc;text-decoration:underline;word-break:break-all;">${this.escapeHtml(params.loginUrl)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
  }

  /**
   * Escape HTML special characters
   *
   * Prevents XSS attacks by escaping user-provided content.
   *
   * @param value - String to escape
   * @returns Escaped string safe for HTML
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

function normalizeOrganizationId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

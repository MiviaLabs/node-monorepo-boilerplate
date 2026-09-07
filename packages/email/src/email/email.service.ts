/**
 * NestJS Email Service
 *
 * Injectable service that wraps the IEmailProvider for easy dependency
 * injection in NestJS applications. Provides sendEmail(), sendBatch(),
 * and healthCheck() methods with JSDoc documentation.
 *
 * @packageDocumentation
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { addJob } from '@package/queues';

import { DEFAULT_FALLBACK_EMAIL } from '../constants';
import { EMAIL_MODULE_OPTIONS, EMAIL_PROVIDER, EMAIL_QUEUE_NAME } from './email.constants';
import { EmailConfigurationError } from '../errors';

import type { IEmailJobData } from './email-job-handler';
import type { IEmailModuleOptions } from './interfaces';
import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse
} from '../providers/email-provider.interface';

// ============================================================================
// HTML ESCAPING UTILITIES
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS attacks.
 *
 * This function escapes the following characters:
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot;
 * - ' → &#39;
 *
 * @param unsafe - The unsafe string to escape
 * @returns The escaped string safe for HTML content
 *
 * @example
 * ```typescript
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 * ```
 */
function escapeHtml(unsafe: string): string {
  return unsafe.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char] as string
  );
}

/**
 * EmailService - Injectable service for sending emails.
 *
 * This service wraps the configured IEmailProvider and provides a clean
 * interface for sending emails in NestJS applications. It supports:
 * - Single email sending via sendEmail()
 * - Batch email sending via sendBatch()
 * - Provider health checks via healthCheck()
 *
 * P0 Compliance: This service does NOT log PII (email addresses, message content).
 * All logging uses non-PII identifiers (message IDs, counts, status codes).
 *
 * @since 0.0.1
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   constructor(private readonly emailService: EmailService) {}
 *
 *   async sendWelcomeEmail(email: string, name: string) {
 *     await this.emailService.sendEmail({
 *       to: email,
 *       subject: 'Welcome!',
 *       html: `<h1>Welcome ${name}</h1>`,
 *       from: 'noreply@example.com'
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Creates a new EmailService instance.
   *
   * @param provider - The injected email provider implementation
   * @param moduleOptions - Optional module configuration for defaults
   *
   * @example
   * ```typescript
   * // Automatic injection via NestJS DI
   * constructor(
   *   @Inject(EMAIL_PROVIDER) private readonly provider: IEmailProvider,
   *   @Optional() @Inject(EMAIL_MODULE_OPTIONS) private readonly moduleOptions?: IEmailModuleOptions
   * ) {}
   * ```
   */
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: IEmailProvider,
    @Optional() @Inject(EMAIL_MODULE_OPTIONS) private readonly moduleOptions?: IEmailModuleOptions
  ) {}

  /**
   * Get default from email address.
   *
   * @returns Default from email or fallback
   *
   * @internal
   */
  private getDefaultFromEmail(): string {
    return this.moduleOptions?.provider?.defaultFromEmail ?? DEFAULT_FALLBACK_EMAIL;
  }

  /**
   * Send a single email.
   *
   * Sends an email using the configured provider. Returns the response
   * containing the message ID and status.
   *
   * @param request - The email send request with recipient, subject, and content
   * @returns Promise resolving to the send response with message ID
   * @throws {EmailSendError} If the send operation fails
   *
   * P0 Compliance: This method does NOT log the email address or message content.
   * Logs only use message IDs for tracing.
   *
   * @example
   * ```typescript
   * const response = await emailService.sendEmail({
   *   to: 'user@example.com',
   *   subject: 'Hello!',
   *   html: '<p>Welcome!</p>',
   *   from: 'noreply@example.com'
   * });
   *
   * console.log(`Message sent: ${response.messageId}`);
   * ```
   */
  async sendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    return this.provider.sendEmail(request);
  }

  /**
   * Send multiple emails in batch.
   *
   * Sends multiple emails using the configured provider. Returns an array
   * of responses, one for each email in the batch.
   *
   * @param requests - Array of email send requests
   * @returns Promise resolving to an array of send responses
   * @throws {EmailSendError} If any send operation fails
   *
   * P0 Compliance: This method does NOT log email addresses or message content.
   * Logs only use request counts and status codes for tracking.
   *
   * @example
   * ```typescript
   * const responses = await emailService.sendBatch([
   *   { to: 'user1@example.com', subject: 'Hello 1', html: '<p>Hi 1</p>', from: 'noreply@example.com' },
   *   { to: 'user2@example.com', subject: 'Hello 2', html: '<p>Hi 2</p>', from: 'noreply@example.com' }
   * ]);
   *
   * console.log(`Sent ${responses.length} emails`);
   * ```
   */
  async sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    return this.provider.sendBatch(requests);
  }

  /**
   * Send a single email asynchronously via queue.
   *
   * Queues the email for background processing instead of sending immediately.
   * Returns immediately with job information, while the email is sent
   * asynchronously by EmailJobHandler.
   *
   * ## When to Use
   *
   * Use sendAsync() when:
   * - You want non-blocking email sending (immediate return)
   * - High-volume email operations (newsletters, bulk notifications)
   * - Retrying failed emails is important (automatic retry with exponential backoff)
   * - Decoupling email sending from request processing (better UX)
   *
   * Use sendEmail() when:
   * - You need immediate confirmation that the email was sent
   * - Low-volume transactional emails where blocking is acceptable
   * - You need the provider response immediately
   *
   * ## Queue Behavior
   *
   * - Jobs are queued in 'emails' queue (see QUEUE_NAMES.EMAILS)
   * - 3 retry attempts with exponential backoff (5s → 10s → 20s)
   * - When DLQ is enabled, failed jobs are moved to 'emails-dlq' (Dead Letter Queue) for inspection
   * - Processed by EmailJobHandler with concurrency of 10
   *
   * ## P0 Compliance
   *
   * - organizationId is REQUIRED for multi-tenancy (P0 violation if missing)
   * - No PII logged (email addresses, content sanitized)
   * - Job data structured as IEmailJobData
   *
   * @param organizationId - Organization/tenant ID for multi-tenancy (P0: REQUIRED)
   * @param emailRequest - The email send request with recipient, subject, and content
   * @returns Promise resolving to job information (jobId, queued status)
   * @throws {Error} If organizationId is missing (P0: multi-tenancy violation)
   * @throws {QueueNotFoundError} If the 'emails' queue doesn't exist
   *
   * @example Non-blocking welcome email
   * ```typescript
   * // Queue the email and return immediately
   * const job = await emailService.sendAsync('tenant-123', {
   *   to: 'user@example.com',
   *   subject: 'Welcome!',
   *   html: '<h1>Welcome</h1>',
   *   from: 'noreply@example.com'
   * });
   *
   * console.log(`Email queued: ${job.id}`);
   * // Email is processed in background by EmailJobHandler
   * ```
   *
   * @example High-volume bulk emails
   * ```typescript
   * // Send newsletter to 10,000 users without blocking
   * const users = await getActiveUsers();
   * const jobs = await Promise.all(
   *   users.map(user =>
   *     emailService.sendAsync(user.organizationId, {
   *       to: user.email,
   *       subject: 'Monthly Newsletter',
   *       html: newsletterHtml,
   *       from: 'news@example.com'
   *     })
   *   )
   * );
   *
   * console.log(`Queued ${jobs.length} emails for background processing`);
   * ```
   *
   * @example Idempotent job (prevent duplicate sends)
   * ```typescript
   * // Use jobId to prevent duplicate emails for same operation
   * const jobId = `welcome-${userId}`;
   * const job = await emailService.sendAsync('tenant-123', {
   *   to: 'user@example.com',
   *   subject: 'Welcome!',
   *   html: '<h1>Welcome</h1>',
   *   from: 'noreply@example.com'
   * }, { jobId });
   *
   * // Calling again with same jobId won't create duplicate email
   * ```
   *
   * @since 0.0.1
   */
  async sendAsync(
    organizationId: string,
    emailRequest: ISendEmailRequest,
    jobOptions?: { jobId?: string }
  ): Promise<{ id: string; name: string }> {
    // P0: Validate organizationId for multi-tenancy
    if (!organizationId) {
      this.logger.error('sendAsync: organizationId is required for multi-tenancy');
      throw new EmailConfigurationError('organizationId is required for email queueing');
    }

    // P0: Log without PII (email addresses, content)
    this.logger.log(`Queueing email job for organization ${organizationId}`);

    // Queue the email job
    const job = await addJob<IEmailJobData>({
      queueName: EMAIL_QUEUE_NAME,
      jobName: 'send-email',
      data: {
        organizationId,
        emailRequest
      },
      options: jobOptions
    });

    // P0: Log only job ID, not email addresses or content
    this.logger.log(`Email job queued: ${job.id} for organization ${organizationId}`);

    if (job.id == null) {
      this.logger.error(
        `sendAsync: queue implementation did not provide a job id for organization ${organizationId}`
      );
      throw new EmailConfigurationError(
        'Email job id was not provided by the queue implementation'
      );
    }

    return {
      id: String(job.id),
      name: job.name
    };
  }

  /**
   * Check email provider health.
   *
   * Performs a health check on the configured email provider to verify
   * connectivity and availability. Returns true if the provider is healthy.
   *
   * @returns Promise resolving to true if provider is healthy, false otherwise
   *
   * @example
   * ```typescript
   * const isHealthy = await emailService.healthCheck();
   * if (!isHealthy) {
   *   console.error('Email provider is unhealthy');
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  /**
   * Send a single email (alias for sendEmail).
   *
   * Convenience alias that delegates to sendEmail(). Provides a shorter
   * method name for common email sending operations.
   *
   * @param request - The email send request with recipient, subject, and content
   * @returns Promise resolving to the send response with message ID
   * @throws {EmailSendError} If the send operation fails
   *
   * P0 Compliance: This method does NOT log the email address or message content.
   * Logs only use message IDs for tracing.
   *
   * @example
   * ```typescript
   * const response = await emailService.send({
   *   to: 'user@example.com',
   *   subject: 'Hello!',
   *   html: '<p>Welcome!</p>',
   *   from: 'noreply@example.com'
   * });
   * ```
   */
  async send(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    return this.sendEmail(request);
  }

  /**
   * Send a welcome email.
   *
   * Convenience method for sending welcome emails to new users.
   * Accepts pre-rendered HTML from React Email or other template engines.
   *
   * @param to - Recipient email address
   * @param name - Recipient name for personalization
   * @param html - Custom HTML content (optional, uses default template if not provided)
   * @param overrides - Optional override for from, subject, etc.
   * @returns Promise resolving to the send response with message ID
   * @throws {EmailSendError} If the send operation fails
   *
   * P0 Compliance: This method does NOT log the email address or name.
   *
   * @example
   * ```typescript
   * // With default template
   * await emailService.sendWelcome('user@example.com', 'John Doe');
   *
   * // With React Email template
   * const html = await render(<WelcomeEmail userName=\"John\" />);
   * await emailService.sendWelcome('user@example.com', 'John Doe', html);
   *
   * // With custom overrides
   * await emailService.sendWelcome('user@example.com', 'John', '<h1>Hi John</h1>', {
   *   from: 'welcome@example.com',
   *   subject: 'Welcome to Our App!'
   * });
   * ```
   */
  async sendWelcome(
    to: string,
    name: string,
    html?: string,
    overrides: Partial<ISendEmailRequest> = {}
  ): Promise<ISendEmailResponse> {
    const safeName = escapeHtml(name);
    return this.sendEmail({
      ...overrides,
      to,
      subject: overrides.subject ?? 'Welcome!',
      html: html ?? `<h1>Welcome ${safeName}!</h1>`,
      from: overrides.from ?? this.getDefaultFromEmail()
    });
  }

  /**
   * Send a password reset email.
   *
   * Convenience method for sending password reset emails with reset tokens.
   * Accepts pre-rendered HTML from React Email or other template engines.
   *
   * @param to - Recipient email address
   * @param resetToken - Password reset token for verification
   * @param html - Custom HTML content (optional, uses default template if not provided)
   * @param overrides - Optional override for from, subject, etc.
   * @returns Promise resolving to the send response with message ID
   * @throws {EmailSendError} If the send operation fails
   *
   * P0 Compliance: This method does NOT log the email address or reset token.
   *
   * @example
   * ```typescript
   * // With default template
   * await emailService.sendPasswordReset('user@example.com', 'reset-token-123');
   *
   * // With React Email template
   * const html = await render(<PasswordResetEmail resetToken=\"token-123\" />);
   * await emailService.sendPasswordReset('user@example.com', 'token-123', html);
   *
   * // With custom overrides
   * await emailService.sendPasswordReset('user@example.com', 'token-123', '<p>Reset link</p>', {
   *   from: 'security@example.com',
   *   subject: 'Security Alert: Password Reset'
   * });
   * ```
   */
  async sendPasswordReset(
    to: string,
    resetToken: string,
    html?: string,
    overrides: Partial<ISendEmailRequest> = {}
  ): Promise<ISendEmailResponse> {
    const safeResetToken = escapeHtml(resetToken);
    return this.sendEmail({
      ...overrides,
      to,
      subject: overrides.subject ?? 'Reset Your Password',
      html: html ?? `<p>Click here to reset your password: <strong>${safeResetToken}</strong></p>`,
      from: overrides.from ?? this.getDefaultFromEmail()
    });
  }

  /**
   * Send a team invitation email.
   *
   * Convenience method for sending team/workspace invitation emails.
   * Accepts pre-rendered HTML from React Email or other template engines.
   *
   * @param to - Recipient email address
   * @param organizationName - Name of the organization/team
   * @param teamId - Team identifier for joining
   * @param html - Custom HTML content (optional, uses default template if not provided)
   * @param overrides - Optional override for from, subject, etc.
   * @returns Promise resolving to the send response with message ID
   * @throws {EmailSendError} If the send operation fails
   *
   * P0 Compliance: This method does NOT log the email address, organization name, or team ID.
   *
   * @example
   * ```typescript
   * // With default template
   * await emailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123');
   *
   * // With React Email template
   * const html = await render(<TeamInvitationEmail orgName=\"Acme Corp\" teamId=\"team-123\" />);
   * await emailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123', html);
   *
   * // With custom overrides
   * await emailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123', '<p>Join us</p>', {
   *   from: 'hr@example.com',
   *   subject: 'Team Invitation from Acme Corp'
   * });
   * ```
   */
  async sendInvitation(
    to: string,
    organizationName: string,
    teamId: string,
    html?: string,
    overrides: Partial<ISendEmailRequest> = {}
  ): Promise<ISendEmailResponse> {
    const safeOrganizationName = escapeHtml(organizationName);
    const safeTeamId = escapeHtml(teamId);
    return this.sendEmail({
      ...overrides,
      to,
      subject: overrides.subject ?? `You are invited to join ${safeOrganizationName}`,
      html:
        html ??
        `<p>You have been invited to join <strong>${safeOrganizationName}</strong>.</p><p>Team ID: ${safeTeamId}</p>`,
      from: overrides.from ?? this.getDefaultFromEmail()
    });
  }
}

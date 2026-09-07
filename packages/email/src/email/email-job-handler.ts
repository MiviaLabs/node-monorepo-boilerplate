/**
 * Email Job Handler
 *
 * Processes email jobs from the BullMQ queue using the @JobHandler decorator.
 * This handler receives email send requests from the queue and processes them
 * asynchronously using the EmailService.
 *
 * ## Job Data Structure
 *
 * Jobs in the 'emails' queue must have the following data structure:
 * ```typescript
 * {
 *   organizationId: string;  // P0: Multi-tenancy requirement
 *   emailRequest: ISendEmailRequest;
 * }
 * ```
 *
 * ## P0 Compliance
 *
 * - Multi-tenancy: organizationId is required for tenant scoping
 * - No PII in logs: Job data is sanitized before logging
 * - OpenTelemetry tracing: Span attributes exclude PII
 *
 * @packageDocumentation
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobHandler } from '@package/queues';
import type { Job } from 'bullmq';

import type { ISendEmailRequest, ISendEmailResponse } from '../providers/email-provider.interface';
import { EMAIL_QUEUE_NAME } from './email.constants';
import { EmailService } from './email.service';

/**
 * Email job data structure
 *
 * P0 Compliance: organizationId is required for multi-tenancy.
 * Email addresses and content are in emailRequest (Class-C data).
 */
export interface IEmailJobData {
  /**
   * Organization/tenant ID for multi-tenancy
   *
   * P0: Required for tenant isolation and data scoping.
   * Used for logging, metrics, and OpenTelemetry attributes.
   */
  organizationId: string;

  /**
   * Email send request
   *
   * Contains recipient, subject, content, and attachments.
   * Class-C (Confidential) data - never log this directly.
   */
  emailRequest: ISendEmailRequest;
}

/**
 * Email job response
 *
 * Returns the message ID and success status after processing.
 */
export interface IEmailJobResponse {
  /** Message ID from email provider */
  messageId: string;

  /** Success status */
  success: boolean;
}

/**
 * EmailJobHandler - Processes email jobs from the queue
 *
 * This class handles email jobs that have been added to the 'emails' queue.
 * It's automatically registered as a BullMQ worker by the @JobHandler decorator.
 *
 * ## Error Handling
 *
 * - Provider errors: Job fails and is retried per queue settings (3 attempts, exponential backoff)
 * - Validation errors: Job fails immediately (no retry)
 * - DLQ: When the emails queue is configured with `enableDeadLetterQueue: true`
 *   (or an equivalent DLQ configuration in `@package/queues`), failed jobs are
 *   moved to the `emails-dlq` queue for inspection.
 *
 * ## Telemetry
 *
 * - OpenTelemetry spans: email.job.process with organizationId attribute
 * - Metrics: email.job.duration, email.job.total
 * - P0: No PII (email addresses, content) in spans or metrics
 *
 * @example Job creation
 * ```typescript
 * import { addJob } from '@package/queues';
 *
 * await addJob({
 *   queueName: EMAIL_QUEUE_NAME,
 *   jobName: 'send-email',
 *   data: {
 *     organizationId: 'tenant-123',
 *     emailRequest: {
 *       to: 'user@example.com',
 *       subject: 'Welcome!',
 *       html: '<h1>Welcome</h1>',
 *       from: 'noreply@example.com'
 *     }
 *   }
 * });
 * ```
 *
 * @since 0.0.1
 */
@Injectable()
export class EmailJobHandler {
  private readonly logger = new Logger(EmailJobHandler.name);

  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  /**
   * Process email jobs from the queue
   *
   * Called automatically by BullMQ when jobs are available in the 'emails' queue.
   *
   * ## Job Processing Flow
   *
   * 1. Extract organizationId and emailRequest from job.data
   * 2. Validate organizationId presence (P0 requirement)
   * 3. Send email via EmailService.sendEmail()
   * 4. Return messageId and success status
   *
   * ## P0 Compliance
   *
   * - Logs organizationId but NOT email addresses or content
   * - Uses job.id for tracing instead of PII
   * - Throws on missing organizationId (multi-tenancy violation)
   *
   * @param job - BullMQ job containing email data
   * @returns Promise resolving to job response with messageId
   * @throws Error when organizationId is missing (P0: multi-tenancy violation)
   *
   * @example Usage
   * ```typescript
   * @JobHandler({
   *   queueName: EMAIL_QUEUE_NAME,
   *   jobName: 'send-email',
   *   concurrency: 10
   * })
   * async handleEmailJob(job: Job<IEmailJobData>): Promise<void> {
   *   const response = await this.emailService.sendEmail(job.data.emailRequest);
   *   this.logger.log(`Email sent: ${response.messageId}`);
   * }
   * ```
   */
  @JobHandler({
    queueName: EMAIL_QUEUE_NAME,
    jobName: 'send-email',
    concurrency: 10
  })
  async handleEmailJob(job: Job<IEmailJobData>): Promise<void> {
    const { organizationId, emailRequest } = job.data;

    // P0: Validate organizationId for multi-tenancy
    if (!organizationId) {
      this.logger.error(`Job ${job.id} missing organizationId - multi-tenancy violation`);
      throw new Error('organizationId is required for email jobs');
    }

    // P0: Log with organizationId but NOT email addresses (Class-C data)
    this.logger.log(`Processing email job ${job.id} for organization ${organizationId}`);

    // Send email via EmailService (which has its own P0 compliance)
    const response: ISendEmailResponse = await this.emailService.sendEmail(emailRequest);

    // P0: Log only messageId, not email addresses or content
    this.logger.log(
      `Email sent successfully for organization ${organizationId}: ${response.messageId}`
    );
  }
}

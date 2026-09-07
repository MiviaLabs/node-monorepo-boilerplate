/**
 * Email attachment data structure.
 */
export interface IEmailAttachment {
  /**
   * File name (e.g., "report.pdf").
   */
  filename: string;

  /**
   * File content as Buffer or base64 string.
   */
  content: Buffer | string;

  /**
   * MIME type (e.g., "application/pdf").
   */
  contentType?: string;
}

export type EmailTrackingMetadataValue = string | number | boolean | null;

export interface IEmailTrackingRequest {
  messageKind?: string;
  referenceType?: string;
  referenceId?: string;
  correlationKey?: string;
  providerTags?: Record<string, string>;
  safeMetadata?: Record<string, EmailTrackingMetadataValue>;
}

/**
 * Email send request structure.
 */
export interface ISendEmailRequest {
  /**
   * Recipient email address(es). Can be a single address or an array of addresses.
   */
  to: string | string[];

  /**
   * Email subject line.
   */
  subject: string;

  /**
   * Plain text email body.
   */
  text?: string;

  /**
   * HTML email body.
   */
  html?: string;

  /**
   * Sender email address. If not provided, uses default from configuration.
   */
  from?: string;

  /**
   * Sender name. If not provided, uses default from configuration.
   */
  fromName?: string;

  /**
   * Reply-to email address.
   */
  replyTo?: string;

  /**
   * CC recipients.
   */
  cc?: string | string[];

  /**
   * BCC recipients.
   */
  bcc?: string | string[];

  /**
   * Email attachments.
   */
  attachments?: IEmailAttachment[];

  /**
   * Custom headers for provider-specific features.
   */
  headers?: Record<string, string>;

  /**
   * Tags for tracking and analytics (provider-specific).
   */
  tags?: string[];

  /**
   * Provider-agnostic outbound tracking hints for correlation.
   */
  emailTracking?: IEmailTrackingRequest;
}

/**
 * Email send response from provider.
 */
export interface ISendEmailResponse {
  /**
   * Unique message ID from the provider.
   */
  messageId: string;

  /**
   * Whether the email was accepted for delivery.
   */
  success: boolean;

  /**
   * Error message if send failed.
   */
  error?: string;

  /**
   * Provider-specific response data.
   */
  providerResponse?: unknown;
}

/**
 * Email provider interface for multi-provider abstraction.
 *
 * Implementations: ResendProvider, TwilioProvider, SendGridProvider.
 */
export interface IEmailProvider {
  /**
   * Provider name (e.g., "resend", "twilio").
   */
  readonly name: string;

  /**
   * Send a single email.
   *
   * @param request - Email send request
   * @returns Email send response with message ID
   * @throws {EmailSendError} When email send fails
   */
  sendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse>;

  /**
   * Send multiple emails in batch.
   *
   * @param requests - Array of email send requests
   * @returns Array of email send responses
   * @throws {EmailSendError} When batch send fails
   */
  sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]>;

  /**
   * Verify provider credentials and connectivity.
   *
   * @returns True if provider is healthy
   */
  healthCheck(): Promise<boolean>;
}

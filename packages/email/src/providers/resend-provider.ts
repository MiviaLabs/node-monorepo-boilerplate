/**
 * Resend Email Provider
 *
 * Email provider implementation using Resend API.
 * Extends BaseEmailProvider for automatic telemetry, validation, and P0 sanitization.
 *
 * @packageDocumentation
 */

import { Resend } from 'resend';

import { BaseEmailProvider } from './base-email-provider';
import { EmailSendError, EmailProviderHealthCheckError, EmailConfigurationError } from '../errors';

// PERF-001: Simple concurrency limiter to avoid ESM import issues with p-limit
class ConcurrencyLimiter {
  private readonly limit: number;
  private active = 0;
  private queue: Array<(value: void) => void> = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active++;

    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse,
  IEmailAttachment
} from './email-provider.interface';
import type { IResendProviderConfig } from '../config/interfaces';
import type { CreateEmailOptions } from 'resend';

/**
 * Resend email provider with OpenTelemetry tracing and P0 sanitization.
 *
 * Features:
 * - Single email send via Resend API
 * - Batch email send (concurrent processing)
 * - Health check via API verification
 * - Rate limit error handling (429 responses)
 * - Automatic retry-after extraction
 * - Attachment format conversion (Buffer/base64 → Resend format)
 *
 * @since 0.0.1
 *
 * @example
 * ```typescript
 * import { ResendAdapter } from '@package/email';
 * import { EmailProviderType } from '@package/email';
 *
 * const config: IResendProviderConfig = {
 *   type: EmailProviderType.RESEND,
 *   apiKey: process.env.RESEND_API_KEY!,
 *   defaultFromEmail: 'noreply@example.com',
 *   defaultFromName: 'My App'
 * };
 *
 * const provider = new ResendAdapter(config);
 *
 * const response = await provider.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   html: '<h1>Welcome!</h1>'
 * });
 * ```
 */
export class ResendAdapter extends BaseEmailProvider implements IEmailProvider {
  private readonly resendClient: Resend;
  private readonly config: IResendProviderConfig;

  constructor(config: IResendProviderConfig) {
    super('resend');

    // Validate configuration
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new EmailConfigurationError('Resend API key is required');
    }

    // BUG-001: Validate defaultFromEmail is present and non-empty
    if (!config.defaultFromEmail || config.defaultFromEmail.trim().length === 0) {
      throw new EmailConfigurationError('defaultFromEmail is required');
    }
    this.validateEmailAddress(config.defaultFromEmail);

    // P0: Validate defaultFromName for control characters (header injection prevention)
    if (config.defaultFromName) {
      if (/[\r\n\x00-\x1f]/.test(config.defaultFromName)) {
        throw new EmailConfigurationError('defaultFromName contains invalid control characters');
      }
    }

    // P0: Validate defaultFromEmail for control characters (header injection prevention)
    if (/[\r\n\x00-\x1f]/.test(config.defaultFromEmail)) {
      throw new EmailConfigurationError('defaultFromEmail contains invalid control characters');
    }

    this.config = config;
    this.resendClient = new Resend(config.apiKey);
  }

  /**
   * Send a single email via Resend API.
   *
   * Converts ISendEmailRequest format to Resend API format.
   * Validation and telemetry are handled by BaseEmailProvider.
   *
   * @param request - Validated email send request
   * @returns Email send response with message ID
   * @throws {EmailSendError} When send fails or rate limited
   */
  protected async doSendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    try {
      // Convert to Resend API format
      const resendRequest = this.convertToResendFormat(request);

      // Send via Resend SDK
      const response = await this.resendClient.emails.send(resendRequest);

      // Handle Resend SDK error response format
      if ('error' in response && response.error) {
        // P0: Sanitize error message to prevent PII leakage
        const sanitizedMessage = this.sanitizeErrorMessage(
          response.error.message || 'Unknown error'
        );
        throw new EmailSendError(`Resend API error: ${sanitizedMessage}`, this.name);
      }

      // BUG-003: Extract message ID from successful response with null check
      if ('data' in response && response.data) {
        const messageId = response.data.id;
        if (!messageId) {
          throw new EmailSendError('Resend API did not return a message ID', this.name);
        }

        return {
          messageId,
          success: true,
          providerResponse: response.data
        };
      }

      throw new EmailSendError('Resend API returned unexpected response format', this.name);
    } catch (error) {
      // Handle rate limit errors (429)
      if (this.isRateLimitError(error)) {
        const retryAfter = this.extractRetryAfter(error);
        throw new EmailSendError(
          `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
          this.name,
          error instanceof Error ? error : undefined
        );
      }

      // Re-throw EmailSendError as-is
      if (error instanceof EmailSendError) {
        throw error;
      }

      // Wrap other errors
      // P0: Sanitize error message to prevent PII leakage from network/SDK errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = this.sanitizeErrorMessage(errorMessage);
      throw new EmailSendError(`Failed to send email: ${sanitizedMessage}`, this.name);
    }
  }

  /**
   * Send multiple emails in batch (concurrent processing).
   *
   * Uses concurrent single-send calls via doSendEmail() (bypasses per-email
   * telemetry from sendEmail() wrapper). Batch-level telemetry is created by
   * BaseEmailProvider.sendBatch(). Validation is preserved.
   *
   * PERF-001: Implements concurrency limiting (max 5 concurrent requests)
   * to prevent rate limiting issues with large batches.
   *
   * @param requests - Validated array of email send requests
   * @returns Array of successful email send responses
   */
  protected async doSendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    // PERF-001: Limit concurrency to avoid rate limiting
    const limit = new ConcurrencyLimiter(5); // Max 5 concurrent requests

    const results = await Promise.allSettled(
      requests.map((request) => limit.run(() => this.doSendEmail(request)))
    );

    const failedResult = results.find((result) => result.status === 'rejected');
    if (failedResult && failedResult.status === 'rejected') {
      const errorMessage =
        failedResult.reason instanceof Error
          ? failedResult.reason.message
          : String(failedResult.reason);
      const sanitizedMessage = this.sanitizeErrorMessage(errorMessage);
      throw new EmailSendError(`Failed to send batch email: ${sanitizedMessage}`, this.name);
    }

    return results
      .filter((result): result is PromiseFulfilledResult<ISendEmailResponse> => {
        return result.status === 'fulfilled';
      })
      .map((result) => result.value);
  }

  /**
   * Verify Resend API credentials and connectivity.
   *
   * Makes a test API call to verify the API key is valid and the service is reachable.
   * Telemetry is handled by BaseEmailProvider.
   *
   * @returns True if provider is healthy
   * @throws {EmailProviderHealthCheckError} When health check fails
   */
  protected async doHealthCheck(): Promise<boolean> {
    try {
      // Verify API key by fetching API keys endpoint
      // This is a lightweight check that validates connectivity and authentication
      await this.resendClient.apiKeys.list();
      return true;
    } catch (error) {
      // P0: Sanitize error message to prevent PII leakage from provider responses
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = this.sanitizeErrorMessage(errorMessage);
      throw new EmailProviderHealthCheckError(
        `Resend health check failed: ${sanitizedMessage}`,
        this.name,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ============================================================================
  // FORMAT CONVERSION
  // ============================================================================

  /**
   * Convert ISendEmailRequest to Resend API format.
   *
   * Handles:
   * - Email addresses (string | string[] → Resend format)
   * - Attachments (Buffer/base64 → Resend attachment format)
   * - Headers (pass-through)
   * - Tags (pass-through)
   *
   * @param request - Email send request
   * @returns Resend API request payload
   */
  private convertToResendFormat(request: ISendEmailRequest): CreateEmailOptions {
    // Build from address (with optional name)
    const from = this.buildFromAddress(request);

    // Build recipient addresses
    const to = Array.isArray(request.to) ? request.to : [request.to];

    // Build Resend request with required email content
    // Resend requires at least one of: html, text, or react
    const baseRequest = {
      from,
      to,
      subject: request.subject
    };

    // Combine to satisfy CreateEmailOptions union type
    // Note: At least one of html or text should be present (validated by BaseEmailProvider)
    const resendRequest: CreateEmailOptions = {
      ...baseRequest,
      ...(request.html ? { html: request.html } : {}),
      ...(request.text ? { text: request.text } : {})
    } as CreateEmailOptions;

    if (request.replyTo) {
      resendRequest.replyTo = request.replyTo;
    }

    if (request.cc) {
      resendRequest.cc = Array.isArray(request.cc) ? request.cc : [request.cc];
    }

    if (request.bcc) {
      resendRequest.bcc = Array.isArray(request.bcc) ? request.bcc : [request.bcc];
    }

    // Convert attachments
    if (request.attachments && request.attachments.length > 0) {
      resendRequest.attachments = request.attachments.map((att) => this.convertAttachment(att));
    }

    // Add headers
    if (request.headers) {
      resendRequest.headers = request.headers;
    }

    const resendTags = [
      ...(request.tags?.map((tag) => {
        const colonIndex = tag.indexOf(':');
        if (colonIndex > 0 && colonIndex < tag.length - 1) {
          return {
            name: sanitizeResendTagComponent(tag.substring(0, colonIndex), 'tag'),
            value: sanitizeResendTagComponent(tag.substring(colonIndex + 1), 'true')
          };
        }

        return {
          name: sanitizeResendTagComponent(tag, 'tag'),
          value: 'true'
        };
      }) ?? []),
      ...Object.entries(request.emailTracking?.providerTags ?? {}).map(([name, value]) => ({
        name: sanitizeResendTagComponent(name, 'tag'),
        value: sanitizeResendTagComponent(value, 'true')
      }))
    ];

    if (resendTags.length > 0) {
      resendRequest.tags = resendTags;
    }

    return resendRequest;
  }

  /**
   * Build "from" address with optional name.
   *
   * Formats:
   * - With name: "Sender Name <sender@example.com>"
   * - Without name: "sender@example.com"
   *
   * P0: fromName is validated by BaseEmailProvider before this method is called,
   * but we also validate defaultFromName in the constructor.
   *
   * @param request - Email send request
   * @returns Formatted from address
   */
  private buildFromAddress(request: ISendEmailRequest): string {
    const fromEmail = request.from ?? this.config.defaultFromEmail;
    if (!fromEmail) {
      throw new EmailConfigurationError('No "from" address provided and no default configured');
    }

    const fromName = request.fromName ?? this.config.defaultFromName;
    if (fromName) {
      // P0: fromName is already validated for control characters by BaseEmailProvider
      // and defaultFromName is validated in constructor
      return `${fromName} <${fromEmail}>`;
    }

    return fromEmail;
  }

  /**
   * Convert IEmailAttachment to Resend attachment format.
   *
   * Resend expects:
   * ```json
   * {
   *   "filename": "report.pdf",
   *   "content": "<base64-encoded-data>"
   * }
   * ```
   *
   * @param attachment - Email attachment
   * @returns Resend attachment object
   */
  private convertAttachment(attachment: IEmailAttachment): Record<string, unknown> {
    let contentBase64: string;

    if (attachment.content instanceof Buffer) {
      // Convert Buffer to base64
      contentBase64 = attachment.content.toString('base64');
    } else if (typeof attachment.content === 'string') {
      // Assume already base64
      contentBase64 = attachment.content;
    } else {
      throw new EmailConfigurationError('Attachment content must be Buffer or string');
    }

    return {
      filename: attachment.filename,
      content: contentBase64
    };
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  /**
   * Check if error is a rate limit error (HTTP 429).
   *
   * @param error - Error object
   * @returns True if rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      const statusCode = this.extractStatusCode(err);
      return statusCode === 429;
    }
    return false;
  }

  /**
   * Extract retry-after value from rate limit error.
   *
   * @param error - Error object
   * @returns Retry-after value in seconds, or null
   */
  private extractRetryAfter(error: unknown): number | null {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      const retryAfterFields = [err['retryAfter'], err['retry_after']];
      for (const value of retryAfterFields) {
        const parsed = this.parseRetryAfterValue(value);
        if (parsed !== null) return parsed;
      }

      const response = err['response'];
      if (response && typeof response === 'object') {
        const responseObj = response as Record<string, unknown>;
        const headers = responseObj['headers'];
        const headerValue = this.getHeaderValue(headers, 'retry-after');
        const parsed = this.parseRetryAfterValue(headerValue);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  private extractStatusCode(errorObj: Record<string, unknown>): number | null {
    const directStatus = [errorObj['statusCode'], errorObj['status']];
    for (const value of directStatus) {
      if (typeof value === 'number') {
        return value;
      }
    }

    const response = errorObj['response'];
    if (response && typeof response === 'object') {
      const responseObj = response as Record<string, unknown>;
      const nestedStatus = [responseObj['statusCode'], responseObj['status']];
      for (const value of nestedStatus) {
        if (typeof value === 'number') {
          return value;
        }
      }
    }

    return null;
  }

  private getHeaderValue(headers: unknown, key: string): unknown {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }

    if ('get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
      return (headers as { get: (name: string) => unknown }).get(key);
    }

    const headersObj = headers as Record<string, unknown>;
    return headersObj[key] ?? headersObj[key.toLowerCase()] ?? headersObj[key.toUpperCase()];
  }

  private parseRetryAfterValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }
}

function sanitizeResendTagComponent(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return sanitized.length > 0 ? sanitized : fallback;
}

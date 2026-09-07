/**
 * Base Email Provider
 *
 * Base class for all email provider implementations with OpenTelemetry metrics and tracing.
 * Provides telemetry, validation, and sanitization (P0 critical for PII protection).
 *
 * @packageDocumentation
 */

import { metrics, trace, SpanStatusCode, context } from '@opentelemetry/api';

import {
  MAX_SUBJECT_LENGTH,
  MAX_RECIPIENTS_PER_EMAIL,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_BATCH_SIZE
} from '../constants';
import { EmailConfigurationError, EmailSendError, EmailProviderHealthCheckError } from '../errors';

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse,
  IEmailAttachment
} from './email-provider.interface';
import type { Attributes, Counter, Histogram, Span, Tracer } from '@opentelemetry/api';

/**
 * Sanitized email address for telemetry (P0: no PII in logs/traces).
 *
 * @example
 * ```typescript
 * // Input: "user@example.com"
 * // Output: "u***@e***"
 * ```
 */
interface ISanitizedEmailAddress {
  masked: string;
}

/**
 * Sanitized email request for telemetry (P0: no PII in logs/traces).
 * Only includes counts and metadata, never actual addresses or content.
 */
interface ISanitizedEmailRequest {
  toCount: number;
  ccCount?: number;
  bccCount?: number;
  hasText: boolean;
  hasHtml: boolean;
  attachmentCount?: number;
  // P0: NEVER include: to, from, subject, text, html, attachments
}

/**
 * Base email provider with OpenTelemetry metrics and distributed tracing.
 *
 * All providers should extend this class to get automatic:
 * - Metrics collection (counters and histograms)
 * - Distributed tracing (spans with context propagation)
 * - Error tracking with status codes
 * - P0 sanitization (no PII in logs/traces)
 * - Request validation
 *
 * @since 0.0.1
 *
 * @example
 * ```typescript
 * class ResendProvider extends BaseEmailProvider {
 *   async doSendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
 *     // Validation already done by base class
 *     // Telemetry already set up by base class
 *     const response = await this.resendClient.send(request);
 *     return {
 *       messageId: response.id,
 *       success: true
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseEmailProvider implements IEmailProvider {
  /** RFC 5322 compliant email regex - basic validation */
  private readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  protected sendEmailCounter: Counter;
  protected sendBatchCounter: Counter;
  protected healthCheckCounter: Counter;
  protected sendEmailHistogram: Histogram;
  protected sendBatchHistogram: Histogram;
  protected healthCheckHistogram: Histogram;

  /** OpenTelemetry tracer for creating spans */
  protected readonly tracer: Tracer;

  constructor(
    public readonly name: string,
    protected readonly meter = metrics.getMeter('email'),
    protected readonly tracerProvider = trace.getTracerProvider()
  ) {
    // Initialize tracer for distributed tracing
    this.tracer = this.tracerProvider.getTracer('email', '1.0.0');

    // Initialize metrics
    this.sendEmailCounter = this.meter.createCounter('email.send.total', {
      description: 'Total number of email send attempts'
    });
    this.sendBatchCounter = this.meter.createCounter('email.send_batch.total', {
      description: 'Total number of batch email send attempts'
    });
    this.healthCheckCounter = this.meter.createCounter('email.health_check.total', {
      description: 'Total number of health check attempts'
    });
    this.sendEmailHistogram = this.meter.createHistogram('email.send.duration', {
      description: 'Duration of email send operations',
      unit: 'ms'
    });
    this.sendBatchHistogram = this.meter.createHistogram('email.send_batch.duration', {
      description: 'Duration of batch email send operations',
      unit: 'ms'
    });
    this.healthCheckHistogram = this.meter.createHistogram('email.health_check.duration', {
      description: 'Duration of health check operations',
      unit: 'ms'
    });
  }

  // ============================================================================
  // PUBLIC API (Template Methods)
  // ============================================================================

  /**
   * Send a single email with validation and telemetry.
   *
   * Template method: validates → creates span → calls doSendEmail → records metrics.
   * Subclasses implement doSendEmail() with provider-specific logic.
   *
   * @param request - Email send request
   * @returns Email send response with message ID
   * @throws {EmailConfigurationError} When request validation fails
   * @throws {EmailSendError} When email send fails
   */
  async sendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    // Validate request (P0: fail fast on invalid input)
    this.validateEmailRequest(request);

    const startTime = Date.now();

    return this.withSpan<ISendEmailResponse>(
      'send_email',
      async (span) => {
        // P0: Add sanitized attributes (no PII)
        const sanitized = this.sanitizeEmailRequest(request);
        span.setAttributes({
          'email.to_count': sanitized.toCount,
          'email.has_text': sanitized.hasText,
          'email.has_html': sanitized.hasHtml,
          'email.attachment_count': sanitized.attachmentCount || 0
        });

        try {
          // Call provider-specific implementation
          const response = await this.doSendEmail(request);

          // Validate provider response: treat success: false or missing messageId as failure
          // Note: Do NOT record metrics here - catch block will handle all failure metrics
          if (response?.success !== true || !response.messageId) {
            throw new EmailSendError(
              'Provider returned unsuccessful sendEmail response',
              this.name
            );
          }

          // Record success metrics
          const duration = Date.now() - startTime;
          this.recordSendEmail(this.buildAttributes(undefined, { success: true }), duration);

          return response;
        } catch (error) {
          // Record failure metrics
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const sanitizedError = this.sanitizeErrorMessage(errorMessage);
          this.recordSendEmail(this.buildAttributes(sanitizedError, { success: false }), duration);

          // Convert to EmailSendError if needed (P0: use sanitized message to prevent PII leak)
          if (!(error instanceof EmailSendError)) {
            throw new EmailSendError(
              `Failed to send email: ${sanitizedError}`,
              this.name,
              error instanceof Error ? error : undefined
            );
          }
          throw error;
        }
      },
      { provider: this.name }
    );
  }

  /**
   * Send multiple emails in batch with validation and telemetry.
   *
   * Template method: validates → creates span → calls doSendBatch → records metrics.
   * Subclasses implement doSendBatch() with provider-specific logic.
   *
   * @param requests - Array of email send requests
   * @returns Array of email send responses
   * @throws {EmailConfigurationError} When batch validation fails
   * @throws {EmailSendError} When batch send fails
   */
  async sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    // Validate batch request (P0: fail fast on invalid input)
    this.validateBatchRequest(requests);

    const startTime = Date.now();

    return this.withSpan<ISendEmailResponse[]>(
      'send_batch',
      async (span) => {
        // P0: Add sanitized attributes (no PII)
        span.setAttributes({
          'email.batch_size': requests.length
        });

        try {
          // Call provider-specific implementation
          const responses = await this.doSendBatch(requests);

          // Validate provider responses before recording success metrics
          const hasInvalidResponses =
            !Array.isArray(responses) ||
            responses.length !== requests.length ||
            responses.some((response) => {
              return (
                response?.success !== true ||
                typeof response.messageId !== 'string' ||
                response.messageId.trim().length === 0
              );
            });

          if (hasInvalidResponses) {
            // Mark span as error but avoid including any PII in the message
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Batch send returned unsuccessful or invalid responses'
            });
            // Throw to trigger failure metrics and standardized EmailSendError handling
            throw new Error('Batch send returned unsuccessful or invalid responses');
          }

          // Record success metrics
          const duration = Date.now() - startTime;
          this.recordSendBatch(
            this.buildAttributes(undefined, {
              success: true,
              batch_size: requests.length
            }),
            duration
          );

          return responses;
        } catch (error) {
          // Record failure metrics
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const sanitizedError = this.sanitizeErrorMessage(errorMessage);
          this.recordSendBatch(
            this.buildAttributes(sanitizedError, {
              success: false,
              batch_size: requests.length
            }),
            duration
          );

          // Convert to EmailSendError if needed (P0: use sanitized message to prevent PII leak)
          if (!(error instanceof EmailSendError)) {
            throw new EmailSendError(
              `Failed to send batch: ${sanitizedError}`,
              this.name,
              error instanceof Error ? error : undefined
            );
          }
          throw error;
        }
      },
      { provider: this.name }
    );
  }

  /**
   * Verify provider credentials and connectivity with telemetry.
   *
   * Template method: creates span → calls doHealthCheck → records metrics.
   * Subclasses implement doHealthCheck() with provider-specific logic.
   *
   * @returns True if provider is healthy
   */
  async healthCheck(): Promise<boolean> {
    const startTime = Date.now();

    return this.withSpan<boolean>(
      'health_check',
      async () => {
        try {
          // Call provider-specific implementation
          const result = await this.doHealthCheck();

          // Record success metrics
          const duration = Date.now() - startTime;
          this.recordHealthCheck(this.buildAttributes(undefined, { success: true }), duration);

          return result;
        } catch (error) {
          // Record failure metrics
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const sanitizedError = this.sanitizeErrorMessage(errorMessage);
          this.recordHealthCheck(
            this.buildAttributes(sanitizedError, { success: false }),
            duration
          );

          // Convert to EmailProviderHealthCheckError if needed (P0: use sanitized message to prevent PII leak)
          if (!(error instanceof EmailProviderHealthCheckError)) {
            throw new EmailProviderHealthCheckError(
              `Health check failed: ${sanitizedError}`,
              this.name,
              error instanceof Error ? error : undefined
            );
          }
          throw error;
        }
      },
      { provider: this.name }
    );
  }

  // ============================================================================
  // ABSTRACT METHODS (Provider-Specific Implementation)
  // ============================================================================

  /**
   * Provider-specific email send implementation.
   *
   * Subclasses MUST implement this method with provider-specific logic.
   * Validation and telemetry are already handled by sendEmail().
   *
   * @param request - Validated email send request
   * @returns Email send response with message ID
   * @throws {EmailSendError} When send fails
   */
  protected abstract doSendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse>;

  /**
   * Provider-specific batch send implementation.
   *
   * Subclasses MUST implement this method with provider-specific logic.
   * Validation and telemetry are already handled by sendBatch().
   *
   * @param requests - Validated array of email send requests
   * @returns Array of email send responses
   * @throws {EmailSendError} When batch send fails
   */
  protected abstract doSendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]>;

  /**
   * Provider-specific health check implementation.
   *
   * Subclasses MUST implement this method with provider-specific logic.
   * Telemetry is already handled by healthCheck().
   *
   * @returns True if provider is healthy
   * @throws {EmailProviderHealthCheckError} When health check fails
   */
  protected abstract doHealthCheck(): Promise<boolean>;

  // ============================================================================
  // VALIDATION (P0: Fail Fast)
  // ============================================================================

  /**
   * Validate display name for control characters (P0: header injection prevention).
   *
   * Email display names (fromName, replyToName) must not contain control characters
   * to prevent header injection attacks via CR/LF sequences.
   *
   * @param name - Display name to validate
   * @param fieldName - Field name for error messages (e.g., 'fromName')
   * @throws {EmailConfigurationError} When name contains control characters
   *
   * @example
   * ```typescript
   * validateDisplayName('My App', 'fromName'); // OK
   * validateDisplayName('App\r\nBCC: evil@hack.com', 'fromName'); // Throws
   * ```
   */
  protected validateDisplayName(name: string, fieldName: string): void {
    if (/[\r\n\x00-\x1f]/.test(name)) {
      throw new EmailConfigurationError(`Email ${fieldName} contains invalid control characters`);
    }
  }

  /**
   * Validate email address format and security (P0: header injection prevention).
   *
   * Checks for:
   * - Basic RFC 5322 format compliance
   * - Control characters (header injection prevention)
   *
   * @param email - Email address to validate
   * @throws {EmailConfigurationError} When email format is invalid or contains control characters
   *
   * @example
   * ```typescript
   * validateEmailAddress('user@example.com'); // OK
   * validateEmailAddress('test'); // Throws: Invalid email format
   * validateEmailAddress('test@domain.com\r\nBCC: evil@hack.com'); // Throws: Control characters
   * ```
   */
  protected validateEmailAddress(email: string): void {
    // Check for control characters FIRST (P0: header injection prevention)
    // Must be before format check because sanitizeEmailAddress splits on @ which breaks with control chars
    if (/[\r\n\x00-\x1f]/.test(email)) {
      throw new EmailConfigurationError('Email address contains invalid control characters');
    }

    // Basic RFC 5322 format check
    if (!this.EMAIL_REGEX.test(email)) {
      throw new EmailConfigurationError('Invalid email format');
    }
  }

  /**
   * Validate email send request.
   *
   * @param request - Email send request to validate
   * @throws {EmailConfigurationError} When validation fails
   */
  protected validateEmailRequest(request: ISendEmailRequest): void {
    // Validate required recipient (to)
    if (!request.to) {
      throw new EmailConfigurationError(
        'Email request must have at least one valid recipient (to)'
      );
    }

    let recipients: string[];

    if (typeof request.to === 'string') {
      if (request.to.trim().length === 0) {
        throw new EmailConfigurationError(
          'Email request must have at least one valid recipient (to)'
        );
      }
      recipients = [request.to];
    } else if (Array.isArray(request.to)) {
      if (request.to.length === 0) {
        throw new EmailConfigurationError(
          'Email request must have at least one valid recipient (to)'
        );
      }

      const hasInvalidRecipient = request.to.some((email) => {
        if (typeof email !== 'string') {
          return true;
        }

        return email.trim().length === 0;
      });

      if (hasInvalidRecipient) {
        throw new EmailConfigurationError(
          'Email request must have at least one valid recipient (to)'
        );
      }

      recipients = request.to;
    } else {
      // Defensive: runtime type mismatch with ISendEmailRequest
      throw new EmailConfigurationError(
        'Email request "to" field must be a string or an array of strings'
      );
    }

    // Validate email format for all recipients (P0: security)
    for (const email of recipients) {
      this.validateEmailAddress(email);
    }

    // Validate cc recipients
    if (request.cc) {
      const ccRecipientsRaw = Array.isArray(request.cc) ? request.cc : [request.cc];
      for (const email of ccRecipientsRaw) {
        if (typeof email !== 'string') {
          throw new EmailConfigurationError(
            'Email request "cc" field must contain only string email addresses'
          );
        }
        this.validateEmailAddress(email);
      }
    }

    // Validate bcc recipients
    if (request.bcc) {
      const bccRecipientsRaw = Array.isArray(request.bcc) ? request.bcc : [request.bcc];
      for (const email of bccRecipientsRaw) {
        if (typeof email !== 'string') {
          throw new EmailConfigurationError(
            'Email request "bcc" field must contain only string email addresses'
          );
        }
        this.validateEmailAddress(email);
      }
    }

    // P0: Validate from address for header injection
    if (request.from) {
      this.validateEmailAddress(request.from);
    }

    // P0: Validate fromName for control characters (header injection prevention)
    if (request.fromName) {
      this.validateDisplayName(request.fromName, 'fromName');
    }

    // P0: Validate replyTo address for header injection
    if (request.replyTo) {
      this.validateEmailAddress(request.replyTo);
    }

    // Validate subject
    if (!request.subject || request.subject.trim().length === 0) {
      throw new EmailConfigurationError('Email request must have a subject');
    }

    // Validate subject length (RFC 5322)
    if (request.subject.length > MAX_SUBJECT_LENGTH) {
      throw new EmailConfigurationError(
        `Email subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters`
      );
    }

    // P0: Validate subject for control characters (header injection prevention)
    if (/[\r\n\x00-\x1f]/.test(request.subject)) {
      throw new EmailConfigurationError('Email subject contains invalid control characters');
    }

    // P0: Validate headers for control characters (header injection prevention)
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        // Always validate header keys to prevent header injection
        if (/[\r\n\x00-\x1f]/.test(key)) {
          throw new EmailConfigurationError('Email headers contain invalid control characters');
        }

        // Enforce string header values and validate them
        if (typeof value !== 'string') {
          throw new EmailConfigurationError('Email header values must be strings');
        }

        if (/[\r\n\x00-\x1f]/.test(value)) {
          throw new EmailConfigurationError('Email headers contain invalid control characters');
        }
      }
    }

    // Validate content (must have text or html)
    if (!request.text && !request.html) {
      throw new EmailConfigurationError('Email request must have text or html content');
    }

    // Validate recipient count
    const toCount = Array.isArray(request.to) ? request.to.length : 1;
    const ccCount = Array.isArray(request.cc) ? request.cc.length : request.cc ? 1 : 0;
    const bccCount = Array.isArray(request.bcc) ? request.bcc.length : request.bcc ? 1 : 0;
    const totalRecipients = toCount + ccCount + bccCount;

    if (totalRecipients > MAX_RECIPIENTS_PER_EMAIL) {
      throw new EmailConfigurationError(
        `Total recipients (${totalRecipients}) exceeds maximum of ${MAX_RECIPIENTS_PER_EMAIL}`
      );
    }

    // Validate attachments
    if (request.attachments) {
      for (const attachment of request.attachments) {
        this.validateAttachment(attachment);
      }
    }
  }

  /**
   * Validate batch email send request.
   *
   * @param requests - Array of email send requests to validate
   * @throws {EmailConfigurationError} When validation fails
   */
  protected validateBatchRequest(requests: ISendEmailRequest[]): void {
    // Validate batch is not empty
    if (!requests || requests.length === 0) {
      throw new EmailConfigurationError('Batch request must contain at least one email');
    }

    // Validate batch size
    if (requests.length > MAX_BATCH_SIZE) {
      throw new EmailConfigurationError(
        `Batch size (${requests.length}) exceeds maximum of ${MAX_BATCH_SIZE}`
      );
    }

    // Validate each request in batch
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      if (!request) {
        throw new EmailConfigurationError(`Batch request at index ${i} is undefined`);
      }
      try {
        this.validateEmailRequest(request);
      } catch (error) {
        throw new EmailConfigurationError(
          `Batch request at index ${i} is invalid: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Validate email attachment.
   *
   * @param attachment - Email attachment to validate
   * @throws {EmailConfigurationError} When validation fails
   */
  protected validateAttachment(attachment: IEmailAttachment): void {
    // Validate filename
    if (!attachment.filename || attachment.filename.trim().length === 0) {
      throw new EmailConfigurationError('Attachment must have a filename');
    }

    // Validate content
    if (!attachment.content) {
      throw new EmailConfigurationError('Attachment must have content');
    }

    // Validate size
    let size: number;
    if (attachment.content instanceof Buffer) {
      size = attachment.content.length;
    } else if (typeof attachment.content === 'string') {
      // NOTE: For base64 content, we decode to calculate exact size.
      // This is intentional for accuracy. Approximate calculation
      // (base64Length * 3 / 4) could be used if profiling shows this
      // as a bottleneck, but accuracy is prioritized currently.
      size = Buffer.from(attachment.content, 'base64').length;
    } else {
      throw new EmailConfigurationError('Attachment content must be string or Buffer');
    }

    if (size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new EmailConfigurationError(
        `Attachment "${attachment.filename}" size (${size} bytes) exceeds maximum of ${MAX_ATTACHMENT_SIZE_BYTES} bytes`
      );
    }
  }

  // ============================================================================
  // SANITIZATION (P0: No PII in Logs/Traces)
  // ============================================================================

  /**
   * Sanitize error message for telemetry (P0: no PII in logs/traces).
   *
   * Removes email addresses from error messages and truncates long messages
   * to prevent PII exposure in telemetry.
   *
   * @param errorMessage - Raw error message to sanitize
   * @returns Sanitized error message with emails redacted
   *
   * @example
   * ```typescript
   * sanitizeErrorMessage('Failed to send to user@example.com: mailbox not found')
   * // Returns: 'Failed to send to [EMAIL_REDACTED]: mailbox not found'
   * ```
   */
  protected sanitizeErrorMessage(errorMessage: string): string {
    // Remove email addresses (P0: no PII in telemetry)
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    let sanitized = errorMessage.replace(emailPattern, '[EMAIL_REDACTED]');

    // Truncate long messages
    const MAX_ERROR_LENGTH = 200;
    if (sanitized.length > MAX_ERROR_LENGTH) {
      sanitized = sanitized.slice(0, MAX_ERROR_LENGTH) + '...[TRUNCATED]';
    }

    return sanitized;
  }

  /**
   * Sanitize email address for telemetry (P0: no PII in logs/traces).
   *
   * Masks email addresses to prevent PII exposure in logs and traces.
   *
   * @param email - Email address to sanitize
   * @returns Sanitized email address
   *
   * @example
   * ```typescript
   * sanitizeEmailAddress('user@example.com')
   * // Returns: { masked: 'u***@e***' }
   * ```
   */
  protected sanitizeEmailAddress(email: string): ISanitizedEmailAddress {
    if (!email || email.length === 0) {
      return { masked: '[empty]' };
    }

    const parts = email.split('@');
    if (parts.length !== 2) {
      // Invalid email format, mask entire string
      return { masked: email.length > 3 ? `${email[0]}***` : '***' };
    }

    const [localPart, domain] = parts;
    if (!localPart || !domain) {
      // Invalid email format, mask entire string
      return { masked: email.length > 3 ? `${email[0]}***` : '***' };
    }
    const maskedLocal = localPart.length > 0 ? `${localPart[0]}***` : '***';
    const maskedDomain = domain.length > 0 ? `${domain[0]}***` : '***';

    return { masked: `${maskedLocal}@${maskedDomain}` };
  }

  /**
   * Sanitize email request for telemetry (P0: no PII in logs/traces).
   *
   * Returns only counts and metadata, never actual addresses or content.
   *
   * @param request - Email request to sanitize
   * @returns Sanitized email request with counts only
   */
  protected sanitizeEmailRequest(request: ISendEmailRequest): ISanitizedEmailRequest {
    const toCount = Array.isArray(request.to) ? request.to.length : 1;
    const ccCount = request.cc ? (Array.isArray(request.cc) ? request.cc.length : 1) : undefined;
    const bccCount = request.bcc
      ? Array.isArray(request.bcc)
        ? request.bcc.length
        : 1
      : undefined;

    return {
      toCount,
      ccCount,
      bccCount,
      hasText: !!request.text,
      hasHtml: !!request.html,
      attachmentCount: request.attachments?.length || 0
    };
  }

  // ============================================================================
  // TELEMETRY (OpenTelemetry)
  // ============================================================================

  /**
   * Execute a function within an OpenTelemetry span.
   *
   * Creates a span with automatic context propagation, error recording,
   * and metric recording. Use this method to wrap any operation that
   * should be traced.
   *
   * @param name - Span name (e.g., 'send_email', 'send_batch')
   * @param fn - Async function to execute within the span
   * @param attributes - Optional span attributes
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * async sendEmail(request: ISendEmailRequest) {
   *   return this.withSpan('send_email', async (span) => {
   *     span.setAttribute('email.to_count', 1);
   *     const result = await performSend(request);
   *     if (result.error) {
   *       span.setStatus({
   *         code: SpanStatusCode.ERROR,
   *         message: result.error
   *       });
   *     }
   *     return result;
   *   }, { provider: this.name });
   * }
   * ```
   */
  protected async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes: Attributes = {}
  ): Promise<T> {
    const spanName = `email.${name}`;
    const span = this.tracer.startSpan(spanName, {
      attributes: {
        provider: this.name,
        ...attributes
      }
    });

    try {
      // Run the function within the span's context
      const result = await context.with(trace.setSpan(context.active(), span), async () =>
        fn(span)
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Record error in span
      this.recordSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Start a span for manual management.
   *
   * For complex operations where you need to manage the span lifecycle
   * manually (e.g., multiple async operations within one span).
   *
   * @param name - Span name
   * @param attributes - Optional span attributes
   * @returns A span that must be manually ended
   *
   * @example
   * ```typescript
   * async complexOperation() {
   *   const span = this.startSpan('complex_operation', { batch_size: 10 });
   *   try {
   *     await step1();
   *     span.addEvent('step1_complete');
   *     await step2();
   *     span.addEvent('step2_complete');
   *   } catch (error) {
   *     span.recordException(error as Error);
   *     throw error;
   *   } finally {
   *     span.end();
   *   }
   * }
   * ```
   */
  protected startSpan(name: string, attributes: Attributes = {}): Span {
    const spanName = `email.${name}`;
    return this.tracer.startSpan(spanName, {
      attributes: {
        provider: this.name,
        ...attributes
      }
    });
  }

  /**
   * Record an error in a span with proper status code (P0: sanitize PII).
   *
   * Sanitizes error messages before exporting to tracing backends to prevent
   * PII exposure from provider SDK errors.
   *
   * @param span - The span to record error in
   * @param error - The error to record
   */
  protected recordSpanError(span: Span, error: unknown): void {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const sanitizedMessage = this.sanitizeErrorMessage(rawMessage);

    // Create a sanitized error object to record (P0: no PII in traces)
    const sanitizedError = new Error(sanitizedMessage);
    if (error instanceof Error && error.name) {
      sanitizedError.name = error.name;
    }

    span.recordException(sanitizedError);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: sanitizedMessage
    });
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  /**
   * Record metrics for sendEmail operation.
   *
   * Increments the email send counter and records operation duration.
   * Used internally by the sendEmail template method to track success/failure metrics.
   *
   * @param attributes - Metric attributes including provider, success status, and optional error
   * @param duration - Operation duration in milliseconds
   *
   * @internal
   * @see {@link sendEmail} for the public API that uses this method
   *
   * @example
   * ```typescript
   * // Called internally on success:
   * this.recordSendEmail({ provider: 'resend', success: true }, 123);
   *
   * // Called internally on failure:
   * this.recordSendEmail({ provider: 'resend', success: false, error: 'Rate limit' }, 45);
   * ```
   */
  protected recordSendEmail(attributes: Attributes, duration: number): void {
    this.sendEmailCounter.add(1, attributes);
    this.sendEmailHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for sendBatch operation.
   *
   * Increments the batch send counter and records operation duration.
   * Used internally by the sendBatch template method to track batch processing metrics.
   *
   * @param attributes - Metric attributes including provider, success status, batch size, and optional error
   * @param duration - Operation duration in milliseconds
   *
   * @internal
   * @see {@link sendBatch} for the public API that uses this method
   *
   * @example
   * ```typescript
   * // Called internally on success:
   * this.recordSendBatch({ provider: 'resend', success: true, batch_size: 10 }, 456);
   *
   * // Called internally on failure:
   * this.recordSendBatch({ provider: 'resend', success: false, batch_size: 10, error: 'Quota' }, 234);
   * ```
   */
  protected recordSendBatch(attributes: Attributes, duration: number): void {
    this.sendBatchCounter.add(1, attributes);
    this.sendBatchHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for healthCheck operation.
   *
   * Increments the health check counter and records operation duration.
   * Used internally by the healthCheck template method to track provider health status.
   *
   * @param attributes - Metric attributes including provider, success status, and optional error
   * @param duration - Operation duration in milliseconds
   *
   * @internal
   * @see {@link healthCheck} for the public API that uses this method
   *
   * @example
   * ```typescript
   * // Called internally on success:
   * this.recordHealthCheck({ provider: 'resend', success: true }, 89);
   *
   * // Called internally on failure:
   * this.recordHealthCheck({ provider: 'resend', success: false, error: 'Connection timeout' }, 30000);
   * ```
   */
  protected recordHealthCheck(attributes: Attributes, duration: number): void {
    this.healthCheckCounter.add(1, attributes);
    this.healthCheckHistogram.record(duration, attributes);
  }

  /**
   * Build common attributes for metrics.
   *
   * @param error - Optional error message
   * @param additional - Additional attributes to merge
   * @returns Merged attributes with provider name and error (if any)
   */
  protected buildAttributes(error?: string, additional?: Attributes): Attributes {
    const attrs: Attributes = {
      provider: this.name,
      ...additional
    };
    if (error) {
      (attrs as Record<string, unknown>)['error'] = error;
    }
    return attrs;
  }
}

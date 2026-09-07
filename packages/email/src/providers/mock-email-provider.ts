/**
 * Mock Email Provider
 *
 * Mock email provider implementation for testing. Extends BaseEmailProvider
 * with in-memory storage, test utilities, and failure simulation capabilities.
 *
 * P0 Compliance: No PII in logs. All email data stored in memory only.
 *
 * @packageDocumentation
 */

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse
} from './email-provider.interface';
import { BaseEmailProvider } from './base-email-provider';
import type { IMockProviderConfig } from '../config/interfaces';
import { EmailSendError, EmailConfigurationError } from '../errors';

/**
 * Default values for mock provider configuration.
 */
const MOCK_CONFIG_DEFAULTS = {
  failureRate: 0,
  simulatedLatencyMs: 0,
  batchFailureIndices: [] as number[]
} as const;

/**
 * Deep clone an email send request to prevent external mutation.
 *
 * Performs a deep clone of nested objects and arrays (attachments, headers,
 * tags) while keeping simple strings as-is. For attachments with Buffer content,
 * creates a copy of the Buffer to prevent mutation of the original.
 *
 * @param request - The request to clone
 * @returns A deep copy of the request
 */
function deepCloneRequest(request: ISendEmailRequest): ISendEmailRequest {
  return {
    to: Array.isArray(request.to) ? [...request.to] : request.to,
    cc: Array.isArray(request.cc) ? [...request.cc] : request.cc,
    bcc: Array.isArray(request.bcc) ? [...request.bcc] : request.bcc,
    subject: request.subject,
    text: request.text,
    html: request.html,
    from: request.from,
    fromName: request.fromName,
    replyTo: request.replyTo,
    attachments: request.attachments
      ? request.attachments.map((att) => ({
          ...att,
          content: Buffer.isBuffer(att.content) ? Buffer.from(att.content) : att.content
        }))
      : undefined,
    headers: request.headers ? { ...request.headers } : undefined,
    tags: request.tags ? [...request.tags] : undefined,
    emailTracking: request.emailTracking
      ? {
          ...request.emailTracking,
          providerTags: request.emailTracking.providerTags
            ? { ...request.emailTracking.providerTags }
            : undefined,
          safeMetadata: request.emailTracking.safeMetadata
            ? { ...request.emailTracking.safeMetadata }
            : undefined
        }
      : undefined
  };
}

/**
 * Stored email record for test inspection.
 *
 * Contains the original request, provider response, and timestamp
 * for use in test assertions.
 */
export interface IStoredEmail {
  /**
   * Original email send request.
   */
  request: ISendEmailRequest;

  /**
   * Provider response from the send operation.
   */
  response: ISendEmailResponse;

  /**
   * ISO timestamp when the email was "sent".
   */
  timestamp: string;
}

/**
 * Mock email provider for testing.
 *
 * This provider never makes real API calls. It stores all sent emails
 * in memory for test inspection and supports failure simulation.
 *
 * @since 0.0.1
 *
 * @example Basic usage in tests
 * ```typescript
 * import { MockEmailProvider } from '@package/email';
 *
 * const mockProvider = new MockEmailProvider({
 *   type: EmailProviderType.MOCK,
 *   defaultFromEmail: 'test@example.com'
 * });
 *
 * await mockProvider.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Test',
 *   html: '<p>Test</p>'
 * });
 *
 * const sentEmails = mockProvider.getSentEmails();
 * expect(sentEmails).toHaveLength(1);
 * ```
 *
 * @example Failure simulation
 * ```typescript
 * const mockProvider = new MockEmailProvider({
 *   type: EmailProviderType.MOCK,
 *   defaultFromEmail: 'test@example.com',
 *   failureRate: 0.5, // 50% failure rate
 *   simulatedLatencyMs: 100 // 100ms delay
 * });
 * ```
 */
export class MockEmailProvider extends BaseEmailProvider implements IEmailProvider {
  /** Provider name identifier */
  public override readonly name = 'mock';

  /** In-memory storage for sent emails */
  private readonly sentEmails: IStoredEmail[] = [];

  /** Message ID counter for generating unique IDs */
  private messageIdCounter = 0;

  /** Configuration options */
  private readonly config: IMockProviderConfig;

  /** Current batch index for failure simulation */
  private batchIndex = 0;

  constructor(config: IMockProviderConfig) {
    super('mock');

    // Validate failureRate is finite and clamp to [0, 1]
    const failureRate = config.failureRate ?? MOCK_CONFIG_DEFAULTS.failureRate;
    if (!Number.isFinite(failureRate)) {
      throw new EmailConfigurationError('failureRate must be a finite number');
    }
    const validatedFailureRate = Math.max(0, Math.min(1, failureRate));

    // Validate simulatedLatencyMs is non-negative and finite
    const simulatedLatencyMs = config.simulatedLatencyMs ?? MOCK_CONFIG_DEFAULTS.simulatedLatencyMs;
    const validatedLatencyMs = Math.max(0, simulatedLatencyMs);

    if (!Number.isFinite(validatedLatencyMs)) {
      throw new EmailConfigurationError('simulatedLatencyMs must be a finite number');
    }

    this.config = {
      ...config,
      failureRate: validatedFailureRate,
      simulatedLatencyMs: validatedLatencyMs,
      batchFailureIndices: config.batchFailureIndices ?? MOCK_CONFIG_DEFAULTS.batchFailureIndices
    };
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  /**
   * Mock email send implementation.
   *
   * Stores the email request and generates a mock response with a unique
   * message ID. Respects failure rate and latency configuration.
   *
   * @param request - Validated email send request
   * @returns Mock email send response with unique message ID
   * @throws {EmailSendError} When failure simulation is enabled
   * @protected
   */
  protected async doSendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    // Apply simulated latency if configured
    await this.applySimulatedLatency();

    // Check if this send should fail based on failure rate
    this.checkFailureRate();

    // Generate unique message ID
    const messageId = `mock-${Date.now()}-${this.messageIdCounter++}`;

    // Create mock response
    const response: ISendEmailResponse = {
      messageId,
      success: true
    };

    // Store the email for test inspection
    this.sentEmails.push({
      request: deepCloneRequest(request), // Deep clone to prevent external mutation
      response,
      timestamp: new Date().toISOString()
    });

    return response;
  }

  /**
   * Mock batch send implementation.
   *
   * Processes requests sequentially with simulated latency and failure
   * checks applied per-email. The sequential processing ensures predictable
   * ordering for tests while still respecting the latency configuration.
   *
   * @param requests - Validated array of email send requests
   * @returns Array of mock email send responses
   * @throws {EmailSendError} When any batch send fails
   * @protected
   */
  protected async doSendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    // Reset batch index for this batch operation
    this.batchIndex = 0;

    // Process each request individually
    const responses: ISendEmailResponse[] = [];

    for (const request of requests) {
      // Note: Simulated latency is applied within doSendEmail(), not here

      // Check if this specific batch item should fail
      this.checkBatchFailureIndices();

      // Process the email (includes latency application)
      const response = await this.doSendEmail(request);
      responses.push(response);

      // Increment batch index for next iteration
      this.batchIndex++;
    }

    return responses;
  }

  /**
   * Mock health check implementation.
   *
   * Mock provider is always healthy.
   *
   * @returns Always true
   * @protected
   */
  protected async doHealthCheck(): Promise<boolean> {
    return true;
  }

  // ============================================================================
  // FAILURE SIMULATION HELPERS
  // ============================================================================

  /**
   * Apply simulated latency if configured.
   *
   * Uses Promise-based delay to avoid blocking the event loop.
   *
   * @protected
   */
  protected async applySimulatedLatency(): Promise<void> {
    const latency = this.config.simulatedLatencyMs ?? MOCK_CONFIG_DEFAULTS.simulatedLatencyMs;
    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency));
    }
  }

  /**
   * Check if this send should fail based on configured failure rate.
   *
   * Generates a random number and compares it against the failure rate.
   *
   * @throws {EmailSendError} When random check falls below failure rate
   * @protected
   */
  protected checkFailureRate(): void {
    const failureRate = this.config.failureRate ?? MOCK_CONFIG_DEFAULTS.failureRate;
    if (failureRate > 0 && Math.random() < failureRate) {
      throw new EmailSendError('MOCK_FAILURE: Simulated provider failure', this.name);
    }
  }

  /**
   * Check if the current batch index is in the configured failure indices.
   *
   * Used to test partial batch failure scenarios.
   *
   * @throws {EmailSendError} When current batch index is in failure indices
   * @protected
   */
  protected checkBatchFailureIndices(): void {
    const failureIndices =
      this.config.batchFailureIndices ?? MOCK_CONFIG_DEFAULTS.batchFailureIndices;
    if (failureIndices.includes(this.batchIndex)) {
      throw new EmailSendError(
        `MOCK_FAILURE: Simulated failure at batch index ${this.batchIndex}`,
        this.name
      );
    }
  }

  // ============================================================================
  // TEST UTILITIES
  // ============================================================================

  /**
   * Get a copy of all stored emails.
   *
   * Returns a shallow copy of the stored emails array to prevent
   * external mutation of internal state.
   *
   * @returns Copy of stored emails array
   *
   * @example
   * ```typescript
   * const emails = mockProvider.getSentEmails();
   * expect(emails).toHaveLength(1);
   * expect(emails[0].request.to).toBe('user@example.com');
   * ```
   */
  getSentEmails(): IStoredEmail[] {
    return [...this.sentEmails];
  }

  /**
   * Clear all stored emails.
   *
   * Use this method for test isolation between test cases.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   mockProvider.clearSentEmails();
   * });
   * ```
   */
  clearSentEmails(): void {
    this.sentEmails.length = 0;
  }

  /**
   * Find emails sent to a specific recipient.
   *
   * Searches the 'to', 'cc', and 'bcc' fields for matching addresses.
   *
   * @param recipient - Email address to search for
   * @returns Array of stored emails sent to the recipient
   *
   * @example
   * ```typescript
   * const emails = mockProvider.findEmailsByRecipient('user@example.com');
   * expect(emails).toHaveLength(2);
   * ```
   */
  findEmailsByRecipient(recipient: string): IStoredEmail[] {
    return this.sentEmails.filter((stored) => {
      const request = stored.request;
      const to = Array.isArray(request.to) ? request.to : [request.to];
      const cc = request.cc ? (Array.isArray(request.cc) ? request.cc : [request.cc]) : [];
      const bcc = request.bcc ? (Array.isArray(request.bcc) ? request.bcc : [request.bcc]) : [];

      return [...to, ...cc, ...bcc].includes(recipient);
    });
  }

  /**
   * Find an email by its message ID.
   *
   * @param messageId - Message ID to search for
   * @returns Stored email or undefined if not found
   *
   * @example
   * ```typescript
   * const email = mockProvider.findEmailById('mock-123-0');
   * expect(email).toBeDefined();
   * ```
   */
  findEmailById(messageId: string): IStoredEmail | undefined {
    return this.sentEmails.find((stored) => stored.response.messageId === messageId);
  }

  /**
   * Get the count of stored emails.
   *
   * @returns Number of stored emails
   *
   * @example
   * ```typescript
   * expect(mockProvider.getEmailCount()).toBe(3);
   * ```
   */
  getEmailCount(): number {
    return this.sentEmails.length;
  }

  /**
   * Reset the provider to initial state.
   *
   * Clears stored emails, resets the message ID counter, and resets
   * the batch index. Use this for complete test isolation.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   mockProvider.reset();
   * });
   * ```
   */
  reset(): void {
    this.clearSentEmails();
    this.messageIdCounter = 0;
    this.batchIndex = 0;
  }
}

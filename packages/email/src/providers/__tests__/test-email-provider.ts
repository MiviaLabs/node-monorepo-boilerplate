/**
 * Mock Email Provider for Testing
 *
 * A no-op email provider implementation for testing and development.
 * Simulates email sending without actually sending emails.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse,
  IMockProviderConfig
} from '../..';

/**
 * Mock Email Provider
 *
 * A test email provider that simulates sending emails without actually
 * sending them. Useful for testing, development, and CI/CD environments.
 *
 * Implements IEmailProvider interface with no-op operations.
 *
 * @example Creating a mock provider
 * ```typescript
 * const mockProvider = new MockEmailProvider({
 *   type: EmailProviderType.MOCK,
 *   defaultFromEmail: 'test@example.com'
 * });
 *
 * await mockProvider.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Test',
 *   html: '<p>Test email</p>'
 * });
 * ```
 */
export class MockEmailProvider implements IEmailProvider {
  /**
   * Provider name identifier.
   */
  readonly name = 'mock';

  /**
   * Creates a new MockEmailProvider instance.
   *
   * @param config - Mock provider configuration
   */
  constructor(private readonly config: IMockProviderConfig) {}

  /**
   * Send a single email (no-op).
   *
   * Simulates sending an email by returning a successful response
   * with a generated message ID. No actual email is sent.
   *
   * @param _request - Email send request
   * @returns Mock email send response with generated message ID
   */
  async sendEmail(_request: ISendEmailRequest): Promise<ISendEmailResponse> {
    // P0: Do NOT log email addresses or message content
    // Log only non-PII information
    // Note: Debug logging disabled to avoid no-console warning
    // In actual use, users would enable a proper logger

    return {
      messageId: `mock-${randomUUID()}`,
      success: true,
      providerResponse: {
        provider: 'mock',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Send multiple emails in batch (no-op).
   *
   * Simulates batch email sending by returning successful responses
   * with generated message IDs. No actual emails are sent.
   *
   * @param requests - Array of email send requests
   * @returns Array of mock email send responses
   */
  async sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    // Note: Debug logging disabled to avoid no-console warning
    // In actual use, users would enable a proper logger

    return requests.map(() => ({
      messageId: `mock-${randomUUID()}`,
      success: true,
      providerResponse: {
        provider: 'mock',
        timestamp: new Date().toISOString()
      }
    }));
  }

  /**
   * Health check for mock provider.
   *
   * Mock provider is always healthy.
   *
   * @returns Always true
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Base Email Provider Tests
 *
 * Tests for BaseEmailProvider OpenTelemetry integration, validation, and sanitization.
 * Following TDD methodology: RED → GREEN → REFACTOR
 */

import {
  MAX_SUBJECT_LENGTH,
  MAX_RECIPIENTS_PER_EMAIL,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_BATCH_SIZE
} from '../../constants';
import {
  EmailConfigurationError,
  EmailSendError,
  EmailProviderHealthCheckError
} from '../../errors';
import { BaseEmailProvider } from '../base-email-provider';

import type { ISendEmailRequest, ISendEmailResponse } from '../email-provider.interface';
import type { Attributes } from '@opentelemetry/api';

/**
 * Test Email Provider implementation for testing BaseEmailProvider.
 */
class TestEmailProvider extends BaseEmailProvider {
  public callLog: string[] = [];

  // Expose protected methods for testing
  public testSanitizeEmailAddress(email: string) {
    return this.sanitizeEmailAddress(email);
  }

  public testSanitizeEmailRequest(request: ISendEmailRequest) {
    return this.sanitizeEmailRequest(request);
  }

  public testValidateEmailRequest(request: ISendEmailRequest) {
    return this.validateEmailRequest(request);
  }

  public testValidateEmailAddress(email: string) {
    return this.validateEmailAddress(email);
  }

  public testValidateBatchRequest(requests: ISendEmailRequest[]) {
    return this.validateBatchRequest(requests);
  }

  public testBuildAttributes(error?: string, additional?: Attributes) {
    return this.buildAttributes(error, additional);
  }

  protected async doSendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse> {
    this.callLog.push(`doSendEmail:${request.subject}`);
    return {
      messageId: `msg-${Date.now()}`,
      success: true
    };
  }

  protected async doSendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    this.callLog.push(`doSendBatch:${requests.length}`);
    return requests.map((_, i) => ({
      messageId: `batch-msg-${i}`,
      success: true
    }));
  }

  protected async doHealthCheck(): Promise<boolean> {
    this.callLog.push('doHealthCheck');
    return true;
  }
}

/**
 * Failing Email Provider for error testing.
 */
class FailingEmailProvider extends BaseEmailProvider {
  protected async doSendEmail(): Promise<ISendEmailResponse> {
    throw new Error('Simulated send failure');
  }

  protected async doSendBatch(): Promise<ISendEmailResponse[]> {
    throw new Error('Simulated batch failure');
  }

  protected async doHealthCheck(): Promise<boolean> {
    throw new Error('Simulated health check failure');
  }
}

describe('BaseEmailProvider', () => {
  let provider: TestEmailProvider;

  beforeEach(() => {
    provider = new TestEmailProvider('test-provider');
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================
  describe('initialization', () => {
    it('should initialize with provider name', () => {
      expect(provider.name).toBe('test-provider');
    });

    it('should have all required methods', () => {
      expect(typeof provider.sendEmail).toBe('function');
      expect(typeof provider.sendBatch).toBe('function');
      expect(typeof provider.healthCheck).toBe('function');
    });
  });

  // ============================================================================
  // SANITIZATION TESTS (P0 CRITICAL)
  // ============================================================================
  describe('sanitization (P0)', () => {
    describe('sanitizeEmailAddress', () => {
      it('should mask email addresses (P0: no PII in logs)', () => {
        const result = provider.testSanitizeEmailAddress('user@example.com');
        expect(result.masked).toBe('u***@e***');
      });

      it('should handle empty email', () => {
        const result = provider.testSanitizeEmailAddress('');
        expect(result.masked).toBe('[empty]');
      });

      it('should handle invalid email formats gracefully', () => {
        const result = provider.testSanitizeEmailAddress('not-an-email');
        expect(result.masked).toBe('n***');
      });

      it('should handle short local part', () => {
        const result = provider.testSanitizeEmailAddress('a@example.com');
        expect(result.masked).toBe('a***@e***');
      });

      it('should handle short domain', () => {
        const result = provider.testSanitizeEmailAddress('user@a.com');
        expect(result.masked).toBe('u***@a***');
      });
    });

    describe('sanitizeEmailRequest', () => {
      it('should show recipient counts instead of addresses', () => {
        const request: ISendEmailRequest = {
          to: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
          cc: 'cc@example.com',
          bcc: ['bcc1@example.com', 'bcc2@example.com'],
          subject: 'Test',
          text: 'Test content'
        };

        const sanitized = provider.testSanitizeEmailRequest(request);

        expect(sanitized.toCount).toBe(3);
        expect(sanitized.ccCount).toBe(1);
        expect(sanitized.bccCount).toBe(2);
        expect(sanitized.hasText).toBe(true);
        expect(sanitized.hasHtml).toBe(false);
        expect(sanitized.attachmentCount).toBe(0);
      });

      it('should handle single recipient as string', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>'
        };

        const sanitized = provider.testSanitizeEmailRequest(request);

        expect(sanitized.toCount).toBe(1);
        expect(sanitized.ccCount).toBeUndefined();
        expect(sanitized.hasText).toBe(false);
        expect(sanitized.hasHtml).toBe(true);
      });

      it('should include attachment count', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
          attachments: [
            { filename: 'file1.pdf', content: Buffer.from('test') },
            { filename: 'file2.pdf', content: Buffer.from('test') }
          ]
        };

        const sanitized = provider.testSanitizeEmailRequest(request);

        expect(sanitized.attachmentCount).toBe(2);
      });
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================
  describe('validation', () => {
    describe('validateEmailAddress (P0)', () => {
      it('should accept valid email format', () => {
        expect(() => {
          provider.testValidateEmailAddress('user@example.com');
        }).not.toThrow();
      });

      it('should accept email with subdomain', () => {
        expect(() => {
          provider.testValidateEmailAddress('user@mail.example.com');
        }).not.toThrow();
      });

      it('should reject email without @', () => {
        expect(() => provider.testValidateEmailAddress('not-an-email')).toThrow(
          EmailConfigurationError
        );
        expect(() => provider.testValidateEmailAddress('not-an-email')).toThrow(
          /Invalid email format/
        );
      });

      it('should reject email without domain', () => {
        expect(() => provider.testValidateEmailAddress('test@')).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailAddress('test@')).toThrow(/Invalid email format/);
      });

      it('should reject email without local part', () => {
        expect(() => provider.testValidateEmailAddress('@domain.com')).toThrow(
          EmailConfigurationError
        );
        expect(() => provider.testValidateEmailAddress('@domain.com')).toThrow(
          /Invalid email format/
        );
      });

      it('should reject email without TLD', () => {
        expect(() => provider.testValidateEmailAddress('test@domain')).toThrow(
          EmailConfigurationError
        );
        expect(() => provider.testValidateEmailAddress('test@domain')).toThrow(
          /Invalid email format/
        );
      });

      it('should reject email with carriage return (header injection)', () => {
        expect(() =>
          provider.testValidateEmailAddress('test@domain.com\r\nBCC: evil@example.com')
        ).toThrow(EmailConfigurationError);
        expect(() =>
          provider.testValidateEmailAddress('test@domain.com\r\nBCC: evil@example.com')
        ).toThrow(/control characters/);
      });

      it('should reject email with newline (header injection)', () => {
        expect(() =>
          provider.testValidateEmailAddress('test@domain.com\nBCC: evil@example.com')
        ).toThrow(EmailConfigurationError);
        expect(() =>
          provider.testValidateEmailAddress('test@domain.com\nBCC: evil@example.com')
        ).toThrow(/control characters/);
      });

      it('should reject email with null byte', () => {
        expect(() => provider.testValidateEmailAddress('test@domain.com\x00')).toThrow(
          EmailConfigurationError
        );
        expect(() => provider.testValidateEmailAddress('test@domain.com\x00')).toThrow(
          /control characters/
        );
      });

      it('should reject email with tab character', () => {
        expect(() => provider.testValidateEmailAddress('test@domain.com\t')).toThrow(
          EmailConfigurationError
        );
        expect(() => provider.testValidateEmailAddress('test@domain.com\t')).toThrow(
          /control characters/
        );
      });
    });

    describe('validateEmailRequest', () => {
      it('should accept valid email request with text', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test Email',
          text: 'Test content'
        };

        expect(() => {
          provider.testValidateEmailRequest(request);
        }).not.toThrow();
      });

      it('should accept valid email request with html', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test Email',
          html: '<p>Test content</p>'
        };

        expect(() => {
          provider.testValidateEmailRequest(request);
        }).not.toThrow();
      });

      it('should reject request without recipient', () => {
        const request: ISendEmailRequest = {
          to: '',
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
      });

      it('should reject request with empty array recipient', () => {
        const request: ISendEmailRequest = {
          to: [],
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
      });

      it('should reject request without subject', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: '',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
      });

      it('should reject request with whitespace-only subject', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: '   ',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
      });

      it('should reject request with invalid email format', () => {
        const request: ISendEmailRequest = {
          to: 'not-an-email',
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/Invalid email format/);
      });

      it('should reject request with email containing control characters', () => {
        const request: ISendEmailRequest = {
          to: 'test@domain.com\r\nBCC: evil@example.com',
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/control characters/);
      });

      it('should validate all recipients in to array', () => {
        const request: ISendEmailRequest = {
          to: ['valid@example.com', 'not-an-email'],
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/Invalid email format/);
      });

      it('should validate cc recipients', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          cc: 'not-an-email',
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/Invalid email format/);
      });

      it('should validate bcc recipients', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          bcc: ['bcc1@example.com', 'not-an-email'],
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/Invalid email format/);
      });

      it('should reject request without text or html', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
      });

      it('should reject subject exceeding MAX_SUBJECT_LENGTH', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'x'.repeat(MAX_SUBJECT_LENGTH + 1),
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/exceeds maximum length/);
      });

      it('should reject too many recipients', () => {
        const request: ISendEmailRequest = {
          to: Array(MAX_RECIPIENTS_PER_EMAIL + 1).fill('user@example.com'),
          subject: 'Test',
          text: 'Test'
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/exceeds maximum/);
      });

      it('should reject attachment exceeding MAX_ATTACHMENT_SIZE_BYTES', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
          attachments: [
            {
              filename: 'large.pdf',
              content: Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES + 1),
              contentType: 'application/pdf'
            }
          ]
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/exceeds maximum/);
      });

      it('should reject attachment without filename', () => {
        const request: ISendEmailRequest = {
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
          attachments: [
            {
              filename: '',
              content: Buffer.from('test'),
              contentType: 'application/pdf'
            }
          ]
        };

        expect(() => provider.testValidateEmailRequest(request)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateEmailRequest(request)).toThrow(/must have a filename/);
      });
    });

    describe('validateBatchRequest', () => {
      it('should reject empty batch', () => {
        expect(() => provider.testValidateBatchRequest([])).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateBatchRequest([])).toThrow(/at least one email/);
      });

      it('should reject batch exceeding MAX_BATCH_SIZE', () => {
        const requests = Array(MAX_BATCH_SIZE + 1).fill({
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test'
        });

        expect(() => provider.testValidateBatchRequest(requests)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateBatchRequest(requests)).toThrow(/exceeds maximum/);
      });

      it('should validate each request in batch', () => {
        const requests = [
          { to: 'user1@example.com', subject: 'Test', text: 'Test' },
          { to: '', subject: 'Test', text: 'Test' } // Invalid
        ];

        expect(() => provider.testValidateBatchRequest(requests)).toThrow(EmailConfigurationError);
        expect(() => provider.testValidateBatchRequest(requests)).toThrow(/index 1/);
      });
    });
  });

  // ============================================================================
  // METRICS TESTS
  // ============================================================================
  describe('metrics', () => {
    describe('buildAttributes', () => {
      it('should include provider name', () => {
        const attrs = provider.testBuildAttributes();
        expect(attrs['provider']).toBe('test-provider');
      });

      it('should merge additional attributes', () => {
        const attrs = provider.testBuildAttributes(undefined, { custom: 'value' });
        expect(attrs['provider']).toBe('test-provider');
        expect(attrs['custom']).toBe('value');
      });

      it('should include error when provided', () => {
        const attrs = provider.testBuildAttributes('Test error');
        expect(attrs['error']).toBe('Test error');
      });

      it('should not include error when not provided', () => {
        const attrs = provider.testBuildAttributes();
        expect(attrs['error']).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // TEMPLATE METHOD PATTERN TESTS
  // ============================================================================
  describe('template method pattern', () => {
    it('should call doSendEmail after validation', async () => {
      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test content'
      };

      const response = await provider.sendEmail(request);

      expect(response.success).toBe(true);
      expect(response.messageId).toBeDefined();
      expect(provider.callLog.length).toBe(1);
      expect(provider.callLog[0]).toMatch(/^doSendEmail:/);
    });

    it('should call doSendBatch after validation', async () => {
      const requests: ISendEmailRequest[] = [
        { to: 'user1@example.com', subject: 'Test 1', text: 'Content 1' },
        { to: 'user2@example.com', subject: 'Test 2', text: 'Content 2' }
      ];

      const responses = await provider.sendBatch(requests);

      expect(responses.length).toBe(2);
      expect(provider.callLog.length).toBe(1);
      expect(provider.callLog[0]).toBe('doSendBatch:2');
    });

    it('should call doHealthCheck', async () => {
      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(provider.callLog.length).toBe(1);
      expect(provider.callLog[0]).toBe('doHealthCheck');
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================
  describe('error handling', () => {
    it('should throw EmailConfigurationError for validation failures', async () => {
      const request: ISendEmailRequest = {
        to: '',
        subject: 'Test',
        text: 'Test'
      };

      await expect(provider.sendEmail(request)).rejects.toThrow(EmailConfigurationError);
    });

    it('should throw EmailSendError for send failures', async () => {
      const failingProvider = new FailingEmailProvider('failing-provider');
      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test'
      };

      await expect(failingProvider.sendEmail(request)).rejects.toThrow(EmailSendError);
    });

    it('should throw EmailSendError for batch failures', async () => {
      const failingProvider = new FailingEmailProvider('failing-provider');
      const requests: ISendEmailRequest[] = [
        { to: 'user@example.com', subject: 'Test', text: 'Test' }
      ];

      await expect(failingProvider.sendBatch(requests)).rejects.toThrow(EmailSendError);
    });

    it('should throw EmailProviderHealthCheckError for health check failures', async () => {
      const failingProvider = new FailingEmailProvider('failing-provider');

      await expect(failingProvider.healthCheck()).rejects.toThrow(EmailProviderHealthCheckError);
    });

    it('should include provider name in EmailSendError', async () => {
      const failingProvider = new FailingEmailProvider('failing-provider');
      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test'
      };

      try {
        await failingProvider.sendEmail(request);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(EmailSendError);
        expect((error as EmailSendError).provider).toBe('failing-provider');
      }
    });
  });

  // ============================================================================
  // SPAN TRACING TESTS (P0)
  // ============================================================================
  describe('span tracing (P0)', () => {
    it('should set sanitized attributes on span for sendEmail (no PII)', async () => {
      const setAttributesCalls: any[] = [];
      const mockSpan = {
        setAttributes: (attrs: any) => setAttributesCalls.push(attrs),
        setStatus: () => {},
        end: () => {},
        recordException: () => {}
      };

      // Mock the withSpan method to capture span operations
      const originalWithSpan = provider['withSpan'].bind(provider);
      provider['withSpan'] = async (_name: string, fn: any) => {
        return fn(mockSpan);
      };

      const request: ISendEmailRequest = {
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Test Subject',
        text: 'Test Content'
      };

      await provider.sendEmail(request);

      // Verify sanitized attributes (P0: no PII)
      expect(setAttributesCalls.length).toBeGreaterThan(0);
      const attrs = setAttributesCalls[0];

      // Should include counts and flags
      expect(attrs['email.to_count']).toBe(2);
      expect(attrs['email.has_text']).toBe(true);
      expect(attrs['email.has_html']).toBe(false);
      expect(attrs['email.attachment_count']).toBe(0);

      // P0: Should NOT include PII
      expect(attrs['email.to']).toBeUndefined();
      expect(attrs.to).toBeUndefined();
      expect(attrs.subject).toBeUndefined();
      expect(attrs.text).toBeUndefined();

      // Restore original
      provider['withSpan'] = originalWithSpan;
    });

    it('should set batch_size attribute on span for sendBatch', async () => {
      const setAttributesCalls: any[] = [];
      const mockSpan = {
        setAttributes: (attrs: any) => setAttributesCalls.push(attrs),
        setStatus: () => {},
        end: () => {},
        recordException: () => {}
      };

      // Mock the withSpan method
      const originalWithSpan = provider['withSpan'].bind(provider);
      provider['withSpan'] = async (_name: string, fn: any) => {
        return fn(mockSpan);
      };

      const requests: ISendEmailRequest[] = [
        { to: 'user1@example.com', subject: 'Test 1', text: 'Content 1' },
        { to: 'user2@example.com', subject: 'Test 2', text: 'Content 2' },
        { to: 'user3@example.com', subject: 'Test 3', text: 'Content 3' }
      ];

      await provider.sendBatch(requests);

      // Verify batch_size attribute
      expect(setAttributesCalls.length).toBeGreaterThan(0);
      const attrs = setAttributesCalls[0];
      expect(attrs['email.batch_size']).toBe(3);

      // P0: Should NOT include PII
      expect(attrs.to).toBeUndefined();
      expect(attrs.subjects).toBeUndefined();

      // Restore original
      provider['withSpan'] = originalWithSpan;
    });

    it('should record exception in span on error', async () => {
      const recordExceptionCalls: any[] = [];
      const setStatusCalls: any[] = [];
      const mockSpan = {
        setAttributes: () => {},
        setStatus: (status: any) => setStatusCalls.push(status),
        end: () => {},
        recordException: (error: any) => recordExceptionCalls.push(error)
      } as any;

      const failingProvider = new FailingEmailProvider('failing');

      // Mock the withSpan method
      const originalWithSpan = failingProvider['withSpan'].bind(failingProvider);
      failingProvider['withSpan'] = async (_name: string, fn: any) => {
        const span = mockSpan;
        try {
          return await fn(span);
        } catch (error) {
          failingProvider['recordSpanError'](span, error);
          throw error;
        }
      };

      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test'
      };

      try {
        await failingProvider.sendEmail(request);
        // Should not reach here
        expect(true).toBe(false);
      } catch (_e) {
        // Expected
      }

      // Verify exception recorded
      expect(recordExceptionCalls.length).toBeGreaterThan(0);
      expect(setStatusCalls.length).toBeGreaterThan(0);

      const status = setStatusCalls[0];
      expect(status.message).toBeDefined();

      // Restore original
      failingProvider['withSpan'] = originalWithSpan;
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================
  describe('integration', () => {
    it('should handle full sendEmail flow', async () => {
      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content',
        attachments: [
          {
            filename: 'test.txt',
            content: Buffer.from('test'),
            contentType: 'text/plain'
          }
        ]
      };

      const response = await provider.sendEmail(request);

      expect(response.success).toBe(true);
      expect(response.messageId).toBeDefined();
      expect(provider.callLog.length).toBe(1);
    });

    it('should handle full sendBatch flow', async () => {
      const requests: ISendEmailRequest[] = [
        { to: 'user1@example.com', subject: 'Test 1', text: 'Content 1' },
        { to: 'user2@example.com', subject: 'Test 2', html: '<p>Content 2</p>' }
      ];

      const responses = await provider.sendBatch(requests);

      expect(responses.length).toBe(2);
      expect(responses[0]?.success).toBe(true);
      expect(responses[1]?.success).toBe(true);
      expect(provider.callLog.length).toBe(1);
    });

    it('should handle healthCheck flow', async () => {
      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(provider.callLog.length).toBe(1);
    });

    it('should validate before attempting send', async () => {
      const invalidRequest: ISendEmailRequest = {
        to: '',
        subject: 'Test',
        text: 'Test'
      };

      await expect(provider.sendEmail(invalidRequest)).rejects.toThrow(EmailConfigurationError);

      // Should not call doSendEmail if validation fails
      expect(provider.callLog.length).toBe(0);
    });
  });
});

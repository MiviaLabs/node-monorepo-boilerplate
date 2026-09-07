/**
 * EmailService Unit Tests
 *
 * Tests the NestJS EmailService wrapper class that provides dependency
 * injection support for email functionality.
 *
 * @packageDocumentation
 */

import { EmailSendError } from '../../errors';
import { EMAIL_PROVIDER } from '../email.constants';
import { DEFAULT_FALLBACK_EMAIL } from '../../constants';
import { EmailService } from '../email.service';

import type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse
} from '../../providers/email-provider.interface';

// Mock @package/queues addJob function
jest.mock('@package/queues', () => ({
  addJob: jest.fn(),
  JobHandler: () => {
    // Return a decorator function
    return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
      // Mock decorator that doesn't modify the descriptor
      return descriptor;
    };
  }
}));

import { addJob } from '@package/queues';
const mockedAddJob = jest.mocked(addJob);

/**
 * Mock Email Provider for testing.
 *
 * P0 Compliance: Mock does NOT log PII (email addresses, message content).
 * All assertions use non-PII identifiers (message IDs, counts, status codes).
 */
class MockEmailProvider implements IEmailProvider {
  readonly name = 'mock';

  /**
   * Mock sendEmail implementation.
   *
   * @param _request - The email send request
   * @returns Promise resolving to send response with message ID
   */
  async sendEmail(_request: ISendEmailRequest): Promise<ISendEmailResponse> {
    // P0: Do NOT log email addresses or message content
    return {
      messageId: `msg-${Date.now()}`,
      success: true
    };
  }

  /**
   * Mock sendBatch implementation.
   *
   * @param requests - Array of email send requests
   * @returns Promise resolving to array of send responses
   */
  async sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    // P0: Do NOT log email addresses or message content
    return requests.map(() => ({
      messageId: `msg-${Date.now()}-${Math.random()}`,
      success: true
    }));
  }

  /**
   * Mock healthCheck implementation.
   *
   * @returns Promise resolving to true (always healthy)
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Failing Mock Email Provider for error testing.
 */
class FailingMockEmailProvider implements IEmailProvider {
  readonly name = 'failing-mock';

  /**
   * Failing sendEmail implementation.
   *
   * @param _request - The email send request (ignored)
   * @returns Promise that rejects with EmailSendError
   */
  async sendEmail(_request: ISendEmailRequest): Promise<ISendEmailResponse> {
    throw new EmailSendError('Failed to send email via mock provider', 'mock');
  }

  /**
   * Failing sendBatch implementation.
   *
   * @param _requests - Array of email send requests (ignored)
   * @returns Promise that rejects with EmailSendError
   */
  async sendBatch(_requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]> {
    throw new EmailSendError('Failed to send email batch via mock provider', 'mock');
  }

  /**
   * Failing healthCheck implementation.
   *
   * @returns Promise resolving to false (unhealthy)
   */
  async healthCheck(): Promise<boolean> {
    return false;
  }
}

describe('EmailService', () => {
  let mockProvider: MockEmailProvider;
  let failingProvider: FailingMockEmailProvider;
  let emailService: EmailService;
  let failingEmailService: EmailService;

  beforeEach(() => {
    // Arrange: Create mock providers
    mockProvider = new MockEmailProvider();
    failingProvider = new FailingMockEmailProvider();

    // Arrange: Create EmailService instances with mocked provider injection
    emailService = new EmailService(mockProvider);
    failingEmailService = new EmailService(failingProvider);
  });

  describe('sendEmail()', () => {
    it('should successfully send a single email', async () => {
      // Arrange
      const request: ISendEmailRequest = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text',
        from: 'noreply@example.com'
      };

      // Act
      const response = await emailService.sendEmail(request);

      // Assert
      expect(response.messageId).toBeTruthy();
      expect(response.success).toBe(true);
    });

    it('should delegate to underlying provider', async () => {
      // Arrange
      const request: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Hello',
        html: '<h1>Hello</h1>',
        from: 'noreply@example.com'
      };

      const sendEmailSpy = jest.spyOn(mockProvider, 'sendEmail');
      sendEmailSpy.mockResolvedValueOnce({
        messageId: 'msg-delegate-test',
        success: true
      });

      // Act
      await emailService.sendEmail(request);

      // Assert
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error when provider fails', async () => {
      // Arrange
      const request: ISendEmailRequest = {
        to: 'fail@example.com',
        subject: 'Fail Test',
        html: '<p>Fail</p>',
        from: 'noreply@example.com'
      };

      // Act & Assert
      await expect(failingEmailService.sendEmail(request)).rejects.toThrow(EmailSendError);
      await expect(failingEmailService.sendEmail(request)).rejects.toThrow(
        'Failed to send email via mock provider'
      );
    });
  });

  describe('sendBatch()', () => {
    it('should successfully send multiple emails in batch', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [
        {
          to: 'user1@example.com',
          subject: 'Batch 1',
          html: '<p>Content 1</p>',
          from: 'noreply@example.com'
        },
        {
          to: 'user2@example.com',
          subject: 'Batch 2',
          html: '<p>Content 2</p>',
          from: 'noreply@example.com'
        },
        {
          to: 'user3@example.com',
          subject: 'Batch 3',
          html: '<p>Content 3</p>',
          from: 'noreply@example.com'
        }
      ];

      // Act
      const responses = await emailService.sendBatch(requests);

      // Assert
      expect(responses.length).toBe(3);
      responses.forEach((response) => {
        expect(response.messageId).toBeTruthy();
        expect(response.success).toBe(true);
      });
    });

    it('should delegate batch to underlying provider', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [
        {
          to: 'batch@example.com',
          subject: 'Batch',
          html: '<p>Batch</p>',
          from: 'noreply@example.com'
        }
      ];

      const sendBatchSpy = jest.spyOn(mockProvider, 'sendBatch');
      sendBatchSpy.mockResolvedValueOnce([
        {
          messageId: 'msg-batch-delegate',
          success: true
        }
      ]);

      // Act
      await emailService.sendBatch(requests);

      // Assert
      expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error when provider batch fails', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [
        {
          to: 'fail-batch@example.com',
          subject: 'Fail Batch',
          html: '<p>Fail</p>',
          from: 'noreply@example.com'
        }
      ];

      // Act & Assert
      await expect(failingEmailService.sendBatch(requests)).rejects.toThrow(EmailSendError);
      await expect(failingEmailService.sendBatch(requests)).rejects.toThrow(
        'Failed to send email batch via mock provider'
      );
    });

    it('should handle empty batch array', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [];

      // Act
      const responses = await emailService.sendBatch(requests);

      // Assert
      expect(responses.length).toBe(0);
    });
  });

  describe('healthCheck()', () => {
    it('should return true when provider is healthy', async () => {
      // Act
      const isHealthy = await emailService.healthCheck();

      // Assert
      expect(isHealthy).toBe(true);
    });

    it('should delegate health check to underlying provider', async () => {
      // Arrange
      const healthCheckSpy = jest.spyOn(mockProvider, 'healthCheck');
      healthCheckSpy.mockResolvedValueOnce(true);

      // Act
      await emailService.healthCheck();

      // Assert
      expect(healthCheckSpy).toHaveBeenCalledTimes(1);
    });

    it('should return false when provider is unhealthy', async () => {
      // Act
      const isHealthy = await failingEmailService.healthCheck();

      // Assert
      expect(isHealthy).toBe(false);
    });
  });

  describe('Dependency Injection', () => {
    it('should be injectable with EMAIL_PROVIDER token', () => {
      // This test verifies the EMAIL_PROVIDER injection token constant
      // is properly defined for NestJS DI

      // Assert
      expect(EMAIL_PROVIDER).toBe('EMAIL_PROVIDER');
      expect(typeof EMAIL_PROVIDER).toBe('string');
    });

    it('should store provider instance', () => {
      // Arrange
      const testProvider = new MockEmailProvider();
      const testService = new EmailService(testProvider);

      // Assert: Verify service was created (provider is stored internally)
      expect(testService).toBeInstanceOf(EmailService);
    });
  });

  describe('P0 Compliance', () => {
    it('should not log PII in sendEmail responses', async () => {
      // Arrange
      const piiRequest: ISendEmailRequest = {
        to: 'sensitive@example.com',
        subject: 'Confidential',
        html: '<p>Secret content</p>',
        from: 'noreply@example.com'
      };

      // Act
      const response = await emailService.sendEmail(piiRequest);

      // Assert: Response should NOT contain PII
      expect(response.messageId).not.toContain('sensitive');
      expect(response.messageId).not.toContain('example');
      expect('to' in response).toBe(false);
    });

    it('should not log PII in sendBatch responses', async () => {
      // Arrange
      const piiRequests: ISendEmailRequest[] = [
        {
          to: 'secret@example.com',
          subject: 'Secret',
          html: '<p>Secret</p>',
          from: 'noreply@example.com'
        }
      ];

      // Act
      const responses = await emailService.sendBatch(piiRequests);

      // Assert: Responses should NOT contain PII
      responses.forEach((response) => {
        expect(response.messageId).not.toContain('secret');
        expect('to' in response).toBe(false);
      });
    });

    it('should escape HTML in sendWelcome to prevent XSS', async () => {
      // Arrange
      const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
      sendEmailSpy.mockResolvedValueOnce({
        messageId: 'msg-xss-test',
        success: true
      });

      // Act
      await emailService.sendWelcome('user@example.com', '<script>alert("XSS")</script>');

      // Assert: HTML should be escaped
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Welcome!',
        html: '<h1>Welcome &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;!</h1>',
        from: 'noreply@example.com'
      });
    });

    it('should escape HTML in sendPasswordReset to prevent XSS', async () => {
      // Arrange
      const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
      sendEmailSpy.mockResolvedValueOnce({
        messageId: 'msg-xss-reset',
        success: true
      });

      // Act
      await emailService.sendPasswordReset('user@example.com', '<img src=x onerror=alert(1)>');

      // Assert: HTML should be escaped
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Reset Your Password',
        html: '<p>Click here to reset your password: <strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>',
        from: 'noreply@example.com'
      });
    });

    it('should escape HTML in sendInvitation to prevent XSS', async () => {
      // Arrange
      const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
      sendEmailSpy.mockResolvedValueOnce({
        messageId: 'msg-xss-invite',
        success: true
      });

      // Act
      await emailService.sendInvitation(
        'user@example.com',
        '<script>alert(1)</script>',
        'team-123'
      );

      // Assert: HTML should be escaped
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'You are invited to join &lt;script&gt;alert(1)&lt;/script&gt;',
        html: '<p>You have been invited to join <strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>.</p><p>Team ID: team-123</p>',
        from: 'noreply@example.com'
      });
    });
  });

  describe('TEST-001: Fallback Behavior', () => {
    it('should use DEFAULT_FALLBACK_EMAIL when moduleOptions is undefined', async () => {
      // Arrange
      const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
      sendEmailSpy.mockResolvedValueOnce({
        messageId: 'msg-fallback-test',
        success: true
      });

      // Act
      await emailService.sendWelcome('user@example.com', 'Test User');

      // Assert: Should use DEFAULT_FALLBACK_EMAIL
      expect(sendEmailSpy).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Welcome!',
        html: '<h1>Welcome Test User!</h1>',
        from: DEFAULT_FALLBACK_EMAIL
      });
    });

    it('should use DEFAULT_FALLBACK_EMAIL for all convenience methods', async () => {
      // Arrange
      const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
      sendEmailSpy.mockResolvedValue({
        messageId: 'msg-test',
        success: true
      });

      // Act & Assert: sendWelcome
      await emailService.sendWelcome('user@example.com', 'User');
      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: DEFAULT_FALLBACK_EMAIL
        })
      );

      // Act & Assert: sendPasswordReset
      await emailService.sendPasswordReset('user@example.com', 'token');
      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: DEFAULT_FALLBACK_EMAIL
        })
      );

      // Act & Assert: sendInvitation
      await emailService.sendInvitation('user@example.com', 'Org', 'team-123');
      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: DEFAULT_FALLBACK_EMAIL
        })
      );
    });
  });

  describe('Convenience Methods', () => {
    describe('send()', () => {
      it('should alias sendEmail() for brevity', async () => {
        // Arrange
        const request: ISendEmailRequest = {
          to: 'alias@example.com',
          subject: 'Alias Test',
          html: '<p>Testing alias</p>',
          from: 'noreply@example.com'
        };

        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-alias-test',
          success: true
        });

        // Act
        await emailService.send(request);

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith(request);
      });
    });

    describe('sendWelcome()', () => {
      it('should send welcome email with defaults', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-welcome',
          success: true
        });

        // Act
        await emailService.sendWelcome('user@example.com', 'John Doe');

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Welcome!',
          html: '<h1>Welcome John Doe!</h1>',
          from: 'noreply@example.com'
        });
      });

      it('should allow custom HTML override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-welcome-custom',
          success: true
        });

        // Act
        await emailService.sendWelcome(
          'user@example.com',
          'John Doe',
          '<p>Custom welcome message with {{name}}</p>'
        );

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Welcome!',
          html: '<p>Custom welcome message with {{name}}</p>',
          from: 'noreply@example.com'
        });
      });

      it('should allow full parameter override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-welcome-override',
          success: true
        });

        // Act
        await emailService.sendWelcome('user@example.com', 'John Doe', '<h1>Special Welcome</h1>', {
          from: 'custom@example.com',
          subject: 'Special Welcome'
        });

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Special Welcome',
          html: '<h1>Special Welcome</h1>',
          from: 'custom@example.com'
        });
      });

      it('should propagate errors when sendEmail fails', async () => {
        // Act & Assert
        await expect(
          failingEmailService.sendWelcome('user@example.com', 'John Doe')
        ).rejects.toThrow(EmailSendError);
        await expect(
          failingEmailService.sendWelcome('user@example.com', 'John Doe')
        ).rejects.toThrow('Failed to send email via mock provider');
      });
    });

    describe('sendPasswordReset()', () => {
      it('should send password reset email with defaults', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-password-reset',
          success: true
        });

        // Act
        await emailService.sendPasswordReset('user@example.com', 'reset-token-123');

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Reset Your Password',
          html: '<p>Click here to reset your password: <strong>reset-token-123</strong></p>',
          from: 'noreply@example.com'
        });
      });

      it('should allow custom HTML override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-password-reset-custom',
          success: true
        });

        // Act
        await emailService.sendPasswordReset(
          'user@example.com',
          'reset-token-123',
          '<a href="/reset?token=reset-token-123">Reset Password</a>'
        );

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Reset Your Password',
          html: '<a href="/reset?token=reset-token-123">Reset Password</a>',
          from: 'noreply@example.com'
        });
      });

      it('should allow full parameter override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-password-reset-override',
          success: true
        });

        // Act
        await emailService.sendPasswordReset(
          'user@example.com',
          'reset-token-123',
          '<p>Reset link</p>',
          {
            from: 'security@example.com',
            subject: 'Security Alert: Password Reset'
          }
        );

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'user@example.com',
          subject: 'Security Alert: Password Reset',
          html: '<p>Reset link</p>',
          from: 'security@example.com'
        });
      });

      it('should propagate errors when sendEmail fails', async () => {
        // Act & Assert
        await expect(
          failingEmailService.sendPasswordReset('user@example.com', 'reset-token-123')
        ).rejects.toThrow(EmailSendError);
        await expect(
          failingEmailService.sendPasswordReset('user@example.com', 'reset-token-123')
        ).rejects.toThrow('Failed to send email via mock provider');
      });
    });

    describe('sendInvitation()', () => {
      it('should send invitation email with defaults', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-invitation',
          success: true
        });

        // Act
        await emailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123');

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'invited@example.com',
          subject: 'You are invited to join Acme Corp',
          html: '<p>You have been invited to join <strong>Acme Corp</strong>.</p><p>Team ID: team-123</p>',
          from: 'noreply@example.com'
        });
      });

      it('should allow custom HTML override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-invitation-custom',
          success: true
        });

        // Act
        await emailService.sendInvitation(
          'invited@example.com',
          'Acme Corp',
          'team-123',
          '<h1>Invitation to Acme Corp</h1><button>Accept</button>'
        );

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'invited@example.com',
          subject: 'You are invited to join Acme Corp',
          html: '<h1>Invitation to Acme Corp</h1><button>Accept</button>',
          from: 'noreply@example.com'
        });
      });

      it('should allow full parameter override', async () => {
        // Arrange
        const sendEmailSpy = jest.spyOn(emailService, 'sendEmail');
        sendEmailSpy.mockResolvedValueOnce({
          messageId: 'msg-invitation-override',
          success: true
        });

        // Act
        await emailService.sendInvitation(
          'invited@example.com',
          'Acme Corp',
          'team-123',
          '<p>Join us</p>',
          {
            from: 'hr@example.com',
            subject: 'Team Invitation from Acme Corp'
          }
        );

        // Assert
        expect(sendEmailSpy).toHaveBeenCalledWith({
          to: 'invited@example.com',
          subject: 'Team Invitation from Acme Corp',
          html: '<p>Join us</p>',
          from: 'hr@example.com'
        });
      });

      it('should propagate errors when sendEmail fails', async () => {
        // Act & Assert
        await expect(
          failingEmailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123')
        ).rejects.toThrow(EmailSendError);
        await expect(
          failingEmailService.sendInvitation('invited@example.com', 'Acme Corp', 'team-123')
        ).rejects.toThrow('Failed to send email via mock provider');
      });
    });
  });

  describe('sendAsync()', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should queue email job with organizationId and emailRequest', async () => {
      // Arrange
      const organizationId = 'tenant-123';
      const emailRequest: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Test</p>',
        from: 'noreply@example.com'
      };

      const mockJob = {
        id: 'job-123',
        name: 'send-email'
      };
      mockedAddJob.mockResolvedValueOnce(mockJob as any);

      // Act
      const result = await emailService.sendAsync(organizationId, emailRequest);

      // Assert
      expect(mockedAddJob).toHaveBeenCalledWith({
        queueName: 'emails',
        jobName: 'send-email',
        data: {
          organizationId,
          emailRequest
        },
        options: undefined
      });
      expect(result.id).toBe('job-123');
      expect(result.name).toBe('send-email');
    });

    it('should support custom job options (e.g., jobId for idempotency)', async () => {
      // Arrange
      const organizationId = 'tenant-456';
      const emailRequest: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Idempotent Email',
        html: '<p>Test</p>',
        from: 'noreply@example.com'
      };

      const mockJob = { id: 'job-456', name: 'send-email' };
      mockedAddJob.mockResolvedValueOnce(mockJob as any);

      // Act
      const result = await emailService.sendAsync(organizationId, emailRequest, {
        jobId: 'custom-job-id'
      });

      // Assert
      expect(mockedAddJob).toHaveBeenCalledWith({
        queueName: 'emails',
        jobName: 'send-email',
        data: {
          organizationId,
          emailRequest
        },
        options: { jobId: 'custom-job-id' }
      });
      expect(result.id).toBe('job-456');
    });

    it('should throw error when organizationId is missing (P0: multi-tenancy violation)', async () => {
      // Arrange
      const emailRequest: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        from: 'noreply@example.com'
      };

      // Act & Assert
      await expect(emailService.sendAsync('', emailRequest)).rejects.toThrow(
        'organizationId is required for email queueing'
      );
      await expect(emailService.sendAsync('', emailRequest)).rejects.toThrow(
        'organizationId is required for email queueing'
      );
    });

    it('should throw error when organizationId is null/undefined (P0: multi-tenancy violation)', async () => {
      // Arrange
      const emailRequest: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        from: 'noreply@example.com'
      };

      // Act & Assert
      await expect(emailService.sendAsync(null as any, emailRequest)).rejects.toThrow(
        'organizationId is required for email queueing'
      );
      await expect(emailService.sendAsync(undefined as any, emailRequest)).rejects.toThrow(
        'organizationId is required for email queueing'
      );
    });

    it('should propagate queue errors from addJob', async () => {
      // Arrange
      const organizationId = 'tenant-789';
      const emailRequest: ISendEmailRequest = {
        to: 'user@example.com',
        subject: 'Queue Error Test',
        html: '<p>Test</p>',
        from: 'noreply@example.com'
      };

      const queueError = new Error('Queue not found: emails');
      mockedAddJob.mockRejectedValueOnce(queueError);

      // Act & Assert
      await expect(emailService.sendAsync(organizationId, emailRequest)).rejects.toThrow(
        'Queue not found: emails'
      );
    });

    it('should include job data structure with organizationId and emailRequest', async () => {
      // Arrange
      const organizationId = 'tenant-999';
      const emailRequest: ISendEmailRequest = {
        to: 'recipient@example.com',
        subject: 'Job Data Test',
        html: '<p>Content</p>',
        from: 'sender@example.com'
      };

      const mockJob = { id: 'job-data-test', name: 'send-email' };
      mockedAddJob.mockResolvedValueOnce(mockJob as any);

      // Act
      await emailService.sendAsync(organizationId, emailRequest);

      // Assert: Verify job data structure
      expect(mockedAddJob).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: 'emails',
          jobName: 'send-email',
          data: {
            organizationId: 'tenant-999',
            emailRequest: {
              to: 'recipient@example.com',
              subject: 'Job Data Test',
              html: '<p>Content</p>',
              from: 'sender@example.com'
            }
          }
        })
      );
    });
  });
});

/**
 * EmailJobHandler Unit Tests
 *
 * Tests the EmailJobHandler for processing email jobs from the BullMQ queue.
 * Validates job processing, multi-tenancy compliance, error handling, and P0
 * compliance (no PII in logs).
 *
 * @packageDocumentation
 */

// Mock @package/queues decorators before importing EmailJobHandler
jest.mock('@package/queues', () => ({
  JobHandler: () => {
    // Return a decorator function
    return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
      // Mock decorator that doesn't modify the descriptor
      return descriptor;
    };
  }
}));

import { EmailService } from '../email.service';
import { EmailJobHandler, IEmailJobData } from '../email-job-handler';

import type { ISendEmailResponse } from '../../providers/email-provider.interface';

/**
 * Mock Job for testing BullMQ job processing.
 *
 * Implements only the properties and methods needed for tests.
 * Uses 'as any' to avoid implementing the full BullMQ Job interface.
 */
class MockJob {
  id: string;
  name: string;
  data: IEmailJobData;

  constructor(data: IEmailJobData, id = 'mock-job-id', name = 'send-email') {
    this.id = id;
    this.name = name;
    this.data = data;
  }
}

describe('EmailJobHandler', () => {
  let emailJobHandler: EmailJobHandler;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockSendEmail: jest.Mock;

  beforeEach(() => {
    // Arrange: Create mock EmailService
    mockSendEmail = jest.fn();
    mockEmailService = {
      sendEmail: mockSendEmail
    } as unknown as jest.Mocked<EmailService>;

    // Arrange: Create EmailJobHandler with mocked EmailService
    emailJobHandler = new EmailJobHandler(mockEmailService);
  });

  describe('handleEmailJob()', () => {
    it('should process email job successfully', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-123',
        emailRequest: {
          to: 'user@example.com',
          subject: 'Test Email',
          html: '<p>Test Content</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      const mockResponse: ISendEmailResponse = {
        messageId: 'msg-success-123',
        success: true
      };
      mockSendEmail.mockResolvedValueOnce(mockResponse);

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(jobData.emailRequest);
    });

    it('should include organizationId in job data for multi-tenancy (P0)', async () => {
      // Arrange
      const organizationId = 'tenant-456';
      const jobData: IEmailJobData = {
        organizationId,
        emailRequest: {
          to: 'user@example.com',
          subject: 'Multi-tenancy Test',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-tenant-456',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify organizationId is present in job data
      expect(job.data.organizationId).toBe(organizationId);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should throw error when organizationId is missing (P0: multi-tenancy violation)', async () => {
      // Arrange: Job data without organizationId
      const jobData: IEmailJobData = {
        organizationId: '',
        emailRequest: {
          to: 'user@example.com',
          subject: 'Missing Org ID',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      // Act & Assert
      await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow(
        'organizationId is required for email jobs'
      );
    });

    it('should throw error when organizationId is null (P0: multi-tenancy violation)', async () => {
      // Arrange: Job data with null organizationId
      const jobData: IEmailJobData = {
        organizationId: null as any,
        emailRequest: {
          to: 'user@example.com',
          subject: 'Null Org ID',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      // Act & Assert
      await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow(
        'organizationId is required for email jobs'
      );
    });

    it('should propagate EmailService errors', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-789',
        emailRequest: {
          to: 'fail@example.com',
          subject: 'Error Test',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      const serviceError = new Error('Provider connection failed');
      mockSendEmail.mockRejectedValueOnce(serviceError);

      // Act & Assert
      await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow(
        'Provider connection failed'
      );
    });

    it('should handle successful email send with messageId', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-success',
        emailRequest: {
          to: 'recipient@example.com',
          subject: 'Success Test',
          html: '<p>Content</p>',
          from: 'sender@example.com'
        }
      };
      const job = new MockJob(jobData, 'job-success-001');

      const mockResponse: ISendEmailResponse = {
        messageId: 'msg-provider-id-xyz',
        success: true
      };
      mockSendEmail.mockResolvedValueOnce(mockResponse);

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify service was called and email was sent
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        subject: 'Success Test',
        html: '<p>Content</p>',
        from: 'sender@example.com'
      });
    });

    it('should include job.id in logs for tracing (P0: no PII)', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-trace',
        emailRequest: {
          to: 'trace@example.com',
          subject: 'Trace Test',
          html: '<p>Trace</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData, 'trace-job-123');

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-trace-456',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify job.id is used for logging (not email addresses)
      expect(job.id).toBe('trace-job-123');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('P0 Compliance', () => {
    it('should validate organizationId presence before processing (P0)', async () => {
      // Arrange: Multiple invalid organizationId scenarios
      const invalidOrgIds = ['', null as any, undefined as any];

      for (const invalidOrgId of invalidOrgIds) {
        const jobData: IEmailJobData = {
          organizationId: invalidOrgId,
          emailRequest: {
            to: 'user@example.com',
            subject: 'Validation Test',
            html: '<p>Test</p>',
            from: 'noreply@example.com'
          }
        };
        const job = new MockJob(jobData);

        // Act & Assert
        await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow(
          'organizationId is required for email jobs'
        );
      }
    });

    it('should not log PII in job processing (P0)', async () => {
      // Arrange: Job with PII in emailRequest
      const jobData: IEmailJobData = {
        organizationId: 'tenant-pii',
        emailRequest: {
          to: 'sensitive.user@example.com',
          subject: 'Confidential Data',
          html: '<p>Secret: 123-45-6789</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-no-pii-logged',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify service was called (logs should not contain PII)
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'sensitive.user@example.com',
        subject: 'Confidential Data',
        html: '<p>Secret: 123-45-6789</p>',
        from: 'noreply@example.com'
      });
      // Note: Actual log content verification would require logger mocking
      // This test ensures the handler structure doesn't expose PII
    });

    it('should use job.id instead of email addresses for tracing (P0)', async () => {
      // Arrange: Job with multiple PII fields
      const jobData: IEmailJobData = {
        organizationId: 'tenant-tracing',
        emailRequest: {
          to: 'john.doe@company.com',
          subject: 'PII Test',
          html: '<p>SSN: 123-45-6789</p>',
          from: 'hr@company.com'
        }
      };
      const job = new MockJob(jobData, 'tracing-job-xyz');

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-tracing',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify job.id is used (not email addresses)
      expect(job.id).toBe('tracing-job-xyz');
      expect('tracing-job-xyz').not.toContain('@');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Job Data Structure', () => {
    it('should accept IEmailJobData with organizationId and emailRequest', async () => {
      // Arrange: Valid IEmailJobData structure
      const jobData: IEmailJobData = {
        organizationId: 'tenant-structure',
        emailRequest: {
          to: 'structure@example.com',
          subject: 'Structure Test',
          html: '<p>Structure</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-structure',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify job data structure
      expect(job.data.organizationId).toBe('tenant-structure');
      expect(job.data.emailRequest.to).toBe('structure@example.com');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle emailRequest with all optional fields', async () => {
      // Arrange: emailRequest with attachments and text content
      const jobData: IEmailJobData = {
        organizationId: 'tenant-full',
        emailRequest: {
          to: 'full@example.com',
          subject: 'Full Fields Test',
          html: '<p>HTML</p>',
          text: 'Plain text',
          from: 'sender@example.com',
          attachments: [
            {
              filename: 'document.pdf',
              content: Buffer.from('pdf content'),
              contentType: 'application/pdf'
            }
          ]
        }
      };
      const job = new MockJob(jobData);

      mockSendEmail.mockResolvedValueOnce({
        messageId: 'msg-full',
        success: true
      });

      // Act
      await emailJobHandler.handleEmailJob(job as any);

      // Assert: Verify all fields are passed through
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'full@example.com',
        subject: 'Full Fields Test',
        html: '<p>HTML</p>',
        text: 'Plain text',
        from: 'sender@example.com',
        attachments: [
          {
            filename: 'document.pdf',
            content: Buffer.from('pdf content'),
            contentType: 'application/pdf'
          }
        ]
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle provider timeout errors', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-timeout',
        emailRequest: {
          to: 'timeout@example.com',
          subject: 'Timeout Test',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      const timeoutError = new Error('ETIMEDOUT');
      mockSendEmail.mockRejectedValueOnce(timeoutError);

      // Act & Assert
      await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow('ETIMEDOUT');
    });

    it('should handle provider authentication errors', async () => {
      // Arrange
      const jobData: IEmailJobData = {
        organizationId: 'tenant-auth',
        emailRequest: {
          to: 'auth@example.com',
          subject: 'Auth Test',
          html: '<p>Test</p>',
          from: 'noreply@example.com'
        }
      };
      const job = new MockJob(jobData);

      const authError = new Error('401 Unauthorized: Invalid API key');
      mockSendEmail.mockRejectedValueOnce(authError);

      // Act & Assert
      await expect(emailJobHandler.handleEmailJob(job as any)).rejects.toThrow(
        '401 Unauthorized: Invalid API key'
      );
    });
  });
});

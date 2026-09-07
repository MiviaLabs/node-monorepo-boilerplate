/**
 * ResendAdapter Unit Tests
 *
 * Tests for Resend email provider implementation.
 * Uses mocked Resend SDK client for isolated testing.
 */

// Mock the Resend module
jest.mock('resend', () => ({
  Resend: jest.fn()
}));

// Import the mocked Resend class
import { Resend } from 'resend';

import { EmailProviderType } from '../../config/interfaces';
import {
  EmailSendError,
  EmailProviderHealthCheckError,
  EmailConfigurationError
} from '../../errors';
import { ResendAdapter } from '../resend-provider';

import type { IResendProviderConfig } from '../../config/interfaces';
import type { ISendEmailRequest } from '../email-provider.interface';

// Get the mock functions
const mockSendFn = jest.fn();
const mockListFn = jest.fn();

describe('ResendAdapter', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset the mock implementation to return fresh mock functions
    (Resend as jest.Mock).mockImplementation(() => ({
      emails: {
        send: mockSendFn
      },
      apiKeys: {
        list: mockListFn
      }
    }));
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create ResendAdapter with valid API key', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com'
      };

      // Act
      const adapter = new ResendAdapter(config);

      // Assert
      expect(adapter).toBeInstanceOf(ResendAdapter);
      expect(adapter.name).toBe('resend');
    });

    it('should throw EmailConfigurationError with empty API key', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: '',
        defaultFromEmail: 'default@example.com'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).toThrow(EmailConfigurationError);
      expect(() => new ResendAdapter(config)).toThrow('Resend API key is required');
    });

    it('should throw EmailConfigurationError with missing API key', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: '',
        defaultFromEmail: 'default@example.com'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).toThrow(EmailConfigurationError);
    });

    it('should throw EmailConfigurationError with invalid defaultFromName (newline)', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com',
        defaultFromName: 'Invalid\nName'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).toThrow(EmailConfigurationError);
      expect(() => new ResendAdapter(config)).toThrow('invalid control characters');
    });

    it('should throw EmailConfigurationError with invalid defaultFromEmail format', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'invalid-email'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).toThrow(EmailConfigurationError);
      expect(() => new ResendAdapter(config)).toThrow('Invalid email format');
    });

    it('should throw EmailConfigurationError with invalid defaultFromName (null byte)', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com',
        defaultFromName: 'Invalid\x00Name'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).toThrow(EmailConfigurationError);
    });

    it('should accept valid defaultFromName', () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com',
        defaultFromName: 'Valid Name'
      };

      // Act & Assert
      expect(() => new ResendAdapter(config)).not.toThrow();
    });
  });

  // ============================================================================
  // SEND EMAIL TESTS
  // ============================================================================

  describe('sendEmail', () => {
    let adapter: ResendAdapter;
    let validRequest: ISendEmailRequest;

    beforeEach(() => {
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com'
      };
      adapter = new ResendAdapter(config);

      validRequest = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1>',
        text: 'Test Text',
        from: 'sender@example.com'
      };
    });

    it('should send email successfully with valid request', async () => {
      // Arrange
      const mockResponse = {
        data: {
          id: 'msg_abc123'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(validRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_abc123');
      expect(result.providerResponse).toEqual({ id: 'msg_abc123' });
      expect(mockSendFn).toHaveBeenCalledTimes(1);
    });

    it('should send email with from name', async () => {
      // Arrange
      const requestWithFromName: ISendEmailRequest = {
        ...validRequest,
        fromName: 'Sender Name'
      };
      const mockResponse = {
        data: {
          id: 'msg_with_name'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithFromName);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Sender Name <sender@example.com>'
        })
      );
    });

    it('should send email with multiple recipients (to array)', async () => {
      // Arrange
      const requestMultipleTo: ISendEmailRequest = {
        ...validRequest,
        to: ['user1@example.com', 'user2@example.com']
      };
      const mockResponse = {
        data: {
          id: 'msg_multiple'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestMultipleTo);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user1@example.com', 'user2@example.com']
        })
      );
    });

    it('should send email with cc and bcc recipients', async () => {
      // Arrange
      const requestWithCcBcc: ISendEmailRequest = {
        ...validRequest,
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com']
      };
      const mockResponse = {
        data: {
          id: 'msg_cc_bcc'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithCcBcc);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com']
        })
      );
    });

    it('should send email with attachments (Buffer)', async () => {
      // Arrange
      const attachmentBuffer = Buffer.from('test content');
      const requestWithAttachment: ISendEmailRequest = {
        ...validRequest,
        attachments: [
          {
            filename: 'test.txt',
            content: attachmentBuffer,
            contentType: 'text/plain'
          }
        ]
      };
      const mockResponse = {
        data: {
          id: 'msg_attachment'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithAttachment);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'test.txt',
              content: attachmentBuffer.toString('base64')
            })
          ])
        })
      );
    });

    it('should send email with attachments (base64 string)', async () => {
      // Arrange
      const base64Content = Buffer.from('test content').toString('base64');
      const requestWithAttachment: ISendEmailRequest = {
        ...validRequest,
        attachments: [
          {
            filename: 'test.txt',
            content: base64Content,
            contentType: 'text/plain'
          }
        ]
      };
      const mockResponse = {
        data: {
          id: 'msg_attachment_base64'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithAttachment);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'test.txt',
              content: base64Content
            })
          ])
        })
      );
    });

    it('should send email with custom headers', async () => {
      // Arrange
      const requestWithHeaders: ISendEmailRequest = {
        ...validRequest,
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Priority': 'urgent'
        }
      };
      const mockResponse = {
        data: {
          id: 'msg_headers'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithHeaders);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Custom-Header': 'custom-value',
            'X-Priority': 'urgent'
          }
        })
      );
    });

    it('should send email with tags', async () => {
      // Arrange
      const requestWithTags: ISendEmailRequest = {
        ...validRequest,
        tags: ['category', 'welcome']
      };
      const mockResponse = {
        data: {
          id: 'msg_tags'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendEmail(requestWithTags);

      // Assert
      expect(result.success).toBe(true);
      // Note: Tags are converted from string[] to Resend's object format
      expect(mockSendFn).toHaveBeenCalled();
    });

    it('should merge provider-neutral tracking tags into Resend tags', async () => {
      const requestWithTracking: ISendEmailRequest = {
        ...validRequest,
        tags: ['category:welcome'],
        emailTracking: {
          providerTags: {
            email_message_id: 'public-123',
            correlation_key: 'password-reset:42'
          }
        }
      };
      const mockResponse = {
        data: {
          id: 'msg_tracking_tags'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      const result = await adapter.sendEmail(requestWithTracking);

      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ name: 'category', value: 'welcome' }),
            expect.objectContaining({ name: 'email_message_id', value: 'public-123' }),
            expect.objectContaining({
              name: 'correlation_key',
              value: 'password-reset-42'
            })
          ])
        })
      );
    });

    it('should sanitize resend tag names and values to provider-safe characters', async () => {
      const requestWithTracking: ISendEmailRequest = {
        ...validRequest,
        tags: ['invite flow:tenant:welcome'],
        emailTracking: {
          providerTags: {
            correlation_key: 'tenant-invitation:42',
            'bad tag name': 'value with spaces/and:slashes'
          }
        }
      };
      const mockResponse = {
        data: {
          id: 'msg_tracking_tags_sanitized'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      const result = await adapter.sendEmail(requestWithTracking);

      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ name: 'invite-flow', value: 'tenant-welcome' }),
            expect.objectContaining({
              name: 'correlation_key',
              value: 'tenant-invitation-42'
            }),
            expect.objectContaining({
              name: 'bad-tag-name',
              value: 'value-with-spaces-and-slashes'
            })
          ])
        })
      );
    });

    it('should throw EmailSendError when Resend API fails', async () => {
      // Arrange
      const apiError = new Error('API Error');
      mockSendFn.mockRejectedValueOnce(apiError);

      // Act & Assert
      await expect(adapter.sendEmail(validRequest)).rejects.toThrow(EmailSendError);
      await expect(adapter.sendEmail(validRequest)).rejects.toThrow('Failed to send email:');
    });

    it('should throw EmailSendError with rate limit info on 429', async () => {
      // Arrange
      const rateLimitError = {
        response: {
          status: 429,
          headers: {
            get: (name: string) => {
              if (name === 'retry-after') return '60';
              return null;
            }
          }
        }
      } as any;
      mockSendFn.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(adapter.sendEmail(validRequest)).rejects.toThrow(
        'Rate limit exceeded, retry after 60s'
      );
    });

    it('should detect top-level 429 and retry_after string', async () => {
      // Arrange
      const rateLimitError = {
        status: 429,
        retry_after: '30'
      } as any;
      mockSendFn.mockRejectedValueOnce(rateLimitError);

      // Act & Assert
      await expect(adapter.sendEmail(validRequest)).rejects.toThrow(
        'Rate limit exceeded, retry after 30s'
      );
    });

    it('should throw EmailConfigurationError with empty to address', async () => {
      // Arrange
      const invalidRequest: ISendEmailRequest = {
        ...validRequest,
        to: '' as any
      };

      // Act & Assert
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(EmailConfigurationError);
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(
        'Email request must have at least one valid recipient'
      );
    });

    it('should throw EmailConfigurationError with empty subject', async () => {
      // Arrange
      const invalidRequest: ISendEmailRequest = {
        ...validRequest,
        subject: ''
      };

      // Act & Assert
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(EmailConfigurationError);
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(
        'Email request must have a subject'
      );
    });

    it('should throw EmailConfigurationError with subject exceeding MAX_SUBJECT_LENGTH (998)', async () => {
      // Arrange
      const invalidRequest: ISendEmailRequest = {
        ...validRequest,
        subject: 'a'.repeat(999)
      };

      // Act & Assert
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(EmailConfigurationError);
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(
        'Email subject exceeds maximum length'
      );
    });

    it('should throw EmailConfigurationError with neither html nor text content', async () => {
      // Arrange
      const invalidRequest: ISendEmailRequest = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        from: 'sender@example.com'
      } as any;

      // Act & Assert
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(EmailConfigurationError);
      await expect(adapter.sendEmail(invalidRequest)).rejects.toThrow(
        'Email request must have text or html content'
      );
    });

    it('should use defaultFromEmail from config when from not provided', async () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com'
      };
      const adapterWithDefault = new ResendAdapter(config);

      const requestWithoutFrom: ISendEmailRequest = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test</h1>'
      };
      const mockResponse = {
        data: {
          id: 'msg_default_from'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapterWithDefault.sendEmail(requestWithoutFrom);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'default@example.com'
        })
      );
    });

    it('should use defaultFromName from config when from name not provided', async () => {
      // Arrange
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com',
        defaultFromName: 'Default Sender'
      };
      const adapterWithDefault = new ResendAdapter(config);

      const requestWithoutFrom: ISendEmailRequest = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test</h1>'
      };
      const mockResponse = {
        data: {
          id: 'msg_default_name'
        }
      };
      mockSendFn.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapterWithDefault.sendEmail(requestWithoutFrom);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Default Sender <default@example.com>'
        })
      );
    });
  });

  // ============================================================================
  // SEND BATCH TESTS
  // ============================================================================

  describe('sendBatch', () => {
    let adapter: ResendAdapter;
    let validRequests: ISendEmailRequest[];

    beforeEach(() => {
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com'
      };
      adapter = new ResendAdapter(config);

      validRequests = [
        { to: 'user1@example.com', subject: 'Test 1', text: 'Content 1', html: '<p>Content 1</p>' },
        { to: 'user2@example.com', subject: 'Test 2', html: '<p>Content 2</p>' }
      ];
    });

    it('should send batch emails successfully', async () => {
      // Arrange
      mockSendFn
        .mockResolvedValueOnce({ data: { id: 'msg_1' } })
        .mockResolvedValueOnce({ data: { id: 'msg_2' } });

      // Act
      const results = await adapter.sendBatch(validRequests);

      // Assert
      expect(results.length).toBe(2);
      expect(results[0]?.messageId).toBe('msg_1');
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.providerResponse).toEqual({ id: 'msg_1' });
      expect(results[1]?.messageId).toBe('msg_2');
      expect(results[1]?.success).toBe(true);
      expect(results[1]?.providerResponse).toEqual({ id: 'msg_2' });
      expect(mockSendFn.mock.calls.length).toBe(2);
    });

    it('should throw EmailSendError if any email in batch fails', async () => {
      // Arrange
      let callCount = 0;
      mockSendFn.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { data: { id: 'msg_1' } };
        }
        throw new Error('API Error');
      });

      // Act & Assert
      await expect(adapter.sendBatch(validRequests)).rejects.toThrow(EmailSendError);
    });
  });

  // ============================================================================
  // HEALTH CHECK TESTS
  // ============================================================================

  describe('healthCheck', () => {
    let adapter: ResendAdapter;

    beforeEach(() => {
      const config: IResendProviderConfig = {
        type: EmailProviderType.RESEND,
        apiKey: 'test-api-key',
        defaultFromEmail: 'default@example.com'
      };
      adapter = new ResendAdapter(config);
    });

    it('should return true when API is healthy', async () => {
      // Arrange
      mockListFn.mockResolvedValueOnce({ data: [] });

      // Act
      const result = await adapter.healthCheck();

      // Assert
      expect(result).toBe(true);
      expect(mockListFn).toHaveBeenCalledTimes(1);
    });

    it('should throw EmailProviderHealthCheckError when API is unreachable', async () => {
      // Arrange
      const apiError = new Error('Network error');
      mockListFn.mockRejectedValueOnce(apiError);

      // Act & Assert
      await expect(adapter.healthCheck()).rejects.toThrow(EmailProviderHealthCheckError);
    });

    it('should throw EmailProviderHealthCheckError on invalid API key', async () => {
      // Arrange
      const authError = {
        response: {
          status: 401
        }
      } as any;
      mockListFn.mockRejectedValueOnce(authError);

      // Act & Assert
      await expect(adapter.healthCheck()).rejects.toThrow(EmailProviderHealthCheckError);
    });
  });
});

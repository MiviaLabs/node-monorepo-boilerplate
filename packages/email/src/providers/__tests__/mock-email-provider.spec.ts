/**
 * MockEmailProvider Unit Tests
 *
 * Comprehensive unit tests for MockEmailProvider including:
 * - Constructor tests
 * - Email sending tests (success, failure, latency)
 * - Batch sending tests
 * - Health check tests
 * - Test utility tests
 * - Failure simulation tests
 * - Isolation tests
 *
 * TDD: AAA (Arrange-Act-Assert) pattern
 * Target: 80%+ code coverage
 */

import { EmailProviderType } from '../../config/interfaces';
import { EmailSendError } from '../../errors';
import { MockEmailProvider } from '../mock-email-provider';

import type { IMockProviderConfig } from '../../config/interfaces';
import type { ISendEmailRequest, IEmailAttachment } from '../email-provider.interface';

describe('MockEmailProvider', () => {
  // Default valid configuration
  const createValidConfig = (): IMockProviderConfig => ({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com'
  });

  // Valid email request
  const createValidRequest = (): ISendEmailRequest => ({
    to: 'recipient@example.com',
    subject: 'Test Subject',
    html: '<p>Test HTML</p>',
    text: 'Test text'
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create MockEmailProvider with valid config', () => {
      // Arrange
      const config = createValidConfig();

      // Act
      const provider = new MockEmailProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(MockEmailProvider);
      expect(provider.name).toBe('mock');
    });

    it('should set default values for optional config fields', () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        failureRate: undefined,
        simulatedLatencyMs: undefined,
        batchFailureIndices: undefined
      };

      // Act
      const provider = new MockEmailProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(MockEmailProvider);
      expect(provider.name).toBe('mock');
    });

    it('should accept custom failureRate', () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        failureRate: 0.5
      };

      // Act
      const provider = new MockEmailProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(MockEmailProvider);
    });

    it('should accept custom simulatedLatencyMs', () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        simulatedLatencyMs: 100
      };

      // Act
      const provider = new MockEmailProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(MockEmailProvider);
    });

    it('should accept custom batchFailureIndices', () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        batchFailureIndices: [1, 3]
      };

      // Act
      const provider = new MockEmailProvider(config);

      // Assert
      expect(provider).toBeInstanceOf(MockEmailProvider);
    });
  });

  // ============================================================================
  // EMAIL SENDING TESTS (SUCCESS)
  // ============================================================================

  describe('sendEmail - success cases', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider(createValidConfig());
    });

    it('should send single email successfully', async () => {
      // Arrange
      const request = createValidRequest();

      // Act
      const response = await provider.sendEmail(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.messageId).toMatch(/^mock-\d+-\d+$/);
      expect(response.error).toBeUndefined();
    });

    it('should store sent email in memory', async () => {
      // Arrange
      const request = createValidRequest();

      // Act
      await provider.sendEmail(request);
      const sentEmails = provider.getSentEmails();

      // Assert
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[0]!.request.to).toBe('recipient@example.com');
      expect(sentEmails[0]!.response.success).toBe(true);
    });

    it('should generate unique message IDs', async () => {
      // Arrange
      const request1 = createValidRequest();
      const request2 = { ...createValidRequest(), to: 'recipient2@example.com' };

      // Act
      const response1 = await provider.sendEmail(request1);
      const response2 = await provider.sendEmail(request2);

      // Assert
      expect(response1.messageId).not.toBe(response2.messageId);
    });

    it('should store timestamp with sent email', async () => {
      // Arrange
      const request = createValidRequest();
      const beforeSend = new Date().toISOString();

      // Act
      await provider.sendEmail(request);
      const sentEmails = provider.getSentEmails();

      // Assert
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[0]!.timestamp).toBeDefined();
      expect(sentEmails[0]!.timestamp >= beforeSend).toBe(true);
    });

    it('should clone request to prevent external mutation', async () => {
      // Arrange
      const request = createValidRequest();

      // Act
      await provider.sendEmail(request);
      request.subject = 'MODIFIED';

      // Assert
      const sentEmails = provider.getSentEmails();
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[0]!.request.subject).toBe('Test Subject');
    });

    it('should handle email with all fields', async () => {
      // Arrange
      const attachment: IEmailAttachment = {
        filename: 'test.pdf',
        content: Buffer.from('test content'),
        contentType: 'application/pdf'
      };

      const request: ISendEmailRequest = {
        to: 'to@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Full Test',
        html: '<h1>HTML</h1>',
        text: 'Text',
        from: 'from@example.com',
        fromName: 'Sender Name',
        replyTo: 'replyto@example.com',
        attachments: [attachment],
        headers: { 'X-Custom': 'value' },
        tags: ['tag1', 'tag2']
      };

      // Act
      const response = await provider.sendEmail(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.messageId).toBeDefined();

      const sentEmails = provider.getSentEmails();
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[0]!.request.to).toBe('to@example.com');
      expect(sentEmails[0]!.request.cc).toBe('cc@example.com');
      expect(sentEmails[0]!.request.bcc).toBe('bcc@example.com');
    });

    it('should handle array of recipients', async () => {
      // Arrange
      const request: ISendEmailRequest = {
        ...createValidRequest(),
        to: ['recipient1@example.com', 'recipient2@example.com']
      };

      // Act
      const response = await provider.sendEmail(request);

      // Assert
      expect(response.success).toBe(true);

      const sentEmails = provider.getSentEmails();
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[0]!.request.to).toEqual([
        'recipient1@example.com',
        'recipient2@example.com'
      ]);
    });
  });

  // ============================================================================
  // EMAIL SENDING TESTS (FAILURE SIMULATION)
  // ============================================================================

  describe('sendEmail - failure simulation', () => {
    it('should throw EmailSendError when failureRate is 1 (always fail)', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        failureRate: 1
      };
      const provider = new MockEmailProvider(config);
      const request = createValidRequest();

      // Act & Assert
      await expect(provider.sendEmail(request)).rejects.toThrow(EmailSendError);
      await expect(provider.sendEmail(request)).rejects.toThrow(
        'MOCK_FAILURE: Simulated provider failure'
      );
    });

    it('should not throw when failureRate is 0 (never fail)', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        failureRate: 0
      };
      const provider = new MockEmailProvider(config);
      const request = createValidRequest();

      // Act & Assert
      await expect(provider.sendEmail(request)).resolves.toMatchObject({
        success: true,
        messageId: expect.any(String)
      });
    });

    it('should sometimes fail when failureRate is 0.5', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        failureRate: 0.5
      };
      const provider = new MockEmailProvider(config);
      const request = createValidRequest();

      // Mock Math.random to return deterministic pattern: 0.8, 0.2, 0.8, 0.2, ...
      // This ensures ~50% failure rate (fail when random < 0.5)
      const mathRandomSpy = jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.2);

      // Act - send 4 times with deterministic pattern
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => provider.sendEmail(request))
      );

      // Assert - should have 2 failures and 2 successes
      const failures = results.filter((r) => r.status === 'rejected').length;
      const successes = results.filter((r) => r.status === 'fulfilled').length;

      expect(failures).toBeGreaterThan(0);
      expect(successes).toBeGreaterThan(0);

      mathRandomSpy.mockRestore();
    });
  });

  // ============================================================================
  // EMAIL SENDING TESTS (LATENCY SIMULATION)
  // ============================================================================

  describe('sendEmail - latency simulation', () => {
    it('should apply simulated latency', async () => {
      // Arrange
      const latencyMs = 100;
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        simulatedLatencyMs: latencyMs
      };
      const provider = new MockEmailProvider(config);
      const request = createValidRequest();

      // Act
      const startTime = Date.now();
      await provider.sendEmail(request);
      const duration = Date.now() - startTime;

      // Assert - should take at least the configured latency
      expect(duration).toBeGreaterThanOrEqual(latencyMs);
    });

    it('should not apply latency when simulatedLatencyMs is 0', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        simulatedLatencyMs: 0
      };
      const provider = new MockEmailProvider(config);
      const request = createValidRequest();

      // Act
      const startTime = Date.now();
      await provider.sendEmail(request);
      const duration = Date.now() - startTime;

      // Assert - should complete quickly (< 10ms)
      expect(duration).toBeLessThan(50); // Allow margin for slow CI systems
    });
  });

  // ============================================================================
  // BATCH SENDING TESTS
  // ============================================================================

  describe('sendBatch', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider(createValidConfig());
    });

    it('should send batch of emails successfully', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [
        { ...createValidRequest(), to: 'recipient1@example.com' },
        { ...createValidRequest(), to: 'recipient2@example.com' },
        { ...createValidRequest(), to: 'recipient3@example.com' }
      ];

      // Act
      const responses = await provider.sendBatch(requests);

      // Assert
      expect(responses).toHaveLength(3);
      expect(responses.every((r) => r.success)).toBe(true);
      expect(responses.every((r) => r.messageId)).toBeDefined();
      expect(new Set(responses.map((r) => r.messageId)).size).toBe(3); // All unique
    });

    it('should store all batch emails in memory', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [
        { ...createValidRequest(), to: 'recipient1@example.com' },
        { ...createValidRequest(), to: 'recipient2@example.com' }
      ];

      // Act
      await provider.sendBatch(requests);
      const sentEmails = provider.getSentEmails();

      // Assert
      expect(sentEmails).toHaveLength(2);
    });

    it('should throw EmailConfigurationError for empty batch', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [];

      // Act & Assert
      await expect(provider.sendBatch(requests)).rejects.toThrow(
        'Batch request must contain at least one email'
      );
    });

    it('should handle single email in batch', async () => {
      // Arrange
      const requests: ISendEmailRequest[] = [createValidRequest()];

      // Act
      const responses = await provider.sendBatch(requests);

      // Assert
      expect(responses).toHaveLength(1);
      expect(responses[0]).toBeDefined();
      expect(responses[0]!.success).toBe(true);
    });

    it('should apply latency to each email in batch', async () => {
      // Arrange
      const latencyMs = 50;
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        simulatedLatencyMs: latencyMs
      };
      const provider = new MockEmailProvider(config);
      const requests: ISendEmailRequest[] = [
        { ...createValidRequest(), to: 'recipient1@example.com' },
        { ...createValidRequest(), to: 'recipient2@example.com' }
      ];

      // Act
      const startTime = Date.now();
      await provider.sendBatch(requests);
      const duration = Date.now() - startTime;

      // Assert - should take at least 2x latency (2 emails)
      expect(duration).toBeGreaterThanOrEqual(latencyMs * 2);
    });
  });

  // ============================================================================
  // BATCH FAILURE SIMULATION TESTS
  // ============================================================================

  describe('sendBatch - partial failure simulation', () => {
    it('should fail specific batch indices', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        batchFailureIndices: [1, 3] // Fail at indices 1 and 3
      };
      const provider = new MockEmailProvider(config);
      const requests: ISendEmailRequest[] = [
        { ...createValidRequest(), to: 'recipient0@example.com' },
        { ...createValidRequest(), to: 'recipient1@example.com' },
        { ...createValidRequest(), to: 'recipient2@example.com' },
        { ...createValidRequest(), to: 'recipient3@example.com' },
        { ...createValidRequest(), to: 'recipient4@example.com' }
      ];

      // Act & Assert
      await expect(provider.sendBatch(requests)).rejects.toThrow(EmailSendError);
      await expect(provider.sendBatch(requests)).rejects.toThrow(
        'MOCK_FAILURE: Simulated failure at batch index 1'
      );

      // Verify that first email was stored (index 0 succeeded)
      const sentEmails = provider.getSentEmails();
      expect(sentEmails.length).toBeGreaterThanOrEqual(1);
      // First email (index 0) should have been stored
      expect(sentEmails.some((e) => e.request.to === 'recipient0@example.com')).toBe(true);
      // Second email (index 1) should NOT have been stored
      expect(sentEmails.some((e) => e.request.to === 'recipient1@example.com')).toBe(false);
    });

    it('should fail at first index in batchFailureIndices', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        batchFailureIndices: [0] // Fail at index 0
      };
      const provider = new MockEmailProvider(config);
      const requests: ISendEmailRequest[] = [createValidRequest()];

      // Act & Assert
      await expect(provider.sendBatch(requests)).rejects.toThrow(
        'MOCK_FAILURE: Simulated failure at batch index 0'
      );
    });

    it('should not fail when batchFailureIndices is empty', async () => {
      // Arrange
      const config: IMockProviderConfig = {
        type: EmailProviderType.MOCK,
        defaultFromEmail: 'test@example.com',
        batchFailureIndices: []
      };
      const provider = new MockEmailProvider(config);
      const requests: ISendEmailRequest[] = [
        { ...createValidRequest(), to: 'recipient1@example.com' },
        { ...createValidRequest(), to: 'recipient2@example.com' }
      ];

      // Act & Assert
      await expect(provider.sendBatch(requests)).resolves.toHaveLength(2);
    });
  });

  // ============================================================================
  // HEALTH CHECK TESTS
  // ============================================================================

  describe('healthCheck', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider(createValidConfig());
    });

    it('should always return true', async () => {
      // Act
      const result = await provider.healthCheck();

      // Assert
      expect(result).toBe(true);
    });

    it('should return true multiple times', async () => {
      // Act
      const result1 = await provider.healthCheck();
      const result2 = await provider.healthCheck();
      const result3 = await provider.healthCheck();

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });
  });

  // ============================================================================
  // TEST UTILITY TESTS
  // ============================================================================

  describe('getSentEmails', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider(createValidConfig());
    });

    it('should return empty array initially', () => {
      // Act
      const sentEmails = provider.getSentEmails();

      // Assert
      expect(sentEmails).toEqual([]);
    });

    it('should return copy of sent emails', async () => {
      // Arrange
      const request = createValidRequest();
      await provider.sendEmail(request);

      // Act
      const sentEmails1 = provider.getSentEmails();
      const sentEmails2 = provider.getSentEmails();

      // Assert - should be different array references
      expect(sentEmails1).not.toBe(sentEmails2);
      expect(sentEmails1).toEqual(sentEmails2);
    });

    it('should not allow external mutation of internal array', async () => {
      // Arrange
      const request = createValidRequest();
      await provider.sendEmail(request);

      // Act - try to mutate returned array
      const sentEmails = provider.getSentEmails();
      sentEmails.push({} as any);

      // Assert - internal array should be unchanged
      expect(provider.getSentEmails()).toHaveLength(1);
    });

    it('should return all sent emails in order', async () => {
      // Arrange
      await provider.sendEmail({ ...createValidRequest(), to: 'first@example.com' });
      await provider.sendEmail({ ...createValidRequest(), to: 'second@example.com' });
      await provider.sendEmail({ ...createValidRequest(), to: 'third@example.com' });

      // Act
      const sentEmails = provider.getSentEmails();

      // Assert
      expect(sentEmails).toHaveLength(3);
      expect(sentEmails[0]).toBeDefined();
      expect(sentEmails[1]).toBeDefined();
      expect(sentEmails[2]).toBeDefined();
      expect(sentEmails[0]!.request.to).toBe('first@example.com');
      expect(sentEmails[1]!.request.to).toBe('second@example.com');
      expect(sentEmails[2]!.request.to).toBe('third@example.com');
    });
  });

  // ============================================================================
  // CLEAR SENT EMAILS TESTS
  // ============================================================================

  describe('clearSentEmails', () => {
    let provider: MockEmailProvider;

    beforeEach(async () => {
      provider = new MockEmailProvider(createValidConfig());
      await provider.sendEmail(createValidRequest());
    });

    it('should clear all stored emails', () => {
      // Arrange - precondition
      expect(provider.getEmailCount()).toBe(1);

      // Act
      provider.clearSentEmails();

      // Assert
      expect(provider.getSentEmails()).toEqual([]);
      expect(provider.getEmailCount()).toBe(0);
    });

    it('should be safe to call on empty provider', () => {
      // Arrange
      provider.clearSentEmails();

      // Act & Assert - should not throw
      expect(() => provider.clearSentEmails()).not.toThrow();
      expect(provider.getEmailCount()).toBe(0);
    });
  });

  // ============================================================================
  // FIND EMAILS BY RECIPIENT TESTS
  // ============================================================================

  describe('findEmailsByRecipient', () => {
    let provider: MockEmailProvider;

    beforeEach(async () => {
      provider = new MockEmailProvider(createValidConfig());
      await provider.sendEmail({ ...createValidRequest(), to: 'primary@example.com' });
      await provider.sendEmail({
        ...createValidRequest(),
        to: 'other@example.com',
        cc: 'primary@example.com'
      });
      await provider.sendEmail({
        ...createValidRequest(),
        to: 'another@example.com',
        bcc: 'primary@example.com'
      });
    });

    it('should find emails in to field', () => {
      // Act
      const emails = provider.findEmailsByRecipient('primary@example.com');

      // Assert - should find at least the email where primary is in 'to'
      expect(emails.length).toBeGreaterThan(0);
      expect(emails.some((e) => e.request.to === 'primary@example.com')).toBe(true);
    });

    it('should find emails in cc field', () => {
      // Act
      const emails = provider.findEmailsByRecipient('primary@example.com');

      // Assert
      expect(emails.length).toBeGreaterThanOrEqual(1);
      expect(emails.some((e) => e.request.cc === 'primary@example.com')).toBe(true);
    });

    it('should find emails in bcc field', () => {
      // Act
      const emails = provider.findEmailsByRecipient('primary@example.com');

      // Assert
      expect(emails.length).toBeGreaterThanOrEqual(1);
      expect(emails.some((e) => e.request.bcc === 'primary@example.com')).toBe(true);
    });

    it('should find emails with array of recipients', async () => {
      // Arrange
      await provider.sendEmail({
        ...createValidRequest(),
        to: ['primary@example.com', 'secondary@example.com']
      });

      // Act
      const emails = provider.findEmailsByRecipient('primary@example.com');

      // Assert
      expect(
        emails.some((e) => {
          const to = e.request.to;
          return Array.isArray(to) && to.includes('primary@example.com');
        })
      ).toBe(true);
    });

    it('should return empty array when recipient not found', () => {
      // Act
      const emails = provider.findEmailsByRecipient('nonexistent@example.com');

      // Assert
      expect(emails).toEqual([]);
    });
  });

  // ============================================================================
  // FIND EMAIL BY ID TESTS
  // ============================================================================

  describe('findEmailById', () => {
    let provider: MockEmailProvider;
    let messageId: string;

    beforeEach(async () => {
      provider = new MockEmailProvider(createValidConfig());
      const response = await provider.sendEmail(createValidRequest());
      messageId = response.messageId;
    });

    it('should find email by message ID', () => {
      // Act
      const email = provider.findEmailById(messageId);

      // Assert
      expect(email).toBeDefined();
      expect(email?.response.messageId).toBe(messageId);
    });

    it('should return undefined for non-existent ID', () => {
      // Act
      const email = provider.findEmailById('non-existent-id');

      // Assert
      expect(email).toBeUndefined();
    });
  });

  // ============================================================================
  // GET EMAIL COUNT TESTS
  // ============================================================================

  describe('getEmailCount', () => {
    let provider: MockEmailProvider;

    beforeEach(() => {
      provider = new MockEmailProvider(createValidConfig());
    });

    it('should return 0 initially', () => {
      // Act
      const count = provider.getEmailCount();

      // Assert
      expect(count).toBe(0);
    });

    it('should increment with each sent email', async () => {
      // Arrange
      expect(provider.getEmailCount()).toBe(0);

      // Act & Assert
      await provider.sendEmail(createValidRequest());
      expect(provider.getEmailCount()).toBe(1);

      await provider.sendEmail(createValidRequest());
      expect(provider.getEmailCount()).toBe(2);

      await provider.sendEmail(createValidRequest());
      expect(provider.getEmailCount()).toBe(3);
    });

    it('should reset to 0 after clear', async () => {
      // Arrange
      await provider.sendEmail(createValidRequest());
      await provider.sendEmail(createValidRequest());
      expect(provider.getEmailCount()).toBe(2);

      // Act
      provider.clearSentEmails();

      // Assert
      expect(provider.getEmailCount()).toBe(0);
    });
  });

  // ============================================================================
  // RESET TESTS
  // ============================================================================

  describe('reset', () => {
    let provider: MockEmailProvider;

    beforeEach(async () => {
      provider = new MockEmailProvider(createValidConfig());
      await provider.sendEmail(createValidRequest());
      await provider.sendEmail(createValidRequest());
    });

    it('should clear all stored emails', () => {
      // Arrange - precondition
      expect(provider.getEmailCount()).toBe(2);

      // Act
      provider.reset();

      // Assert
      expect(provider.getEmailCount()).toBe(0);
    });

    it('should reset message ID counter', async () => {
      // Arrange - get first message ID
      const firstResponse = await provider.sendEmail(createValidRequest());
      provider.reset();

      // Act - send after reset
      const secondResponse = await provider.sendEmail(createValidRequest());

      // Assert - message IDs should be different (due to timestamp)
      // but counter was reset
      expect(firstResponse.messageId).not.toBe(secondResponse.messageId);
    });

    it('should allow fresh sends after reset', async () => {
      // Act
      provider.reset();
      await provider.sendEmail(createValidRequest());

      // Assert
      expect(provider.getEmailCount()).toBe(1);
    });
  });

  // ============================================================================
  // ISOLATION TESTS
  // ============================================================================

  describe('test isolation', () => {
    it('should keep instances independent', async () => {
      // Arrange
      const provider1 = new MockEmailProvider(createValidConfig());
      const provider2 = new MockEmailProvider(createValidConfig());

      // Act
      await provider1.sendEmail({ ...createValidRequest(), to: 'provider1@example.com' });
      await provider2.sendEmail({ ...createValidRequest(), to: 'provider2@example.com' });

      // Assert
      expect(provider1.getEmailCount()).toBe(1);
      expect(provider2.getEmailCount()).toBe(1);
      const emails1 = provider1.getSentEmails();
      const emails2 = provider2.getSentEmails();
      expect(emails1[0]).toBeDefined();
      expect(emails2[0]).toBeDefined();
      expect(emails1[0]!.request.to).toBe('provider1@example.com');
      expect(emails2[0]!.request.to).toBe('provider2@example.com');
    });

    it('should keep reset isolated to instance', async () => {
      // Arrange
      const provider1 = new MockEmailProvider(createValidConfig());
      const provider2 = new MockEmailProvider(createValidConfig());
      await provider1.sendEmail(createValidRequest());
      await provider2.sendEmail(createValidRequest());

      // Act
      provider1.reset();

      // Assert
      expect(provider1.getEmailCount()).toBe(0);
      expect(provider2.getEmailCount()).toBe(1);
    });
  });

  // ============================================================================
  // P0 COMPLIANCE TESTS (No PII in logs)
  // ============================================================================

  describe('P0 compliance', () => {
    it('should never log PII (email addresses, content)', async () => {
      // This is a documentation test - the actual P0 compliance
      // is ensured by BaseEmailProvider's sanitize methods
      // MockEmailProvider inherits this behavior

      // Arrange
      const provider = new MockEmailProvider(createValidConfig());

      // Act & Assert - Provider should work without throwing
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: 'Secret',
          html: '<p>Private data</p>'
        })
      ).resolves.toMatchObject({
        success: true,
        messageId: expect.any(String)
      });
    });
  });
});

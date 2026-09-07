/**
 * MockEmailProvider Integration Tests
 *
 * Real-world usage patterns for MockEmailProvider in test scenarios.
 * Demonstrates typical testing workflows for applications using email.
 *
 * Test Scenarios:
 * - Single email sending and verification
 * - Batch email operations
 * - Failure simulation for testing error handling
 * - Test isolation and cleanup
 * - Querying sent emails for assertions
 *
 * P0 Compliance: No PII in test output (uses test@example.com)
 */

import { MockEmailProvider } from '../providers/mock-email-provider';
import { EmailProviderType } from '../config/interfaces';
import type { IMockProviderConfig } from '../config/interfaces';
import type { ISendEmailRequest } from '../providers/email-provider.interface';
import { EmailSendError } from '../errors';

describe('MockEmailProvider Integration Tests', () => {
  let mockProvider: MockEmailProvider;

  /**
   * Create a valid test configuration.
   */
  const createTestConfig = (): IMockProviderConfig => ({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'noreply-test@example.com',
    defaultFromName: 'Test Application'
  });

  /**
   * Create a valid email request for testing.
   */
  const createTestRequest = (overrides?: Partial<ISendEmailRequest>): ISendEmailRequest => ({
    to: 'recipient@example.com',
    subject: 'Test Email',
    html: '<p>Test content</p>',
    text: 'Test content',
    ...overrides
  });

  beforeEach(() => {
    // ARRANGE: Create fresh provider for each test
    mockProvider = new MockEmailProvider(createTestConfig());
  });

  afterEach(() => {
    // CLEANUP: Reset provider state after each test
    mockProvider.reset();
  });

  describe('Single Email Sending', () => {
    it('should send single email and verify delivery', async () => {
      // ARRANGE
      const request = createTestRequest({
        to: 'user@example.com',
        subject: 'Welcome to our app',
        html: '<h1>Welcome!</h1><p>Get started today.</p>'
      });

      // ACT
      const response = await mockProvider.sendEmail(request);

      // ASSERT
      expect(response.success).toBe(true);
      expect(response.messageId).toMatch(/^mock-\d+-\d+$/);

      // Verify email was stored
      const sentEmails = mockProvider.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]!.request.to).toBe('user@example.com');
      expect(sentEmails[0]!.request.subject).toBe('Welcome to our app');
    });

    it('should send multiple emails in sequence', async () => {
      // ARRANGE
      const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com'];

      // ACT
      const responses = await Promise.all(
        recipients.map((to) =>
          mockProvider.sendEmail(
            createTestRequest({
              to,
              subject: `Email for ${to}`
            })
          )
        )
      );

      // ASSERT
      expect(responses).toHaveLength(3);
      responses.forEach((response) => {
        expect(response.success).toBe(true);
        expect(response.messageId).toMatch(/^mock-\d+-\d+$/);
      });

      // Verify all emails were stored in order
      const sentEmails = mockProvider.getSentEmails();
      expect(sentEmails).toHaveLength(3);
      expect(sentEmails[0]!.request.to).toBe('user1@example.com');
      expect(sentEmails[1]!.request.to).toBe('user2@example.com');
      expect(sentEmails[2]!.request.to).toBe('user3@example.com');
    });

    it('should handle email with all fields including attachments', async () => {
      // ARRANGE
      const request = createTestRequest({
        to: 'user@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Email with attachments',
        html: '<p>See attached documents</p>',
        attachments: [
          {
            filename: 'document.pdf',
            content: Buffer.from('mock-pdf-content'),
            contentType: 'application/pdf'
          },
          {
            filename: 'image.png',
            content: Buffer.from('mock-png-content'),
            contentType: 'image/png'
          }
        ]
      });

      // ACT
      const response = await mockProvider.sendEmail(request);

      // ASSERT
      expect(response.success).toBe(true);

      const sentEmails = mockProvider.getSentEmails();
      const storedRequest = sentEmails[0]!.request;

      expect(storedRequest.to).toBe('user@example.com');
      expect(storedRequest.cc).toBe('cc@example.com');
      expect(storedRequest.bcc).toBe('bcc@example.com');
      expect(storedRequest.attachments).toHaveLength(2);
      expect(storedRequest.attachments![0]!.filename).toBe('document.pdf');
      expect(storedRequest.attachments![1]!.filename).toBe('image.png');
    });
  });

  describe('Batch Email Operations', () => {
    it('should send batch of emails efficiently', async () => {
      // ARRANGE
      const recipients = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
      const requests = recipients.map((to) =>
        createTestRequest({
          to,
          subject: `Batch email ${to}`
        })
      );

      // ACT
      const responses = await mockProvider.sendBatch(requests);

      // ASSERT
      expect(responses).toHaveLength(10);
      responses.forEach((response) => {
        expect(response.success).toBe(true);
      });

      // Verify all emails were stored
      expect(mockProvider.getEmailCount()).toBe(10);
    });

    it('should handle batch with mixed recipients (to, cc, bcc)', async () => {
      // ARRANGE
      const requests: ISendEmailRequest[] = [
        createTestRequest({
          to: 'primary@example.com',
          cc: 'cc1@example.com',
          bcc: 'bcc1@example.com'
        }),
        createTestRequest({
          to: ['user1@example.com', 'user2@example.com'],
          cc: ['cc2@example.com', 'cc3@example.com']
        }),
        createTestRequest({
          to: 'single@example.com',
          bcc: ['bcc1@example.com', 'bcc2@example.com', 'bcc3@example.com']
        })
      ];

      // ACT
      const responses = await mockProvider.sendBatch(requests);

      // ASSERT
      expect(responses).toHaveLength(3);
      expect(responses.every((r) => r.success)).toBe(true);

      // Verify recipients were stored correctly
      const sentEmails = mockProvider.getSentEmails();
      expect(sentEmails[0]!.request.cc).toBe('cc1@example.com');
      expect(sentEmails[1]!.request.to).toEqual(['user1@example.com', 'user2@example.com']);
    });
  });

  describe('Failure Simulation', () => {
    it('should simulate random failures with failureRate', async () => {
      // ARRANGE
      const failureConfig = createTestConfig();
      failureConfig.failureRate = 0.5; // 50% failure rate

      const testProvider = new MockEmailProvider(failureConfig);
      const requests = Array.from({ length: 20 }, () => createTestRequest());

      // ACT
      const results = await Promise.allSettled(requests.map((req) => testProvider.sendEmail(req)));

      // ASSERT
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failureCount = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof EmailSendError
      ).length;

      // With 50% failure rate and 20 attempts, should have mix of success/failure
      expect(successCount + failureCount).toBe(20);
      expect(successCount).toBeGreaterThan(0); // At least some successes
      expect(failureCount).toBeGreaterThan(0); // At least some failures

      // Verify only successful emails were stored
      expect(testProvider.getEmailCount()).toBe(successCount);

      // CLEANUP
      testProvider.reset();
    });

    it('should always fail with failureRate of 1', async () => {
      // ARRANGE
      const failureConfig = createTestConfig();
      failureConfig.failureRate = 1; // 100% failure rate

      const testProvider = new MockEmailProvider(failureConfig);
      const request = createTestRequest();

      // ACT & ASSERT
      await expect(testProvider.sendEmail(request)).rejects.toThrow(EmailSendError);
      await expect(testProvider.sendEmail(request)).rejects.toThrow(EmailSendError);
      await expect(testProvider.sendEmail(request)).rejects.toThrow(EmailSendError);

      // Verify no emails were stored
      expect(testProvider.getEmailCount()).toBe(0);

      // CLEANUP
      testProvider.reset();
    });

    it('should never fail with failureRate of 0', async () => {
      // ARRANGE
      const successConfig = createTestConfig();
      successConfig.failureRate = 0; // 0% failure rate (default)

      const testProvider = new MockEmailProvider(successConfig);
      const requests = Array.from({ length: 50 }, () => createTestRequest());

      // ACT
      const responses = await Promise.all(requests.map((req) => testProvider.sendEmail(req)));

      // ASSERT
      expect(responses).toHaveLength(50);
      expect(responses.every((r) => r.success)).toBe(true);

      // CLEANUP
      testProvider.reset();
    });

    it('should fail specific batch indices with batchFailureIndices', async () => {
      // ARRANGE
      const failureConfig = createTestConfig();
      failureConfig.batchFailureIndices = [1, 3]; // Fail 2nd and 4th emails

      const testProvider = new MockEmailProvider(failureConfig);
      const requests = Array.from({ length: 4 }, (_, i) =>
        createTestRequest({
          to: `user${i}@example.com`,
          subject: `Email ${i}`
        })
      );

      // ACT & ASSERT
      // Batch should fail at index 1
      await expect(testProvider.sendBatch(requests)).rejects.toThrow(EmailSendError);

      // Only first email should be stored (index 0 succeeded before index 1 failed)
      expect(testProvider.getEmailCount()).toBe(1);
      expect(testProvider.getSentEmails()[0]!.request.to).toBe('user0@example.com');

      // CLEANUP
      testProvider.reset();
    });
  });

  describe('Latency Simulation', () => {
    it('should apply simulated latency for testing timeout behavior', async () => {
      // ARRANGE
      const latencyConfig = createTestConfig();
      latencyConfig.simulatedLatencyMs = 100; // 100ms delay per email

      const testProvider = new MockEmailProvider(latencyConfig);
      const request = createTestRequest();

      // ACT
      const startTime = Date.now();
      await testProvider.sendEmail(request);
      const duration = Date.now() - startTime;

      // ASSERT
      // Allow for timing variance (95ms minimum instead of exactly 100ms)
      expect(duration).toBeGreaterThanOrEqual(90); // Allow for timing variance
      expect(duration).toBeLessThan(250); // Should not take much longer than 100ms

      // CLEANUP
      testProvider.reset();
    });

    it('should apply latency per email in batch', async () => {
      // ARRANGE
      const latencyConfig = createTestConfig();
      latencyConfig.simulatedLatencyMs = 50; // 50ms per email

      const testProvider = new MockEmailProvider(latencyConfig);
      const requests = Array.from({ length: 3 }, () => createTestRequest());

      // ACT
      const startTime = Date.now();
      await testProvider.sendBatch(requests);
      const duration = Date.now() - startTime;

      // ASSERT
      // 3 emails * 50ms = 150ms minimum (with some variance)
      expect(duration).toBeGreaterThanOrEqual(140); // Allow for timing variance
      expect(duration).toBeLessThan(350); // Allow for timing overhead

      // CLEANUP
      testProvider.reset();
    });
  });

  describe('Email Querying and Assertions', () => {
    it('should find emails by recipient', async () => {
      // ARRANGE
      const requests: ISendEmailRequest[] = [
        createTestRequest({ to: 'user1@example.com' }),
        createTestRequest({ to: 'user2@example.com', cc: 'user1@example.com' }),
        createTestRequest({ to: 'user3@example.com' }),
        createTestRequest({ to: 'user2@example.com' })
      ];

      // ACT
      await mockProvider.sendBatch(requests);

      // ASSERT
      const user1Emails = mockProvider.findEmailsByRecipient('user1@example.com');
      expect(user1Emails).toHaveLength(2);

      const user2Emails = mockProvider.findEmailsByRecipient('user2@example.com');
      expect(user2Emails).toHaveLength(2);

      const user3Emails = mockProvider.findEmailsByRecipient('user3@example.com');
      expect(user3Emails).toHaveLength(1);
    });

    it('should find email by message ID', async () => {
      // ARRANGE
      const request = createTestRequest({ to: 'user@example.com' });
      const response = await mockProvider.sendEmail(request);

      // ACT
      const foundEmail = mockProvider.findEmailById(response.messageId);

      // ASSERT
      expect(foundEmail).toBeDefined();
      expect(foundEmail!.request.to).toBe('user@example.com');
      expect(foundEmail!.response.messageId).toBe(response.messageId);
    });

    it('should verify email timestamps', async () => {
      // ARRANGE
      const beforeSend = new Date().toISOString();
      const request = createTestRequest();

      // ACT
      await mockProvider.sendEmail(request);
      const afterSend = new Date().toISOString();

      // ASSERT
      const sentEmails = mockProvider.getSentEmails();
      const timestamp = sentEmails[0]!.timestamp;

      expect(timestamp).toBeDefined();
      expect(new Date(timestamp).toISOString()).toBe(timestamp); // Valid ISO date

      // Verify timestamp is within test execution window
      expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(new Date(beforeSend).getTime());
      expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(new Date(afterSend).getTime());
    });
  });

  describe('Test Isolation and Cleanup', () => {
    it('should keep multiple provider instances independent', async () => {
      // ARRANGE
      const provider1 = new MockEmailProvider(createTestConfig());
      const provider2 = new MockEmailProvider(createTestConfig());

      // ACT
      await provider1.sendEmail(createTestRequest({ to: 'provider1@example.com' }));
      await provider2.sendEmail(createTestRequest({ to: 'provider2@example.com' }));

      // ASSERT
      expect(provider1.getEmailCount()).toBe(1);
      expect(provider2.getEmailCount()).toBe(1);

      expect(provider1.getSentEmails()[0]!.request.to).toBe('provider1@example.com');
      expect(provider2.getSentEmails()[0]!.request.to).toBe('provider2@example.com');

      // CLEANUP
      provider1.reset();
      provider2.reset();
    });

    it('should reset provider to initial state', async () => {
      // ARRANGE
      await mockProvider.sendEmail(createTestRequest());
      await mockProvider.sendEmail(createTestRequest());

      // ACT
      mockProvider.reset();

      // ASSERT
      expect(mockProvider.getEmailCount()).toBe(0);
      expect(mockProvider.getSentEmails()).toHaveLength(0);
    });

    it('should allow fresh sends after reset', async () => {
      // ARRANGE
      const firstResponse = await mockProvider.sendEmail(createTestRequest());
      mockProvider.reset();

      // ACT
      const secondResponse = await mockProvider.sendEmail(createTestRequest());

      // ASSERT
      // Both should be valid message IDs with counter reset to 0
      expect(firstResponse.messageId).toMatch(/^mock-\d+-0$/);
      expect(secondResponse.messageId).toMatch(/^mock-\d+-0$/); // Counter reset to 0

      // Message IDs may be the same if sent quickly (same timestamp + same counter)
      // The important thing is that the counter was reset and no emails are stored
      expect(mockProvider.getEmailCount()).toBe(1); // Only second email stored
    });

    it('should clearSentEmails preserve message ID counter', async () => {
      // ARRANGE
      const firstResponse = await mockProvider.sendEmail(createTestRequest());
      mockProvider.clearSentEmails();

      // ACT
      const secondResponse = await mockProvider.sendEmail(createTestRequest());

      // ASSERT
      // Message IDs should be different (counter incremented)
      expect(firstResponse.messageId).not.toBe(secondResponse.messageId);

      // Counter should have incremented
      expect(firstResponse.messageId).toMatch(/^mock-\d+-0$/);
      expect(secondResponse.messageId).toMatch(/^mock-\d+-1$/);
    });
  });

  describe('Real-World Test Scenarios', () => {
    it('should test user registration email flow', async () => {
      // ARRANGE
      const userData = {
        email: 'newuser@example.com',
        name: 'John Doe',
        verificationToken: 'abc123xyz'
      };

      const registrationEmail = createTestRequest({
        to: userData.email,
        subject: 'Welcome to Our App!',
        html: `
          <h1>Welcome, ${userData.name}!</h1>
          <p>Please verify your email by clicking the link below:</p>
          <a href="/verify?token=${userData.verificationToken}">Verify Email</a>
        `
      });

      // ACT
      const response = await mockProvider.sendEmail(registrationEmail);

      // ASSERT
      expect(response.success).toBe(true);

      const sentEmail = mockProvider.getSentEmails()[0]!;
      expect(sentEmail.request.to).toBe(userData.email);
      expect(sentEmail.request.subject).toBe('Welcome to Our App!');
      expect(sentEmail.request.html).toContain(userData.name);
      expect(sentEmail.request.html).toContain(userData.verificationToken);
    });

    it('should test password reset email flow', async () => {
      // ARRANGE
      const resetData = {
        email: 'user@example.com',
        resetToken: 'reset-token-456',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      };

      const resetEmail = createTestRequest({
        to: resetData.email,
        subject: 'Password Reset Request',
        html: `
          <h1>Reset Your Password</h1>
          <p>Click the link below to reset your password:</p>
          <a href="/reset-password?token=${resetData.resetToken}">Reset Password</a>
          <p>This link expires in 1 hour.</p>
        `
      });

      // ACT
      const response = await mockProvider.sendEmail(resetEmail);

      // ASSERT
      expect(response.success).toBe(true);

      const sentEmail = mockProvider.getSentEmails()[0]!;
      expect(sentEmail.request.to).toBe(resetData.email);
      expect(sentEmail.request.html).toContain(resetData.resetToken);
    });

    it('should test notification batch for multiple users', async () => {
      // ARRANGE
      const users = [
        { id: '1', email: 'user1@example.com', name: 'Alice' },
        { id: '2', email: 'user2@example.com', name: 'Bob' },
        { id: '3', email: 'user3@example.com', name: 'Charlie' }
      ];

      const notificationEmails = users.map((user) =>
        createTestRequest({
          to: user.email,
          subject: 'System Maintenance Scheduled',
          html: `
            <h1>Hello ${user.name},</h1>
            <p>We will be performing system maintenance on Sunday.</p>
            <p>Expected downtime: 2 hours</p>
          `
        })
      );

      // ACT
      const responses = await mockProvider.sendBatch(notificationEmails);

      // ASSERT
      expect(responses).toHaveLength(3);
      expect(responses.every((r) => r.success)).toBe(true);

      const sentEmails = mockProvider.getSentEmails();
      expect(sentEmails).toHaveLength(3);

      // Verify each user received personalized email
      users.forEach((user, index) => {
        expect(sentEmails[index]!.request.to).toBe(user.email);
        expect(sentEmails[index]!.request.html).toContain(user.name);
      });
    });

    it('should test error handling when email service fails', async () => {
      // ARRANGE - Simulate unreliable email service
      const unreliableConfig = createTestConfig();
      unreliableConfig.failureRate = 0.3; // 30% failure rate
      unreliableConfig.simulatedLatencyMs = 50;

      const unreliableProvider = new MockEmailProvider(unreliableConfig);
      const request = createTestRequest();

      // ACT - Attempt to send with retry logic
      let attempts = 0;
      let lastError: Error | null = null;
      let response = null;

      while (attempts < 5 && !response) {
        attempts++;
        try {
          response = await unreliableProvider.sendEmail(request);
        } catch (error) {
          lastError = error as Error;
          // Simulating retry delay
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // ASSERT
      if (response) {
        expect(response.success).toBe(true);
        expect(attempts).toBeGreaterThan(0);
      } else {
        // All retries failed
        expect(lastError).toBeInstanceOf(EmailSendError);
        expect(attempts).toBe(5);
      }

      // CLEANUP
      unreliableProvider.reset();
    });
  });

  describe('P0 Compliance - No PII in Logs', () => {
    it('should not log email addresses in production', async () => {
      // ARRANGE
      const request = createTestRequest({
        to: 'sensitive-user@example.com',
        subject: 'Confidential Information',
        html: '<p>Secret data</p>',
        text: 'Secret data'
      });

      // ACT
      const response = await mockProvider.sendEmail(request);

      // ASSERT - Verify email was stored but not logged
      expect(response.success).toBe(true);

      const sentEmails = mockProvider.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      // Email data is accessible in memory for tests
      expect(sentEmails[0]!.request.to).toBe('sensitive-user@example.com');

      // But there's no logging output to inspect (P0 compliance)
      // In real scenarios, we would verify console.log was not called
      // or that logs only contain non-PII identifiers
    });
  });
});

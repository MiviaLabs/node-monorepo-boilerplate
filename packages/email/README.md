# @package/email

Enterprise-grade email adapter with multi-provider support (Resend, Twilio, SendGrid, Mock) and NestJS module integration.

## Features

- **Multi-provider support**: Resend, Twilio, SendGrid, Mock
- **Unified interface**: Single API for all providers
- **Type-safe**: Full TypeScript support with interfaces
- **Extensible**: Easy to add new providers
- **Configuration**: Environment-based provider selection
- **Testing**: Mock provider for unit tests

## Installation

```bash
pnpm add @package/email
```

## Local Development with MockEmailProvider

The `MockEmailProvider` is designed for testing email functionality without making real API calls. It stores all sent emails in memory for test inspection and supports failure simulation.

### Basic Test Setup

```typescript
import { MockEmailProvider, EmailProviderType } from '@package/email';

describe('My Email Tests', () => {
  let mockProvider: MockEmailProvider;

  beforeEach(() => {
    // Create a fresh mock provider for each test
    mockProvider = new MockEmailProvider({
      type: EmailProviderType.MOCK,
      defaultFromEmail: 'test@example.com'
    });
  });

  afterEach(() => {
    // Clean up after each test
    mockProvider.reset();
  });

  it('should send email successfully', async () => {
    const response = await mockProvider.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>'
    });

    expect(response.success).toBe(true);
  });
});
```

### Inspecting Sent Emails

```typescript
import { MockEmailProvider, EmailProviderType, type IStoredEmail } from '@package/email';

async function testWelcomeEmail() {
  const mockProvider = new MockEmailProvider({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com'
  });

  // Send email
  await mockProvider.sendEmail({
    to: 'newuser@example.com',
    subject: 'Welcome!',
    html: '<h1>Welcome!</h1>'
  });

  // Get all sent emails
  const sentEmails: IStoredEmail[] = mockProvider.getSentEmails();
  expect(sentEmails).toHaveLength(1);

  // Access request and response
  const { request, response, timestamp } = sentEmails[0]!;
  expect(request.to).toBe('newuser@example.com');
  expect(response.messageId).toMatch(/^mock-\d+-\d+$/);

  // Clean up
  mockProvider.reset();
}
```

### Finding Specific Emails

```typescript
import { MockEmailProvider, EmailProviderType } from '@package/email';

async function testUserNotifications() {
  const mockProvider = new MockEmailProvider({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com'
  });

  // Send emails to multiple users
  await mockProvider.sendBatch([
    { to: 'user1@example.com', subject: 'Notification 1', html: '<p>Test</p>' },
    { to: 'user2@example.com', subject: 'Notification 2', html: '<p>Test</p>' },
    { to: 'user1@example.com', subject: 'Notification 3', html: '<p>Test</p>' }
  ]);

  // Find all emails sent to a specific recipient
  const user1Emails = mockProvider.findEmailsByRecipient('user1@example.com');
  expect(user1Emails).toHaveLength(2);

  // Find email by message ID
  const response = await mockProvider.sendEmail({
    to: 'user@example.com',
    subject: 'Test',
    html: '<p>Test</p>'
  });

  const email = mockProvider.findEmailById(response.messageId);
  expect(email).toBeDefined();
  expect(email!.request.to).toBe('user@example.com');

  mockProvider.reset();
}
```

### Failure Simulation

Test error handling and retry logic with configurable failure rates:

```typescript
import { MockEmailProvider, EmailProviderType } from '@package/email';

async function testFailureScenarios() {
  // 50% failure rate
  const unreliableProvider = new MockEmailProvider({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com',
    failureRate: 0.5
  });

  const results = await Promise.allSettled([
    unreliableProvider.sendEmail({ to: 'user1@example.com', subject: 'Test', html: '<p>Test</p>' }),
    unreliableProvider.sendEmail({ to: 'user2@example.com', subject: 'Test', html: '<p>Test</p>' }),
    unreliableProvider.sendEmail({ to: 'user3@example.com', subject: 'Test', html: '<p>Test</p>' })
  ]);

  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failureCount = results.filter((r) => r.status === 'rejected').length;

  console.log(`Success: ${successCount}, Failures: ${failureCount}`);

  // Only successful emails are stored
  expect(unreliableProvider.getEmailCount()).toBe(successCount);

  unreliableProvider.reset();
}
```

### Batch Failure Simulation

Test partial batch failures by specifying which indices should fail:

```typescript
import { MockEmailProvider, EmailProviderType } from '@package/email';

async function testPartialBatchFailure() {
  const provider = new MockEmailProvider({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com',
    batchFailureIndices: [1, 3] // Fail 2nd and 4th emails
  });

  const requests = [
    { to: 'user1@example.com', subject: 'Email 1', html: '<p>Test</p>' },
    { to: 'user2@example.com', subject: 'Email 2', html: '<p>Test</p>' },
    { to: 'user3@example.com', subject: 'Email 3', html: '<p>Test</p>' },
    { to: 'user4@example.com', subject: 'Email 4', html: '<p>Test</p>' }
  ];

  // Should fail at index 1 (2nd email)
  await expect(provider.sendBatch(requests)).rejects.toThrow();

  // Only first email succeeded
  expect(provider.getEmailCount()).toBe(1);

  provider.reset();
}
```

### Latency Simulation

Test timeout behavior and async operations:

```typescript
import { MockEmailProvider, EmailProviderType } from '@package/email';

async function testTimeoutBehavior() {
  const slowProvider = new MockEmailProvider({
    type: EmailProviderType.MOCK,
    defaultFromEmail: 'test@example.com',
    simulatedLatencyMs: 100 // 100ms delay per email
  });

  const startTime = Date.now();
  await slowProvider.sendEmail({
    to: 'user@example.com',
    subject: 'Test',
    html: '<p>Test</p>'
  });
  const duration = Date.now() - startTime;

  expect(duration).toBeGreaterThanOrEqual(100);

  slowProvider.reset();
}
```

### Test Utilities

| Method                             | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `getSentEmails()`                  | Returns copy of all stored emails                                  |
| `clearSentEmails()`                | Clears all stored emails (keeps message ID counter)                |
| `reset()`                          | Complete reset (clears emails, resets counter, resets batch index) |
| `findEmailsByRecipient(recipient)` | Find emails sent to specific recipient (searches to, cc, bcc)      |
| `findEmailById(messageId)`         | Find email by message ID                                           |
| `getEmailCount()`                  | Get count of stored emails                                         |

### Configuration Options

```typescript
interface IMockProviderConfig extends IBaseEmailProviderConfig {
  type: EmailProviderType.MOCK;

  /**
   * Failure rate (0-1) for simulating send failures.
   * 0 = never fail, 0.5 = 50% failure rate, 1 = always fail.
   * @defaultValue 0
   */
  failureRate?: number;

  /**
   * Simulated latency in milliseconds before response.
   * Useful for testing timeout behavior.
   * @defaultValue 0
   */
  simulatedLatencyMs?: number;

  /**
   * Array of batch indices to fail (0-indexed).
   * Used to test partial batch failure scenarios.
   * @defaultValue []
   */
  batchFailureIndices?: number[];
}
```

## Usage

### Configuration

Set environment variables:

```bash
# Choose provider
EMAIL_PROVIDER=resend  # or twilio, sendgrid, mock

# Default sender (all providers)
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
DEFAULT_FROM_NAME=Your App

# Resend
RESEND_API_KEY=your-resend-api-key

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key
```

### Basic Usage

```typescript
import {
  resolveEmailProviderConfig,
  ResendAdapter,
  type ISendEmailRequest
} from '@package/email';

// Resolve configuration from environment
const config = resolveEmailProviderConfig();

// Initialize provider and send email
const provider = new ResendAdapter(config);

const request: ISendEmailRequest = {
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our app!</h1>',
  text: 'Welcome to our app!'
};

const response = await provider.sendEmail(request);
console.log('Sent email ID:', response.messageId);
```

## Interfaces

### IEmailProvider

Core email provider interface that all providers implement:

```typescript
interface IEmailProvider {
  readonly name: string;
  sendEmail(request: ISendEmailRequest): Promise<ISendEmailResponse>;
  sendBatch(requests: ISendEmailRequest[]): Promise<ISendEmailResponse[]>;
  healthCheck(): Promise<boolean>;
}
```

### ISendEmailRequest

Email send request structure:

```typescript
interface ISendEmailRequest {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: IEmailAttachment[];
  headers?: Record<string, string>;
  tags?: string[];
}
```

## Configuration

### EmailProviderType

```typescript
enum EmailProviderType {
  RESEND = 'resend',
  TWILIO = 'twilio',
  SENDGRID = 'sendgrid',
  MOCK = 'mock'
}
```

### Provider Configs

- `IResendProviderConfig`: Resend configuration with API key
- `ITwilioProviderConfig`: Twilio configuration with Account SID and Auth Token
- `ISendGridProviderConfig`: SendGrid configuration with API key
- `IMockProviderConfig`: Mock provider for testing

## Error Handling

- `EmailError`: Base error class
- `EmailSendError`: Email send operation failed
- `EmailConfigurationError`: Invalid configuration
- `EmailProviderHealthCheckError`: Health check failed

## Constants

- `DEFAULT_EMAIL_TIMEOUT_MS`: 30 seconds
- `MAX_BATCH_SIZE`: 100 emails per batch
- `MAX_SUBJECT_LENGTH`: 998 characters
- `MAX_RECIPIENTS_PER_EMAIL`: 50 recipients
- `MAX_ATTACHMENT_SIZE_BYTES`: 10 MB

## Architecture & Supported Features

### Core Infrastructure

- Package structure and robust build pipeline
- Core interfaces (`IEmailProvider`, `ISendEmailRequest`, `ISendEmailResponse`, `IEmailAttachment`)
- Dynamic configuration interfaces and environment resolvers
- Strongly typed error hierarchy (`EmailError`, `EmailSendError`, `EmailConfigurationError`, `EmailProviderHealthCheckError`)
- `BaseEmailProvider` with built-in OpenTelemetry tracing and metric instrumentation
  - Distributed tracing with span wrapping across send operations
  - Production sanitization preventing PII leakage in traces and logs
  - Parameter validation for recipients, subject line lengths, and attachment sizes
  - Template method pattern for consistent provider lifecycle management

### Resend Integration

- Full Resend SDK integration via `ResendAdapter`
- High-throughput single and batch email dispatching
- Health check verification via API key validation
- Rate limit mitigation (HTTP 429) parsing `retry-after` metadata
- Dynamic attachment conversion supporting Buffer and base64 payloads
- Standardized sender string formatting (`"Name <email>"`)

### NestJS Module Integration

- `EmailModule.forRoot()` and `EmailModule.forRootAsync()` dynamic module initialization
- Injectable `EmailService` handling provider delegation and application logic
- Configurable dependency injection with `EMAIL_MODULE_OPTIONS` and `EMAIL_PROVIDER` tokens
- Graceful shutdown lifecycle management via NestJS `OnModuleDestroy` hook

## Associated Packages

- `@package/core`: Base error types
- `@package/observability`: OpenTelemetry tracing and observability integration

## Documentation References

| **Document**  | **Path**                               |
| ------------- | -------------------------------------- |
| Package Index | [../../README.md](../../README.md)     |
| Core Package  | [../core/README.md](../core/README.md) |

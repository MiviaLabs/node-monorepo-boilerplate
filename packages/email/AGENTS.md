# @package/email

Enterprise email adapter with multi-provider support (Resend, Twilio, SendGrid, Mock) and NestJS module integration.

## Purpose

This package provides a unified email sending interface supporting multiple providers (Resend, Twilio SendGrid, SendGrid) with batch operations, attachment support, configurable provider selection, and NestJS DI integration. Built for enterprise applications requiring reliable email delivery with provider abstraction.

## Structure

```text
src/
├── config/                      # Configuration resolution
│   ├── interfaces.ts            # Configuration type definitions
│   ├── defaults.ts              # Default configuration values
│   └── config-resolver.ts       # Environment-based config resolution
├── providers/                   # Email provider implementations
│   ├── email-provider.interface.ts  # IEmailProvider interface
│   ├── base-email-provider.ts       # Abstract base class with telemetry
│   ├── resend-provider.ts           # Resend provider implementation
│   └── __tests__/                   # Provider unit tests
│       ├── base-email-provider.test.ts
│       ├── resend-provider.test.ts
│       └── test-email-provider.ts
├── email/                       # NestJS module integration
│   ├── email.module.ts          # Dynamic module with forRoot/forRootAsync
│   ├── email.service.ts         # Injectable service wrapper
│   ├── email.constants.ts       # DI tokens (EMAIL_MODULE_OPTIONS, EMAIL_PROVIDER)
│   ├── interfaces.ts            # Module configuration interfaces
│   └── __tests__/              # NestJS module tests
│       ├── email.service.spec.ts
│       └── email.module.spec.ts
├── __tests__/                   # Unit tests
│   └── config-resolver.test.ts  # Configuration resolver tests
├── constants.ts                 # Email module constants
├── errors.ts                    # Typed error classes
└── index.ts                     # Public exports
```

## NestJS Integration

### Module Registration

```typescript
import { EmailModule, EmailProviderType } from '@package/email';

// Synchronous configuration
@Module({
  imports: [
    EmailModule.forRoot({
      global: true,
      provider: {
        type: EmailProviderType.RESEND,
        apiKey: 're_123456789',
        defaultFromEmail: 'noreply@example.com'
      }
    })
  ]
})
export class AppModule {}

// Asynchronous configuration (recommended)
@Module({
  imports: [
    EmailModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        global: true,
        provider: {
          type: config.get<EmailProviderType>('EMAIL_PROVIDER'),
          apiKey: config.get<string>('RESEND_API_KEY'),
          defaultFromEmail: config.get<string>('DEFAULT_FROM_EMAIL')
        }
      }),
      inject: [ConfigService]
    })
  ]
})
export class AppModule {}
```

### Using EmailService

```typescript
import { Injectable } from '@nestjs/common';
import { EmailService } from '@package/email';

@Injectable()
export class UserService {
  constructor(private readonly emailService: EmailService) {}

  async sendWelcomeEmail(email: string, name: string) {
    await this.emailService.sendEmail({
      to: email,
      subject: 'Welcome!',
      html: `<h1>Welcome ${name}</h1>`,
      from: 'noreply@example.com'
    });
  }
}
```

## Usage

```typescript
import {
  resolveEmailProviderConfig,
  resolveEmailConfig,
  EmailProviderType,
  type ISendEmailRequest,
  type IEmailProvider
} from '@package/email';

// Resolve configuration from environment
const config = resolveEmailProviderConfig();
console.log(`Using provider: ${config.type}`);

// Full module configuration
const moduleConfig = resolveEmailConfig();

// Email request structure
const request: ISendEmailRequest = {
  to: 'user@example.com',
  subject: 'Welcome to our app',
  html: '<h1>Welcome!</h1>',
  text: 'Welcome!',
  from: 'noreply@example.com',
  attachments: [
    {
      filename: 'welcome.pdf',
      content: Buffer.from('...'),
      contentType: 'application/pdf'
    }
  ]
};
```

## Key Exports

### Core Interfaces

- `IEmailProvider` - Email provider interface (sendEmail, sendBatch, healthCheck)
- `BaseEmailProvider` - Abstract base class with OpenTelemetry tracing, validation, and P0-compliant sanitization
- `ResendAdapter` - Resend email provider implementation
- `ISendEmailRequest` - Email send request structure
- `ISendEmailResponse` - Email send response with message ID
- `IEmailAttachment` - Email attachment data structure

### Configuration

- `EmailProviderType` - Provider type enum (RESEND, TWILIO, SENDGRID, MOCK)
- `EmailProviderConfig` - Union type for all provider configurations
- `IEmailModuleConfig` - Email module configuration options
- `IResendProviderConfig` - Resend provider configuration
- `ITwilioProviderConfig` - Twilio provider configuration
- `ISendGridProviderConfig` - SendGrid provider configuration
- `IMockProviderConfig` - Mock provider for local development

### Configuration Resolvers

- `resolveEmailProviderConfig()` - Resolve provider config from environment
- `resolveEmailConfig()` - Resolve full module config from environment

### Error Types

- `EmailError` - Base error class
- `EmailSendError` - Email send operation failed
- `EmailConfigurationError` - Invalid configuration
- `EmailProviderHealthCheckError` - Health check failed

### Constants

- `DEFAULT_EMAIL_TIMEOUT_MS` - Default timeout (30 seconds)
- `MAX_BATCH_SIZE` - Maximum batch size (100 emails)
- `MAX_SUBJECT_LENGTH` - Maximum subject length (998 characters)
- `MAX_RECIPIENTS_PER_EMAIL` - Maximum recipients (50)
- `MAX_ATTACHMENT_SIZE_BYTES` - Maximum attachment size (10 MB)
- `EMAIL_MODULE_OPTIONS` - Module options injection token
- `EMAIL_PROVIDER` - Provider injection token

## Environment Variables

```bash
# Provider selection
EMAIL_PROVIDER=resend  # resend | twilio | sendgrid | mock

# Default sender (all providers)
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
DEFAULT_FROM_NAME=Your App Name

# Resend (if EMAIL_PROVIDER=resend)
RESEND_API_KEY=your-resend-api-key

# Twilio (if EMAIL_PROVIDER=twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_EMAIL_SERVICE_SID=your-twilio-email-service-sid  # optional

# SendGrid (if EMAIL_PROVIDER=sendgrid)
SENDGRID_API_KEY=your-sendgrid-api-key
```

## Dependencies

- `@package/core` - Base error types (BaseError)
- `@package/observability` - OpenTelemetry tracing and metrics instrumentation

## Core Capabilities

### Core Infrastructure

- Package structure and build configuration
- Core interfaces (`IEmailProvider`, `ISendEmailRequest`, `ISendEmailResponse`)
- Configuration interfaces and environment resolver
- Typed error classes and constants
- `BaseEmailProvider` with OpenTelemetry tracing
  - OpenTelemetry metrics (counters + histograms)
  - Distributed tracing with span wrapping
  - P0-compliant email sanitization (no PII in logs/traces)
  - Request validation (recipients, subject, attachments)
  - Template method pattern for provider implementations

### Resend Provider

- Resend SDK integration
- `ResendAdapter` class extending `BaseEmailProvider`
- `sendEmail()` implementation with format conversion
- `sendBatch()` implementation with concurrent processing
- `healthCheck()` implementation via `apiKeys.list()`
- Rate limit error handling (429) with retry-after extraction
- Attachment conversion (Buffer/base64 to Resend format)
- Sender address formatting (`"Name <email>"`)

### NestJS Module

- `EmailModule.forRoot()` / `forRootAsync()` dynamic registration
- `EmailService` with dependency injection support
- Provider factory pattern
- Graceful shutdown support (`OnModuleDestroy` lifecycle hook)
- Unit tests for `EmailService` and `EmailModule`
- Integration patterns for NestJS application modules
- Exported module types and tokens

### Mock Provider & Extensibility

- `MockEmailProvider` for local development without external API calls
- Failure simulation, latency injection, and in-memory inspection
- Unified `IEmailProvider` contract for additional provider adapters (Twilio SendGrid, SendGrid)

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

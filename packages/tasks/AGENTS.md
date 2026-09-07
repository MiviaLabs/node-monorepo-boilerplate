# @package/tasks

Google Cloud Tasks integration with OpenTelemetry tracing and mock providers for local development.

## Purpose

This package provides a unified interface for creating and managing Google Cloud Tasks queues and tasks. It includes enterprise features such as built-in OpenTelemetry tracing for observability, type-safe error handling, and an in-memory mock provider for fast, isolated testing without network calls.

## Structure

```text
src/
├── config/
│   ├── config-resolver.ts  # Environment variable resolution
│   ├── defaults.ts         # Default configuration values
│   └── interfaces.ts       # Configuration interfaces and enums
├── providers/
│   ├── cloud-tasks.provider.ts  # Production Cloud Tasks client
│   ├── mock-provider.ts         # In-memory mock for local development
│   ├── provider-factory.ts      # Factory functions
│   └── google-tasks.types.ts    # Internal Google API types
├── errors.ts               # Type-safe error classes
└── index.ts
```

## Usage

```typescript
import {
  createCloudTasksProvider,
  createMockCloudTasksProvider,
  HttpMethod,
  QueueState
} from '@package/tasks';

// Production: Auto-configure from environment variables
const provider = createCloudTasksProvider();

// Production: Explicit configuration
const provider = createCloudTasksProvider({
  projectId: 'my-project',
  location: 'us-central1',
  credentials: { keyFile: '/path/to/service-account.json' },
  enableTracing: true
});

// Testing: Mock provider with no network calls
const mockProvider = createMockCloudTasksProvider(
  { projectId: 'test-project', location: 'us-central1' },
  { delayMs: 0 }
);

// Create a queue
await provider.createQueue('email-queue', {
  state: QueueState.RUNNING,
  rateLimits: { maxRequestsPerSecond: 100 }
});

// Create an HTTP task
await provider.createHttpTask('email-queue', {
  url: 'https://api.example.com/send-email',
  httpMethod: HttpMethod.POST,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: 'user@example.com' })
});
```

## Key Exports

### Providers

- `CloudTasksProvider` - Production Google Cloud Tasks client
- `MockCloudTasksProvider` - In-memory provider for local development
- `createCloudTasksProvider` - Factory for production provider
- `createMockCloudTasksProvider` - Factory for mock provider

### Configuration

- `CloudTasksConfig` - Provider configuration interface
- `HttpTargetOptions` - HTTP task target configuration
- `AppEngineHttpTargetOptions` - App Engine task target configuration
- `TaskOptions` - Task creation options
- `QueueOptions` - Queue creation options
- `RetryConfig` - Retry configuration
- `RateLimits` - Queue rate limiting
- `HttpMethod` - HTTP method enum (GET, POST, PUT, DELETE, etc.)
- `QueueState` - Queue state enum (RUNNING, PAUSED, DISABLED)

### Errors

- `CloudTasksError` - Base error class
- `QueueNotFoundError` - Queue does not exist
- `QueueAlreadyExistsError` - Queue already exists
- `TaskCreationFailedError` - Task creation failed
- `TaskNotFoundError` - Task not found
- `InvalidTaskConfigError` - Invalid configuration
- `AuthenticationFailedError` - Authentication failed
- `PermissionDeniedError` - IAM permission denied
- `RateLimitExceededError` - API rate limit exceeded

## Associated Packages

- `@package/observability` - OpenTelemetry tracing integration
- `@package/errors` - Type-safe error handling

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

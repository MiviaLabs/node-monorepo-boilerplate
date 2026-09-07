# @package/pubsub

Production-grade Google Cloud Pub/Sub messaging integration providing reliable topic and subscription management, ordered message publishing, pull subscribers, dead-letter queuing, and OpenTelemetry instrumentation.

## Purpose

This package delivers an enterprise-ready messaging layer for Google Cloud Pub/Sub. It includes resilient connection management, circuit breakers, Dead Letter Queue (DLQ) workflows, automatic reconnection policies, and an in-memory mock provider for rapid, offline testing.

## Structure

```text
src/
├── config/                  # Configuration management
│   ├── interfaces.ts        # IPubSubConfig, ISubscriptionOptions, ITopicOptions
│   ├── defaults.ts          # Default configuration values
│   └── config-resolver.ts   # Environment variable resolution
├── providers/               # Pub/Sub provider implementations
│   ├── pubsub.provider.ts   # GCP Pub/Sub provider with circuit breaker
│   ├── mock-provider.ts     # In-memory mock for local development
│   └── provider-factory.ts  # Factory functions for provider creation
├── errors.ts                # Comprehensive error hierarchy
└── index.ts
```

## Usage

```typescript
import { createPubSubProvider, createMockPubSubProvider } from '@package/pubsub';
import type { IPubSubConfig, ISubscriptionOptions } from '@package/pubsub';

// Production: Uses environment variables or explicit config
const provider = createPubSubProvider({
  projectId: 'my-project',
  credentials: { keyFile: '/path/to/key.json' },
  enableTracing: true
});

// Create topic and subscription
await provider.createTopic('orders');
await provider.createSubscription('order-processor', 'orders', {
  ackDeadlineSeconds: 30,
  deadLetterPolicy: {
    deadLetterTopic: 'orders-dlq',
    maxDeliveryAttempts: 5
  }
});

// Publish messages
await provider.publish('orders', { type: 'order.created', orderId: '12345' });

// Subscribe to messages
await provider.subscribe('order-processor', async (message) => {
  const data = JSON.parse(message.data.toString());
  await processOrder(data);
  await message.ack();
});

// Testing: Use mock provider
const mockProvider = createMockPubSubProvider();
await mockProvider.createTopic('test-topic');
await mockProvider.publish('test-topic', { test: 'data' });
expect(mockProvider.getMessageCount('test-topic')).toBe(1);
```

## Key Exports

### Configuration

- `IPubSubConfig` - Main configuration interface
- `ISubscriptionOptions` - Subscription creation options
- `ITopicOptions` - Topic creation options
- `IDeadLetterPolicy` - Dead Letter Queue configuration
- `IRetryPolicy` - Message retry backoff settings
- `resolveConfig` - Resolve config from environment variables

### Providers

- `createPubSubProvider` - Factory for production or mock provider
- `createMockPubSubProvider` - Factory specifically for test provider
- `PubSubProvider` - GCP Pub/Sub provider class
- `MockPubSubProvider` - In-memory mock provider class
- `PubSubProviderType` - Enum for provider type identification

### Types

- `ITopicInfo` - Topic metadata returned by operations
- `ISubscriptionInfo` - Subscription metadata returned by operations
- `IReceivedMessage` - Message structure in subscription handlers
- `MessageData` - Message payload type (Buffer, string, or object)

### Errors

- `PubSubError` - Base error class for all Pub/Sub errors
- `PubSubErrorCode` - Enum of all error codes
- `TopicNotFoundError` - Topic does not exist
- `TopicAlreadyExistsError` - Topic naming conflict
- `SubscriptionNotFoundError` - Subscription does not exist
- `SubscriptionAlreadyExistsError` - Subscription naming conflict
- `PublishFailedError` - Message publishing failed
- `SubscribeFailedError` - Subscription attachment failed
- `MessageAckFailedError` - Message acknowledgment failed
- `MessageNackFailedError` - Message nack failed
- `AuthenticationFailedError` - GCP credential issues
- `PermissionDeniedError` - IAM permission issues
- `DeadLetterQueueFailedError` - DLQ configuration issues
- `InvalidPubSubConfigError` - Invalid configuration

## Environment Variables

| **Variable** | **Description** |
| `PUBSUB_PROJECT_ID` | GCP project ID |
| `PUBSUB_KEY_FILE` | Path to service account JSON key |
| `PUBSUB_CLIENT_EMAIL` | Service account email (alternative to key file) |
| `PUBSUB_PRIVATE_KEY` | Service account private key (alternative to key file) |
| `PUBSUB_TEST_MODE` | Enable mock provider for local development |

## Associated Packages

- `@package/observability` - Distributed tracing integration
- `@package/core` - Error handling utilities (InfrastructureError)
- `@package/queues` - BullMQ queue adapter (alternative to Pub/Sub)
- `@package/events` - Event bus integration

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

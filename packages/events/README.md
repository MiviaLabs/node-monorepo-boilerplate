# @package/events

Production-ready Kafka event bus for event-driven architecture in the Node Monorepo Boilerplate.

## Overview

`@package/events` provides a type-safe, well-abstracted Kafka client wrapper for implementing event-driven architecture. It includes event bus, message handlers, NestJS integration, retry logic, dead-letter queue support, and OpenTelemetry tracing.

## Features

- **Event Bus** - High-level API for publishing and subscribing to events
- **Flexible Event Routing** - Route events to multiple destinations (Kafka, Pub/Sub, Queues) simultaneously
- **Message Handlers** - Type-safe event handling with configurable retry logic
- **Dead-Letter Queue** - Automatic DLQ support for failed messages
- **NestJS Integration** - First-class NestJS module with decorator-based handler registration
- **OpenTelemetry Tracing** - Built-in distributed tracing for all operations
- **CQRS Compliance** - Events follow CQRS patterns from `@package/types`
- **Idempotent Processing** - Safe event handling with at-least-once delivery semantics
- **Graceful Shutdown** - Clean resource cleanup on application termination
- **Health Checks** - Built-in Kafka connectivity monitoring
- **Configuration Validation** - Zod-validated environment variables and config
- **Structured Logging** - Consistent logging format with metadata

## Installation

```bash
pnpm install @package/events
```

Peer dependencies:

```bash
pnpm install @nestjs/common@^11.0.0 @opentelemetry/api@^1.9.0
```

## Documentation

### Package Documentation

- [Overview](../../apps/api/docs/events/overview.md) - High-level architecture and concepts
- [Getting Started](../../apps/api/docs/events/README.md) - Event documentation index
- [Configuration](../../apps/api/docs/events/README.md) - Runtime concepts and setup guidance
- [Event Bus](../../apps/api/docs/events/publishing-events.md) - Event publishing and subscribing
- [Handlers](../../apps/api/docs/events/creating-consumers.md) - Creating event handlers
- [Testing](../../apps/api/docs/events/testing-events.md) - Testing strategies
- [Kafka Patterns](../../apps/api/docs/events/creating-consumers.md) - Consumer patterns and delivery concerns
- [Diagrams](../../apps/api/docs/events/README.md) - Architecture diagrams and flow overview

### Transaction & Outbox Pattern

- [Transactions](../../apps/api/docs/events/transactions.md) - Transaction patterns for events
- [Monitoring](../../apps/api/docs/events/dead-letter.md) - Monitoring failed deliveries and retries
- [Troubleshooting](../../apps/api/docs/events/dead-letter.md) - Common issues and solutions

### API-Specific Documentation

- [Events Overview](../../apps/api/docs/events/overview.md) - Event-driven architecture in the API
- [Publishing Events](../../apps/api/docs/events/publishing-events.md) - How to publish events
- [Outbox Pattern](../../apps/api/docs/events/outbox-pattern.md) - Outbox pattern deep dive
- [Transactions](../../apps/api/docs/events/transactions.md) - Database transactions with events
- [Creating Consumers](../../apps/api/docs/events/creating-consumers.md) - How to create event consumers
- [Event Schemas](../../apps/api/docs/events/event-schemas.md) - Design event payloads
- [Testing Events](../../apps/api/docs/events/testing-events.md) - Test event-driven code

## Quick Start

### 1. Start Kafka Locally

```bash
cd packages/events
docker-compose up -d
```

### 2. Configure Environment

```bash
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=my-service
```

### 3. Publish Events

```typescript
import { eventBus } from '@package/events';

await eventBus.publish('user.created', {
  userId: 'user-123',
  email: 'user@example.com',
  name: 'John Doe'
});
```

### 4. Handle Events

```typescript
import { EventHandler, EventMessage } from '@package/events';

@Injectable()
export class UsersEventHandler {
  @EventHandler('user.created')
  async handleUserCreated(event: EventMessage<UserCreatedData>) {
    await this.emailService.sendWelcome(event.data.email);
  }
}
```

## NestJS Integration

```typescript
import { Module } from '@nestjs/common';
import { EventsModule } from '@package/events';

@Module({
  imports: [
    EventsModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        kafka: {
          brokers: config.get('KAFKA_BROKERS').split(','),
          clientId: config.get('KAFKA_CLIENT_ID'),
          ssl: config.get('KAFKA_SSL') === 'true',
          sasl: config.get('KAFKA_SASL_MECHANISM')
            ? {
                mechanism: config.get('KAFKA_SASL_MECHANISM'),
                username: config.get('KAFKA_SASL_USERNAME'),
                password: config.get('KAFKA_SASL_PASSWORD')
              }
            : undefined
        }
      })
    })
  ]
})
export class AppModule {}
```

## Flexible Event Routing

The event routing system allows you to publish events to multiple destinations simultaneously. Instead of being limited to Kafka, you can route events to Google Cloud Pub/Sub, job queues, or any combination of destinations.

### How It Works

When event routing is enabled, the `EventBus` uses an `EventRouter` to determine where each event type should be published. Events can be routed to:

- **Kafka** - Your primary event streaming platform
- **Google Cloud Pub/Sub** - For cloud-native event streaming
- **Job Queues** - For asynchronous background processing

### Configuration

#### Environment-Based (Recommended for Simple Configs)

Set a single JSON configuration via environment variable:

```bash
EVENT_ROUTING_ENABLED=true
EVENT_ROUTING_CONFIG='{"user.created":["kafka","pubsub"],"order.completed":["queue"],"analytics.track":["pubsub"]}'
```

#### File-Based (Recommended for Complex Configs)

For more complex routing, use a JSON configuration file:

```bash
EVENT_ROUTING_ENABLED=true
EVENT_ROUTING_CONFIG_PATH=./config/event-routing.json
```

**config/event-routing.json:**

```json
{
  "user.created": ["kafka", "pubsub"],
  "order.completed": ["kafka", "queue"],
  "analytics.track": ["pubsub"],
  "email.send": ["queue"]
}
```

#### Code-Based (Maximum Flexibility)

Configure routing programmatically in your module:

```typescript
import { EventsModule, DestinationType } from '@package/events';

@Module({
  imports: [
    EventsModule.forRoot({
      kafka: {
        brokers: ['localhost:9092'],
        clientId: 'my-service'
      },
      routing: {
        enabled: true,
        defaultStrategy: 'all',
        defaultFailurePolicy: 'continue',
        routes: [
          {
            eventType: 'user.created',
            destinations: [{ type: DestinationType.KAFKA }, { type: DestinationType.PUBSUB }]
          },
          {
            eventType: 'email.send',
            destinations: [{ type: DestinationType.QUEUE }]
          }
        ]
      }
    })
  ]
})
export class AppModule {}
```

### Routing Strategies

- **`all`** (default) - All destinations must succeed for the event to be considered successfully published
- **`any`** - At least one destination must succeed
- **`ordered`** - Destinations are tried in priority order until one succeeds

### Failure Policies

- **`continue`** (default) - Continue with other destinations if one fails
- **`stop`** - Stop routing immediately on first failure
- **`fallback`** - Use fallback destination on failure

### Usage Examples

**Example 1: Send user events to both Kafka and Pub/Sub**

```typescript
await eventBus.publish('user.created', {
  userId: '123',
  email: 'user@example.com'
});
// → Published to Kafka AND Pub/Sub
```

**Example 2: Send high-priority events to queues only**

```typescript
await eventBus.publish('email.send', {
  to: 'user@example.com',
  template: 'welcome'
});
// → Published to Queue only (for background processing)
```

**Example 3: Analytics events to Pub/Sub only**

```typescript
await eventBus.publish('analytics.track', {
  event: 'page_view',
  userId: '123',
  page: '/home'
});
// → Published to Pub/Sub only (no Kafka)
```

## Configuration

### Environment Variables

```bash
# Required
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=my-service

# Optional - Event Publishing
EVENTS_ENABLED=true                                          # Enable/disable event publishing globally
EVENTS_TYPE_VALIDATION_ENABLED=true                          # Enable event type format validation

# Optional - Event Routing (NEW)
EVENT_ROUTING_ENABLED=false                                  # Enable flexible event routing
EVENT_ROUTING_CONFIG='{}'                                    # JSON routing config (env-based)
EVENT_ROUTING_CONFIG_PATH=./config/event-routing.json        # Path to routing config file

# Optional - Kafka Connection
KAFKA_SSL=false
KAFKA_SASL_MECHANISM=scram-sha-256
KAFKA_SASL_USERNAME=user
KAFKA_SASL_PASSWORD=pass
KAFKA_CONNECTION_TIMEOUT=10000
KAFKA_REQUEST_TIMEOUT=30000
KAFKA_RETRY_INTERVAL=5000
KAFKA_MAX_RETRIES=5

# Optional - Circuit Breaker
EVENTS_CIRCUIT_BREAKER_ENABLED=true                         # Enable circuit breaker for Kafka connections
EVENTS_CIRCUIT_BREAKER_THRESHOLD=5                          # Number of failures before opening circuit
EVENTS_CIRCUIT_BREAKER_TIMEOUT_MS=60000                      # Time in ms before attempting to close circuit

# Optional - Integration Bridges
INTEGRATION_QUEUES_ENABLED=false                            # Bridge events to queues
INTEGRATION_PUBSUB_ENABLED=false                            # Bridge events to pubsub
INTEGRATION_TASKS_ENABLED=false                             # Bridge events to tasks

# Optional - Outbox Poller
OUTBOX_ENABLED=true                                         # Enable outbox poller
OUTBOX_POLL_INTERVAL=1000                                   # Poll interval in milliseconds
OUTBOX_BATCH_SIZE=10                                        # Number of events to process per batch
OUTBOX_MAX_RETRIES=5                                        # Maximum retry attempts for failed events
OUTBOX_CONNECTION_RETRY_MAX=3                               # Max retries for Kafka connection verification
OUTBOX_CONNECTION_RETRY_DELAY_MS=2000                       # Delay between connection retry attempts
```

### Programmatic Configuration

```typescript
import { setKafkaConfig } from '@package/events';

setKafkaConfig({
  brokers: ['localhost:9092', 'localhost:9093'],
  clientId: 'my-service',
  ssl: true,
  sasl: {
    mechanism: 'scram-sha-256',
    username: 'user',
    password: 'pass'
  },
  connectionTimeout: 15000,
  requestTimeout: 45000
});
```

## API Reference

### EventBus

```typescript
class EventBus {
  publish<T>(eventType: string, data: T, options?: PublishOptions): Promise<void>;
  publishBatch<T>(
    events: Array<{ eventType: string; data: T; options?: PublishOptions }>
  ): Promise<void>;
  subscribe(
    topic: string,
    handler: (message: EventMessage) => void | Promise<void>,
    options?: SubscribeOptions
  ): Promise<ConsumerSubscription>;
}

interface PublishOptions {
  topic?: string;
  partition?: number;
  key?: string;
  headers?: Record<string, string>;
}

interface SubscribeOptions {
  groupId?: string;
  fromBeginning?: boolean;
}
```

### MessageHandler

```typescript
class MessageHandler {
  register<T>(options: MessageHandlerOptions, handler: MessageHandlerFn<T>): Promise<void>;
  unregister(topic: string): Promise<void>;
  unregisterAll(): Promise<void>;
}

interface MessageHandlerOptions {
  topic: string;
  groupId?: string;
  fromBeginning?: boolean;
  deadLetterTopic?: string;
  maxRetries?: number;
  retryDelay?: number;
}
```

### Event Message Format

```typescript
interface EventMessage<T = unknown> {
  readonly eventType: string;
  readonly eventId: string;
  readonly timestamp: Date;
  readonly data: T;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly aggregateId?: string;
  readonly aggregateVersion?: number;
  readonly schemaVersion: string;
  readonly tenantId?: string;
  readonly metadata?: ExtendedEventMetadata;

  // CQRS IEvent properties
  readonly readonly: true;
  readonly occurredAt: Date;
  readonly version: number;
}
```

## Event Format

Events follow a standard format compatible with CQRS patterns:

```typescript
const event: EventMessage<UserCreatedData> = {
  eventType: 'user.created',
  eventId: '123e4567-e89b-12d3-a456-426614174000',
  timestamp: new Date(),
  occurredAt: new Date(),
  readonly: true,
  version: 1,
  schemaVersion: '1.0',
  data: {
    userId: 'user-123',
    email: 'user@example.com',
    name: 'John Doe'
  },
  correlationId: 'abc-123',
  tenantId: 'tenant-001'
};
```

## Usage Examples

### Publishing Events

```typescript
// Simple publish
await eventBus.publish('user.created', {
  userId: 'user-123',
  email: 'user@example.com'
});

// With options
await eventBus.publish('order.created', orderData, {
  key: order.id, // Partition by order ID
  headers: {
    'correlation-id': traceId,
    'tenant-id': tenantId
  }
});

// Batch publish
await eventBus.publishBatch([
  { eventType: 'user.created', data: user1 },
  { eventType: 'user.created', data: user2 },
  { eventType: 'user.created', data: user3 }
]);
```

### Subscribing to Events

```typescript
const subscription = await eventBus.subscribe(
  'user-created',
  async (event) => {
    console.log('User created:', event.data);
    await processEvent(event);
  },
  {
    groupId: 'my-service',
    fromBeginning: false
  }
);

// Unsubscribe when done
await subscription.unsubscribe();
```

### Message Handlers with Retry

```typescript
await messageHandler.register(
  {
    topic: 'user-created',
    groupId: 'email-service',
    maxRetries: 3,
    retryDelay: 1000,
    deadLetterTopic: 'user-created-dlq'
  },
  async (event: EventMessage<UserCreatedData>) => {
    // Retries up to 3 times on failure
    // Failed messages go to DLQ
    await sendWelcomeEmail(event.data.email);
  }
);
```

### Health Check

```typescript
import { healthCheck } from '@package/events';

const isHealthy = await healthCheck();
if (!isHealthy) {
  console.error('Kafka is not healthy');
}
```

## Best Practices

1. **Event Naming** - Use dot notation (e.g., `user.created`, `order.completed`)
2. **Topic Naming** - Events auto-map to topics (e.g., `user.created` -> `user-created`)
3. **Idempotency** - Handlers must be idempotent (at-least-once delivery)
4. **Error Handling** - Configure DLQ for failed messages
5. **Consumer Groups** - Use unique consumer group IDs per service
6. **Message Size** - Keep payloads under 1MB (Kafka limit)
7. **Correlation IDs** - Use correlation IDs for distributed tracing
8. **Testing** - Write integration tests with Testcontainers

## Building

```bash
pnpm nx build events
```

## Running Tests

```bash
# Unit tests
pnpm nx test events

# Integration tests (requires Kafka)
docker-compose up -d
INCLUDE_INTEGRATION_TESTS=1 pnpm nx test events
```

## Development

Start local Kafka for development:

```bash
cd packages/events
docker-compose up -d
```

Access Kafka UI at http://localhost:8080

## Associated Packages

- [`@package/types`](../types/) - CQRS and event types
- [`@package/core`](../core/) - Base error classes
- [`@package/queues`](../queues/) - Job queues for async processing
- [`@package/pubsub`](../pubsub/) - Google Cloud Pub/Sub integration
- [`@package/tasks`](../tasks/) - Google Cloud Tasks integration
- [`@package/schema`](../schema/) - Zod validation schemas

## Integration Bridges

The events package provides integration bridges to connect Kafka events with other infrastructure packages:

### Event-to-Queues Bridge

Bridges Kafka events to job queues for asynchronous processing:

```typescript
import { createEventToQueueBridge } from '@package/events';

const bridge = createEventToQueueBridge({
  enabled: true,
  queueName: 'events',
  jobName: 'process-event',
  eventTypes: ['user.created', 'order.completed']
});

await bridge.initialize();
await bridge.bridgeEvent(event);
```

### Kafka-to-PubSub Bridge

Bridges Kafka events to Google Cloud Pub/Sub:

```typescript
import { createKafkaToPubSubBridge } from '@package/events';

const bridge = createKafkaToPubSubBridge({
  enabled: true,
  topicName: 'events',
  eventTypes: ['user.created', 'order.completed']
});

await bridge.initialize();
await bridge.bridgeEvent(event);
```

### Event-to-Tasks Bridge

Bridges Kafka events to Google Cloud Tasks:

```typescript
import { createEventToTasksBridge } from '@package/events';

const bridge = createEventToTasksBridge({
  enabled: true,
  queueName: 'event-tasks',
  httpUrl: 'https://api.example.com/events/handle',
  eventTypes: ['user.created', 'order.completed']
});

await bridge.initialize();
await bridge.bridgeEvent(event);
```

## Circuit Breaker

The package includes a circuit breaker pattern for Kafka connections to prevent cascading failures:

- **CLOSED**: Normal operation, requests flow through
- **OPEN**: Circuit is open after threshold failures, requests are blocked
- **HALF_OPEN**: Testing if service has recovered, allows limited requests

Configuration:

```bash
EVENTS_CIRCUIT_BREAKER_ENABLED=true
EVENTS_CIRCUIT_BREAKER_THRESHOLD=5
EVENTS_CIRCUIT_BREAKER_TIMEOUT_MS=60000
```

## Event Type Validation

Event types are validated to follow the pattern `domain.event` (e.g., `user.created`, `order.completed`):

```bash
EVENTS_TYPE_VALIDATION_ENABLED=true
```

Invalid event types will throw an `EventValidationError`.

## External Resources

- [KafkaJS Documentation](https://kafka.js.org/docs)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Event-Driven Architecture](https://martinfowler.com/articles/microservices.html#EventDrivenArchitecture)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)

## Links

- [Main Repository](../../README.md)
- [Full Documentation](../../apps/api/docs/events/README.md)

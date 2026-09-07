# @package/events

Enterprise event management with event bus, outbox pattern, dead letter queues, replay, versioning, and schema validation.

## Purpose

This package provides comprehensive event-driven architecture infrastructure for the monorepo. It implements enterprise patterns including the transactional outbox for reliable delivery, dead letter queues for failed event handling, event replay for state rebuilding, and schema versioning for backward compatibility.

## Structure

```text
src/
├── client.ts                # HTTP client for event publishing
├── event-bus.ts             # Central event dispatch mechanism (Kafka)
├── events.module.ts         # NestJS module for event infrastructure
├── handler.ts               # Base handler for processing events
├── errors.ts                # Event-related error classes
├── config/                  # Event configuration
├── dead-letter/             # Dead letter queue service
│   └── dead-letter.service.ts
├── integration/             # Integration bridges
├── logging/                 # Event logging
│   └── logger.ts
├── outbox/                  # Transactional outbox pattern
│   ├── outbox.repository.ts
│   ├── outbox-poller.service.ts
│   └── outbox.config.ts
├── replay/                  # Event replay service
│   └── event-replay.service.ts
├── routing/                 # Event routing
│   └── router.ts
├── schema/                  # Schema registry
│   ├── event-registry.service.ts
│   └── event-auto-register.ts
├── validation/              # Runtime payload validation
│   └── event-validation.service.ts
└── versioning/              # Schema evolution
    ├── event-versioning.service.ts
    ├── version-validation.ts
    └── consumer-version-handler.ts
```

## Usage

```typescript
import { EventsModule, EventBus } from '@package/events';

// NestJS module setup
@Module({
  imports: [
    EventsModule.forRoot({
      brokers: ['localhost:9092'],
      clientId: 'my-app'
    })
  ]
})
export class AppModule {}

// Inject and use EventBus
@Injectable()
export class UserService {
  constructor(private readonly eventBus: EventBus) {}

  async createUser(data: CreateUserDto) {
    const user = await this.db.create(data);
    // Publish event (NOTE: Use userId, not email - email is Class-C PII)
    await this.eventBus.publish('user.created', {
      userId: user.id
    });
    return user;
  }
}

// Subscribe to events (event name uses dot notation, not dash)
// Example: In a service class that receives the EventBus via dependency injection
@Injectable()
export class EventListenerService {
  constructor(private readonly eventBus: EventBus) {}

  async onApplicationBootstrap() {
    await this.eventBus.subscribe('user.created', async (event: EventMessage) => {
      console.log('User created:', event.data);
    });
  }
}

// Use outbox pattern for reliable delivery
import { OutboxRepository, OutboxPollerService } from '@package/events';

// Event versioning
import { EventVersioningService, VersionCompatibilityChecker } from '@package/events';

const versioningService = new EventVersioningService();
versioningService.registerSchema('user.created', {
  version: '1.0',
  schema: userCreatedV1Schema
});
```

## Key Exports

### Core

- `EventBus` - Central event dispatch mechanism using Kafka
- `EventMessage<T>` - Event message interface with metadata
- `EventsModule` - NestJS module for event infrastructure
- `EventError` - Base error class for event-related failures

### Outbox Pattern

- `OutboxRepository` - Transactional outbox repository
- `OutboxPollerService` - Polls outbox and publishes pending events
- `OutboxPollerConfig` - Configuration for outbox polling

### Dead Letter Queue

- `DeadLetterService` - Failed event handling and reprocessing
- `ErrorClassification` - Error classification for DLQ routing
- `DeadLetterEvent` - Failed event type

### Event Replay

- `EventReplayService` - Replay historical events for state rebuilding
- `ReplayOptions` - Configuration for replay sessions
- `ReplaySession` - Active replay session
- `ReplayStatus` - Replay operation status

### Versioning

- `EventVersioningService` - Schema registration and migration
- `VersionCompatibilityChecker` - Check schema compatibility
- `HandleVersion` - Decorator for version-specific handlers

### Validation

- `EventValidationService` - Runtime event payload validation

### Schema Registry

- `EventRegistryService` - Event schema versioning and lookup
- `EventAutoRegister` - Automatic schema registration

## Associated Packages

- `@package/db-outbox` - Event store database schema and outbox tables
- `@package/core` - Error handling and infrastructure utilities
- `@package/types` - IEvent and EventMetadata types
- `@package/schema` - Zod schema definitions
- `@package/pubsub` - Google Cloud Pub/Sub integration

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

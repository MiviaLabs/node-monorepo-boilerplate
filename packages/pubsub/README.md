# @package/pubsub

Enterprise-grade Google Cloud Pub/Sub integration providing scalable topic/subscription management, batch and ordered message publishing, pull subscriptions, dead-letter queue (DLQ) support, and OpenTelemetry instrumentation.

## Overview

`@package/pubsub` delivers a robust messaging abstraction over Google Cloud Pub/Sub. Designed for distributed event architectures, it incorporates automatic retry backoff, Dead Letter Queue routing for poison messages, message ordering keys, and OpenTelemetry distributed tracing. It also includes an in-memory mock provider for fast, dependency-free unit and integration testing.

## Features

- **Topic Management**: Create, delete, get, and list Pub/Sub topics
- **Subscription Management**: Create, delete, get, and list subscriptions
- **Message Publishing**: Publish single or batch messages with ordering keys
- **Message Subscription**: Pull subscriptions with message acknowledgment
- **Dead Letter Queue**: Support for DLQ configuration
- **Observability**: Built-in OpenTelemetry tracing and metrics
- **Testing**: Mock provider for unit testing without GCP dependencies

## Installation

```bash
pnpm add @package/pubsub
```

## Configuration

Configure using environment variables:

```bash
# Required
PUBSUB_PROJECT_ID=your-project-id

# Optional
PUBSUB_TOPIC_NAME=default-topic
PUBSUB_SUBSCRIPTION_NAME=default-subscription
PUBSUB_KEY_FILE=/path/to/key.json
# OR
PUBSUB_CLIENT_EMAIL=service-account@example.com
PUBSUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
PUBSUB_TIMEOUT=60000
PUBSUB_MAX_RETRIES=3
PUBSUB_ENABLE_TRACING=true
PUBSUB_ACK_DEADLINE=60
PUBSUB_MAX_MESSAGES=100
PUBSUB_TEST_MODE=false
```

## Usage

### Basic Setup

```typescript
import { createPubSubProvider, resolveConfig } from '@package/pubsub';

// Use environment configuration
const provider = createPubSubProvider();

// Or provide custom config
const config = {
  projectId: 'my-project',
  enableTracing: true
};
const provider = createPubSubProvider(config);
```

### Topic Management

```typescript
// Create a topic
await provider.createTopic('my-topic', {
  description: 'My topic for events',
  labels: {
    environment: 'production'
  }
});

// Get topic info
const topic = await provider.getTopic('my-topic');

// List all topics
const topics = await provider.listTopics();

// Delete a topic
await provider.deleteTopic('my-topic');
```

### Subscription Management

```typescript
// Create a subscription
await provider.createSubscription('my-subscription', 'my-topic', {
  ackDeadlineSeconds: 60,
  messageRetentionSeconds: 604800, // 7 days
  enableMessageOrdering: true,
  deadLetterPolicy: {
    deadLetterTopic: 'my-dlq-topic',
    maxDeliveryAttempts: 5
  }
});

// Get subscription info
const subscription = await provider.getSubscription('my-subscription');

// List all subscriptions
const subscriptions = await provider.listSubscriptions();

// Delete a subscription
await provider.deleteSubscription('my-subscription');
```

### Publishing Messages

```typescript
// Publish a single message
const result = await provider.publish(
  'my-topic',
  { data: 'value', timestamp: new Date() },
  {
    attributes: {
      eventType: 'user.created'
    }
  }
);

console.log('Published message:', result.messageId);

// Publish batch messages
const results = await provider.publishBatch('my-topic', [
  {
    data: { id: 1, name: 'Item 1' }
  },
  {
    data: { id: 2, name: 'Item 2' }
  }
]);
```

### Subscribing to Messages

```typescript
// Subscribe to a subscription
await provider.subscribe(
  'my-subscription',
  async (message) => {
    try {
      const data = JSON.parse(message.data.toString());
      console.log('Received message:', data);

      // Process the message

      // Acknowledge the message
      await message.ack();
    } catch (error) {
      console.error('Error processing message:', error);

      // Negative acknowledge (will be retried)
      await message.nack();
    }
  },
  {
    flowControl: {
      maxMessages: 100
    }
  }
);

// Unsubscribe
await provider.unsubscribe('my-subscription');
```

### Health Check

```typescript
const isHealthy = await provider.healthCheck();
```

## Running Tests

Use the mock provider for testing:

```typescript
import { createMockPubSubProvider } from '@package/pubsub';

const provider = createMockPubSubProvider({
  projectId: 'test-project'
});

// Create topic and subscription
await provider.createTopic('test-topic');
await provider.createSubscription('test-subscription', 'test-topic');

// Publish messages
await provider.publish('test-topic', { test: 'data' });

// Subscribe
await provider.subscribe('test-subscription', async (message) => {
  console.log('Received:', message.data.toString());
  await message.ack();
});

// Check test state
provider.getTopicCount(); // 1
provider.getSubscriptionCount(); // 1
provider.getMessageCount('test-topic'); // 1
provider.getSubscriptionMessageCount('test-subscription'); // 0 (acked)

// Clean up
provider.clear();
```

## Error Handling

The package provides specific error types:

```typescript
import {
  TopicNotFoundError,
  TopicAlreadyExistsError,
  SubscriptionNotFoundError,
  PublishFailedError,
  InvalidMessageDataError
} from '@package/pubsub';

try {
  await provider.createTopic('my-topic');
} catch (error) {
  if (error instanceof TopicAlreadyExistsError) {
    console.log('Topic already exists');
  }
}
```

## API Reference

### Classes

- `PubSubProvider` - Real Pub/Sub client
- `MockPubSubProvider` - In-memory mock for testing

### Functions

- `createPubSubProvider(config?)` - Create provider from config
- `createMockPubSubProvider(config?)` - Create mock provider
- `resolveConfig()` - Resolve config from environment

### Types

- `PubSubConfig` - Provider configuration
- `TopicOptions` - Topic creation options
- `SubscriptionOptions` - Subscription creation options
- `PublishOptions` - Publish options
- `SubscribeOptions` - Subscribe options
- `PubSubMessage` - Published message structure
- `ReceivedMessage` - Received message structure

## Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Watch mode
pnpm test:watch
```

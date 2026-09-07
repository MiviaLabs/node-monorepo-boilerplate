# @package/tasks

Google Cloud Tasks integration package for the enterprise starter kit.

## Features

- **Queue Management**: Create, delete, get, and list Cloud Tasks queues
- **Task Creation**: Create and schedule tasks with HTTP or App Engine targets
- **Configuration**: Environment-based configuration with validation
- **Observability**: Built-in OpenTelemetry tracing and metrics
- **Testing**: Mock provider for unit testing without GCP dependencies

## Installation

```bash
pnpm add @package/tasks
```

## Configuration

Configure using environment variables:

```bash
# Required
CLOUD_TASKS_PROJECT_ID=your-project-id
CLOUD_TASKS_LOCATION=us-central1

# Optional
CLOUD_TASKS_QUEUE_NAME=default-queue
CLOUD_TASKS_KEY_FILE=/path/to/key.json
# OR
CLOUD_TASKS_CLIENT_EMAIL=service-account@example.com
CLOUD_TASKS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
CLOUD_TASKS_TIMEOUT=60000
CLOUD_TASKS_MAX_RETRIES=3
CLOUD_TASKS_ENABLE_TRACING=true
TEST_MODE=false
```

## Usage

### Basic Setup

```typescript
import { createCloudTasksProvider, resolveConfig } from '@package/tasks';

// Use environment configuration
const provider = createCloudTasksProvider();

// Or provide custom config
const config = {
  projectId: 'my-project',
  location: 'us-central1',
  enableTracing: true
};
const provider = createCloudTasksProvider(config);
```

### Queue Management

```typescript
// Create a queue
await provider.createQueue('my-queue', {
  state: 'ENABLED',
  rateLimits: {
    maxRequestsPerSecond: 500
  },
  retryConfig: {
    maxAttempts: 3,
    minBackoffInSeconds: 10
  }
});

// Get queue info
const queue = await provider.getQueue('my-queue');

// List all queues
const queues = await provider.listQueues();

// Delete a queue
await provider.deleteQueue('my-queue');
```

### Creating Tasks

#### HTTP Target

```typescript
const task = await provider.createHttpTask(
  'my-queue',
  {
    url: 'https://api.example.com/webhook',
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ data: 'value' })
  },
  {
    priority: 5,
    dispatchDeadline: 600
  }
);
```

#### App Engine Target

```typescript
const task = await provider.createAppEngineTask(
  'my-queue',
  {
    relativeUri: '/api/tasks/process',
    httpMethod: 'POST',
    appEngineRouting: {
      service: 'worker',
      version: 'v1'
    }
  },
  {
    priority: 3
  }
);
```

### Task Management

```typescript
// Get task info
const task = await provider.getTask('task-name');

// Delete a task
await provider.deleteTask('task-name');
```

### Health Check

```typescript
const isHealthy = await provider.healthCheck();
```

## Running Tests

Use the mock provider for local development:

```typescript
import { createMockCloudTasksProvider } from '@package/tasks';

const provider = createMockCloudTasksProvider({
  projectId: 'test-project',
  location: 'us-central1'
});

// Use the same API as the real provider
await provider.createQueue('test-queue');
await provider.createHttpTask('test-queue', {
  url: 'https://example.com/webhook'
});

// Check test state
provider.getQueueCount(); // 1
provider.getTaskCount('test-queue'); // 1

// Clean up
provider.clear();
```

## Error Handling

The package provides specific error types:

```typescript
import {
  QueueNotFoundError,
  QueueAlreadyExistsError,
  TaskCreationFailedError,
  InvalidTaskConfigError
} from '@package/tasks';

try {
  await provider.createQueue('my-queue');
} catch (error) {
  if (error instanceof QueueAlreadyExistsError) {
    console.log('Queue already exists');
  }
}
```

## API Reference

### Classes

- `CloudTasksProvider` - Real Cloud Tasks client
- `MockCloudTasksProvider` - In-memory mock for testing

### Functions

- `createCloudTasksProvider(config?)` - Create provider from config
- `createMockCloudTasksProvider(config?)` - Create mock provider
- `resolveConfig()` - Resolve config from environment

### Types

- `CloudTasksConfig` - Provider configuration
- `QueueOptions` - Queue creation options
- `TaskOptions` - Task creation options
- `HttpTargetOptions` - HTTP target configuration
- `AppEngineHttpTargetOptions` - App Engine target configuration

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

# @package/core

Foundational infrastructure toolkit providing standardized configuration resolution, OpenTelemetry instrumentation, error hierarchies, and testing utilities across platform services.

## Overview

`@package/core` establishes core infrastructure primitives for backend applications and packages across the monorepo. It standardizes configuration management with three-tier resolution, provides unified OpenTelemetry tracing and metrics helpers, implements an extensible error hierarchy with cause chaining, and delivers a mock provider framework for reliable testing.

## Key Features

- **Three-Tier Configuration Engine**: Deterministic config resolution prioritizing user overrides, environment variables, and safe defaults.
- **OpenTelemetry Instrumentation**: Distributed tracing helpers (`withSpan`, `withSpanKind`), custom span attribute injectors, and metric instruments.
- **`@Instrumented` Decorators**: Method-level and class-level decorators for zero-boilerplate distributed tracing.
- **Structured Error Taxonomy**: Base infrastructure errors preserving causal chains, error codes, and operational metadata.
- **Testing Doubles Harness**: Abstract `MockProvider` base class and factory with configurable latency, failure injection, and health state simulation.

## Installation

```bash
pnpm add @package/core
```

## Quick Start

### Configuration System

The configuration engine resolves options following a strict priority hierarchy:
1. Explicit user-provided options (highest)
2. Environment variables
3. Default values (fallback)

```typescript
import { resolveConfig } from '@package/core';

// Basic resolution with default settings
const config = resolveConfig();

// Custom configuration with full typing
const customConfig = resolveConfig({
  enableGracefulShutdown: true,
  timeouts: {
    default: 60000,
    short: 5000,
    long: 120000
  },
  retry: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
  },
  healthCheck: {
    intervalMs: 30000,
    timeoutMs: 5000,
    unhealthyThreshold: 3
  },
  openTelemetry: {
    enableTracing: true,
    enableMetrics: true,
    serviceName: 'order-service',
    serviceVersion: '1.0.0'
  }
});
```

#### Environment Variable Overrides

All core configurations can be driven via standard environment variables:

```bash
# Graceful Shutdown
INFRA_ENABLE_GRACEFUL_SHUTDOWN=true

# Timeouts (milliseconds)
INFRA_TIMEOUT_DEFAULT=30000
INFRA_TIMEOUT_SHORT=5000
INFRA_TIMEOUT_MEDIUM=15000
INFRA_TIMEOUT_LONG=60000
INFRA_TIMEOUT_VERY_LONG=300000

# Retry Policies
INFRA_RETRY_MAX_ATTEMPTS=3
INFRA_RETRY_INITIAL_DELAY_MS=1000
INFRA_RETRY_MAX_DELAY_MS=10000
INFRA_RETRY_BACKOFF_MULTIPLIER=2

# Health Checks
INFRA_HEALTH_CHECK_INTERVAL_MS=30000
INFRA_HEALTH_CHECK_TIMEOUT_MS=5000
INFRA_HEALTH_CHECK_UNHEALTHY_THRESHOLD=3

# OpenTelemetry
INFRA_OTEL_TRACING_ENABLED=true
INFRA_OTEL_METRICS_ENABLED=true
INFRA_OTEL_TRACER_NAME=@package/core
INFRA_OTEL_METER_NAME=@package/core
SERVICE_NAME=order-service
SERVICE_VERSION=1.0.0
```

### OpenTelemetry Distributed Tracing

Wrap operations inside OpenTelemetry spans with automatic lifecycle management, exception recording, and custom semantic attributes:

```typescript
import { withSpan, addSpanAttributes, MESSAGING_ATTRS, MESSAGING_SYSTEMS } from '@package/core';

const result = await withSpan('message.process', async (span) => {
  span.setAttributes({
    [MESSAGING_ATTRS.SYSTEM]: MESSAGING_SYSTEMS.KAFKA,
    'messaging.destination': 'events.user'
  });

  addSpanAttributes({ 'user.id': 'usr_12345' });

  return await processUserEvent();
});
```

### Automatic Tracing with Decorators

Instrument TypeScript classes and individual methods without manual span plumbing:

```typescript
import { Instrumented, InstrumentedClass } from '@package/core';

export class OrderService {
  @Instrumented({
    name: 'order.process',
    attributes: { 'service.component': 'orders' },
    includeArgs: true
  })
  async processOrder(orderId: string): Promise<void> {
    // Automatically traced in active context
  }
}

// Or instrument every method on a service class
@InstrumentedClass({ attributes: { 'service.component': 'billing' } })
export class BillingService {
  async charge() {}
  async refund() {}
}
```

### Metrics Collection

Create and update meters, counters, and histograms:

```typescript
import {
  createCounter,
  createHistogram,
  incrementCounter,
  recordHistogram,
  InfrastructureMetrics
} from '@package/core';

const operationCounter = createCounter(InfrastructureMetrics.OPERATION_COUNT, {
  description: 'Count of completed operations'
});
incrementCounter(operationCounter, 1, { 'operation.type': 'sync' });

const durationHistogram = createHistogram(InfrastructureMetrics.OPERATION_DURATION, {
  description: 'Operation execution duration',
  unit: 'ms'
});
recordHistogram(durationHistogram, 125.4, { 'operation.type': 'sync' });
```

### Standardized Error Taxonomy

All infrastructure errors inherit from `InfrastructureError`, providing consistent serialization, error codes, and nested cause preservation:

```typescript
import {
  ConfigurationError,
  MissingConfigurationError,
  OperationError,
  ConnectionError,
  NotFoundError,
  TimeoutError
} from '@package/core';

// Configuration
throw new MissingConfigurationError('databaseUrl', 'PostgresPool');

// Connection failures
throw new ConnectionError('Redis', 'Connection reset by peer', originalSocketError);

// Operation failures
throw new OperationError('cache.flush', 'Failed to execute FLUSHDB', cause);
```

### Mock Provider Harness

Easily simulate third-party infrastructure providers with controlled latency, failure injection, and health state transitions:

```typescript
import { MockProvider, MockProviderFactory, ProviderHealth } from '@package/core';

class MockEmailClient extends MockProvider {
  protected getProviderName(): string {
    return 'MockEmailClient';
  }

  async send(recipient: string): Promise<string> {
    return this.executeOperation('send', async () => {
      return `sent-to-${recipient}`;
    });
  }
}

// Instantiate double with simulated latency and failure rate
const client = MockProviderFactory.create(MockEmailClient, {
  latency: 50, // 50ms synthetic latency
  failureRate: 0.05 // 5% simulated failure rate
});

// Update health dynamically in integration tests
client.setHealth(ProviderHealth.DEGRADED);
```

## Package Architecture

```text
src/
├── config/                  # Configuration resolution and typing
├── decorators/              # Tracing decorators (@Instrumented)
├── errors/                  # Standardized error hierarchy
├── opentelemetry/           # OpenTelemetry spans, metrics, and attributes
├── testing/                 # MockProvider harness for test doubles
├── constants.ts             # Semantic conventions and system identifiers
└── index.ts                 # Main barrel export
```

## Development Commands

```bash
# Build
pnpm nx build core

# Run unit tests
pnpm nx test core

# Lint
pnpm nx lint core
```

## Associated Packages

- [`@package/observability`](../observability) – Complete OpenTelemetry SDK bootstrapping, collectors, and exporter pipelines.
- [`@package/errors`](../errors) – HTTP and application-level domain errors.

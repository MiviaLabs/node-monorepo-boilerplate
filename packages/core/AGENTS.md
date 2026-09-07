# @package/core

Foundational infrastructure toolkit providing standardized configuration resolution, OpenTelemetry instrumentation, error hierarchies, and testing utilities across platform services.

## Purpose

The `@package/core` package establishes base classes and common infrastructure patterns for backend services and libraries in the monorepo:

- **Standardized Error Hierarchy**: Strongly typed infrastructure error classes with causal chain preservation and contextual metadata.
- **OpenTelemetry Instrumentation**: Distributed tracing helpers, metric instruments, and semantic attribute constants.
- **Three-Tier Configuration Resolver**: Deterministic configuration resolution with strict precedence (explicit options -> environment variables -> defaults).
- **Mock Provider Base Class**: Simulation harness for testing infrastructure clients with configurable latency, failure rates, and health transitions.
- **`@Instrumented` Decorator**: Non-invasive method-level and class-level tracing integration with OpenTelemetry spans.

## Structure

```text
src/
├── config/                        # Configuration management
│   ├── config-resolver.ts         # Three-tier priority resolution engine
│   ├── defaults.ts                # Production-ready default values
│   ├── interfaces.ts              # Configuration contracts (ITimeoutConfig, IRetryConfig, etc.)
│   └── index.ts
├── decorators/                    # TypeScript method and class decorators
│   ├── instrumented.decorator.ts  # @Instrumented and @InstrumentedClass decorators
│   └── index.ts
├── errors/                        # Infrastructure error taxonomy
│   ├── configuration-error.ts     # Missing or invalid configuration errors
│   ├── connection-error.ts        # Network and service connection failures
│   ├── infrastructure-error.ts    # Base error class with cause chaining
│   ├── not-found-error.ts         # Missing resource and provider errors
│   ├── operation-error.ts         # Execution failure and retry exhaustion errors
│   └── index.ts
├── opentelemetry/                 # Telemetry utilities
│   ├── attributes.ts              # Semantic convention constants
│   ├── metrics.ts                 # Meter, counter, and histogram helpers
│   ├── tracing.ts                 # withSpan, getTracer, and span attribute helpers
│   ├── utilities.ts               # Object-to-attributes converters
│   └── index.ts
├── testing/                       # Test doubles and provider harness
│   ├── mock-provider.ts           # MockProvider abstract base class and factory
│   └── index.ts
├── constants.ts                   # Infrastructure constants and prefixes
└── index.ts                       # Unified package export barrel
```

## Key Exports

### Configuration Resolution
- `resolveConfig(userConfig?, defaultOverrides?)` – Resolves full infrastructure config according to priority rules.
- `ConfigResolver` – Static helper for resolving environment variables with type coercion.
- `IInfrastructureCoreConfig`, `IResolvedInfrastructureCoreConfig` – Input and resolved configuration interfaces.
- `ITimeoutConfig`, `IRetryConfig`, `IHealthCheckConfig`, `IOpenTelemetryConfig` – Component-level configuration types.

### Observability & Telemetry
- `withSpan(name, fn, options?)` – Executes asynchronous callbacks wrapped in an active OpenTelemetry span.
- `withSpanKind(name, kind, fn, options?)` – Wraps execution with an explicit `SpanKind` (`CLIENT`, `SERVER`, `PRODUCER`, `CONSUMER`, `INTERNAL`).
- `getTracer(name?, version?)` – Returns a tracer instance from the global OpenTelemetry provider.
- `addSpanAttributes(attributes)` – Appends key-value attributes to the currently active span.
- `recordSpanException(error, span?)` – Safely records errors and sets error status on spans.
- `createCounter()`, `createHistogram()`, `incrementCounter()`, `recordHistogram()` – High-performance metric instrumentation helpers.
- `InfrastructureMetrics` – Standardized platform metric names.

### Decorators
- `@Instrumented(options?)` – Wraps methods in OpenTelemetry spans with automatic error capture and argument recording.
- `@InstrumentedClass(options?)` – Automatically applies span tracing across all methods in a class.

### Error Hierarchy
- `InfrastructureError` – Base class extending `Error` with `code`, `details`, and nested `cause`.
- `ConfigurationError`, `MissingConfigurationError`, `InvalidConfigurationError` – Configuration validation issues.
- `OperationError`, `TimeoutError`, `MaxRetriesExceededError` – Execution lifecycle failures.
- `ConnectionError`, `AuthenticationError`, `ServiceUnavailableError` – Downstream connectivity issues.
- `NotFoundError`, `ProviderNotFoundError`, `QueueNotFoundError`, `WorkerNotFoundError` – Unregistered resource access.

### Mock Provider Harness
- `MockProvider` – Abstract base provider with latency injection, failure rate simulation, and state tracking.
- `MockProviderFactory` – Factory for constructing configured mock instances.
- `ProviderHealth` – Provider health states (`HEALTHY`, `DEGRADED`, `UNHEALTHY`).

## Usage

```typescript
import {
  resolveConfig,
  withSpan,
  addSpanAttributes,
  Instrumented,
  InfrastructureError,
  ConnectionError
} from '@package/core';

// Configuration
const config = resolveConfig({
  timeouts: { default: 60000 },
  retry: { maxAttempts: 5 }
});

// Traced execution
async function executeTask(taskId: string): Promise<void> {
  await withSpan('task.execute', async (span) => {
    span.setAttribute('task.id', taskId);
    addSpanAttributes({ 'task.type': 'batch' });
    // Execute business logic...
  });
}

// Method decoration
class DataService {
  @Instrumented({ attributes: { 'service.component': 'data-store' } })
  async queryRecord(id: string) {
    // Traced automatically
    return { id };
  }
}
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

- [`@package/observability`](../observability) – Complete OpenTelemetry SDK bootstrapping and exporter configuration.
- [`@package/errors`](../errors) – Domain-level application errors and HTTP translation.

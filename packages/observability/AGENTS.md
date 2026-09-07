# @package/observability

Production-ready observability infrastructure providing OpenTelemetry distributed tracing, Pino-powered structured logging, multi-dimensional metrics collection, request context propagation, and native Google Cloud Platform (GCP) integration.

## Purpose

This package provides a comprehensive observability stack for distributed systems. It includes:

- **Telemetry**: OpenTelemetry SDK initialization with automatic instrumentation
- **Logging**: Structured logging with Pino, supporting child loggers and PII redaction
- **Metrics**: Counter, histogram, and gauge metric types with OTEL export
- **Context**: AsyncLocalStorage-based request context propagation
- **GCP Integration**: Native providers for Cloud Trace, Cloud Logging, and Cloud Monitoring

## Structure

```text
src/
├── config/                 # Configuration resolution
│   ├── interfaces.ts       # Config interfaces
│   ├── defaults.ts         # Default values
│   └── config-resolver.ts  # Environment-aware resolver
├── providers/              # GCP OpenTelemetry providers
│   ├── gcp-trace.provider.ts
│   ├── gcp-logging.provider.ts
│   ├── gcp-metrics.provider.ts
│   └── gcp-otel-provider.factory.ts
├── patterns/               # Observability patterns
│   ├── correlation-id.pattern.ts  # Correlation ID generation
│   └── pii-redaction.pattern.ts   # PII redaction for logs
├── decorators/             # Method decorators
│   └── metric.decorator.ts # @Metric decorator for auto-instrumentation
├── telemetry.ts            # OpenTelemetry SDK management
├── logger.ts               # Pino-based structured logger
├── metrics.ts              # Metrics service (counter, histogram, gauge)
├── context.ts              # AsyncLocalStorage request context
├── errors.ts               # Observability error types
├── observability.module.ts # NestJS module
└── index.ts
```

## Usage

```typescript
import {
  initializeTelemetry,
  shutdownTelemetry,
  logger,
  metricsService,
  setRequestContext,
  getRequestContext,
  withRequestContext,
  createCorrelationId,
  redactObject
} from '@package/observability';

// Initialize telemetry at application startup
initializeTelemetry({
  serviceName: 'api',
  serviceVersion: '1.0.0',
  environment: 'production',
  enabled: true
});

// Structured logging with context
logger.info('Application started', { port: 3000 });

const requestLogger = logger.child({
  requestId: 'req-123',
  hashedUserId: 'a1b2c3d4', // Hash of user ID for PII protection
  hashedOrganizationId: 'e5f6g7h8' // Hash of organization ID for PII protection
});
requestLogger.info('Processing request');

// Request context propagation
await withRequestContext({ requestId: 'req-123', hashedUserId: 'a1b2c3d4' }, async () => {
  const ctx = getRequestContext();
  // P0: Use hashedUserId, not raw userId, to avoid PII in logs
  logger.info('In request context', { requestId: ctx.requestId, hashedUserId: ctx.hashedUserId });
});

// Metrics
const counter = metricsService.createCounter('http.requests', 'Total requests');
counter.add(1, { method: 'GET', route: '/users' });

// PII redaction
const safeData = redactObject({ email: 'user@example.com', name: 'John' });
// { email: '***REDACTED***', name: 'John' }

// Graceful shutdown
await shutdownTelemetry();
```

## Key Exports

### Telemetry

- `initializeTelemetry(config)` - Initialize OpenTelemetry SDK
- `shutdownTelemetry()` - Graceful SDK shutdown
- `isTelemetryEnabled(config?)` - Check if telemetry is active

### Logging

- `Logger` - Structured logger class with child logger support
- `logger` - Global pre-configured logger instance
- `ILogContext` - Logging context interface

### Metrics

- `metricsService` - Singleton metrics service
- `createCounter(name, description)` - Create counter metric
- `createHistogram(name, description)` - Create histogram metric
- `createGauge(name, description)` - Create gauge metric
- `incrementCounter(name, attributes?)` - Increment a counter
- `recordHistogram(name, value, attributes?)` - Record histogram value

### Context

- `setRequestContext(context)` - Set request-scoped context
- `getRequestContext()` - Retrieve current context
- `withRequestContext(context, fn)` - Execute with scoped context
- `getRequestId()` / `getUserId()` / `getOrganizationId()` - Context accessors

### Patterns

- `createCorrelationId()` - Generate correlation IDs
- `createTraceParent()` - W3C Trace Context header creation
- `redactObject(obj)` - PII redaction for logs

### Decorators

- `@Metric(options)` - Method decorator for automatic metric recording

### GCP Providers

- `GcpTraceProvider` - Cloud Trace integration
- `GcpLoggingProvider` - Cloud Logging integration
- `GcpMetricsProvider` - Cloud Monitoring integration
- `createGcpOtelProvider(config)` - Factory for GCP providers

### Configuration

- `resolveConfig(options?)` - Resolve configuration from options/environment
- `ObservabilityConfig` - Configuration interface
- `LogLevel` - Log level enum

### NestJS

- `ObservabilityModule` - NestJS module for observability integration

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |

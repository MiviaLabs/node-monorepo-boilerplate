# @package/observability

Enterprise-grade observability infrastructure providing OpenTelemetry distributed tracing, Pino structured logging, multi-dimensional metrics, AsyncLocalStorage request context propagation, and native Google Cloud Platform (GCP) integration.

## Overview

`@package/observability` delivers end-to-end distributed tracing, high-performance structured logging with Pino, and standardized metrics collection across microservices and modular monoliths. It includes built-in PII redaction, W3C Trace Context propagation, and seamless NestJS integration via dynamic modules.

## Features

- **OpenTelemetry Tracing** - Distributed tracing with automatic instrumentation
- **Structured Logging** - Pino logger with pretty printing and log levels
- **Metrics Collection** - Custom metrics with OpenTelemetry
- **Context Management** - Async local storage for request context
- **Type-Safe** - Full TypeScript support
- **NestJS Integration** - Ready-to-use NestJS module with dependency injection

## Installation

This package is part of the enterprise starter monorepo.

```bash
pnpm install @package/observability
```

## Quick Start

### Standalone Usage

```typescript
import { logger, LogLevel } from '@package/observability';
import { initializeTelemetry } from '@package/observability';
import { metricsService } from '@package/observability';
import { setRequestContext, withRequestContext } from '@package/observability';

// Initialize OpenTelemetry
initializeTelemetry({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  environment: 'production',
  exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
});

// Logging
logger.info('Application started');
logger.error('Error occurred', new Error('Something went wrong'));

// Metrics
const counter = metricsService.createCounter('requests.total', 'Total requests');
metricsService.incrementCounter('requests.total', 1);

// Context
setRequestContext({ userId: 'user-123', requestId: 'req-456' });
logger.info('Processing request');

// Async context
await withRequestContext({ userId: 'user-123' }, async () => {
  logger.info('This log includes userId context');
});
```

### NestJS Integration

```typescript
import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@package/observability';

@Module({
  imports: [
    ObservabilityModule.forRoot({
      telemetry: {
        serviceName: 'api-service',
        serviceVersion: '1.0.0',
        environment: process.env.NODE_ENV ?? 'development',
        exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      }
    })
  ]
})
export class AppModule {}
```

#### Using Dependency Injection

```typescript
import { Injectable } from '@nestjs/common';
import { Logger, MetricsService } from '@package/observability';

@Injectable()
export class UsersService {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: MetricsService,
    private readonly userRepository: UserRepository
  ) {
    this.logger.info('UsersService initialized');
  }

  async createUser(dto: CreateUserDto) {
    // WARNING: Never log PII (email, password, etc.) directly!
    // Log non-PII identifiers only (e.g., userId after creation)
    const user = await this.userRepository.create(dto);

    this.logger.info('User created', { userId: user.id });
    this.metrics.incrementCounter('users.created');

    return user;
  }
}
```

#### Async Configuration

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObservabilityModule } from '@package/observability';

@Module({
  imports: [
    ObservabilityModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        telemetry: {
          serviceName: config.get('SERVICE_NAME'),
          serviceVersion: config.get('SERVICE_VERSION'),
          environment: config.get('NODE_ENV'),
          exporterUrl: config.get('OTEL_EXPORTER_URL')
        }
      }),
      inject: [ConfigService]
    })
  ]
})
export class AppModule {}
```

## API Reference

### Logger

```typescript
/**
 * Structured logger with automatic context enrichment and log level filtering.
 * Outputs JSON logs with consistent format for observability platforms.
 */
class Logger {
  /**
   * Logs a debug-level message. Disabled in production by default.
   * @param message - The log message
   * @param context - Optional context to include in the log entry
   */
  debug(message: string, context?: ILogContext): void;

  /**
   * Logs an info-level message for normal operation events.
   * @param message - The log message
   * @param context - Optional context to include in the log entry
   */
  info(message: string, context?: ILogContext): void;

  /**
   * Logs a warning for unexpected but recoverable situations.
   * @param message - The log message
   * @param context - Optional context to include in the log entry
   */
  warn(message: string, context?: ILogContext): void;

  /**
   * Logs an error with optional exception details.
   * @param message - The log message
   * @param error - Optional error object to include stack trace
   * @param context - Optional context to include in the log entry
   */
  error(message: string, error?: Error | unknown, context?: ILogContext): void;

  /**
   * Logs a fatal error indicating application shutdown is imminent.
   * @param message - The log message
   * @param error - Optional error object to include stack trace
   * @param context - Optional context to include in the log entry
   */
  fatal(message: string, error?: Error | unknown, context?: ILogContext): void;

  /**
   * Creates a child logger with inherited context.
   * @param context - Context to bind to all logs from this child logger
   * @returns A new Logger instance with the provided context
   */
  child(context: ILogContext): Logger;
}

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Context object for structured logging. Contains request metadata
 * that is automatically included in log entries.
 */
interface ILogContext {
  /** User identifier for the current request */
  userId?: string;
  /** Organization/tenant identifier for multi-tenancy */
  organizationId?: string;
  /** Correlation ID for request tracing */
  requestId?: string;
  /** Additional arbitrary context properties */
  [key: string]: unknown;
}
```

### MetricsService

```typescript
class MetricsService {
  createCounter(name: string, description: string, options?: MetricOptions): Counter;
  createHistogram(name: string, description: string, options?: MetricOptions): Histogram;
  createGauge(name: string, description: string, options?: MetricOptions): Gauge;

  incrementCounter(name: string, amount?: number, attributes?: Attributes): void;
  recordHistogram(name: string, value: number, attributes?: Attributes): void;
  recordGauge(name: string, value: number, attributes?: Attributes): void;
}
```

### Telemetry

```typescript
interface ITelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporterUrl?: string;
}

function initializeTelemetry(config: ITelemetryConfig): void;
async function shutdownTelemetry(): Promise<void>;
```

### Context

```typescript
function setRequestContext(context: ILogContext): void;
function getRequestContext(): ILogContext | undefined;
function withRequestContext<T>(
  context: ILogContext,
  callback: () => T | Promise<T>
): T | Promise<T>;

function getRequestId(): string | undefined;
function getUserId(): string | undefined;
function getOrganizationId(): string | undefined;
```

## Configuration

### Environment Variables

```bash
# Service Identification (shared across all infrastructure packages)
SERVICE_NAME=my-service
SERVICE_VERSION=1.0.0

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

**Note:** `OTEL_SERVICE_NAME` and `OTEL_SERVICE_VERSION` are deprecated. Use `SERVICE_NAME` and `SERVICE_VERSION` instead for consistency across all infrastructure packages.

## Usage Examples

### Context Propagation

```typescript
import { setRequestContext, logger, getUserId } from '@package/observability';

// Set context at request start
setRequestContext({
  userId: 'user-123',
  requestId: 'req-456',
  organizationId: 'org-789'
});

// Context is automatically included in logs
logger.info('Processing request');

// Access context values
const userId = getUserId();
```

### Metrics with Attributes

```typescript
import { metricsService } from '@package/observability';

const requestCounter = metricsService.createCounter('http.requests', 'HTTP requests');

// Record with attributes
metricsService.incrementCounter('http.requests', 1, {
  method: 'GET',
  path: '/api/users',
  status: '200'
});
```

### Child Logger

```typescript
import { logger } from '@package/observability';

const childLogger = logger.child({
  component: 'database',
  operation: 'query'
});

childLogger.info('Executing query');
```

## Distributed Tracing

The observability package provides OpenTelemetry-based distributed tracing with automatic instrumentation and manual span creation capabilities.

### Automatic Instrumentation

When OpenTelemetry is initialized, the following are automatically traced:

- **HTTP/HTTPS**: Incoming and outgoing HTTP requests
- **Express/Fastify/NestJS**: Web framework routing and middleware
- **PostgreSQL/MySQL/MongoDB**: Database queries and connections
- **Redis**: Cache operations
- **gRPC**: Remote procedure calls

No code changes required - instrumentation works by monkey-patching libraries at runtime.

### Manual Span Creation

For custom instrumentation beyond automatic tracing:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

// Get a tracer for your component
const tracer = trace.getTracer('payment-service', '1.0.0');

// Simple span
const span = tracer.startSpan('validate-payment');
try {
  span.setAttribute('order.id', orderId);
  span.setAttribute('payment.amount', amount);
  span.addEvent('validation-started');

  await validatePayment(orderId);

  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error as Error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
} finally {
  span.end();
}
```

### Nested Spans with Context Propagation

Use `startActiveSpan` for automatic context propagation to child spans:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service', '1.0.0');

async function processOrder(orderId: string): Promise<void> {
  await tracer.startActiveSpan('process-order', async (span) => {
    try {
      span.setAttribute('order.id', orderId);

      // Child spans automatically inherit context
      await validateOrder(orderId); // Creates child span
      await processPayment(orderId); // Creates child span
      await sendConfirmation(orderId); // Creates child span

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

async function validateOrder(orderId: string): Promise<void> {
  await tracer.startActiveSpan('validate-order', async (span) => {
    // This span is automatically a child of 'process-order'
    span.setAttribute('validation.type', 'inventory-check');
    // ... validation logic
    span.end();
  });
}
```

### Resource Attributes

The SDK is configured with semantic convention attributes:

| Attribute                | Description        | Example                      |
| ------------------------ | ------------------ | ---------------------------- |
| `service.name`           | Service identifier | `'api'`, `'payment-service'` |
| `service.version`        | Service version    | `'1.2.3'`, `'abc123def'`     |
| `deployment.environment` | Environment name   | `'production'`, `'staging'`  |

## Metrics

### Metric Types

| Type          | Use Case                                  | Example                 |
| ------------- | ----------------------------------------- | ----------------------- |
| **Counter**   | Cumulative totals (requests, errors)      | `http.requests.total`   |
| **Histogram** | Distributions (latency, sizes)            | `http.request.duration` |
| **Gauge**     | Current values (connections, queue depth) | `db.connections.active` |

### Naming Conventions

Follow the OpenTelemetry naming pattern: `<domain>.<entity>.<action>`

```typescript
import { MetricNamingConvention, MetricAttributes } from '@package/observability';

// Use predefined constants
MetricNamingConvention.HTTP_REQUESTS; // 'http.server.requests'
MetricNamingConvention.DB_QUERY_DURATION; // 'db.query.duration'
MetricNamingConvention.CACHE_HITS; // 'cache.hits'
MetricNamingConvention.QUEUE_JOBS_ENQUEUED; // 'queue.jobs.enqueued'
MetricNamingConvention.BUSINESS_OPERATIONS; // 'business.operations'
```

### Using Metric Decorators

```typescript
import {
  MetricCounter,
  MetricHistogram,
  MetricOperationCounter,
  MetricAttributes
} from '@package/observability';

@Injectable()
export class OrderService {
  // Count method invocations
  @MetricCounter({
    name: 'orders.created',
    description: 'Orders created',
    attributes: { [MetricAttributes.COMPONENT]: 'orders' }
  })
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.orderRepository.create(dto);
  }

  // Record method duration
  @MetricHistogram({
    name: 'orders.processing.duration',
    description: 'Order processing time'
  })
  async processOrder(orderId: string): Promise<void> {
    await this.fulfillment.process(orderId);
  }

  // Track success/failure with separate counters
  @MetricOperationCounter({
    name: 'orders.operations',
    operationType: 'cancel',
    recordErrors: true
  })
  async cancelOrder(orderId: string): Promise<void> {
    await this.orderRepository.cancel(orderId);
  }
}
```

> **Note:** Decorator `attributes` are static and evaluated at decoration time.
> For **tenant-scoped metrics** requiring `organization_id` from request context,
> use the imperative `MetricRecorder` methods shown below, or the `*WithContext`
> methods from `MetricsService` which automatically inject tenant context.

### Imperative Metric Recording

```typescript
import {
  MetricRecorder,
  MetricNamingConvention,
  MetricAttributes,
  getOrganizationId
} from '@package/observability';

// Increment counter (always include organization_id for tenant isolation)
MetricRecorder.increment('http.requests', 1, {
  [MetricAttributes.ORGANIZATION_ID]: getOrganizationId(),
  [MetricAttributes.METHOD]: 'POST',
  [MetricAttributes.ROUTE]: '/api/orders',
  [MetricAttributes.STATUS_CODE]: 201
});

// Record histogram value
MetricRecorder.record(MetricNamingConvention.DB_QUERY_DURATION, queryTimeMs, {
  [MetricAttributes.ORGANIZATION_ID]: getOrganizationId(),
  [MetricAttributes.DB_SYSTEM]: 'postgresql',
  [MetricAttributes.DB_OPERATION]: 'SELECT',
  [MetricAttributes.DB_TABLE]: 'orders'
});

// Set gauge value
MetricRecorder.gauge('db.connections.active', connectionCount, {
  [MetricAttributes.ORGANIZATION_ID]: getOrganizationId(),
  [MetricAttributes.DB_SYSTEM]: 'postgresql'
});

// Measure operation duration
const result = await MetricRecorder.measure(
  'external.api.duration',
  () => externalApi.fetchData(query),
  { [MetricAttributes.ORGANIZATION_ID]: getOrganizationId(), api: 'payment-gateway' }
);
```

### Multi-Tenant Metrics

Always include `organization_id` for tenant-scoped analysis:

```typescript
import { MetricRecorder, MetricAttributes, getOrganizationId } from '@package/observability';

MetricRecorder.increment('orders.created', 1, {
  [MetricAttributes.ORGANIZATION_ID]: getOrganizationId(),
  [MetricAttributes.OPERATION_TYPE]: 'standard_order'
});
```

## Structured Logging

### Log Levels

| Level   | Use Case                                                 |
| ------- | -------------------------------------------------------- |
| `debug` | Detailed diagnostic information (disabled in production) |
| `info`  | Normal operation events, request handling                |
| `warn`  | Unexpected but recoverable situations                    |
| `error` | Errors that affect operation but don't crash the app     |
| `fatal` | Critical errors causing application shutdown             |

### Structured Log Format

Logs are output as JSON with automatic context enrichment:

```json
{
  "level": "info",
  "time": 1703980800000,
  "msg": "Order created",
  "orderId": "order-123",
  "userId": "user-456",
  "organizationId": "org-789",
  "requestId": "req-abc",
  "amount": 99.99
}
```

### Correlation ID Patterns

Use correlation IDs to trace requests across services:

```typescript
import {
  generateCorrelationId,
  extractCorrelationId,
  createCorrelationHeaders,
  withCorrelation,
  logger
} from '@package/observability';

// Extract from incoming request or generate new
const correlationId = extractCorrelationId(req.headers) ?? generateCorrelationId();

// Execute with correlation context
await withCorrelation({ requestId: correlationId }, async () => {
  logger.info('Processing request'); // Automatically includes requestId

  // Propagate to downstream services
  const headers = createCorrelationHeaders();
  await fetch('https://downstream-service/api', {
    headers: {
      'Content-Type': 'application/json',
      ...headers // Includes x-correlation-id
    }
  });
});
```

### W3C Trace Context

For distributed tracing interoperability:

```typescript
import { extractTraceParent, createTraceParent } from '@package/observability';

// Extract from incoming request
const traceContext = extractTraceParent(req.headers);
if (traceContext) {
  console.log('Trace ID:', traceContext.traceId);
  console.log('Parent Span:', traceContext.spanId);
  console.log('Sampled:', traceContext.sampled);
}

// Create for outbound requests
const traceparent = createTraceParent(traceId, spanId, true);
// '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
```

### PII Redaction

> **⚠️ CRITICAL: Never pass PII to loggers.** Even with redaction, PII should not
> flow through logging pipelines. The `redactObject` function is a **defense-in-depth
> fallback** for edge cases, not a license to log sensitive data. Always use
> `createSafeLogContext` to construct log contexts with only non-PII fields.

#### Recommended Pattern: Use `createSafeLogContext`

Always construct log contexts with only non-sensitive fields:

```typescript
import { createSafeLogContext, logger } from '@package/observability';

// ✅ CORRECT: Only pass non-PII fields to the logger
const safeContext = createSafeLogContext({
  userId: 'user-123', // Opaque identifier - OK
  action: 'profile_update', // Action type - OK
  organizationId: 'org-456' // Tenant identifier - OK
  // ❌ NEVER include: email, password, name, phone, address, etc.
});

logger.info('User profile updated', safeContext);
```

#### Defense-in-Depth: `redactObject`

The `redactObject` function provides a safety net for data that may accidentally
contain PII. Use it only when you cannot guarantee the data structure is PII-free,
**not** as a primary logging strategy:

```typescript
import { redactObject, logger } from '@package/observability';

// ⚠️ FALLBACK ONLY: Use when data structure is uncertain
// This should NOT be your normal logging pattern
function handleExternalWebhook(payload: unknown): void {
  // External payload structure is uncertain - apply redaction as safety net
  logger.debug('Webhook payload received', {
    sanitized: redactObject(payload as Record<string, unknown>)
  });
}

// Redaction output example (for fields that slip through):
// { id: 'user-123', email: '***REDACTED***', role: 'admin' }
```

> **Note:** If you find yourself regularly using `redactObject` on user data,
> refactor to explicitly select non-PII fields instead.

## NestJS Integration

### Module Registration

#### Static Configuration

```typescript
import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@package/observability';

@Module({
  imports: [
    ObservabilityModule.forRoot({
      telemetry: {
        serviceName: 'api',
        serviceVersion: '1.0.0',
        environment: process.env.NODE_ENV ?? 'development',
        exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      },
      enableGracefulShutdown: true,
      telemetryEnabled: process.env.OTEL_ENABLED === 'true'
    })
  ]
})
export class AppModule {}
```

#### Async Configuration with ConfigService

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ObservabilityModule } from '@package/observability';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ObservabilityModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        telemetry: {
          serviceName: config.getOrThrow('SERVICE_NAME'),
          serviceVersion: config.getOrThrow('SERVICE_VERSION'),
          environment: config.getOrThrow('NODE_ENV'),
          exporterUrl: config.get('OTEL_EXPORTER_URL')
        },
        telemetryEnabled: config.get('OTEL_ENABLED') === 'true'
      }),
      inject: [ConfigService]
    })
  ]
})
export class AppModule {}
```

### Dependency Injection

The module exports `Logger` and `MetricsService` for injection:

```typescript
import { Injectable } from '@nestjs/common';
import { Logger, MetricsService } from '@package/observability';

@Injectable()
export class PaymentService {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: MetricsService
  ) {}

  async processPayment(orderId: string, amount: number, organizationId: string): Promise<void> {
    this.logger.info('Processing payment', { orderId, amount, organizationId });

    const startTime = performance.now();
    try {
      await this.paymentGateway.charge(amount);

      this.metrics.incrementCounter('payments.successful', 1, {
        organization_id: organizationId,
        payment_method: 'credit_card'
      });
    } catch (error) {
      this.metrics.incrementCounter('payments.failed', 1, {
        organization_id: organizationId,
        error_type: error.name
      });
      throw error;
    } finally {
      const duration = performance.now() - startTime;
      this.metrics.recordHistogram('payments.duration', duration, {
        organization_id: organizationId
      });
    }
  }
}
```

### Request Context Middleware

Set up request context for automatic log enrichment:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  setRequestContext,
  extractCorrelationId,
  generateCorrelationId
} from '@package/observability';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = extractCorrelationId(req.headers) ?? generateCorrelationId();

    // Set response header for client debugging
    res.setHeader('x-correlation-id', correlationId);

    // Initialize request context
    setRequestContext({
      requestId: correlationId,
      userId: (req as any).user?.id,
      organizationId: (req as any).user?.organizationId
    });

    next();
  }
}

// In your module
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
```

### Lifecycle Hooks

The `ObservabilityModule` automatically handles:

- **`onModuleInit`**: Initializes OpenTelemetry SDK before requests are processed
- **`onApplicationShutdown`**: Flushes pending telemetry data on shutdown

Enable shutdown hooks in your main.ts:

```typescript
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Required for graceful telemetry shutdown
  app.enableShutdownHooks();

  await app.listen(3000);
}
```

## Context Propagation

### How AsyncLocalStorage Works

The observability package uses Node.js `AsyncLocalStorage` to propagate context across async boundaries automatically. Once context is set, it flows through:

- Promise chains (async/await)
- setTimeout/setInterval callbacks
- EventEmitter handlers
- Database queries
- HTTP requests

### Setting Context

```typescript
import { setRequestContext, withRequestContext } from '@package/observability';

// Option 1: Persistent context update (for middleware)
setRequestContext({
  requestId: 'req-123',
  userId: 'user-456',
  organizationId: 'org-789'
});

// Option 2: Scoped context (auto-cleanup when callback completes)
await withRequestContext({ requestId: 'req-123', userId: 'user-456' }, async () => {
  // Context available here and in all nested async calls
  await processRequest();
});
// Context automatically cleaned up here
```

### Retrieving Context

```typescript
import {
  getRequestContext,
  getRequestId,
  getUserId,
  getOrganizationId
} from '@package/observability';

// Get full context object
const context = getRequestContext();
// { requestId: 'req-123', userId: 'user-456', organizationId: 'org-789' }

// Get individual values
const requestId = getRequestId(); // 'req-123'
const userId = getUserId(); // 'user-456'
const organizationId = getOrganizationId(); // 'org-789'
```

### Context in Nested Async Operations

Context automatically propagates through nested operations:

```typescript
import { withRequestContext, getRequestId, logger } from '@package/observability';

async function handleRequest(): Promise<void> {
  await withRequestContext({ requestId: 'req-123' }, async () => {
    logger.info('Request started'); // Includes requestId

    // Context propagates to nested function
    await fetchUserData();

    // Even through setTimeout
    setTimeout(() => {
      console.log('Timer requestId:', getRequestId()); // 'req-123'
    }, 100);
  });
}

async function fetchUserData(): Promise<User> {
  // Context available without parameter passing
  logger.info('Fetching user data'); // Automatically includes requestId
  return userRepository.findById(getUserId());
}
```

### Multi-Tenant Context

For multi-tenant applications, always set organization context:

```typescript
import { setRequestContext, getOrganizationId, logger } from '@package/observability';

// In authentication middleware
setRequestContext({
  requestId: req.id,
  userId: authenticatedUser.id,
  organizationId: authenticatedUser.organizationId
});

// In any service method
async function getOrganizationData(): Promise<Data> {
  const orgId = getOrganizationId();
  if (!orgId) {
    throw new Error('Organization context required');
  }

  logger.info('Fetching org data'); // Includes organizationId automatically
  return dataRepository.findByOrganization(orgId);
}
```

## Building

```bash
pnpm nx build observability
```

## Running Tests

```bash
# Unit tests
pnpm nx test observability

# Integration tests (requires OTLP collector)
INCLUDE_INTEGRATION_TESTS=1 pnpm nx test observability
```

## Associated Packages

- [`@package/events`](../events/) - Kafka events with OpenTelemetry tracing

## Documentation References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Pino Documentation](https://getpino.io/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/)

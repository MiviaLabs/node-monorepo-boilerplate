/**
 * @package/observability
 *
 * Observability infrastructure package containing OpenTelemetry setup,
 * logging infrastructure, and metrics collection.
 *
 * Related packages:
 * - `@package/pubsub` - Pub/Sub message tracing
 * - `@package/tasks` - Cloud Tasks tracing
 * - `@package/queues` - BullMQ job tracing
 * - `@package/redis` - Redis cache tracing
 * - `@package/core` - Error handling integration
 * - `@package/auth` - Authentication telemetry
 *
 * @packageDocumentation
 */

// ====================================================================
// Configuration
// {@link ObservabilityConfig} - Observability configuration options
// See `@package/core` for IOpenTelemetryConfig interface
// ====================================================================
export * from './config';

// ====================================================================
// Errors
// {@link ObservabilityError} - Base observability error class
// ====================================================================
export * from './errors';

// ====================================================================
// Telemetry
// {@link initializeTelemetry} - Initialize OpenTelemetry SDK
// {@link shutdownTelemetry} - Graceful SDK shutdown
// See `@package/core` for tracing utilities
// ====================================================================
export * from './telemetry';

// ====================================================================
// Logger
// {@link Logger} - Structured logging with context
// {@link logger} - Global logger instance
// See `@package/core` for error logging
// ====================================================================
export * from './logger';

// ====================================================================
// Metrics
// {@link incrementCounter} - Counter metric recording
// {@link recordHistogram} - Histogram metric recording
// See `@package/core` for metric utilities
// ====================================================================
export * from './metrics';

// ====================================================================
// Context
// {@link setRequestContext} - Set request-scoped context
// {@link getRequestContext} - Retrieve request context
// {@link withRequestContext} - Execute with scoped context
// ====================================================================
export * from './context';

// ====================================================================
// Patterns
// {@link createCorrelationId} - Generate correlation IDs
// {@link createTraceParent} - W3C Trace Context header creation
// {@link redactObject} - PII redaction for logs
// ====================================================================
export * from './patterns';

// ====================================================================
// Decorators
// {@link Metric} - Method metric decorator
// ====================================================================
export * from './decorators';

// ====================================================================
// GCP OpenTelemetry Providers
// {@link GcpMetricsProvider} - GCP Cloud Monitoring integration
// {@link GcpLoggingProvider} - GCP Cloud Logging integration
// {@link GcpTraceProvider} - GCP Cloud Trace integration
// ====================================================================
export * from './providers/gcp-provider.types';
export * from './providers/gcp-provider.interface';
export * from './providers/gcp-metrics.provider';
export * from './providers/gcp-logging.provider';
export * from './providers/gcp-trace.provider';
export * from './providers/gcp-otel-provider.factory';
export * from './providers/gcp-auth-headers.provider';

// ====================================================================
// NestJS Module
// {@link ObservabilityModule} - NestJS module for observability
// ====================================================================
export * from './observability.module';

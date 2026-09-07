/**
 * OpenTelemetry SDK Initialization and Management
 *
 * This module provides functions to initialize, manage, and shut down the OpenTelemetry SDK
 * for distributed tracing, metrics collection, and automatic instrumentation. It wraps the
 * OpenTelemetry Node.js SDK with a simplified API that integrates with the observability
 * package's configuration system.
 *
 * ## Automatic Instrumentation
 *
 * When initialized, the SDK automatically instruments common Node.js libraries and frameworks:
 * - **HTTP/HTTPS**: Incoming and outgoing HTTP requests
 * - **Express/Fastify/NestJS**: Web framework routing and middleware
 * - **PostgreSQL/MySQL/MongoDB**: Database queries and connections
 * - **Redis**: Cache operations
 * - **gRPC**: Remote procedure calls
 * - **AWS SDK/GCP SDK**: Cloud service operations
 *
 * No code changes are required for automatic instrumentation - it works by monkey-patching
 * the libraries at runtime when the SDK starts.
 *
 * ## Manual Span Creation
 *
 * For custom instrumentation beyond automatic tracing, use the OpenTelemetry Trace API:
 *
 * @example Creating manual spans
 * ```typescript
 * import { trace } from '@opentelemetry/api';
 *
 * // Get a tracer for your component
 * const tracer = trace.getTracer('my-service', '1.0.0');
 *
 * // Create a simple span
 * const span = tracer.startSpan('my-operation');
 * try {
 *   // Perform operation
 *   span.setAttribute('user.id', userId);
 *   span.addEvent('processing-started');
 *   // ... operation logic
 *   span.setStatus({ code: SpanStatusCode.OK });
 * } catch (error) {
 *   span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
 *   throw error;
 * } finally {
 *   span.end();
 * }
 * ```
 *
 * @example Using startActiveSpan for automatic context propagation
 * ```typescript
 * import { trace, SpanStatusCode } from '@opentelemetry/api';
 *
 * const tracer = trace.getTracer('payment-service', '1.0.0');
 *
 * async function processPayment(orderId: string, amount: number): Promise<void> {
 *   await tracer.startActiveSpan('process-payment', async (span) => {
 *     try {
 *       // Child spans automatically inherit context from this active span
 *       span.setAttribute('order.id', orderId);
 *       span.setAttribute('payment.amount', amount);
 *       span.setAttribute('payment.currency', 'USD');
 *
 *       // Nested operations automatically become child spans
 *       await validatePayment(orderId);
 *       await chargeCard(amount);
 *
 *       span.setStatus({ code: SpanStatusCode.OK });
 *     } catch (error) {
 *       span.recordException(error as Error);
 *       span.setStatus({ code: SpanStatusCode.ERROR });
 *       throw error;
 *     } finally {
 *       span.end();
 *     }
 *   });
 * }
 * ```
 *
 * ## Resource Attributes (Semantic Conventions)
 *
 * This module configures OpenTelemetry resources following semantic conventions:
 * - `service.name` - Identifies the service in traces (e.g., "api", "payment-service")
 * - `service.version` - Service version for debugging (e.g., "1.2.3", commit SHA)
 * - `deployment.environment` - Environment name (e.g., "production", "staging", "development")
 *
 * These attributes appear on all spans and metrics, enabling filtering and grouping
 * in observability backends like Jaeger, Zipkin, or cloud-native solutions.
 *
 * @see {@link https://opentelemetry.io/docs/concepts/semantic-conventions/} OpenTelemetry Semantic Conventions
 * @see {@link https://opentelemetry.io/docs/instrumentation/js/} OpenTelemetry JavaScript Documentation
 *
 * @module observability/telemetry
 */

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes, Resource } from '@opentelemetry/resources';
import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';

import type { ResolvedTelemetryConfig } from './config';

/** The singleton NodeSDK instance, null when not initialized or after shutdown */
let sdk: NodeSDK | null = null;

/**
 * Configuration options for OpenTelemetry SDK initialization.
 *
 * All fields except `serviceName`, `serviceVersion`, and `environment` are optional.
 * When not provided, values are read from environment variables or use sensible defaults.
 *
 * @interface ITelemetryConfig
 *
 * @example Minimal configuration
 * ```typescript
 * const config: ITelemetryConfig = {
 *   serviceName: 'my-api',
 *   serviceVersion: '1.0.0',
 *   environment: 'production'
 * };
 * ```
 *
 * @example Full configuration with OTLP exporter
 * ```typescript
 * const config: ITelemetryConfig = {
 *   serviceName: 'payment-service',
 *   serviceVersion: process.env.GIT_SHA ?? '0.0.0',
 *   environment: process.env.NODE_ENV ?? 'development',
 *   exporterUrl: 'http://otel-collector:4317',
 *   enabled: true
 * };
 * ```
 */
export interface ITelemetryConfig {
  /**
   * The logical name of the service.
   *
   * Maps to the `service.name` resource attribute in OpenTelemetry semantic conventions.
   * This appears in trace viewers to identify which service generated spans.
   *
   * @example 'api', 'payment-service', 'user-auth'
   */
  serviceName: string;

  /**
   * The version of the service.
   *
   * Maps to the `service.version` resource attribute. Useful for identifying which
   * deployment produced specific traces during debugging.
   *
   * @example '1.2.3', 'abc123def' (git SHA), '2024.01.15'
   */
  serviceVersion: string;

  /**
   * The deployment environment name.
   *
   * Maps to the `deployment.environment` resource attribute. Used to filter traces
   * by environment in observability backends.
   *
   * @example 'production', 'staging', 'development', 'test'
   */
  environment: string;

  /**
   * The OTLP exporter endpoint URL.
   *
   * When provided, configures the SDK to export traces via OTLP to this endpoint.
   * Sets the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable for the SDK.
   *
   * Common endpoints:
   * - Local collector: `http://localhost:4317` (gRPC) or `http://localhost:4318` (HTTP)
   * - Kubernetes: `http://otel-collector:4317`
   * - Cloud providers: Varies by provider
   *
   * @example 'http://otel-collector:4317', 'https://otlp.example.com:443'
   */
  exporterUrl?: string;

  /**
   * Enable or disable OpenTelemetry SDK initialization.
   *
   * When `false`, `initializeTelemetry()` returns immediately without starting the SDK.
   * Useful for disabling telemetry in development or test environments.
   *
   * @default process.env.OTEL_ENABLED === 'true'
   */
  enabled?: boolean;
}

/**
 * Checks whether OpenTelemetry instrumentation is enabled.
 *
 * This function determines if telemetry should be active by checking:
 * 1. The `enabled` property in the provided configuration (if present)
 * 2. The `OTEL_ENABLED` environment variable (fallback)
 *
 * Use this function to conditionally execute telemetry-related code or to
 * verify the telemetry state before attempting operations that require
 * an active SDK.
 *
 * @param config - Optional telemetry configuration object. If provided and contains
 *                 an `enabled` property, that value takes precedence over the
 *                 environment variable.
 * @returns `true` if telemetry is enabled, `false` otherwise
 *
 * @example Check before manual instrumentation
 * ```typescript
 * import { isTelemetryEnabled } from '@package/observability';
 * import { trace } from '@opentelemetry/api';
 *
 * function performOperation(): void {
 *   if (isTelemetryEnabled()) {
 *     const tracer = trace.getTracer('my-service');
 *     const span = tracer.startSpan('custom-operation');
 *     // ... traced operation
 *     span.end();
 *   } else {
 *     // ... untraced operation
 *   }
 * }
 * ```
 *
 * @example Use with configuration object
 * ```typescript
 * const config = resolveConfig({ telemetry: { enabled: false } });
 *
 * if (isTelemetryEnabled(config.telemetry)) {
 *   initializeTelemetry(config.telemetry);
 * }
 * ```
 */
export function isTelemetryEnabled(config?: ITelemetryConfig | ResolvedTelemetryConfig): boolean {
  if (config?.enabled !== undefined) {
    return config.enabled;
  }
  return process.env['OTEL_ENABLED'] === 'true';
}

/**
 * Initializes the OpenTelemetry Node.js SDK with automatic instrumentation.
 *
 * This function configures and starts the OpenTelemetry SDK, enabling distributed tracing
 * and automatic instrumentation of common Node.js libraries. It is idempotent - calling
 * it multiple times has no effect after the first successful initialization.
 *
 * ## Initialization Behavior
 *
 * - If `config.enabled` is `false` (or `OTEL_ENABLED` is not `'true'`), returns immediately
 * - If the SDK is already initialized, returns immediately (idempotent)
 * - Configures resource attributes following OpenTelemetry semantic conventions
 * - Enables automatic instrumentation for HTTP, databases, and other libraries
 * - If `exporterUrl` is provided, configures OTLP export to that endpoint
 *
 * ## Resource Attributes
 *
 * The SDK is configured with the following resource attributes:
 * - `service.name` - From `config.serviceName`
 * - `service.version` - From `config.serviceVersion`
 * - `deployment.environment` - From `config.environment`
 *
 * ## When to Call
 *
 * Call this function early in your application's startup sequence, before any
 * instrumented libraries are used. Typically in your main entry point:
 *
 * @param config - Configuration options for the telemetry SDK. Accepts either
 *                 an `ITelemetryConfig` object or a `ResolvedTelemetryConfig` from
 *                 the config resolver.
 * @returns void - The function has no return value. Check `isTelemetryEnabled()`
 *                 to verify the SDK state after initialization.
 *
 * @example Basic initialization in application entry point
 * ```typescript
 * import { initializeTelemetry } from '@package/observability';
 *
 * // Initialize at application startup
 * initializeTelemetry({
 *   serviceName: 'api',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 *   enabled: true
 * });
 *
 * // Now start your application - all HTTP requests, DB queries, etc. are traced
 * const app = await NestFactory.create(AppModule);
 * await app.listen(3000);
 * ```
 *
 * @example Using resolved configuration from observability module
 * ```typescript
 * import { resolveConfig, initializeTelemetry } from '@package/observability';
 *
 * // Resolve configuration from environment variables and defaults
 * const config = resolveConfig({
 *   telemetry: {
 *     serviceName: 'payment-service',
 *     serviceVersion: process.env.GIT_SHA
 *   }
 * });
 *
 * // Initialize with resolved config
 * initializeTelemetry(config.telemetry);
 * ```
 *
 * @example With OTLP collector endpoint
 * ```typescript
 * initializeTelemetry({
 *   serviceName: 'user-service',
 *   serviceVersion: '2.1.0',
 *   environment: process.env.NODE_ENV ?? 'development',
 *   exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
 *   enabled: process.env.OTEL_ENABLED === 'true'
 * });
 * ```
 *
 * @see {@link shutdownTelemetry} for graceful shutdown
 * @see {@link isTelemetryEnabled} to check if telemetry is active
 */
export function initializeTelemetry(config: ITelemetryConfig | ResolvedTelemetryConfig): void {
  // Skip initialization if disabled
  if (!isTelemetryEnabled(config)) {
    return;
  }

  if (sdk) {
    return;
  }

  const resource: Resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
    'deployment.environment': config.environment
  });

  // Add trace exporter if URL is provided. The endpoint is passed
  // programmatically to the exporter instead of mutating process.env — a
  // library must not change global process state. NodeSDK's env-var semantics
  // treat OTEL_EXPORTER_OTLP_ENDPOINT as a base URL with /v1/traces appended;
  // we preserve that contract here.
  const sdkConfig: Partial<NodeSDKConfiguration> = {
    resource,
    instrumentations: [getNodeAutoInstrumentations()]
  };

  if (config.exporterUrl) {
    const baseUrl = config.exporterUrl.replace(/\/+$/, '');
    sdkConfig.traceExporter = new OTLPTraceExporter({
      url: `${baseUrl}/v1/traces`
    });
  }

  sdk = new NodeSDK(sdkConfig);

  sdk.start();
}

/**
 * Gracefully shuts down the OpenTelemetry SDK.
 *
 * This function flushes any pending telemetry data and releases SDK resources.
 * It ensures that all buffered spans and metrics are exported before the process
 * terminates, preventing data loss.
 *
 * ## Shutdown Behavior
 *
 * - Flushes all pending spans to configured exporters
 * - Closes connections to telemetry backends
 * - Releases SDK resources
 * - Resets the SDK state to allow re-initialization if needed
 *
 * If the SDK is not initialized (or was already shut down), this function
 * returns immediately without error.
 *
 * ## When to Call
 *
 * Call this function during application shutdown to ensure telemetry data is not lost:
 * - In process signal handlers (SIGTERM, SIGINT)
 * - In application lifecycle hooks (NestJS `onApplicationShutdown`)
 * - Before process exit in CLI tools
 *
 * @returns A promise that resolves when the shutdown is complete. The promise
 *          resolves immediately if the SDK is not initialized.
 *
 * @example Graceful shutdown with process signals
 * ```typescript
 * import { initializeTelemetry, shutdownTelemetry } from '@package/observability';
 *
 * // Initialize telemetry
 * initializeTelemetry(config);
 *
 * // Handle graceful shutdown
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down...');
 *   await shutdownTelemetry();
 *   process.exit(0);
 * });
 *
 * process.on('SIGINT', async () => {
 *   console.log('Interrupted, shutting down...');
 *   await shutdownTelemetry();
 *   process.exit(0);
 * });
 * ```
 *
 * @example NestJS application shutdown hook
 * ```typescript
 * import { Injectable, OnApplicationShutdown } from '@nestjs/common';
 * import { shutdownTelemetry } from '@package/observability';
 *
 * @Injectable()
 * export class TelemetryService implements OnApplicationShutdown {
 *   async onApplicationShutdown(signal?: string): Promise<void> {
 *     console.log(`Received ${signal}, flushing telemetry...`);
 *     await shutdownTelemetry();
 *   }
 * }
 * ```
 *
 * @see {@link initializeTelemetry} for SDK initialization
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

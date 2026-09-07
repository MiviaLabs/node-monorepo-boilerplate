/**
 * Configuration interfaces for the @package/core package.
 *
 * This module defines all configuration interfaces that control infrastructure
 * behavior including timeouts, retries, health checks, and observability settings.
 * Configuration follows a three-tier priority system:
 *
 * 1. **User-provided configuration** (highest priority) - Passed directly to functions
 * 2. **Environment variables** - Read from `process.env` using the `INFRA_*` prefix
 * 3. **Default values** (lowest priority) - Sensible defaults for production use
 *
 * @remarks
 * All configuration interfaces use optional fields. When a field is not provided,
 * the system falls back to environment variables, then to built-in defaults.
 * This design allows flexible configuration across different deployment environments.
 *
 * @see IResolvedInfrastructureCoreConfig - The fully-resolved configuration type
 * @see resolveConfig - Function that resolves configuration
 * @see defaults - Default values for all configuration options
 *
 * @example Complete configuration object with all options
 * ```typescript
 * import type { IInfrastructureCoreConfig } from '@package/core';
 *
 * const config: IInfrastructureCoreConfig = {
 *   enableGracefulShutdown: true,
 *
 *   timeouts: {
 *     default: 30000,    // 30 seconds for general operations
 *     short: 5000,       // 5 seconds for quick operations
 *     medium: 15000,     // 15 seconds for moderate operations
 *     long: 60000,       // 1 minute for longer operations
 *     veryLong: 300000   // 5 minutes for batch/bulk operations
 *   },
 *
 *   retry: {
 *     maxAttempts: 3,           // Try up to 3 times
 *     initialDelayMs: 1000,     // Start with 1 second delay
 *     maxDelayMs: 10000,        // Cap delay at 10 seconds
 *     backoffMultiplier: 2      // Double delay each retry
 *   },
 *
 *   healthCheck: {
 *     intervalMs: 30000,        // Check every 30 seconds
 *     timeoutMs: 5000,          // Timeout after 5 seconds
 *     unhealthyThreshold: 3     // Mark unhealthy after 3 failures
 *   },
 *
 *   openTelemetry: {
 *     enableTracing: true,
 *     enableMetrics: true,
 *     tracerName: '@myorg/api',
 *     meterName: '@myorg/api',
 *     serviceName: 'api-service',
 *     serviceVersion: '1.0.0'
 *   }
 * };
 * ```
 *
 * @module
 */

/**
 * Timeout configuration for infrastructure operations.
 *
 * Defines multiple timeout tiers for different operation types. Using tiered
 * timeouts allows fine-grained control over how long operations can run before
 * being cancelled.
 *
 * @remarks
 * All timeout values are in milliseconds. Choose the appropriate timeout tier
 * based on the expected duration of the operation:
 * - `short`: Quick lookups, cache reads, simple validations
 * - `medium`: Database queries, API calls to fast services
 * - `default`: General-purpose operations
 * - `long`: Complex queries, file uploads, external API calls
 * - `veryLong`: Batch processing, bulk operations, migrations
 *
 * @see DEFAULT_TIMEOUT_CONFIG - Default values
 *
 * @example Using timeout tiers in operations
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * const config = resolveConfig({ timeouts: { short: 3000 } });
 *
 * // Use short timeout for cache operations
 * await cacheOperation({ timeout: config.timeouts.short });
 *
 * // Use long timeout for file uploads
 * await uploadFile({ timeout: config.timeouts.long });
 * ```
 */
export interface ITimeoutConfig {
  /**
   * Default timeout in milliseconds for general operations.
   *
   * Used when no specific timeout tier is specified.
   *
   * @defaultValue 30000 (30 seconds)
   * @minimum 100
   * @maximum 600000 (10 minutes)
   */
  default?: number;

  /**
   * Short timeout in milliseconds for quick operations.
   *
   * Ideal for cache reads, simple lookups, and health checks.
   *
   * @defaultValue 5000 (5 seconds)
   * @minimum 100
   * @maximum 30000 (30 seconds)
   */
  short?: number;

  /**
   * Medium timeout in milliseconds for moderate operations.
   *
   * Suitable for database queries and fast API calls.
   *
   * @defaultValue 15000 (15 seconds)
   * @minimum 1000
   * @maximum 60000 (1 minute)
   */
  medium?: number;

  /**
   * Long timeout in milliseconds for extended operations.
   *
   * Appropriate for complex queries, file operations, and external APIs.
   *
   * @defaultValue 60000 (1 minute)
   * @minimum 5000
   * @maximum 300000 (5 minutes)
   */
  long?: number;

  /**
   * Very long timeout in milliseconds for batch operations.
   *
   * Reserved for bulk processing, migrations, and long-running tasks.
   *
   * @defaultValue 300000 (5 minutes)
   * @minimum 30000
   * @maximum 3600000 (1 hour)
   */
  veryLong?: number;
}

/**
 * Retry configuration for transient failure recovery.
 *
 * Configures exponential backoff retry behavior for operations that may
 * experience transient failures (network issues, rate limits, temporary
 * service unavailability).
 *
 * @remarks
 * The retry delay follows exponential backoff:
 * ```
 * delay = min(initialDelayMs * (backoffMultiplier ^ (attempt - 1)), maxDelayMs)
 * ```
 *
 * For example, with defaults (1000ms initial, 2x multiplier, 10000ms max):
 * - Attempt 1: 1000ms delay
 * - Attempt 2: 2000ms delay
 * - Attempt 3: 4000ms delay
 * - Attempt 4: 8000ms delay
 * - Attempt 5+: 10000ms delay (capped at maxDelayMs)
 *
 * @see DEFAULT_RETRY_CONFIG - Default values
 *
 * @example Custom retry configuration for rate-limited APIs
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // More aggressive retries for rate-limited APIs
 * const config = resolveConfig({
 *   retry: {
 *     maxAttempts: 5,
 *     initialDelayMs: 2000,    // Start with longer delay
 *     maxDelayMs: 30000,       // Allow up to 30 second delays
 *     backoffMultiplier: 1.5   // Gentler backoff curve
 *   }
 * });
 * ```
 */
export interface IRetryConfig {
  /**
   * Maximum number of retry attempts before giving up.
   *
   * Includes the initial attempt. A value of 3 means: 1 initial + 2 retries.
   *
   * @defaultValue 3
   * @minimum 1
   * @maximum 10
   */
  maxAttempts?: number;

  /**
   * Initial retry delay in milliseconds.
   *
   * The delay before the first retry attempt. Subsequent retries use
   * exponential backoff based on this value.
   *
   * @defaultValue 1000 (1 second)
   * @minimum 100
   * @maximum 30000 (30 seconds)
   */
  initialDelayMs?: number;

  /**
   * Maximum retry delay in milliseconds.
   *
   * Caps the exponential backoff to prevent excessively long delays.
   *
   * @defaultValue 10000 (10 seconds)
   * @minimum 1000
   * @maximum 300000 (5 minutes)
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier for exponential delay growth.
   *
   * Each retry multiplies the previous delay by this factor.
   * Use 1.0 for constant delays, 2.0 for doubling, etc.
   *
   * @defaultValue 2
   * @minimum 1
   * @maximum 5
   */
  backoffMultiplier?: number;
}

/**
 * Health check configuration for monitoring infrastructure components.
 *
 * Controls how frequently health checks run and when to mark a component
 * as unhealthy. Used by connection pools, service monitors, and load balancers.
 *
 * @remarks
 * Health checks help detect and recover from component failures:
 * - Periodic checks detect problems before they impact users
 * - Unhealthy thresholds prevent flapping (rapid healthy/unhealthy transitions)
 * - Timeouts ensure checks don't hang indefinitely
 *
 * @see DEFAULT_HEALTH_CHECK_CONFIG - Default values
 *
 * @example Health check configuration for critical services
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // More frequent checks for critical database connections
 * const config = resolveConfig({
 *   healthCheck: {
 *     intervalMs: 10000,         // Check every 10 seconds
 *     timeoutMs: 3000,           // Fail fast on slow responses
 *     unhealthyThreshold: 2      // Mark unhealthy after 2 failures
 *   }
 * });
 * ```
 */
export interface IHealthCheckConfig {
  /**
   * Health check interval in milliseconds.
   *
   * How frequently to run health checks. Lower values detect problems
   * faster but increase overhead.
   *
   * @defaultValue 30000 (30 seconds)
   * @minimum 1000
   * @maximum 300000 (5 minutes)
   */
  intervalMs?: number;

  /**
   * Health check timeout in milliseconds.
   *
   * Maximum time to wait for a health check response. Should be less
   * than the interval to prevent overlapping checks.
   *
   * @defaultValue 5000 (5 seconds)
   * @minimum 500
   * @maximum 30000 (30 seconds)
   */
  timeoutMs?: number;

  /**
   * Consecutive failures before marking unhealthy.
   *
   * Number of consecutive failed health checks required before a
   * component is marked as unhealthy. Prevents false positives from
   * transient issues.
   *
   * @defaultValue 3
   * @minimum 1
   * @maximum 10
   */
  unhealthyThreshold?: number;
}

/**
 * OpenTelemetry configuration for observability features.
 *
 * Controls distributed tracing and metrics collection. These settings
 * integrate with the OpenTelemetry SDK configured in your application.
 *
 * @remarks
 * OpenTelemetry provides:
 * - **Tracing**: Distributed trace context for request flows
 * - **Metrics**: Counters, histograms, and gauges for monitoring
 *
 * The `serviceName` and `serviceVersion` are used to identify your service
 * in trace and metric data. If not provided, they fall back to the
 * `SERVICE_NAME` and `SERVICE_VERSION` environment variables.
 *
 * @see DEFAULT_OPENTELEMETRY_CONFIG - Default values
 * @see tracing - Tracing utilities
 * @see metrics - Metrics utilities
 *
 * @example Configuring OpenTelemetry for a microservice
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * const config = resolveConfig({
 *   openTelemetry: {
 *     enableTracing: true,
 *     enableMetrics: true,
 *     serviceName: 'user-service',
 *     serviceVersion: process.env.APP_VERSION || '1.0.0',
 *     tracerName: '@myorg/user-service',
 *     meterName: '@myorg/user-service'
 *   }
 * });
 * ```
 */
export interface IOpenTelemetryConfig {
  /**
   * Enable distributed tracing.
   *
   * When enabled, spans are created for instrumented operations.
   * Requires OpenTelemetry SDK to be configured for trace export.
   *
   * @defaultValue true
   */
  enableTracing?: boolean;

  /**
   * Enable metrics collection.
   *
   * When enabled, metrics (counters, histograms) are recorded.
   * Requires OpenTelemetry SDK to be configured for metric export.
   *
   * @defaultValue true
   */
  enableMetrics?: boolean;

  /**
   * Default tracer name for creating spans.
   *
   * Identifies the instrumentation library in trace data. Use your
   * package or service name for easy filtering.
   *
   * @defaultValue '@package/core'
   */
  tracerName?: string;

  /**
   * Default meter name for creating metrics.
   *
   * Identifies the instrumentation library in metric data. Use your
   * package or service name for easy filtering.
   *
   * @defaultValue '@package/core'
   */
  meterName?: string;

  /**
   * Service name for trace and metric identification.
   *
   * Appears in observability tools to identify your service.
   * Falls back to `SERVICE_NAME` environment variable.
   *
   * @defaultValue undefined (uses SERVICE_NAME env var)
   */
  serviceName?: string;

  /**
   * Service version for trace and metric identification.
   *
   * Helps correlate traces/metrics with specific deployments.
   * Falls back to `SERVICE_VERSION` environment variable.
   *
   * @defaultValue undefined (uses SERVICE_VERSION env var)
   */
  serviceVersion?: string;
}

/**
 * Environment variable name mappings for configuration.
 *
 * Allows customization of environment variable names for different
 * deployment scenarios where standard `INFRA_*` prefixes conflict
 * with existing variables.
 *
 * @remarks
 * By default, all environment variables use the `INFRA_` prefix (except
 * `SERVICE_NAME` and `SERVICE_VERSION` which follow OpenTelemetry conventions).
 * Use this interface to override variable names when deploying in environments
 * with different naming conventions.
 *
 * @example Using custom environment variable names
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // Use APP_ prefix instead of INFRA_
 * const config = resolveConfig({
 *   envVarNames: {
 *     timeoutDefault: 'APP_TIMEOUT_DEFAULT',
 *     retryMaxAttempts: 'APP_RETRY_MAX_ATTEMPTS',
 *     otelServiceName: 'OTEL_SERVICE_NAME'
 *   }
 * });
 * ```
 */
export interface IEnvironmentVariableNames {
  /**
   * Environment variable for graceful shutdown toggle.
   * @defaultValue 'INFRA_ENABLE_GRACEFUL_SHUTDOWN'
   */
  enableGracefulShutdown?: string;

  /**
   * Environment variable for default timeout.
   * @defaultValue 'INFRA_TIMEOUT_DEFAULT'
   */
  timeoutDefault?: string;

  /**
   * Environment variable for short timeout.
   * @defaultValue 'INFRA_TIMEOUT_SHORT'
   */
  timeoutShort?: string;

  /**
   * Environment variable for medium timeout.
   * @defaultValue 'INFRA_TIMEOUT_MEDIUM'
   */
  timeoutMedium?: string;

  /**
   * Environment variable for long timeout.
   * @defaultValue 'INFRA_TIMEOUT_LONG'
   */
  timeoutLong?: string;

  /**
   * Environment variable for very long timeout.
   * @defaultValue 'INFRA_TIMEOUT_VERY_LONG'
   */
  timeoutVeryLong?: string;

  /**
   * Environment variable for retry max attempts.
   * @defaultValue 'INFRA_RETRY_MAX_ATTEMPTS'
   */
  retryMaxAttempts?: string;

  /**
   * Environment variable for retry initial delay.
   * @defaultValue 'INFRA_RETRY_INITIAL_DELAY_MS'
   */
  retryInitialDelayMs?: string;

  /**
   * Environment variable for retry max delay.
   * @defaultValue 'INFRA_RETRY_MAX_DELAY_MS'
   */
  retryMaxDelayMs?: string;

  /**
   * Environment variable for retry backoff multiplier.
   * @defaultValue 'INFRA_RETRY_BACKOFF_MULTIPLIER'
   */
  retryBackoffMultiplier?: string;

  /**
   * Environment variable for health check interval.
   * @defaultValue 'INFRA_HEALTH_CHECK_INTERVAL_MS'
   */
  healthCheckIntervalMs?: string;

  /**
   * Environment variable for health check timeout.
   * @defaultValue 'INFRA_HEALTH_CHECK_TIMEOUT_MS'
   */
  healthCheckTimeoutMs?: string;

  /**
   * Environment variable for unhealthy threshold.
   * @defaultValue 'INFRA_HEALTH_CHECK_UNHEALTHY_THRESHOLD'
   */
  healthCheckUnhealthyThreshold?: string;

  /**
   * Environment variable for OpenTelemetry tracing toggle.
   * @defaultValue 'INFRA_OTEL_TRACING_ENABLED'
   */
  otelTracingEnabled?: string;

  /**
   * Environment variable for OpenTelemetry metrics toggle.
   * @defaultValue 'INFRA_OTEL_METRICS_ENABLED'
   */
  otelMetricsEnabled?: string;

  /**
   * Environment variable for tracer name.
   * @defaultValue 'INFRA_OTEL_TRACER_NAME'
   */
  otelTracerName?: string;

  /**
   * Environment variable for meter name.
   * @defaultValue 'INFRA_OTEL_METER_NAME'
   */
  otelMeterName?: string;

  /**
   * Environment variable for service name.
   * @defaultValue 'SERVICE_NAME'
   */
  otelServiceName?: string;

  /**
   * Environment variable for service version.
   * @defaultValue 'SERVICE_VERSION'
   */
  otelServiceVersion?: string;
}

/**
 * Main configuration interface for the @package/core package.
 *
 * All configuration options are optional. Values are resolved using the
 * three-tier priority system: user config → environment variables → defaults.
 *
 * @remarks
 * This is the input configuration type. After resolution, use
 * {@link IResolvedInfrastructureCoreConfig} which has all defaults applied.
 *
 * @see IResolvedInfrastructureCoreConfig - The resolved output type
 * @see resolveConfig - Resolution function
 *
 * @example Minimal configuration (uses all defaults)
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // All values come from environment variables or defaults
 * const config = resolveConfig({});
 * ```
 *
 * @example Partial override with environment fallback
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // Override specific values, rest from env/defaults
 * const config = resolveConfig({
 *   timeouts: { default: 45000 },
 *   retry: { maxAttempts: 5 }
 * });
 * ```
 */
export interface IInfrastructureCoreConfig {
  /**
   * Enable graceful shutdown on SIGTERM/SIGINT signals.
   *
   * When enabled, the process waits for in-flight operations to complete
   * before exiting. Disable only in development or test environments.
   *
   * @defaultValue true
   */
  enableGracefulShutdown?: boolean;

  /**
   * Timeout configuration for operations.
   * @see {@link ITimeoutConfig}
   */
  timeouts?: ITimeoutConfig;

  /**
   * Retry configuration for transient failures.
   * @see {@link IRetryConfig}
   */
  retry?: IRetryConfig;

  /**
   * Health check configuration for monitoring.
   * @see {@link IHealthCheckConfig}
   */
  healthCheck?: IHealthCheckConfig;

  /**
   * OpenTelemetry observability configuration.
   * @see {@link IOpenTelemetryConfig}
   */
  openTelemetry?: IOpenTelemetryConfig;

  /**
   * Custom environment variable name mappings.
   * @see {@link IEnvironmentVariableNames}
   */
  envVarNames?: IEnvironmentVariableNames;
}

/**
 * Resolved configuration with all defaults applied.
 *
 * This interface represents the final configuration after merging user
 * options, environment variables, and defaults. All fields are required
 * (except optional service identification fields).
 *
 * @remarks
 * This is the output type of resolveConfig.
 * Use this type when you need guaranteed values without undefined checks.
 *
 * @see IInfrastructureCoreConfig - The input configuration type
 * @see resolveConfig - Resolution function
 *
 * @example Using resolved configuration
 * ```typescript
 * import { resolveConfig, IResolvedInfrastructureCoreConfig } from '@package/core';
 *
 * function createClient(config: IResolvedInfrastructureCoreConfig): Client {
 *   // No undefined checks needed - all values are guaranteed
 *   return new Client({
 *     timeout: config.timeouts.default,
 *     retries: config.retry.maxAttempts,
 *     healthCheckInterval: config.healthCheck.intervalMs
 *   });
 * }
 *
 * const config = resolveConfig({ timeouts: { default: 60000 } });
 * const client = createClient(config);
 * ```
 */
export interface IResolvedInfrastructureCoreConfig {
  /**
   * Whether graceful shutdown is enabled.
   * Always resolved to a boolean value.
   */
  enableGracefulShutdown: boolean;

  /**
   * Fully resolved timeout configuration.
   * All timeout tiers are guaranteed to have values.
   */
  timeouts: Required<ITimeoutConfig>;

  /**
   * Fully resolved retry configuration.
   * All retry settings are guaranteed to have values.
   */
  retry: Required<IRetryConfig>;

  /**
   * Fully resolved health check configuration.
   * All health check settings are guaranteed to have values.
   */
  healthCheck: Required<IHealthCheckConfig>;

  /**
   * Resolved OpenTelemetry configuration.
   *
   * Core settings (enableTracing, enableMetrics, tracerName, meterName)
   * are guaranteed. Service identification (serviceName, serviceVersion)
   * may be undefined if not provided via config or environment.
   */
  openTelemetry: Omit<Required<IOpenTelemetryConfig>, 'serviceName' | 'serviceVersion'> & {
    serviceName?: string;
    serviceVersion?: string;
  };
}

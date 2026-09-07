/**
 * Default configuration values for the @package/core package.
 *
 * This module provides production-ready default values for all configuration
 * options. These defaults are carefully chosen to balance:
 *
 * - **Performance**: Fast enough for real-time applications
 * - **Reliability**: Robust enough to handle transient failures
 * - **Resource efficiency**: Conservative resource consumption
 *
 * ## Default Value Philosophy
 *
 * | Category | Principle |
 * |----------|-----------|
 * | Timeouts | Long enough for normal operations, short enough to fail fast |
 * | Retries | Enough attempts for transient failures, not so many to overwhelm |
 * | Health checks | Frequent enough to detect issues, not so frequent to add overhead |
 * | Observability | Enabled by default for production visibility |
 *
 * ## Override Priority
 *
 * These defaults have the lowest priority in the configuration resolution:
 * 1. User-provided configuration (highest)
 * 2. Environment variables
 * 3. These defaults (lowest)
 *
 * @see ITimeoutConfig - Timeout configuration interface
 * @see IRetryConfig - Retry configuration interface
 * @see IHealthCheckConfig - Health check configuration interface
 * @see IOpenTelemetryConfig - OpenTelemetry configuration interface
 * @see resolveConfig - Configuration resolution function
 *
 * @example Using defaults directly (not recommended - use resolveConfig instead)
 * ```typescript
 * import { DEFAULT_TIMEOUT_CONFIG, DEFAULT_RETRY_CONFIG } from '@package/core';
 *
 * // Direct access to defaults (for documentation or testing)
 * console.log(DEFAULT_TIMEOUT_CONFIG.default);  // 30000
 * console.log(DEFAULT_RETRY_CONFIG.maxAttempts); // 3
 * ```
 *
 * @example Preferred usage via resolveConfig
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // Defaults are applied automatically for unspecified values
 * const config = resolveConfig({
 *   timeouts: { default: 60000 }  // Override only what you need
 * });
 *
 * console.log(config.timeouts.default);  // 60000 (overridden)
 * console.log(config.timeouts.short);    // 5000 (default applied)
 * ```
 *
 * @module
 */

import type {
  ITimeoutConfig,
  IRetryConfig,
  IHealthCheckConfig,
  IOpenTelemetryConfig
} from './interfaces';

/**
 * Default timeout configuration for infrastructure operations.
 *
 * These values are tuned for typical microservice architectures where:
 * - Most operations complete in milliseconds to seconds
 * - Network latency is generally under 100ms
 * - Database queries typically complete in under 5 seconds
 *
 * ## Rationale for Each Tier
 *
 * | Tier | Value | Use Case | Rationale |
 * |------|-------|----------|-----------|
 * | `short` | 5s | Cache reads, health checks | Fast operations should fail fast |
 * | `medium` | 15s | Database queries, fast APIs | Allows for network variation |
 * | `default` | 30s | General operations | Balanced for most use cases |
 * | `long` | 60s | File uploads, complex queries | Accommodates larger payloads |
 * | `veryLong` | 300s | Batch jobs, migrations | Long-running but bounded |
 *
 * @see ITimeoutConfig - Interface definition with field documentation
 * @see ConfigResolver.getTimeoutConfig - Resolution method
 *
 * @example Accessing default timeout values
 * ```typescript
 * import { DEFAULT_TIMEOUT_CONFIG } from '@package/core';
 *
 * // Use for comparison or documentation
 * if (customTimeout > DEFAULT_TIMEOUT_CONFIG.veryLong) {
 *   console.warn('Custom timeout exceeds recommended maximum');
 * }
 * ```
 */
export const DEFAULT_TIMEOUT_CONFIG: Required<ITimeoutConfig> = {
  default: 30000, // 30 seconds - general purpose, covers most API operations
  short: 5000, // 5 seconds - cache, health checks, simple lookups
  medium: 15000, // 15 seconds - database queries, fast external APIs
  long: 60000, // 1 minute - file operations, complex queries
  veryLong: 300000 // 5 minutes - batch processing, migrations
};

/**
 * Default retry configuration for transient failure recovery.
 *
 * These values implement exponential backoff optimized for:
 * - Recovering from brief network interruptions
 * - Respecting rate limits on external APIs
 * - Avoiding thundering herd problems
 *
 * ## Backoff Behavior
 *
 * With these defaults, retry delays are:
 * - Attempt 1: 1000ms (initial delay)
 * - Attempt 2: 2000ms (1000 × 2)
 * - Attempt 3: 4000ms (2000 × 2)
 *
 * Total wait time before failure: ~7 seconds
 *
 * ## Rationale
 *
 * | Setting | Value | Rationale |
 * |---------|-------|-----------|
 * | `maxAttempts` | 3 | Enough for transient issues, not overwhelming |
 * | `initialDelayMs` | 1000ms | Gives brief hiccups time to resolve |
 * | `maxDelayMs` | 10000ms | Prevents excessively long waits |
 * | `backoffMultiplier` | 2 | Standard exponential backoff |
 *
 * @see IRetryConfig - Interface definition with field documentation
 * @see ConfigResolver.getRetryConfig - Resolution method
 *
 * @example Calculating retry delay
 * ```typescript
 * import { DEFAULT_RETRY_CONFIG } from '@package/core';
 *
 * function calculateDelay(attempt: number): number {
 *   const { initialDelayMs, backoffMultiplier, maxDelayMs } = DEFAULT_RETRY_CONFIG;
 *   const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
 *   return Math.min(delay, maxDelayMs);
 * }
 *
 * console.log(calculateDelay(1)); // 1000
 * console.log(calculateDelay(2)); // 2000
 * console.log(calculateDelay(3)); // 4000
 * ```
 */
export const DEFAULT_RETRY_CONFIG: Required<IRetryConfig> = {
  maxAttempts: 3, // 1 initial + 2 retries - handles most transient failures
  initialDelayMs: 1000, // 1 second - allows brief issues to resolve
  maxDelayMs: 10000, // 10 seconds - caps exponential growth
  backoffMultiplier: 2 // Standard doubling - widely used pattern
};

/**
 * Default health check configuration for infrastructure monitoring.
 *
 * These values balance responsiveness with overhead:
 * - Detect failures within ~90 seconds (3 × 30s interval)
 * - Minimal CPU/network overhead from frequent checks
 * - Avoid false positives from transient issues
 *
 * ## Rationale
 *
 * | Setting | Value | Rationale |
 * |---------|-------|-----------|
 * | `intervalMs` | 30s | Balance between detection speed and overhead |
 * | `timeoutMs` | 5s | Fail fast on unresponsive services |
 * | `unhealthyThreshold` | 3 | Prevent flapping from transient issues |
 *
 * ## Detection Timeline
 *
 * With these defaults, an unhealthy service is detected in:
 * - Best case: 30 seconds (first check fails)
 * - Worst case: 90 seconds (3 consecutive failures)
 *
 * @see IHealthCheckConfig - Interface definition with field documentation
 * @see ConfigResolver.getHealthCheckConfig - Resolution method
 *
 * @example Health check monitoring logic
 * ```typescript
 * import { DEFAULT_HEALTH_CHECK_CONFIG } from '@package/core';
 *
 * let consecutiveFailures = 0;
 *
 * function onHealthCheckResult(healthy: boolean): void {
 *   if (healthy) {
 *     consecutiveFailures = 0;
 *   } else {
 *     consecutiveFailures++;
 *     if (consecutiveFailures >= DEFAULT_HEALTH_CHECK_CONFIG.unhealthyThreshold) {
 *       markServiceUnhealthy();
 *     }
 *   }
 * }
 * ```
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: Required<IHealthCheckConfig> = {
  intervalMs: 30000, // 30 seconds - reasonable check frequency
  timeoutMs: 5000, // 5 seconds - fail fast if service unresponsive
  unhealthyThreshold: 3 // 3 failures - prevents false positives
};

/**
 * Default OpenTelemetry configuration for observability.
 *
 * Observability is enabled by default because:
 * - Production systems need visibility into behavior
 * - Performance overhead is minimal when not exported
 * - Easier to disable than to retrofit later
 *
 * ## Rationale
 *
 * | Setting | Value | Rationale |
 * |---------|-------|-----------|
 * | `enableTracing` | true | Distributed tracing essential for debugging |
 * | `enableMetrics` | true | Metrics required for monitoring/alerting |
 * | `tracerName` | '@package/core' | Identifies instrumentation source |
 * | `meterName` | '@package/core' | Identifies metrics source |
 *
 * ## Service Identification
 *
 * `serviceName` and `serviceVersion` are intentionally undefined by default.
 * They should be set via:
 * - Environment variables: `SERVICE_NAME`, `SERVICE_VERSION`
 * - User configuration for explicit control
 *
 * @see IOpenTelemetryConfig - Interface definition with field documentation
 * @see ConfigResolver.getOpenTelemetryConfig - Resolution method
 * @see tracing - Tracing utilities that use this configuration
 * @see metrics - Metrics utilities that use this configuration
 *
 * @example Checking if tracing is enabled
 * ```typescript
 * import { DEFAULT_OPENTELEMETRY_CONFIG } from '@package/core';
 *
 * if (DEFAULT_OPENTELEMETRY_CONFIG.enableTracing) {
 *   console.log('Tracing is enabled by default');
 * }
 * ```
 */
export const DEFAULT_OPENTELEMETRY_CONFIG: Required<
  Omit<IOpenTelemetryConfig, 'serviceName' | 'serviceVersion'>
> & {
  serviceName?: string;
  serviceVersion?: string;
} = Object.freeze({
  enableTracing: true, // Essential for production debugging
  enableMetrics: true, // Required for monitoring and alerting
  tracerName: '@package/core', // Identifies this package in traces
  meterName: '@package/core' // Identifies this package in metrics
} as const) as Required<Omit<IOpenTelemetryConfig, 'serviceName' | 'serviceVersion'>> & {
  serviceName?: string;
  serviceVersion?: string;
};

/**
 * Metrics Service for OpenTelemetry-based Application Metrics
 *
 * This module provides a high-level API for creating and recording application metrics
 * using OpenTelemetry. It supports three fundamental metric types:
 *
 * - **Counter**: Monotonically increasing value for tracking occurrences (e.g., requests, errors)
 * - **Histogram**: Distribution of values for measuring latencies, sizes, or other distributions
 * - **Gauge**: Point-in-time measurements for tracking current values (e.g., active connections, queue depth)
 *
 * ## Choosing the Right Metric Type
 *
 * | Metric Type | Use When | Examples |
 * |-------------|----------|----------|
 * | Counter | Counting occurrences that only increase | HTTP requests, errors, messages processed |
 * | Histogram | Measuring distributions | Request latency, response sizes, queue wait times |
 * | Gauge | Tracking current state | Active connections, memory usage, queue depth |
 *
 * ## Naming Conventions
 *
 * Use dot-separated hierarchical names following OpenTelemetry semantic conventions:
 * - `http.server.requests` - HTTP server request counter
 * - `http.server.request.duration` - HTTP request latency histogram
 * - `db.client.connections.active` - Active database connections gauge
 * - `queue.messages.pending` - Pending queue messages gauge
 *
 * ## No-Op Fallback Behavior
 *
 * When OpenTelemetry is disabled (via `OTEL_ENABLED` environment variable), all metric
 * operations use lightweight no-op implementations that have zero performance overhead.
 * This allows metric instrumentation code to remain in place without affecting performance
 * in environments where telemetry is not configured.
 *
 * ## Metric Caching
 *
 * Metrics are created once and cached by name. Subsequent calls to `createCounter()`,
 * `createHistogram()`, or `createGauge()` with the same name return the existing metric
 * instance. This enables safe metric creation in hot paths without performance concerns.
 *
 * @module observability/metrics
 *
 * @example Basic usage
 * ```typescript
 * import { metricsService } from '@package/observability';
 *
 * // Create metrics at module initialization
 * const requestCounter = metricsService.createCounter(
 *   'http.server.requests',
 *   'Total HTTP requests received'
 * );
 *
 * const latencyHistogram = metricsService.createHistogram(
 *   'http.server.request.duration',
 *   'HTTP request latency in milliseconds',
 *   { unit: 'ms' }
 * );
 *
 * // Record metrics in request handlers
 * function handleRequest(req: Request) {
 *   const start = performance.now();
 *   // ... process request ...
 *   const duration = performance.now() - start;
 *
 *   requestCounter.add(1, { method: req.method, route: req.path });
 *   latencyHistogram.record(duration, { method: req.method, route: req.path });
 * }
 * ```
 */

import {
  Counter,
  Histogram,
  Gauge,
  Meter,
  metrics,
  MetricOptions,
  Attributes
} from '@opentelemetry/api';

import { getOrganizationId, getUserId } from './context';
import { isTelemetryEnabled } from './telemetry';

/**
 * No-op counter implementation for when OpenTelemetry is disabled.
 *
 * Provides a zero-overhead fallback that matches the OpenTelemetry Counter interface,
 * allowing metric instrumentation code to remain in place without performance impact.
 *
 * @internal
 */
class NoOpCounter {
  add(_amount: number, _attributes?: Attributes): void {
    // No-op: silently ignore when telemetry is disabled
  }
}

/**
 * No-op histogram implementation for when OpenTelemetry is disabled.
 *
 * Provides a zero-overhead fallback that matches the OpenTelemetry Histogram interface,
 * allowing metric instrumentation code to remain in place without performance impact.
 *
 * @internal
 */
class NoOpHistogram {
  record(_value: number, _attributes?: Attributes): void {
    // No-op: silently ignore when telemetry is disabled
  }
}

/**
 * No-op gauge implementation for when OpenTelemetry is disabled.
 *
 * Provides a zero-overhead fallback that matches the OpenTelemetry Gauge interface,
 * allowing metric instrumentation code to remain in place without performance impact.
 *
 * @internal
 */
class NoOpGauge {
  record(_value: number, _attributes?: Attributes): void {
    // No-op: silently ignore when telemetry is disabled
  }
}

/**
 * Service for creating and managing OpenTelemetry metrics.
 *
 * MetricsService provides a unified API for application instrumentation with support
 * for three metric types: counters, histograms, and gauges. All metrics are cached
 * by name, ensuring efficient reuse and consistent behavior across the application.
 *
 * ## Metric Types Overview
 *
 * - **Counter**: Use for values that only increase (e.g., request count, error count).
 *   Call `createCounter()` to create, then use `.add()` or `incrementCounter()` to record.
 *
 * - **Histogram**: Use for measuring distributions of values (e.g., latency, response size).
 *   Call `createHistogram()` to create, then use `.record()` or `recordHistogram()` to record.
 *
 * - **Gauge**: Use for point-in-time measurements (e.g., active connections, queue depth).
 *   Call `createGauge()` to create, then use `.record()` or `recordGauge()` to record.
 *
 * ## Telemetry Disabled Behavior
 *
 * When `OTEL_ENABLED` is not set to `'true'`, all metric operations use no-op
 * implementations. This allows metric instrumentation to remain in production code
 * without any performance penalty when telemetry is disabled.
 *
 * ## Caching Behavior
 *
 * Metrics are created once and cached by name. Calling `createCounter()` with the same
 * name multiple times returns the same counter instance. This is safe to call in hot
 * paths (e.g., inside request handlers) without performance concerns.
 *
 * @example Creating and using metrics
 * ```typescript
 * const metricsService = new MetricsService();
 *
 * // Create metrics (typically at module initialization)
 * const httpRequests = metricsService.createCounter(
 *   'http.server.requests',
 *   'Total number of HTTP requests'
 * );
 *
 * const requestLatency = metricsService.createHistogram(
 *   'http.server.request.duration',
 *   'Request latency distribution',
 *   { unit: 'ms' }
 * );
 *
 * const activeConnections = metricsService.createGauge(
 *   'http.server.connections.active',
 *   'Number of active HTTP connections'
 * );
 *
 * // Record metrics (in request handlers)
 * httpRequests.add(1, { method: 'GET', route: '/api/users' });
 * requestLatency.record(42.5, { method: 'GET', route: '/api/users' });
 * activeConnections.record(150, { server: 'web-1' });
 * ```
 *
 * @example Using convenience methods
 * ```typescript
 * // Create metrics first
 * metricsService.createCounter('api.requests', 'API request count');
 * metricsService.createHistogram('api.latency', 'API latency');
 * metricsService.createGauge('api.queue.depth', 'Queue depth');
 *
 * // Use convenience methods anywhere in the code
 * metricsService.incrementCounter('api.requests', 1, { endpoint: '/users' });
 * metricsService.recordHistogram('api.latency', 125, { endpoint: '/users' });
 * metricsService.recordGauge('api.queue.depth', 42);
 * ```
 */
export class MetricsService {
  private counters = new Map<string, Counter | NoOpCounter>();
  private histograms = new Map<string, Histogram | NoOpHistogram>();
  private gauges = new Map<string, Gauge | NoOpGauge>();

  /**
   * The meter name used for creating metrics.
   * Configurable via constructor, defaults to 'default'.
   */
  private readonly meterName: string;

  /**
   * Creates a new MetricsService instance.
   *
   * @param meterName - Optional name for the OpenTelemetry meter. If not provided,
   *                   defaults to 'default'. Use a descriptive name like your service
   *                   name (e.g., 'api', 'payment-service') for better organization
   *                   in observability backends.
   *
   * @example Default meter name
   * ```typescript
   * const metricsService = new MetricsService();
   * // Uses meter name 'default'
   * ```
   *
   * @example Custom meter name
   * ```typescript
   * const metricsService = new MetricsService('payment-service');
   * // Uses meter name 'payment-service'
   * ```
   */
  constructor(meterName: string = 'default') {
    this.meterName = meterName;
  }

  /**
   * Whether OpenTelemetry is currently enabled.
   *
   * Evaluated at metric creation time to determine whether to use real
   * OpenTelemetry metrics or no-op implementations. Once a metric is created
   * and cached, its type (real or no-op) is fixed for the lifetime of the
   * service instance.
   *
   * **Note:** Toggling telemetry state at runtime does NOT affect previously
   * created metrics. For dynamic toggling, restart the service or implement
   * a cache-clearing mechanism.
   *
   * @internal
   */
  private get enabled(): boolean {
    return isTelemetryEnabled();
  }

  /**
   * Gets the OpenTelemetry meter instance for creating metrics.
   * @internal
   */
  private get meter(): Meter {
    return metrics.getMeter(this.meterName);
  }

  /**
   * Creates or retrieves a counter metric.
   *
   * Counters are monotonically increasing metrics used to track occurrences of events.
   * Common use cases include counting HTTP requests, errors, messages processed, etc.
   *
   * ## Caching Behavior
   *
   * If a counter with the same name already exists, the existing instance is returned.
   * This makes it safe to call `createCounter()` multiple times with the same name.
   *
   * ## Naming Convention
   *
   * Use dot-separated hierarchical names:
   * - `http.server.requests` - Total HTTP requests
   * - `http.server.errors` - Total HTTP errors
   * - `queue.messages.processed` - Messages processed from queue
   *
   * @param name - Unique metric name using dot-separated hierarchical notation
   * @param description - Human-readable description of what the counter measures
   * @param options - Optional OpenTelemetry metric options (unit, valueType, etc.)
   * @returns Counter instance for recording values, or NoOpCounter when telemetry is disabled
   *
   * @example Basic counter creation
   * ```typescript
   * const requestCounter = metricsService.createCounter(
   *   'http.server.requests',
   *   'Total number of HTTP requests received'
   * );
   *
   * // Increment the counter
   * requestCounter.add(1, { method: 'GET', status_code: '200' });
   * ```
   *
   * @example Counter with custom unit
   * ```typescript
   * const bytesCounter = metricsService.createCounter(
   *   'network.bytes.sent',
   *   'Total bytes sent over the network',
   *   { unit: 'By' }
   * );
   *
   * bytesCounter.add(1024, { protocol: 'tcp' });
   * ```
   *
   * @example Error counting pattern
   * ```typescript
   * const errorCounter = metricsService.createCounter(
   *   'app.errors',
   *   'Application errors by type and severity'
   * );
   *
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   errorCounter.add(1, {
   *     error_type: error.name,
   *     severity: 'error',
   *     module: 'user-service'
   *   });
   * }
   * ```
   */
  createCounter(name: string, description: string, options?: MetricOptions): Counter | NoOpCounter {
    if (this.counters.has(name)) {
      return this.counters.get(name) as Counter | NoOpCounter;
    }

    const counter = this.enabled
      ? this.meter.createCounter(name, {
          description,
          ...options
        })
      : new NoOpCounter();

    this.counters.set(name, counter);
    return counter;
  }

  /**
   * Creates or retrieves a histogram metric.
   *
   * Histograms measure the distribution of values, computing statistics like min, max,
   * average, percentiles, and count. Use histograms for latency, response sizes,
   * queue wait times, or any measurement where understanding the distribution matters.
   *
   * ## Caching Behavior
   *
   * If a histogram with the same name already exists, the existing instance is returned.
   * This makes it safe to call `createHistogram()` multiple times with the same name.
   *
   * ## Naming Convention
   *
   * Use dot-separated hierarchical names with a `.duration` or descriptive suffix:
   * - `http.server.request.duration` - HTTP request latency
   * - `http.server.response.size` - Response body size
   * - `db.client.query.duration` - Database query duration
   * - `queue.message.wait_time` - Time messages wait in queue
   *
   * @param name - Unique metric name using dot-separated hierarchical notation
   * @param description - Human-readable description of what the histogram measures
   * @param options - Optional OpenTelemetry metric options (unit, valueType, etc.)
   * @returns Histogram instance for recording values, or NoOpHistogram when telemetry is disabled
   *
   * @example Measuring HTTP request latency
   * ```typescript
   * const latencyHistogram = metricsService.createHistogram(
   *   'http.server.request.duration',
   *   'HTTP request latency in milliseconds',
   *   { unit: 'ms' }
   * );
   *
   * // In request handler
   * const start = performance.now();
   * await handleRequest(req, res);
   * const duration = performance.now() - start;
   *
   * latencyHistogram.record(duration, {
   *   method: req.method,
   *   route: '/api/users',
   *   status_code: '200'
   * });
   * ```
   *
   * @example Measuring response sizes
   * ```typescript
   * const responseSizeHistogram = metricsService.createHistogram(
   *   'http.server.response.size',
   *   'HTTP response body size in bytes',
   *   { unit: 'By' }
   * );
   *
   * responseSizeHistogram.record(responseBody.length, {
   *   content_type: 'application/json',
   *   endpoint: '/api/users'
   * });
   * ```
   *
   * @example Database query timing
   * ```typescript
   * const queryDuration = metricsService.createHistogram(
   *   'db.client.query.duration',
   *   'Database query execution time',
   *   { unit: 'ms' }
   * );
   *
   * const start = performance.now();
   * const result = await db.query(sql);
   * queryDuration.record(performance.now() - start, {
   *   operation: 'SELECT',
   *   table: 'users'
   * });
   * ```
   */
  createHistogram(
    name: string,
    description: string,
    options?: MetricOptions
  ): Histogram | NoOpHistogram {
    if (this.histograms.has(name)) {
      return this.histograms.get(name) as Histogram | NoOpHistogram;
    }

    const histogram = this.enabled
      ? this.meter.createHistogram(name, {
          description,
          ...options
        })
      : new NoOpHistogram();

    this.histograms.set(name, histogram);
    return histogram;
  }

  /**
   * Creates or retrieves a gauge metric.
   *
   * Gauges represent point-in-time measurements that can increase or decrease.
   * Use gauges for current values like active connections, queue depth, memory usage,
   * or temperature readings.
   *
   * ## Caching Behavior
   *
   * If a gauge with the same name already exists, the existing instance is returned.
   * This makes it safe to call `createGauge()` multiple times with the same name.
   *
   * ## Naming Convention
   *
   * Use dot-separated hierarchical names with a descriptive suffix:
   * - `http.server.connections.active` - Active HTTP connections
   * - `process.memory.usage` - Current memory usage
   * - `queue.messages.pending` - Pending messages in queue
   * - `db.pool.connections.available` - Available database pool connections
   *
   * @param name - Unique metric name using dot-separated hierarchical notation
   * @param description - Human-readable description of what the gauge measures
   * @param options - Optional OpenTelemetry metric options (unit, valueType, etc.)
   * @returns Gauge instance for recording values, or NoOpGauge when telemetry is disabled
   *
   * @example Tracking active connections
   * ```typescript
   * const activeConnections = metricsService.createGauge(
   *   'http.server.connections.active',
   *   'Number of active HTTP connections'
   * );
   *
   * // Update when connections change
   * server.on('connection', () => {
   *   connectionCount++;
   *   activeConnections.record(connectionCount, { server: 'web-1' });
   * });
   *
   * server.on('close', () => {
   *   connectionCount--;
   *   activeConnections.record(connectionCount, { server: 'web-1' });
   * });
   * ```
   *
   * @example Monitoring queue depth
   * ```typescript
   * const queueDepth = metricsService.createGauge(
   *   'queue.messages.pending',
   *   'Number of messages waiting in queue'
   * );
   *
   * // Periodically update gauge
   * setInterval(async () => {
   *   const depth = await queue.getMessageCount();
   *   queueDepth.record(depth, { queue_name: 'orders' });
   * }, 5000);
   * ```
   *
   * @example Tracking memory usage
   * ```typescript
   * const memoryGauge = metricsService.createGauge(
   *   'process.memory.heap.used',
   *   'Heap memory used by the process',
   *   { unit: 'By' }
   * );
   *
   * setInterval(() => {
   *   const usage = process.memoryUsage();
   *   memoryGauge.record(usage.heapUsed, { process: 'api' });
   * }, 10000);
   * ```
   */
  createGauge(name: string, description: string, options?: MetricOptions): Gauge | NoOpGauge {
    if (this.gauges.has(name)) {
      return this.gauges.get(name) as Gauge | NoOpGauge;
    }

    const gauge = this.enabled
      ? this.meter.createGauge(name, {
          description,
          ...options
        })
      : new NoOpGauge();

    this.gauges.set(name, gauge);
    return gauge;
  }

  /**
   * Increments a previously created counter by the specified amount.
   *
   * This is a convenience method that looks up an existing counter by name and
   * increments it. The counter must have been created first using `createCounter()`.
   *
   * ## Graceful Handling
   *
   * If the counter does not exist (was never created), this method silently does
   * nothing. This allows defensive coding patterns where increment calls can be
   * made without checking if the counter exists.
   *
   * @param name - Name of the counter to increment (must match a previously created counter)
   * @param amount - Amount to increment by (default: 1). Can be any positive number.
   * @param attributes - Optional key-value pairs for metric dimensions
   *
   * @example Basic usage
   * ```typescript
   * // Create the counter first
   * metricsService.createCounter('http.server.requests', 'Total HTTP requests');
   *
   * // Increment anywhere in the code
   * metricsService.incrementCounter('http.server.requests');
   * metricsService.incrementCounter('http.server.requests', 1, { method: 'GET' });
   * ```
   *
   * @example With attributes for dimensions
   * ```typescript
   * metricsService.createCounter('api.calls', 'API calls by endpoint and method');
   *
   * // In request handler
   * metricsService.incrementCounter('api.calls', 1, {
   *   endpoint: '/api/users',
   *   method: 'POST',
   *   status_code: '201'
   * });
   * ```
   *
   * @example Counting multiple items at once
   * ```typescript
   * metricsService.createCounter('queue.messages.processed', 'Messages processed');
   *
   * // After processing a batch
   * const batchSize = processedMessages.length;
   * metricsService.incrementCounter('queue.messages.processed', batchSize, {
   *   queue_name: 'orders'
   * });
   * ```
   */
  incrementCounter(name: string, amount: number = 1, attributes?: Attributes): void {
    const counter = this.counters.get(name);
    if (counter) {
      counter.add(amount, attributes);
    }
  }

  /**
   * Records a value to a previously created histogram.
   *
   * This is a convenience method that looks up an existing histogram by name and
   * records a value to it. The histogram must have been created first using
   * `createHistogram()`.
   *
   * ## Graceful Handling
   *
   * If the histogram does not exist (was never created), this method silently does
   * nothing. This allows defensive coding patterns where record calls can be
   * made without checking if the histogram exists.
   *
   * @param name - Name of the histogram to record to (must match a previously created histogram)
   * @param value - The value to record (e.g., latency in milliseconds, size in bytes)
   * @param attributes - Optional key-value pairs for metric dimensions
   *
   * @example Recording request latency
   * ```typescript
   * // Create the histogram first
   * metricsService.createHistogram(
   *   'http.server.request.duration',
   *   'Request duration in milliseconds',
   *   { unit: 'ms' }
   * );
   *
   * // In request handler
   * const start = performance.now();
   * await processRequest();
   * const duration = performance.now() - start;
   *
   * metricsService.recordHistogram('http.server.request.duration', duration, {
   *   method: 'GET',
   *   route: '/api/users',
   *   status_code: '200'
   * });
   * ```
   *
   * @example Recording with different attributes
   * ```typescript
   * metricsService.createHistogram('db.query.duration', 'Database query duration');
   *
   * // Record with query type attributes
   * metricsService.recordHistogram('db.query.duration', 15.5, {
   *   operation: 'SELECT',
   *   table: 'users',
   *   cached: 'false'
   * });
   * ```
   */
  recordHistogram(name: string, value: number, attributes?: Attributes): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.record(value, attributes);
    }
  }

  /**
   * Records a value to a previously created gauge.
   *
   * This is a convenience method that looks up an existing gauge by name and
   * records a value to it. The gauge must have been created first using
   * `createGauge()`.
   *
   * ## Graceful Handling
   *
   * If the gauge does not exist (was never created), this method silently does
   * nothing. This allows defensive coding patterns where record calls can be
   * made without checking if the gauge exists.
   *
   * @param name - Name of the gauge to record to (must match a previously created gauge)
   * @param value - The current value to record (can increase or decrease)
   * @param attributes - Optional key-value pairs for metric dimensions
   *
   * @example Tracking active connections
   * ```typescript
   * // Create the gauge first
   * metricsService.createGauge(
   *   'http.server.connections.active',
   *   'Active HTTP connections'
   * );
   *
   * // Update when connections change
   * metricsService.recordGauge('http.server.connections.active', currentCount, {
   *   server: 'web-1',
   *   protocol: 'http2'
   * });
   * ```
   *
   * @example Monitoring resource usage
   * ```typescript
   * metricsService.createGauge('process.cpu.utilization', 'CPU utilization percentage');
   *
   * // Periodically update
   * setInterval(() => {
   *   const cpuUsage = getCpuUsage();
   *   metricsService.recordGauge('process.cpu.utilization', cpuUsage, {
   *     process: 'api-server'
   *   });
   * }, 5000);
   * ```
   *
   * @example Tracking queue depth with attributes
   * ```typescript
   * metricsService.createGauge('queue.depth', 'Current queue depth');
   *
   * // Update with queue-specific attributes
   * metricsService.recordGauge('queue.depth', pendingJobs, {
   *   queue_name: 'email-notifications',
   *   priority: 'high'
   * });
   * ```
   */
  recordGauge(name: string, value: number, attributes?: Attributes): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.record(value, attributes);
    }
  }

  /**
   * Builds metric attributes with tenant context from the current request scope.
   *
   * Extracts `organization_id` and optionally `user_id` from the async local storage
   * request context and merges them with any provided attributes. This ensures every
   * metric recorded includes proper tenant identification for multi-tenant isolation.
   *
   * ## Attribute Precedence
   *
   * Context-derived `organization_id` (and `user_id` when `includeUserId` is true)
   * **always take precedence** and cannot be overridden by caller-supplied attributes.
   * This is a security measure to prevent tenant context spoofing in multi-tenant
   * environments.
   *
   * @param attributes - Optional attributes to merge with tenant context
   * @param includeUserId - Whether to include `user_id` in attributes (default: false)
   * @returns Merged attributes with tenant context, or original attributes if no context
   *
   * @internal
   */
  private buildContextAttributes(
    attributes?: Attributes,
    includeUserId: boolean = false
  ): Attributes | undefined {
    const organizationId = getOrganizationId();

    if (!organizationId) {
      return attributes;
    }

    const contextAttrs: Attributes = {
      organization_id: organizationId
    };

    if (includeUserId) {
      const userId = getUserId();
      if (userId) {
        contextAttrs['user_id'] = userId;
      }
    }

    // Spread attributes first, then contextAttrs to ensure context-derived
    // organization_id and user_id cannot be overridden by caller-supplied values
    return attributes ? { ...attributes, ...contextAttrs } : contextAttrs;
  }

  /**
   * Increments a counter with automatic tenant context injection.
   *
   * A multi-tenancy-aware wrapper around `incrementCounter` that automatically
   * retrieves `organization_id` from the current request context and merges it
   * with any provided attributes. This ensures every counter increment includes
   * proper tenant identification for data isolation and per-tenant analytics.
   *
   * ## Behavior
   *
   * - Extracts `organization_id` from the async local storage request context
   * - Merges provided attributes with context attributes (context attrs take precedence)
   * - Context-derived `organization_id` and `user_id` cannot be overridden
   * - Optionally includes `user_id` when `includeUserId` is true
   * - Falls back to provided attributes only if no context is available
   * - Calls the underlying `incrementCounter` method with merged attributes
   *
   * ## When to Use
   *
   * Use this method instead of `incrementCounter` when:
   * - Operating in a multi-tenant environment
   * - You need per-tenant metric breakdowns
   * - Auditing requires tenant identification on all metrics
   * - You want automatic context propagation without manual attribute passing
   *
   * @param name - Name of the counter to increment (must match a previously created counter)
   * @param amount - Amount to increment by (default: 1)
   * @param attributes - Optional additional attributes to merge with tenant context
   * @param includeUserId - Whether to include `user_id` from context (default: false)
   *
   * @example Basic usage with automatic tenant context
   * ```typescript
   * // Context is set by middleware: { organizationId: 'org-123', userId: 'user-456' }
   * metricsService.createCounter('api.requests', 'API requests by tenant');
   *
   * // Automatically includes organization_id attribute
   * metricsService.incrementCounterWithContext('api.requests');
   * // Recorded with: { organization_id: 'org-123' }
   * ```
   *
   * @example With additional attributes
   * ```typescript
   * metricsService.incrementCounterWithContext('api.requests', 1, {
   *   method: 'POST',
   *   endpoint: '/users'
   * });
   * // Recorded with: { organization_id: 'org-123', method: 'POST', endpoint: '/users' }
   * ```
   *
   * @example Including user context for user-level metrics
   * ```typescript
   * metricsService.incrementCounterWithContext(
   *   'feature.usage',
   *   1,
   *   { feature: 'export' },
   *   true // includeUserId
   * );
   * // Recorded with: { organization_id: 'org-123', user_id: 'user-456', feature: 'export' }
   * ```
   *
   * @see {@link incrementCounter} for the underlying method without context injection
   * @see {@link getOrganizationId} for how tenant context is retrieved
   */
  incrementCounterWithContext(
    name: string,
    amount: number = 1,
    attributes?: Attributes,
    includeUserId: boolean = false
  ): void {
    const mergedAttributes = this.buildContextAttributes(attributes, includeUserId);
    this.incrementCounter(name, amount, mergedAttributes);
  }

  /**
   * Records a histogram value with automatic tenant context injection.
   *
   * A multi-tenancy-aware wrapper around `recordHistogram` that automatically
   * retrieves `organization_id` from the current request context and merges it
   * with any provided attributes. This ensures every histogram measurement includes
   * proper tenant identification for per-tenant latency analysis and SLA tracking.
   *
   * ## Behavior
   *
   * - Extracts `organization_id` from the async local storage request context
   * - Merges provided attributes with context attributes (context attrs take precedence)
   * - Context-derived `organization_id` and `user_id` cannot be overridden
   * - Optionally includes `user_id` when `includeUserId` is true
   * - Falls back to provided attributes only if no context is available
   * - Calls the underlying `recordHistogram` method with merged attributes
   *
   * ## When to Use
   *
   * Use this method instead of `recordHistogram` when:
   * - Tracking per-tenant latency distributions
   * - Measuring tenant-specific SLA compliance
   * - Analyzing performance differences across tenants
   * - You need automatic context propagation for observability
   *
   * @param name - Name of the histogram to record to (must match a previously created histogram)
   * @param value - The value to record (e.g., latency in milliseconds)
   * @param attributes - Optional additional attributes to merge with tenant context
   * @param includeUserId - Whether to include `user_id` from context (default: false)
   *
   * @example Tenant-aware latency tracking
   * ```typescript
   * metricsService.createHistogram(
   *   'http.server.request.duration',
   *   'Request latency by tenant',
   *   { unit: 'ms' }
   * );
   *
   * const start = performance.now();
   * await processRequest();
   * const duration = performance.now() - start;
   *
   * // Automatically includes organization_id for per-tenant analysis
   * metricsService.recordHistogramWithContext(
   *   'http.server.request.duration',
   *   duration,
   *   { method: 'GET', route: '/api/users' }
   * );
   * // Recorded with: { organization_id: 'org-123', method: 'GET', route: '/api/users' }
   * ```
   *
   * @example Database query timing per tenant
   * ```typescript
   * metricsService.recordHistogramWithContext('db.query.duration', queryTime, {
   *   operation: 'SELECT',
   *   table: 'orders'
   * });
   * // Enables per-tenant database performance analysis
   * ```
   *
   * @see {@link recordHistogram} for the underlying method without context injection
   * @see {@link getOrganizationId} for how tenant context is retrieved
   */
  recordHistogramWithContext(
    name: string,
    value: number,
    attributes?: Attributes,
    includeUserId: boolean = false
  ): void {
    const mergedAttributes = this.buildContextAttributes(attributes, includeUserId);
    this.recordHistogram(name, value, mergedAttributes);
  }

  /**
   * Records a gauge value with automatic tenant context injection.
   *
   * A multi-tenancy-aware wrapper around `recordGauge` that automatically
   * retrieves `organization_id` from the current request context and merges it
   * with any provided attributes. This ensures every gauge measurement includes
   * proper tenant identification for per-tenant resource tracking.
   *
   * ## Behavior
   *
   * - Extracts `organization_id` from the async local storage request context
   * - Merges provided attributes with context attributes (context attrs take precedence)
   * - Context-derived `organization_id` and `user_id` cannot be overridden
   * - Optionally includes `user_id` when `includeUserId` is true
   * - Falls back to provided attributes only if no context is available
   * - Calls the underlying `recordGauge` method with merged attributes
   *
   * ## When to Use
   *
   * Use this method instead of `recordGauge` when:
   * - Tracking per-tenant resource usage (connections, queue depth)
   * - Monitoring tenant-specific quotas and limits
   * - Providing tenant-scoped dashboards
   * - You need automatic context propagation for observability
   *
   * @param name - Name of the gauge to record to (must match a previously created gauge)
   * @param value - The current value to record
   * @param attributes - Optional additional attributes to merge with tenant context
   * @param includeUserId - Whether to include `user_id` from context (default: false)
   *
   * @example Tenant-aware connection tracking
   * ```typescript
   * metricsService.createGauge(
   *   'tenant.connections.active',
   *   'Active connections per tenant'
   * );
   *
   * // Update when connections change
   * metricsService.recordGaugeWithContext(
   *   'tenant.connections.active',
   *   currentConnectionCount
   * );
   * // Recorded with: { organization_id: 'org-123' }
   * ```
   *
   * @example Per-tenant queue depth monitoring
   * ```typescript
   * metricsService.recordGaugeWithContext('tenant.queue.depth', pendingJobs, {
   *   queue_name: 'email-notifications'
   * });
   * // Enables per-tenant queue monitoring and alerting
   * ```
   *
   * @see {@link recordGauge} for the underlying method without context injection
   * @see {@link getOrganizationId} for how tenant context is retrieved
   */
  recordGaugeWithContext(
    name: string,
    value: number,
    attributes?: Attributes,
    includeUserId: boolean = false
  ): void {
    const mergedAttributes = this.buildContextAttributes(attributes, includeUserId);
    this.recordGauge(name, value, mergedAttributes);
  }
}

/**
 * Global singleton instance of MetricsService.
 *
 * Use this pre-configured instance for application-wide metrics collection.
 * The singleton pattern ensures all parts of the application share the same
 * metric cache and OpenTelemetry meter.
 *
 * @example Using the singleton
 * ```typescript
 * import { metricsService } from '@package/observability';
 *
 * // Create metrics at module load
 * const requestCounter = metricsService.createCounter(
 *   'http.server.requests',
 *   'Total HTTP requests'
 * );
 *
 * // Use in request handlers
 * export function handleRequest(req: Request) {
 *   requestCounter.add(1, { method: req.method });
 * }
 * ```
 */
export const metricsService = new MetricsService();

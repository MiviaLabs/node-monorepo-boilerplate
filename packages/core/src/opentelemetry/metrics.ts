/**
 * OpenTelemetry metrics utilities for application observability.
 *
 * This module provides helper functions for creating and recording metrics.
 * Metrics are used to measure quantitative data about your application's
 * behavior over time, such as request counts, latencies, and resource usage.
 *
 * @remarks
 * This is a lightweight abstraction over the OpenTelemetry Metrics API.
 * For full metrics functionality including exporters and readers,
 * configure `@opentelemetry/sdk-metrics` in your application bootstrap.
 *
 * ## Metric Types
 *
 * - **Counter**: Monotonically increasing values (requests, errors, bytes sent)
 * - **Histogram**: Distribution of values (latencies, sizes, scores)
 * - **UpDownCounter**: Values that can increase or decrease (queue size, connections)
 *
 * @see {@link https://opentelemetry.io/docs/concepts/signals/metrics/ | OpenTelemetry Metrics}
 * @see {@link https://opentelemetry.io/docs/specs/otel/metrics/api/ | OpenTelemetry Metrics API}
 *
 * @example Basic counter usage
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const requestCounter = createCounter('http.requests', {
 *   description: 'Total HTTP requests received',
 *   unit: '1'
 * });
 *
 * function handleRequest(method: string, path: string): void {
 *   incrementCounter(requestCounter, 1, { method, path });
 *   // ... handle request
 * }
 * ```
 *
 * @example Histogram for latency tracking
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const latencyHistogram = createHistogram('http.request.duration', {
 *   description: 'HTTP request duration in milliseconds',
 *   unit: 'ms',
 *   boundaries: [5, 10, 25, 50, 100, 250, 500, 1000]
 * });
 *
 * async function handleRequest(req: Request): Promise<Response> {
 *   const start = Date.now();
 *   try {
 *     return await processRequest(req);
 *   } finally {
 *     recordHistogram(latencyHistogram, Date.now() - start, {
 *       method: req.method,
 *       route: req.path
 *     });
 *   }
 * }
 * ```
 *
 * @module
 */

import { metrics } from '@opentelemetry/api';

import type { Meter, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

/**
 * Default meter name used when no custom name is provided.
 *
 * @remarks
 * The meter name identifies the instrumentation library in metric data.
 * Using a consistent name helps with filtering and analyzing metrics.
 *
 * @example
 * ```typescript
 * import { DEFAULT_METER_NAME, getMeter } from '@package/core/opentelemetry';
 *
 * // Use default meter
 * const meter = getMeter();
 *
 * // Or explicitly pass the default
 * const sameMeter = getMeter(DEFAULT_METER_NAME);
 * ```
 */
export const DEFAULT_METER_NAME = '@package/core';

/**
 * Gets or creates a meter instance for creating metric instruments.
 *
 * A meter is the entry point for creating metrics (counters, histograms, etc.).
 * Each meter is identified by a name and optional version, which appear in
 * metric data to identify the instrumentation library.
 *
 * @param name - The name identifying this meter/instrumentation library.
 *   Use a package name or descriptive identifier. Defaults to `DEFAULT_METER_NAME`.
 * @param version - Optional version string for the instrumentation library.
 *   Useful for tracking which version of instrumentation generated a metric.
 * @returns A meter instance that can be used to create metric instruments.
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/metrics/api/#get-a-meter | OpenTelemetry Get Meter}
 *
 * @example Using the default meter
 * ```typescript
 * import { getMeter } from '@package/core/opentelemetry';
 *
 * const meter = getMeter();
 * const counter = meter.createCounter('my.counter');
 * counter.add(1);
 * ```
 *
 * @example Using a custom meter name and version
 * ```typescript
 * import { getMeter } from '@package/core/opentelemetry';
 *
 * const meter = getMeter('@myorg/payment-service', '2.1.0');
 * const histogram = meter.createHistogram('payment.duration', {
 *   description: 'Payment processing duration',
 *   unit: 'ms'
 * });
 * ```
 */
export function getMeter(name: string = DEFAULT_METER_NAME, version?: string): Meter {
  return metrics.getMeter(name, version);
}

/**
 * Creates a counter metric instrument.
 *
 * A counter is a cumulative metric that only increases (or resets to zero on restart).
 * Use counters for values that accumulate over time, such as:
 * - Number of requests served
 * - Number of errors encountered
 * - Bytes sent/received
 * - Tasks completed
 *
 * @param name - The name of the counter metric. Use dot notation for hierarchical
 *   names (e.g., `'http.requests'`, `'cache.hits'`, `'queue.processed'`).
 * @param options - Optional configuration for the counter.
 * @param options.description - Human-readable description of what the counter measures.
 * @param options.unit - Unit of measurement. Use `'1'` for dimensionless counts,
 *   `'By'` for bytes, `'ms'` for milliseconds, etc.
 * @returns A counter instrument that can be incremented using `add()` or `incrementCounter()`.
 *
 * @see {@link incrementCounter} - Helper function for adding to counters
 * @see {@link https://opentelemetry.io/docs/specs/otel/metrics/api/#counter | OpenTelemetry Counter}
 *
 * @example Creating a request counter
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const requestCounter = createCounter('http.server.requests', {
 *   description: 'Total number of HTTP requests received',
 *   unit: '1'
 * });
 *
 * // Increment by 1
 * incrementCounter(requestCounter, 1, { method: 'GET', route: '/users' });
 *
 * // Or use the counter directly
 * requestCounter.add(1, { method: 'POST', route: '/orders' });
 * ```
 *
 * @example Counting errors by type
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const errorCounter = createCounter('app.errors', {
 *   description: 'Application errors by type',
 *   unit: '1'
 * });
 *
 * function handleError(error: unknown): void {
 *   const err = error instanceof Error ? error : new Error(String(error));
 *   const errorCode = error !== null &&
 *     typeof error === 'object' &&
 *     'code' in error &&
 *     typeof (error as { code?: unknown }).code === 'string'
 *       ? (error as { code: string }).code
 *       : 'unknown';
 *
 *   incrementCounter(errorCounter, 1, {
 *     'error.type': err.name,
 *     'error.code': errorCode
 *   });
 * }
 * ```
 *
 * @example Counting bytes transferred
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const bytesCounter = createCounter('http.server.bytes_sent', {
 *   description: 'Total bytes sent in HTTP responses',
 *   unit: 'By'
 * });
 *
 * function sendResponse(response: Response, body: Buffer): void {
 *   incrementCounter(bytesCounter, body.length, {
 *     'http.status_code': response.statusCode
 *   });
 * }
 * ```
 */
export function createCounter(
  name: string,
  options: { description?: string; unit?: string } = {}
): Counter {
  const meter = getMeter();
  return meter.createCounter(name, options);
}

/**
 * Creates a histogram metric instrument.
 *
 * A histogram collects observations (usually measurements like latencies or sizes)
 * and counts them in configurable buckets. Use histograms for:
 * - Request/response latencies
 * - Response body sizes
 * - Queue wait times
 * - Any value where you want to understand the distribution
 *
 * @param name - The name of the histogram metric. Use dot notation for hierarchical
 *   names (e.g., `'http.request.duration'`, `'db.query.time'`).
 * @param options - Optional configuration for the histogram.
 * @param options.description - Human-readable description of what the histogram measures.
 * @param options.unit - Unit of measurement (e.g., `'ms'`, `'s'`, `'By'`).
 * @param options.boundaries - Explicit bucket boundaries. If not specified,
 *   the SDK uses default boundaries. Good boundaries depend on expected values.
 * @returns A histogram instrument that can record values using `record()` or `recordHistogram()`.
 *
 * @see {@link recordHistogram} - Helper function for recording histogram values
 * @see {@link https://opentelemetry.io/docs/specs/otel/metrics/api/#histogram | OpenTelemetry Histogram}
 *
 * @example Tracking HTTP request latency
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const latencyHistogram = createHistogram('http.server.duration', {
 *   description: 'HTTP server request duration',
 *   unit: 'ms',
 *   boundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
 * });
 *
 * async function handleRequest(req: Request): Promise<Response> {
 *   const start = performance.now();
 *   try {
 *     return await processRequest(req);
 *   } finally {
 *     recordHistogram(latencyHistogram, performance.now() - start, {
 *       'http.method': req.method,
 *       'http.route': req.route
 *     });
 *   }
 * }
 * ```
 *
 * @example Tracking database query duration
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const queryHistogram = createHistogram('db.query.duration', {
 *   description: 'Database query duration',
 *   unit: 'ms',
 *   boundaries: [1, 5, 10, 25, 50, 100, 250, 500]
 * });
 *
 * async function executeQuery(query: string): Promise<Result> {
 *   const start = Date.now();
 *   const result = await db.execute(query);
 *   recordHistogram(queryHistogram, Date.now() - start, {
 *     'db.operation': query.split(' ')[0].toUpperCase()
 *   });
 *   return result;
 * }
 * ```
 *
 * @example Tracking response sizes
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const sizeHistogram = createHistogram('http.response.size', {
 *   description: 'HTTP response body size',
 *   unit: 'By',
 *   boundaries: [100, 1000, 10000, 100000, 1000000]
 * });
 *
 * function sendResponse(body: Buffer, route: string): void {
 *   recordHistogram(sizeHistogram, body.length, { route });
 * }
 * ```
 */
export function createHistogram(
  name: string,
  options: { description?: string; unit?: string; boundaries?: number[] } = {}
): Histogram {
  const meter = getMeter();
  return meter.createHistogram(name, options);
}

/**
 * Creates an up-down counter metric instrument.
 *
 * An up-down counter is a cumulative metric that can increase or decrease.
 * Unlike regular counters, up-down counters can have negative delta values.
 * Use up-down counters for values that fluctuate:
 * - Active connections/requests
 * - Queue depth
 * - Cache size
 * - Thread pool size
 *
 * @param name - The name of the up-down counter metric. Use dot notation for
 *   hierarchical names (e.g., `'http.active_requests'`, `'queue.size'`).
 * @param options - Optional configuration for the up-down counter.
 * @param options.description - Human-readable description of what the counter measures.
 * @param options.unit - Unit of measurement. Use `'1'` for dimensionless counts.
 * @returns An up-down counter instrument that can be incremented or decremented using `add()`.
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/metrics/api/#updowncounter | OpenTelemetry UpDownCounter}
 *
 * @example Tracking active connections
 * ```typescript
 * import { createUpDownCounter } from '@package/core/opentelemetry';
 *
 * const activeConnections = createUpDownCounter('http.active_connections', {
 *   description: 'Number of active HTTP connections',
 *   unit: '1'
 * });
 *
 * function onConnectionOpen(host: string): void {
 *   activeConnections.add(1, { host });
 * }
 *
 * function onConnectionClose(host: string): void {
 *   activeConnections.add(-1, { host });
 * }
 * ```
 *
 * @example Tracking queue depth
 * ```typescript
 * import { createUpDownCounter } from '@package/core/opentelemetry';
 *
 * const queueSize = createUpDownCounter('queue.size', {
 *   description: 'Current number of items in the queue',
 *   unit: '1'
 * });
 *
 * function enqueue(item: Job, queueName: string): void {
 *   queue.push(item);
 *   queueSize.add(1, { queue: queueName });
 * }
 *
 * function dequeue(queueName: string): Job | undefined {
 *   const item = queue.shift();
 *   if (item) {
 *     queueSize.add(-1, { queue: queueName });
 *   }
 *   return item;
 * }
 * ```
 *
 * @example Tracking cache entries
 * ```typescript
 * import { createUpDownCounter } from '@package/core/opentelemetry';
 *
 * const cacheSize = createUpDownCounter('cache.entries', {
 *   description: 'Number of entries in the cache',
 *   unit: '1'
 * });
 *
 * class Cache<T> {
 *   private readonly name: string;
 *
 *   set(key: string, value: T): void {
 *     if (!this.store.has(key)) {
 *       cacheSize.add(1, { cache: this.name });
 *     }
 *     this.store.set(key, value);
 *   }
 *
 *   delete(key: string): boolean {
 *     if (this.store.delete(key)) {
 *       cacheSize.add(-1, { cache: this.name });
 *       return true;
 *     }
 *     return false;
 *   }
 * }
 * ```
 */
export function createUpDownCounter(
  name: string,
  options: { description?: string; unit?: string } = {}
): UpDownCounter {
  const meter = getMeter();
  return meter.createUpDownCounter(name, options);
}

/**
 * Increments a counter by a specified value with optional attributes.
 *
 * Helper function that wraps `counter.add()` for a more semantic API.
 * Use this for incrementing counters with attributes in a single call.
 *
 * @param counter - The counter instrument to increment.
 * @param value - The amount to add (must be non-negative). Defaults to 1.
 * @param attributes - Optional key-value pairs to associate with this measurement.
 *   Attributes allow you to slice and dice metrics by different dimensions.
 * @returns void
 * @throws {RangeError} If value is negative.
 *
 * @see {@link createCounter} - For creating counter instruments
 *
 * @example Basic increment
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const counter = createCounter('events.processed');
 *
 * // Increment by 1 (default)
 * incrementCounter(counter);
 *
 * // Increment by specific value
 * incrementCounter(counter, 5);
 *
 * // Increment with attributes
 * incrementCounter(counter, 1, { event_type: 'user.created' });
 * ```
 *
 * @example Tracking API requests with attributes
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const requestCounter = createCounter('api.requests');
 *
 * function logRequest(method: string, path: string, status: number): void {
 *   incrementCounter(requestCounter, 1, {
 *     method,
 *     path,
 *     status_code: status,
 *     status_class: `${Math.floor(status / 100)}xx`
 *   });
 * }
 * ```
 *
 * @example Counting batch operations
 * ```typescript
 * import { createCounter, incrementCounter } from '@package/core/opentelemetry';
 *
 * const itemsProcessed = createCounter('batch.items_processed');
 *
 * async function processBatch(items: Item[]): Promise<void> {
 *   const results = await Promise.all(items.map(processItem));
 *   const successes = results.filter(r => r.success).length;
 *   const failures = results.length - successes;
 *
 *   incrementCounter(itemsProcessed, successes, { status: 'success' });
 *   incrementCounter(itemsProcessed, failures, { status: 'failure' });
 * }
 * ```
 */
export function incrementCounter(
  counter: Counter,
  value: number = 1,
  attributes: Record<string, string | number | boolean> = {}
): void {
  if (value < 0) {
    throw new RangeError(`incrementCounter value must be non-negative, received: ${value}`);
  }
  counter.add(value, attributes);
}

/**
 * Records a value in a histogram with optional attributes.
 *
 * Helper function that wraps `histogram.record()` for a more semantic API.
 * Use this for recording measurements like latencies, sizes, or any value
 * where you want to understand the distribution.
 *
 * @param histogram - The histogram instrument to record to.
 * @param value - The measurement value to record (can be negative for histograms).
 * @param attributes - Optional key-value pairs to associate with this measurement.
 *   Attributes allow you to slice and dice metrics by different dimensions.
 * @returns void
 *
 * @see {@link createHistogram} - For creating histogram instruments
 *
 * @example Recording request latency
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const latencyHistogram = createHistogram('http.duration', { unit: 'ms' });
 *
 * async function handleRequest(req: Request): Promise<Response> {
 *   const start = Date.now();
 *   const response = await processRequest(req);
 *   recordHistogram(latencyHistogram, Date.now() - start, {
 *     method: req.method,
 *     status: response.status
 *   });
 *   return response;
 * }
 * ```
 *
 * @example Recording with multiple dimensions
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const queryDuration = createHistogram('db.query.duration', { unit: 'ms' });
 *
 * async function executeQuery(
 *   operation: string,
 *   table: string
 * ): Promise<QueryResult> {
 *   const start = performance.now();
 *   const result = await db.execute(operation);
 *
 *   recordHistogram(queryDuration, performance.now() - start, {
 *     'db.operation': operation.split(' ')[0],
 *     'db.table': table,
 *     'db.row_count': result.rowCount
 *   });
 *
 *   return result;
 * }
 * ```
 *
 * @example Recording response sizes
 * ```typescript
 * import { createHistogram, recordHistogram } from '@package/core/opentelemetry';
 *
 * const responseSize = createHistogram('http.response.size', { unit: 'By' });
 *
 * function sendResponse(body: Buffer, contentType: string): void {
 *   recordHistogram(responseSize, body.length, {
 *     content_type: contentType,
 *     compressed: body.length < originalSize
 *   });
 * }
 * ```
 */
export function recordHistogram(
  histogram: Histogram,
  value: number,
  attributes: Record<string, string | number | boolean> = {}
): void {
  histogram.record(value, attributes);
}

/**
 * Predefined metric names for infrastructure operations.
 *
 * Use these constants for consistent metric naming across the application.
 * Following a naming convention makes it easier to query and visualize metrics
 * in monitoring tools.
 *
 * ## Naming Convention
 *
 * Metrics follow the pattern: `infrastructure.<category>.<measurement>`
 *
 * - **category**: The type of infrastructure component (operation, job, cache, connection, provider)
 * - **measurement**: What is being measured (duration, count, errors, size)
 *
 * ## Metric Categories
 *
 * | Category | Use Case |
 * |----------|----------|
 * | `operation` | General infrastructure operations |
 * | `job` | Background job processing (BullMQ, etc.) |
 * | `cache` | Cache operations (Redis, in-memory) |
 * | `connection` | Connection pool management |
 * | `provider` | External provider interactions |
 *
 * @see {@link createCounter} - For creating counters
 * @see {@link createHistogram} - For creating histograms
 * @see {@link createUpDownCounter} - For creating up-down counters
 *
 * @example Using predefined metric names
 * ```typescript
 * import {
 *   createCounter,
 *   createHistogram,
 *   createUpDownCounter,
 *   InfrastructureMetrics,
 *   incrementCounter,
 *   recordHistogram
 * } from '@package/core/opentelemetry';
 *
 * // Create metrics using predefined names
 * const operationCount = createCounter(InfrastructureMetrics.OPERATION_COUNT);
 * const operationDuration = createHistogram(InfrastructureMetrics.OPERATION_DURATION);
 * const operationErrors = createCounter(InfrastructureMetrics.OPERATION_ERRORS);
 *
 * async function performOperation(name: string): Promise<void> {
 *   const start = Date.now();
 *   try {
 *     await doWork();
 *     incrementCounter(operationCount, 1, { operation: name });
 *   } catch (error) {
 *     incrementCounter(operationErrors, 1, { operation: name });
 *     throw error;
 *   } finally {
 *     recordHistogram(operationDuration, Date.now() - start, { operation: name });
 *   }
 * }
 * ```
 *
 * @example Job processing metrics
 * ```typescript
 * import {
 *   createCounter,
 *   createHistogram,
 *   createUpDownCounter,
 *   InfrastructureMetrics
 * } from '@package/core/opentelemetry';
 *
 * const jobCount = createCounter(InfrastructureMetrics.JOB_COUNT, {
 *   description: 'Total jobs processed'
 * });
 * const jobDuration = createHistogram(InfrastructureMetrics.JOB_DURATION, {
 *   description: 'Job processing duration',
 *   unit: 'ms'
 * });
 * const jobErrors = createCounter(InfrastructureMetrics.JOB_ERRORS, {
 *   description: 'Job processing errors'
 * });
 * const jobRetries = createCounter(InfrastructureMetrics.JOB_RETRIES, {
 *   description: 'Job retry attempts'
 * });
 * const queueSize = createUpDownCounter(InfrastructureMetrics.QUEUE_SIZE, {
 *   description: 'Current queue depth'
 * });
 * ```
 *
 * @example Cache metrics
 * ```typescript
 * import { createCounter, InfrastructureMetrics } from '@package/core/opentelemetry';
 *
 * const cacheHits = createCounter(InfrastructureMetrics.CACHE_HIT);
 * const cacheMisses = createCounter(InfrastructureMetrics.CACHE_MISS);
 *
 * async function getFromCache<T>(key: string): Promise<T | null> {
 *   const value = await redis.get(key);
 *   if (value) {
 *     cacheHits.add(1, { cache: 'redis' });
 *     return JSON.parse(value);
 *   }
 *   cacheMisses.add(1, { cache: 'redis' });
 *   return null;
 * }
 * ```
 */
export const InfrastructureMetrics = {
  // Operation metrics
  /** Duration of infrastructure operations in milliseconds (histogram) */
  OPERATION_DURATION: 'infrastructure.operation.duration',
  /** Total count of infrastructure operations (counter) */
  OPERATION_COUNT: 'infrastructure.operation.count',
  /** Total count of infrastructure operation errors (counter) */
  OPERATION_ERRORS: 'infrastructure.operation.errors',

  // Queue/job metrics
  /** Duration of job processing in milliseconds (histogram) */
  JOB_DURATION: 'infrastructure.job.duration',
  /** Total count of jobs processed (counter) */
  JOB_COUNT: 'infrastructure.job.count',
  /** Total count of job processing errors (counter) */
  JOB_ERRORS: 'infrastructure.job.errors',
  /** Total count of job retry attempts (counter) */
  JOB_RETRIES: 'infrastructure.job.retries',
  /** Current number of jobs in queue (up-down counter) */
  QUEUE_SIZE: 'infrastructure.queue.size',

  // Cache metrics
  /** Total count of cache hits (counter) */
  CACHE_HIT: 'infrastructure.cache.hit',
  /** Total count of cache misses (counter) */
  CACHE_MISS: 'infrastructure.cache.miss',
  /** Duration of cache operations in milliseconds (histogram) */
  CACHE_DURATION: 'infrastructure.cache.duration',

  // Connection metrics
  /** Current number of active connections (up-down counter) */
  CONNECTION_COUNT: 'infrastructure.connection.count',
  /** Total count of connection errors (counter) */
  CONNECTION_ERRORS: 'infrastructure.connection.errors',
  /** Duration of connection establishment in milliseconds (histogram) */
  CONNECTION_DURATION: 'infrastructure.connection.duration',

  // Provider metrics
  /** Duration of provider operations in milliseconds (histogram) */
  PROVIDER_OPERATION_DURATION: 'infrastructure.provider.operation.duration',
  /** Total count of provider operations (counter) */
  PROVIDER_OPERATION_COUNT: 'infrastructure.provider.operation.count'
} as const;

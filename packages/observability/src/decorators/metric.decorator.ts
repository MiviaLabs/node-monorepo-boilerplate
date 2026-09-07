/**
 * Metric Decorators
 *
 * Decorator utilities for automatic metric collection.
 *
 * @module @package/observability/decorators
 */

import { metricsService } from '../metrics';

import type { MetricOptions } from '@opentelemetry/api';

/**
 * Metric naming conventions following OpenTelemetry best practices
 *
 * @see https://opentelemetry.io/docs/reference/specification/metrics/api/
 *
 * Format: <unit>.<component>.<entity>.<action>
 * Examples:
 * - http.server.requests (Counter)
 * - http.server.request.duration (Histogram)
 * - db.connections.active (Gauge)
 */
export const MetricNamingConvention = {
  /**
   * HTTP server metrics
   */
  HTTP_REQUESTS: 'http.server.requests',
  HTTP_REQUEST_DURATION: 'http.server.request.duration',
  HTTP_RESPONSE_SIZE: 'http.server.response.size',

  /**
   * Database metrics
   */
  DB_QUERIES: 'db.queries',
  DB_QUERY_DURATION: 'db.query.duration',
  DB_CONNECTIONS_ACTIVE: 'db.connections.active',
  DB_CONNECTIONS_IDLE: 'db.connections.idle',

  /**
   * Cache metrics
   */
  CACHE_HITS: 'cache.hits',
  CACHE_MISSES: 'cache.misses',
  CACHE_DURATION: 'cache.duration',

  /**
   * Queue metrics
   */
  QUEUE_JOBS_ENQUEUED: 'queue.jobs.enqueued',
  QUEUE_JOBS_DEQUEUED: 'queue.jobs.dequeued',
  QUEUE_JOBS_FAILED: 'queue.jobs.failed',
  QUEUE_JOBS_DURATION: 'queue.jobs.duration',
  QUEUE_JOBS_PENDING: 'queue.jobs.pending',

  /**
   * Business metrics
   */
  BUSINESS_OPERATIONS: 'business.operations',
  BUSINESS_OPERATION_DURATION: 'business.operation.duration',
  BUSINESS_REVENUE: 'business.revenue',
  BUSINESS_ORDERS: 'business.orders',

  /**
   * Error metrics
   */
  ERRORS_TOTAL: 'errors.total',
  ERRORS_BY_TYPE: 'errors.by_type'
} as const;

/**
 * Standard metric attribute keys following OpenTelemetry semantic conventions.
 *
 * Attributes (also called labels or tags) add dimensions to metrics, enabling
 * filtering, grouping, and aggregation in observability backends. Use these
 * constants to ensure consistent attribute naming across your application.
 *
 * ## Best Practices
 *
 * 1. **Use low-cardinality values**: Avoid high-cardinality attributes like user IDs
 *    or request IDs in metrics (use them in traces instead). High cardinality
 *    causes metric explosion and increased storage costs.
 *
 * 2. **Be consistent**: Always use the same attribute names and value formats
 *    across your application for the same concept.
 *
 * 3. **Prefer enums over free-form strings**: Use fixed sets of values where
 *    possible (e.g., 'GET', 'POST' for methods; 'success', 'failure' for status).
 *
 * 4. **Include tenant context**: For multi-tenant applications, always include
 *    `organization_id` to enable per-tenant metric analysis.
 *
 * @example HTTP request metrics
 * ```typescript
 * MetricRecorder.increment('http.requests', 1, {
 *   [MetricAttributes.METHOD]: 'POST',
 *   [MetricAttributes.ROUTE]: '/api/users',
 *   [MetricAttributes.STATUS_CODE]: 201
 * });
 * ```
 *
 * @example Database query metrics
 * ```typescript
 * MetricRecorder.record(MetricNamingConvention.DB_QUERY_DURATION, queryTimeMs, {
 *   [MetricAttributes.DB_SYSTEM]: 'postgresql',
 *   [MetricAttributes.DB_OPERATION]: 'SELECT',
 *   [MetricAttributes.DB_TABLE]: 'users'
 * });
 * ```
 *
 * @example Business operation with tenant context
 * ```typescript
 * MetricRecorder.increment(MetricNamingConvention.BUSINESS_OPERATIONS, 1, {
 *   [MetricAttributes.OPERATION_TYPE]: 'order_created',
 *   [MetricAttributes.OPERATION_STATUS]: 'success',
 *   [MetricAttributes.ORGANIZATION_ID]: tenantId
 * });
 * ```
 *
 * @see {@link MetricNamingConvention} for standard metric names
 * @see {@link https://opentelemetry.io/docs/concepts/semantic-conventions/} OpenTelemetry Semantic Conventions
 */
export const MetricAttributes = {
  // ─────────────────────────────────────────────────────────────────────────────
  // HTTP Attributes
  // Use for HTTP server and client metrics
  // ─────────────────────────────────────────────────────────────────────────────

  /** HTTP method (GET, POST, PUT, DELETE, PATCH). Use uppercase. */
  METHOD: 'method',

  /** HTTP response status code (200, 404, 500). Use numeric values. */
  STATUS_CODE: 'status_code',

  /** Route template with placeholders (e.g., '/api/users/:id'). Prefer over PATH for lower cardinality. */
  ROUTE: 'route',

  /** Actual request path (e.g., '/api/users/123'). Use sparingly due to high cardinality. */
  PATH: 'path',

  // ─────────────────────────────────────────────────────────────────────────────
  // Database Attributes
  // Use for database query and connection metrics
  // ─────────────────────────────────────────────────────────────────────────────

  /** Database system identifier (postgresql, mysql, mongodb, redis). Use lowercase. */
  DB_SYSTEM: 'db_system',

  /** Database name being accessed. */
  DB_NAME: 'db_name',

  /** Database operation type (SELECT, INSERT, UPDATE, DELETE, CONNECT). Use uppercase for SQL. */
  DB_OPERATION: 'db_operation',

  /** Database table or collection name being accessed. */
  DB_TABLE: 'db_table',

  // ─────────────────────────────────────────────────────────────────────────────
  // Cache Attributes
  // Use for cache operation metrics (Redis, Memcached, in-memory)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Cache system identifier (redis, memcached, memory). Use lowercase. */
  CACHE_SYSTEM: 'cache_system',

  /** Cache key pattern or prefix. Avoid full keys to prevent high cardinality. */
  CACHE_KEY: 'cache_key',

  /** Whether the cache lookup was a hit (true) or miss (false). */
  CACHE_HIT: 'cache_hit',

  // ─────────────────────────────────────────────────────────────────────────────
  // Queue Attributes
  // Use for job queue and message broker metrics (BullMQ, RabbitMQ)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Queue name identifier. */
  QUEUE_NAME: 'queue_name',

  /** Type of job being processed (e.g., 'email-notification', 'report-generation'). */
  JOB_TYPE: 'job_type',

  /** Job processing status (completed, failed, delayed, waiting). Use lowercase. */
  JOB_STATUS: 'job_status',

  // ─────────────────────────────────────────────────────────────────────────────
  // Business Attributes
  // Use for domain-specific and multi-tenant metrics
  // ─────────────────────────────────────────────────────────────────────────────

  /** Business operation type (e.g., 'order_created', 'payment_processed'). Use snake_case. */
  OPERATION_TYPE: 'operation_type',

  /** Operation outcome status (success, failure, partial). Use lowercase. */
  OPERATION_STATUS: 'operation_status',

  /** Organization/tenant ID for multi-tenant metric isolation. Critical for SaaS applications. */
  ORGANIZATION_ID: 'organization_id',

  /**
   * User ID. **SENSITIVE/PII** - Contains personally identifiable information.
   *
   * **WARNING:** Avoid using in metrics due to high cardinality and privacy concerns.
   * User IDs must NOT be emitted in logs or error messages without redaction.
   *
   * **Recommended alternatives:**
   * - Use `organization_id` for tenant-level aggregation
   * - Track user-level details in traces (not metrics) where retention is shorter
   * - Use hashed or anonymized identifiers if user-level metrics are required
   *
   * @see {@link ORGANIZATION_ID} for tenant-level metric isolation
   */
  USER_ID: 'user_id',

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Attributes
  // Use for error tracking and categorization
  // ─────────────────────────────────────────────────────────────────────────────

  /** Error class/type name (e.g., 'ValidationError', 'NotFoundError'). */
  ERROR_TYPE: 'error_type',

  /**
   * Error message. Use sparingly due to high cardinality and potential PII.
   * Consider using error codes instead.
   */
  ERROR_MESSAGE: 'error_message',

  // ─────────────────────────────────────────────────────────────────────────────
  // General Attributes
  // Use for service-level identification
  // ─────────────────────────────────────────────────────────────────────────────

  /** Service name emitting the metric (e.g., 'api', 'worker', 'scheduler'). */
  SERVICE_NAME: 'service_name',

  /** Component within the service (e.g., 'auth', 'payments', 'notifications'). */
  COMPONENT: 'component'
} as const;

/**
 * Counter decorator options
 */
export interface CounterDecoratorOptions {
  /**
   * Metric name (defaults to generated name)
   */
  name?: string;

  /**
   * Metric description
   */
  description?: string;

  /**
   * Amount to increment by (default: 1)
   */
  amount?: number;

  /**
   * Static attributes to include
   */
  attributes?: Record<string, string | number | boolean>;

  /**
   * Attribute keys to extract from function arguments
   * Format: { attributeKey: argumentIndex }
   */
  attributeMapping?: Record<string, number>;

  /**
   * OpenTelemetry metric options
   */
  metricOptions?: MetricOptions;
}

/**
 * Histogram decorator options
 */
export interface HistogramDecoratorOptions {
  /**
   * Metric name (defaults to generated name)
   */
  name?: string;

  /**
   * Metric description
   */
  description?: string;

  /**
   * Value to record (default: return value)
   * Can be a number or a function that extracts the value from result
   */
  value?: number | ((result: unknown) => number);

  /**
   * Static attributes to include
   */
  attributes?: Record<string, string | number | boolean>;

  /**
   * Attribute keys to extract from function arguments
   */
  attributeMapping?: Record<string, number>;

  /**
   * OpenTelemetry metric options
   */
  metricOptions?: MetricOptions;
}

/**
 * Increment a counter metric when a method is called
 *
 * @param options - Counter decorator configuration options
 * @returns Method decorator that increments a counter on each invocation
 *
 * @example
 * ```typescript
 * class UserService {
 *   @MetricCounter({ name: 'user.creation.attempts' })
 *   createUser(dto: CreateUserDto) {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function MetricCounter(options: CounterDecoratorOptions = {}) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor?.value;

    // Safety check for environments where descriptor.value might be undefined
    if (!originalMethod) {
      return descriptor;
    }

    const metricName = options.name || MetricNamingConvention.BUSINESS_OPERATIONS;
    const description = options.description || `Counter for ${metricName}`;
    const amount = options.amount ?? 1;

    // Create the counter
    const counter = metricsService.createCounter(metricName, description, options.metricOptions);

    descriptor.value = function (...args: unknown[]) {
      // Build attributes
      const attributes = buildAttributes(options.attributes, options.attributeMapping, args);

      // Increment counter
      counter.add(amount, attributes);

      // Call original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Records histogram duration on error path.
 *
 * @param histogram - The histogram to record to
 * @param startTime - The start time from performance.now()
 * @param options - Decorator options containing static attributes and mapping
 * @param args - Function arguments for dynamic attribute extraction
 * @param error - The caught error
 */
function recordErrorHistogram(
  histogram: ReturnType<typeof metricsService.createHistogram>,
  startTime: number,
  options: HistogramDecoratorOptions,
  args: unknown[],
  error: unknown
): void {
  const duration = performance.now() - startTime;
  const attributes = buildAttributes(
    {
      ...options.attributes,
      [MetricAttributes.ERROR_TYPE]: error instanceof Error ? error.name : 'unknown'
    },
    options.attributeMapping,
    args
  );
  histogram.record(duration, attributes);
}

/**
 * Record duration metric when a method is called
 *
 * @param options - Histogram decorator configuration options
 * @returns Method decorator that records execution duration as a histogram
 *
 * @example
 * ```typescript
 * class UserService {
 *   @MetricHistogram({ name: 'user.creation.duration' })
 *   async createUser(dto: CreateUserDto) {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function MetricHistogram(options: HistogramDecoratorOptions = {}): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor?.value;

    // Safety check for environments where descriptor.value might be undefined
    if (!originalMethod) {
      return descriptor;
    }

    const metricName = options.name || MetricNamingConvention.BUSINESS_OPERATION_DURATION;
    const description = options.description || `Histogram for ${metricName}`;
    const histogram = metricsService.createHistogram(
      metricName,
      description,
      options.metricOptions
    );

    descriptor.value = async function (...args: unknown[]) {
      const startTime = performance.now();

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;
        const attributes = buildAttributes(options.attributes, options.attributeMapping, args);
        histogram.record(duration, attributes);
        return result;
      } catch (error) {
        recordErrorHistogram(histogram, startTime, options, args, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Configuration options for the {@link MetricOperationCounter} decorator.
 *
 * Extends {@link CounterDecoratorOptions} with operation-specific settings
 * for tracking success/failure metrics of method invocations.
 */
export interface IOperationCounterOptions extends CounterDecoratorOptions {
  /**
   * Operation type attribute value.
   * Defaults to the decorated method name if not specified.
   */
  operationType?: string;

  /**
   * Whether to record errors in a separate counter.
   * Defaults to true.
   */
  recordErrors?: boolean;
}

/**
 * Decorator that records success/failure counter metrics for method calls.
 *
 * Creates two counters:
 * - `{baseName}.success` - Incremented when the method completes without throwing
 * - `{baseName}.error` - Incremented when the method throws (if `recordErrors` is true)
 *
 * Both counters include the `operation_type` attribute for filtering.
 *
 * @param options - Configuration options for the operation counter
 * @param options.name - Base metric name (defaults to `business.operations`)
 * @param options.operationType - Operation type attribute (defaults to method name)
 * @param options.recordErrors - Whether to track errors separately (defaults to true)
 * @param options.attributes - Static attributes to include on all recordings
 * @param options.attributeMapping - Dynamic attribute extraction from arguments
 * @returns A method decorator that instruments the target method
 * @throws Re-throws any error from the decorated method after recording metrics
 *
 * @example Basic usage
 * ```typescript
 * class UserService {
 *   @MetricOperationCounter({
 *     name: 'user.operations',
 *     operationType: 'create'
 *   })
 *   async createUser(dto: CreateUserDto) {
 *     // On success: increments user.operations.success{operation_type="create"}
 *     // On error: increments user.operations.error{operation_type="create", error_type="ValidationError"}
 *   }
 * }
 * ```
 *
 * @example With tenant context
 * ```typescript
 * class OrderService {
 *   @MetricOperationCounter({
 *     name: 'order.operations',
 *     operationType: 'place',
 *     attributes: { service: 'order-service' }
 *   })
 *   async placeOrder(dto: PlaceOrderDto, tenantId: string) {
 *     // Metrics include service="order-service" attribute
 *   }
 * }
 * ```
 *
 * @example Disable error tracking
 * ```typescript
 * class NotificationService {
 *   @MetricOperationCounter({
 *     name: 'notification.operations',
 *     recordErrors: false
 *   })
 *   async sendNotification(dto: NotificationDto) {
 *     // Only success counter is recorded; errors are not tracked separately
 *   }
 * }
 * ```
 */
export function MetricOperationCounter(options: IOperationCounterOptions = {}): MethodDecorator {
  return function (_target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor?.value;

    // Safety check for environments where descriptor.value might be undefined
    if (!originalMethod) {
      return descriptor;
    }

    const baseName = options.name || MetricNamingConvention.BUSINESS_OPERATIONS;
    const operationType =
      options.operationType ||
      (typeof propertyKey === 'string' ? propertyKey : String(propertyKey));
    const shouldRecordErrors = options.recordErrors !== false;

    // Create success counter
    const successCounter = metricsService.createCounter(
      `${baseName}.success`,
      `Successful ${operationType} operations`,
      options.metricOptions
    );

    // Only create error counter if error recording is enabled
    const errorCounter = shouldRecordErrors
      ? metricsService.createCounter(
          `${baseName}.error`,
          `Failed ${operationType} operations`,
          options.metricOptions
        )
      : null;

    descriptor.value = async function (...args: unknown[]) {
      // Build base attributes
      const attributes = buildAttributes(
        {
          ...options.attributes,
          [MetricAttributes.OPERATION_TYPE]: operationType
        },
        options.attributeMapping,
        args
      );

      try {
        const result = await originalMethod.apply(this, args);
        successCounter.add(1, attributes);
        return result;
      } catch (error) {
        if (errorCounter) {
          const errorAttributes = {
            ...attributes,
            [MetricAttributes.ERROR_TYPE]: error instanceof Error ? error.name : 'unknown'
          };
          errorCounter.add(1, errorAttributes);
        }
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Build metric attributes from static and dynamic sources.
 *
 * Only accepts primitive types (string, number, boolean) to prevent
 * accidental PII leakage from complex objects. Objects and arrays
 * are silently skipped.
 *
 * Note: `attributeMapping` is a simple index-based extraction mechanism
 * (`Record<string, number>`) that maps attribute keys to argument indices.
 * Only primitive values at those indices are extracted; complex objects
 * must be handled manually before passing to decorators.
 *
 * @param staticAttributes - Predefined attributes to include
 * @param attributeMapping - Maps attribute keys to argument indices (primitives only)
 * @param args - Function arguments to extract values from
 * @returns Record of primitive attribute values
 */
function buildAttributes(
  staticAttributes?: Record<string, string | number | boolean>,
  attributeMapping?: Record<string, number>,
  args?: unknown[]
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {
    ...(staticAttributes ?? {})
  };

  // Extract attributes from function arguments (primitives only)
  if (attributeMapping && args) {
    for (const [key, argIndex] of Object.entries(attributeMapping)) {
      const value = args[argIndex];
      // Only accept primitive types to prevent PII leakage from objects/arrays
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        attributes[key] = value;
      }
      // Objects and arrays are silently skipped to avoid accidental PII exposure
    }
  }

  return attributes;
}

/**
 * Imperative metric recording utilities for cases where decorators are not suitable.
 *
 * Use `MetricRecorder` when you need fine-grained control over metric recording,
 * such as recording metrics based on runtime conditions, within loops, or in
 * utility functions where decorators cannot be applied.
 *
 * For method-level automatic metric collection, prefer the decorator approach:
 * - {@link MetricCounter} for counting method invocations
 * - {@link MetricHistogram} for recording method duration
 * - {@link MetricOperationCounter} for success/failure tracking
 *
 * @example Basic counter increment
 * ```typescript
 * import { MetricRecorder, MetricNamingConvention } from '@package/observability';
 *
 * // Increment a counter when processing items
 * for (const item of items) {
 *   await processItem(item);
 *   MetricRecorder.increment(MetricNamingConvention.BUSINESS_OPERATIONS, 1, {
 *     operation_type: 'item_processed',
 *     item_type: item.type
 *   });
 * }
 * ```
 *
 * @example Recording histogram values
 * ```typescript
 * // Record response sizes
 * MetricRecorder.record('http.response.size', response.body.length, {
 *   route: '/api/users',
 *   method: 'GET'
 * });
 * ```
 *
 * @example Measuring operation duration
 * ```typescript
 * // Wrap an operation to automatically record its duration
 * const result = await MetricRecorder.measure(
 *   'external.api.duration',
 *   () => externalApi.fetchData(query),
 *   { api: 'payment-gateway', operation: 'charge' }
 * );
 * ```
 */
export class MetricRecorder {
  /**
   * Increment a counter metric with optional attributes.
   *
   * Counters are cumulative metrics that only increase (or reset to zero on restart).
   * Use counters for tracking totals like requests, errors, items processed, etc.
   *
   * @param name - The metric name following OpenTelemetry naming conventions.
   *               Use constants from {@link MetricNamingConvention} or follow
   *               the pattern: `<domain>.<entity>.<action>` (e.g., 'http.requests.total')
   * @param amount - The amount to increment by. Defaults to 1.
   *                 Must be a non-negative number.
   * @param attributes - Optional key-value pairs for metric dimensions.
   *                     Use constants from {@link MetricAttributes} for standard keys.
   *
   * @example Basic increment
   * ```typescript
   * MetricRecorder.increment('users.created');
   * ```
   *
   * @example Increment with amount and attributes
   * ```typescript
   * MetricRecorder.increment('queue.messages.processed', batchSize, {
   *   queue_name: 'email-notifications',
   *   status: 'success'
   * });
   * ```
   *
   * @example Error counting
   * ```typescript
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   MetricRecorder.increment('errors.total', 1, {
   *     error_type: error.name,
   *     component: 'payment-processor'
   *   });
   *   throw error;
   * }
   * ```
   */
  static increment(
    name: string,
    amount: number = 1,
    attributes?: Record<string, string | number | boolean>
  ): void {
    metricsService.incrementCounter(name, amount, attributes);
  }

  /**
   * Record a value in a histogram metric.
   *
   * Histograms track the distribution of values, automatically computing
   * percentiles (p50, p95, p99), min, max, and average. Use histograms for
   * measuring durations, sizes, or any value where distribution matters.
   *
   * @param name - The metric name following OpenTelemetry naming conventions.
   *               Common patterns: `*.duration`, `*.size`, `*.count`
   * @param value - The value to record. Units depend on what you're measuring:
   *                - Duration: milliseconds (e.g., 150.5)
   *                - Size: bytes (e.g., 4096)
   *                - Count: integer (e.g., 25)
   * @param attributes - Optional key-value pairs for metric dimensions.
   *
   * @example Recording request duration
   * ```typescript
   * const start = performance.now();
   * await handleRequest();
   * MetricRecorder.record('http.request.duration', performance.now() - start, {
   *   method: 'POST',
   *   route: '/api/orders',
   *   status_code: 201
   * });
   * ```
   *
   * @example Recording payload size
   * ```typescript
   * MetricRecorder.record('http.request.body.size', request.body.length, {
   *   content_type: request.headers['content-type']
   * });
   * ```
   *
   * @example Recording database query time
   * ```typescript
   * MetricRecorder.record(MetricNamingConvention.DB_QUERY_DURATION, queryTimeMs, {
   *   db_system: 'postgresql',
   *   db_operation: 'SELECT',
   *   db_table: 'users'
   * });
   * ```
   */
  static record(
    name: string,
    value: number,
    attributes?: Record<string, string | number | boolean>
  ): void {
    metricsService.recordHistogram(name, value, attributes);
  }

  /**
   * Set a gauge metric to a specific value.
   *
   * Gauges represent a current value that can go up or down, like temperature,
   * queue depth, or active connections. Unlike counters, gauges can decrease.
   *
   * @param name - The metric name following OpenTelemetry naming conventions.
   *               Common patterns: `*.active`, `*.current`, `*.available`
   * @param value - The current value to set. Can be any number (positive,
   *                negative, or zero).
   * @param attributes - Optional key-value pairs for metric dimensions.
   *
   * @example Tracking active connections
   * ```typescript
   * // On connection open
   * activeConnections++;
   * MetricRecorder.gauge('db.connections.active', activeConnections, {
   *   db_system: 'postgresql',
   *   pool: 'main'
   * });
   *
   * // On connection close
   * activeConnections--;
   * MetricRecorder.gauge('db.connections.active', activeConnections, {
   *   db_system: 'postgresql',
   *   pool: 'main'
   * });
   * ```
   *
   * @example Queue depth monitoring
   * ```typescript
   * const queueSize = await queue.getWaitingCount();
   * MetricRecorder.gauge(MetricNamingConvention.QUEUE_JOBS_PENDING, queueSize, {
   *   queue_name: 'email-notifications'
   * });
   * ```
   *
   * @example Memory usage tracking
   * ```typescript
   * const memUsage = process.memoryUsage();
   * MetricRecorder.gauge('process.memory.heap_used', memUsage.heapUsed, {
   *   service_name: 'api'
   * });
   * ```
   */
  static gauge(
    name: string,
    value: number,
    attributes?: Record<string, string | number | boolean>
  ): void {
    metricsService.recordGauge(name, value, attributes);
  }

  /**
   * Measure the duration of an operation and record it as a histogram.
   *
   * This is a convenience method that wraps an operation, measures its
   * execution time, and records it to a histogram metric. It handles both
   * successful completions and errors, adding an `error_type` attribute on failure.
   *
   * @typeParam T - The return type of the operation being measured
   * @param name - The metric name for the duration histogram
   * @param fn - The function to execute and measure. Can be sync or async.
   * @param attributes - Optional base attributes. An `error_type` attribute
   *                     (see {@link MetricAttributes.ERROR_TYPE}) is automatically
   *                     added if the operation throws.
   * @returns The result of the executed function
   * @throws Re-throws any error from the measured function after recording metrics
   *
   * @example Measuring external API call
   * ```typescript
   * const userData = await MetricRecorder.measure(
   *   'external.api.duration',
   *   async () => {
   *     const response = await fetch('https://api.example.com/users/123');
   *     return response.json();
   *   },
   *   { api: 'user-service', operation: 'get-user' }
   * );
   * ```
   *
   * @example Measuring database operation
   * ```typescript
   * const users = await MetricRecorder.measure(
   *   MetricNamingConvention.DB_QUERY_DURATION,
   *   async () => {
   *     return db.select().from(usersTable).where(eq(usersTable.active, true));
   *   },
   *   { db_operation: 'SELECT', db_table: 'users' }
   * );
   * ```
   *
   * @example With error handling (error is re-thrown)
   * ```typescript
   * try {
   *   await MetricRecorder.measure(
   *     'payment.process.duration',
   *     () => paymentGateway.charge(amount),
   *     { payment_method: 'credit_card' }
   *   );
   * } catch (error) {
   *   // Error is recorded with error_type attribute, then re-thrown
   *   // Histogram will have: { payment_method: 'credit_card', error_type: 'PaymentError' }
   *   handlePaymentError(error);
   * }
   * ```
   */
  static async measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      metricsService.recordHistogram(name, duration, attributes);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorAttributes = {
        ...attributes,
        [MetricAttributes.ERROR_TYPE]: error instanceof Error ? error.name : 'unknown'
      };
      metricsService.recordHistogram(name, duration, errorAttributes);
      throw error;
    }
  }
}

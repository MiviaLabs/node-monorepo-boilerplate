/**
 * Correlation ID Pattern
 *
 * Utilities for generating, extracting, and propagating correlation IDs
 * for distributed tracing and log aggregation.
 *
 * This module provides a comprehensive set of tools for managing correlation IDs
 * across distributed systems, enabling request tracing through multiple services.
 * It supports both simple UUID-based correlation IDs and W3C Trace Context format
 * for integration with OpenTelemetry and other distributed tracing systems.
 *
 * ## Core Concepts
 *
 * - **Correlation ID**: A unique identifier (UUID v4) that follows a request across services
 * - **W3C Trace Context**: Standard format (`traceparent` header) for distributed tracing
 * - **Context Propagation**: Automatic storage and retrieval via AsyncLocalStorage
 *
 * @module observability/patterns/correlation-id
 *
 * @example Basic correlation ID flow
 * ```typescript
 * import {
 *   generateCorrelationId,
 *   extractCorrelationId,
 *   createCorrelationHeaders
 * } from '@package/observability';
 *
 * // Generate a new correlation ID for incoming request without one
 * const correlationId = generateCorrelationId();
 *
 * // Extract correlation ID from incoming headers
 * const existingId = extractCorrelationId(request.headers);
 *
 * // Create headers for outbound HTTP calls
 * const headers = createCorrelationHeaders();
 * await fetch('https://downstream-service/api', { headers });
 * ```
 *
 * @example W3C Trace Context for distributed tracing
 * ```typescript
 * import { extractTraceParent, createTraceParent } from '@package/observability';
 *
 * // Extract trace context from incoming request
 * const traceContext = extractTraceParent(request.headers);
 * if (traceContext) {
 *   console.log('Trace ID:', traceContext.traceId);
 *   console.log('Parent Span:', traceContext.spanId);
 * }
 *
 * // Create traceparent header for outbound requests
 * const traceparent = createTraceParent(traceId, spanId, true);
 * // '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
 * ```
 */

import { randomUUID } from 'node:crypto';

import { setRequestContext, getRequestId, withRequestContext } from '../context';

import type { ILogContext } from '../logger';

/**
 * Default header name for correlation ID
 */
export const DEFAULT_CORRELATION_HEADER = 'x-correlation-id';

/**
 * Standard UUID format (v4)
 */
export const UUID_V4_FORMAT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generate a new correlation ID (UUID v4).
 *
 * Creates a cryptographically random UUID v4 suitable for use as a correlation ID.
 * Use this function when starting a new request chain or when an incoming request
 * does not have a correlation ID header.
 *
 * @returns A new UUID v4 string (e.g., '550e8400-e29b-41d4-a716-446655440000')
 *
 * @example Basic usage
 * ```typescript
 * const correlationId = generateCorrelationId();
 * // '550e8400-e29b-41d4-a716-446655440000'
 * ```
 *
 * @example In an HTTP middleware
 * ```typescript
 * function correlationMiddleware(req, res, next) {
 *   const correlationId = extractCorrelationId(req.headers) ?? generateCorrelationId();
 *   req.correlationId = correlationId;
 *   res.setHeader('x-correlation-id', correlationId);
 *   next();
 * }
 * ```
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Validate if a string is a valid UUID v4 correlation ID.
 *
 * Uses a regular expression to validate the UUID v4 format. This ensures
 * correlation IDs from external sources are properly formatted before use.
 *
 * @param id - The string to validate as a UUID v4
 * @returns `true` if the string is a valid UUID v4, `false` otherwise
 *
 * @example Basic validation
 * ```typescript
 * isValidCorrelationId('550e8400-e29b-41d4-a716-446655440000'); // true
 * isValidCorrelationId('not-a-uuid'); // false
 * isValidCorrelationId(''); // false
 * ```
 *
 * @example Validating incoming headers
 * ```typescript
 * const incomingId = req.headers['x-correlation-id'];
 * if (typeof incomingId === 'string' && isValidCorrelationId(incomingId)) {
 *   // Use the validated correlation ID
 *   setCorrelationId(incomingId);
 * } else {
 *   // Generate a new one
 *   setCorrelationId(generateCorrelationId());
 * }
 * ```
 */
export function isValidCorrelationId(id: string): boolean {
  return UUID_V4_FORMAT.test(id);
}

/**
 * Extract correlation ID from HTTP headers.
 *
 * Retrieves the correlation ID from incoming request headers. Handles both
 * single-value and array-value headers (e.g., when proxies add duplicates).
 * Only returns valid UUID v4 values; invalid values are ignored.
 *
 * @param headers - The headers object from an HTTP request. Values can be strings,
 *                  arrays of strings, or undefined (common for Node.js IncomingHttpHeaders).
 * @param headerName - The header name to look for. Defaults to 'x-correlation-id'.
 * @returns The correlation ID if found and valid, otherwise `undefined`
 *
 * @example Basic extraction
 * ```typescript
 * const headers = { 'x-correlation-id': '123e4567-e89b-12d3-a456-426614174000' };
 * const correlationId = extractCorrelationId(headers);
 * // '123e4567-e89b-12d3-a456-426614174000'
 * ```
 *
 * @example With custom header name
 * ```typescript
 * const headers = { 'x-request-id': '123e4567-e89b-12d3-a456-426614174000' };
 * const correlationId = extractCorrelationId(headers, 'x-request-id');
 * // '123e4567-e89b-12d3-a456-426614174000'
 * ```
 *
 * @example Handling missing or invalid headers
 * ```typescript
 * extractCorrelationId({}); // undefined
 * extractCorrelationId({ 'x-correlation-id': 'invalid' }); // undefined
 * extractCorrelationId({ 'x-correlation-id': undefined }); // undefined
 * ```
 *
 * @example In Express middleware for header propagation
 * ```typescript
 * app.use((req, res, next) => {
 *   const correlationId = extractCorrelationId(req.headers) ?? generateCorrelationId();
 *   res.setHeader('x-correlation-id', correlationId);
 *   req.correlationId = correlationId;
 *   next();
 * });
 * ```
 */
export function extractCorrelationId(
  headers: Record<string, string | string[] | undefined>,
  headerName: string = DEFAULT_CORRELATION_HEADER
): string | undefined {
  const value = headers[headerName];

  if (Array.isArray(value)) {
    const firstValid = value.find((v) => isValidCorrelationId(v));
    return firstValid;
  }

  if (typeof value === 'string' && isValidCorrelationId(value)) {
    return value;
  }

  return undefined;
}

/**
 * Get or create correlation ID for the current request context.
 *
 * This function implements the auto-creation pattern: if a correlation ID
 * already exists in the current AsyncLocalStorage context, it is returned;
 * otherwise, a new UUID v4 is generated, stored in the context, and returned.
 *
 * This is the preferred method for obtaining correlation IDs in application code
 * because it ensures consistent ID usage throughout a request lifecycle without
 * requiring explicit ID management.
 *
 * @returns The existing correlation ID from context or a newly generated UUID v4
 *
 * @example Basic auto-creation pattern
 * ```typescript
 * // First call generates and stores a new ID
 * const id1 = getOrCreateCorrelationId();
 * // '550e8400-e29b-41d4-a716-446655440000'
 *
 * // Subsequent calls return the same ID
 * const id2 = getOrCreateCorrelationId();
 * // '550e8400-e29b-41d4-a716-446655440000' (same as id1)
 * ```
 *
 * @example In a service method for logging
 * ```typescript
 * async function processOrder(orderId: string) {
 *   const correlationId = getOrCreateCorrelationId();
 *   logger.info('Processing order', { correlationId, orderId });
 *
 *   // All downstream calls within this context share the same correlationId
 *   await validateOrder(orderId);
 *   await chargePayment(orderId);
 *   await sendConfirmation(orderId);
 *
 *   logger.info('Order processed', { correlationId, orderId });
 * }
 * ```
 *
 * @example Creating headers for outbound HTTP requests
 * ```typescript
 * async function callDownstreamService(data: unknown) {
 *   const correlationId = getOrCreateCorrelationId();
 *   const response = await fetch('https://downstream-service/api', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'x-correlation-id': correlationId
 *     },
 *     body: JSON.stringify(data)
 *   });
 *   return response.json();
 * }
 * ```
 */
export function getOrCreateCorrelationId(): string {
  const existing = getRequestId();
  if (existing) {
    return existing;
  }

  const newId = generateCorrelationId();
  setRequestContext({ requestId: newId });
  return newId;
}

/**
 * Create correlation headers for outbound HTTP requests.
 *
 * Generates a headers object containing the correlation ID for propagation
 * to downstream services. Uses `getOrCreateCorrelationId()` internally,
 * so the same correlation ID is used throughout the request lifecycle.
 *
 * This function simplifies header propagation in distributed systems by
 * providing a ready-to-use headers object that can be spread into fetch
 * or axios configurations.
 *
 * @param headerName - The header name to use. Defaults to 'x-correlation-id'.
 * @returns An object with the correlation ID header set
 *
 * @example Basic usage with fetch
 * ```typescript
 * const headers = createCorrelationHeaders();
 * // { 'x-correlation-id': '550e8400-e29b-41d4-a716-446655440000' }
 *
 * await fetch('https://api.example.com/users', {
 *   headers: {
 *     'Content-Type': 'application/json',
 *     ...headers
 *   }
 * });
 * ```
 *
 * @example With custom header name
 * ```typescript
 * const headers = createCorrelationHeaders('x-request-id');
 * // { 'x-request-id': '550e8400-e29b-41d4-a716-446655440000' }
 * ```
 *
 * @example In a distributed tracing scenario
 * ```typescript
 * async function callPaymentService(orderId: string, amount: number) {
 *   const correlationHeaders = createCorrelationHeaders();
 *
 *   // All downstream services will receive the same correlation ID
 *   const response = await axios.post('https://payment-service/charge', {
 *     orderId,
 *     amount
 *   }, {
 *     headers: {
 *       ...correlationHeaders,
 *       'Authorization': `Bearer ${token}`
 *     }
 *   });
 *
 *   return response.data;
 * }
 * ```
 */
export function createCorrelationHeaders(
  headerName: string = DEFAULT_CORRELATION_HEADER
): Record<string, string> {
  const correlationId = getOrCreateCorrelationId();
  return {
    [headerName]: correlationId
  };
}

/**
 * Wrap a function with correlation context.
 *
 * Executes the provided function within a context that has the specified
 * correlation information. Any calls to `getOrCreateCorrelationId()` or
 * `getRequestId()` within the function will return the correlation ID
 * from this context.
 *
 * This is useful for:
 * - Setting up request context in middleware
 * - Running background jobs with correlation
 * - Testing code that depends on correlation context
 *
 * @typeParam T - The return type of the wrapped function
 * @param context - The log context containing correlation information (e.g., requestId)
 * @param fn - The function to execute within the correlation context
 * @returns The return value of the wrapped function
 *
 * @example Basic usage
 * ```typescript
 * const result = withCorrelation({ requestId: '123e4567-e89b-12d3-a456-426614174000' }, () => {
 *   // All code here will use the provided requestId
 *   return performOperation();
 * });
 * ```
 *
 * @example In HTTP middleware
 * ```typescript
 * app.use((req, res, next) => {
 *   const correlationId = extractCorrelationId(req.headers) ?? generateCorrelationId();
 *
 *   withCorrelation({ requestId: correlationId }, () => {
 *     // All request handling code runs with this correlation context
 *     next();
 *   });
 * });
 * ```
 *
 * @example Async function with correlation
 * ```typescript
 * await withCorrelation({ requestId: correlationId, userId: 'user-123' }, async () => {
 *   await processUserRequest();
 *   // Correlation ID is available in all async operations
 * });
 * ```
 */
export function withCorrelation<T>(context: ILogContext, fn: () => T): T {
  return withRequestContext(context, fn);
}

/**
 * Options for creating OpenTelemetry span context.
 *
 * These options map to OpenTelemetry span attributes and enable correlation
 * between logs and distributed traces. Use this interface when creating
 * span context for custom instrumentation.
 *
 * @see {@link createSpanContext} for creating span context from these options
 *
 * @example
 * ```typescript
 * const options: ISpanContextOptions = {
 *   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   spanId: '00f067aa0ba902b7',
 *   parentSpanId: 'b7ad6b7169203331',
 *   spanName: 'HTTP GET /api/users'
 * };
 * ```
 */
export interface ISpanContextOptions {
  /**
   * Trace ID (root of trace hierarchy).
   * A 32-character lowercase hexadecimal string identifying the entire trace.
   */
  traceId?: string;

  /**
   * Span ID (current span).
   * A 16-character lowercase hexadecimal string identifying this specific span.
   */
  spanId?: string;

  /**
   * Parent span ID.
   * A 16-character lowercase hexadecimal string identifying the parent span.
   * Used to build the trace hierarchy.
   */
  parentSpanId?: string;

  /**
   * Human-readable span name.
   * Typically describes the operation (e.g., 'HTTP GET /api/users').
   */
  spanName?: string;
}

/**
 * Create span context for OpenTelemetry correlation.
 *
 * Converts OpenTelemetry span information into a log context object that can
 * be used for structured logging. This enables correlation between logs and
 * distributed traces by including trace/span IDs in log entries.
 *
 * If no traceId is provided, uses `getOrCreateCorrelationId()` to ensure
 * a correlation ID is always present.
 *
 * @param options - The span context options containing trace/span identifiers
 * @returns A log context object with requestId and optional span attributes
 *
 * @example Basic span context
 * ```typescript
 * const spanContext = createSpanContext({
 *   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   spanId: '00f067aa0ba902b7',
 *   spanName: 'HTTP GET /api/users'
 * });
 * // { requestId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', spanName: 'HTTP GET /api/users' }
 * ```
 *
 * @example Using with logger for trace correlation
 * ```typescript
 * const spanContext = createSpanContext({
 *   traceId: traceId,
 *   spanId: spanId,
 *   spanName: 'processPayment'
 * });
 *
 * // Logs will include trace context for correlation
 * logger.info('Processing payment', { ...spanContext, orderId, amount });
 * ```
 *
 * @example With parent span for distributed tracing
 * ```typescript
 * const childSpanContext = createSpanContext({
 *   traceId: parentTraceId,
 *   spanId: generateSpanId(),
 *   parentSpanId: parentSpanId,
 *   spanName: 'database.query'
 * });
 * ```
 */
export function createSpanContext(options: ISpanContextOptions): ILogContext {
  const context: ILogContext = {
    requestId: options.traceId || getOrCreateCorrelationId()
  };

  // Add span information to context
  if (options.spanName) {
    (context as Record<string, unknown>)['spanName'] = options.spanName;
  }

  if (options.spanId) {
    (context as Record<string, unknown>)['spanId'] = options.spanId;
  }

  if (options.parentSpanId) {
    (context as Record<string, unknown>)['parentSpanId'] = options.parentSpanId;
  }

  return context;
}

/**
 * Extract W3C Trace Context from HTTP headers.
 *
 * Parses the W3C `traceparent` header to extract distributed tracing context.
 * The traceparent header follows the format: `{version}-{trace-id}-{span-id}-{trace-flags}`
 *
 * This function is essential for distributed tracing interoperability, allowing
 * your service to participate in traces that span multiple services and vendors.
 *
 * @see {@link https://www.w3.org/TR/trace-context/} W3C Trace Context specification
 * @see {@link createTraceParent} for creating traceparent headers
 *
 * @param headers - The HTTP headers object containing the traceparent header
 * @returns An object containing traceId, spanId, and sampled flag, or `undefined`
 *          if the header is missing or malformed
 *
 * @example Basic extraction
 * ```typescript
 * const headers = {
 *   'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
 * };
 * const traceContext = extractTraceParent(headers);
 * // {
 * //   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 * //   spanId: '00f067aa0ba902b7',
 * //   sampled: true
 * // }
 * ```
 *
 * @example Handling missing or invalid headers
 * ```typescript
 * extractTraceParent({}); // undefined
 * extractTraceParent({ traceparent: 'invalid' }); // undefined
 * extractTraceParent({ traceparent: '00-abc-def-01' }); // undefined (wrong format)
 * ```
 *
 * @example In middleware for distributed tracing propagation
 * ```typescript
 * app.use((req, res, next) => {
 *   const traceContext = extractTraceParent(req.headers);
 *
 *   if (traceContext) {
 *     // Continue existing trace
 *     setTraceContext({
 *       traceId: traceContext.traceId,
 *       parentSpanId: traceContext.spanId,
 *       sampled: traceContext.sampled
 *     });
 *   } else {
 *     // Start new trace
 *     initializeNewTrace();
 *   }
 *
 *   next();
 * });
 * ```
 *
 * @example With OpenTelemetry context propagation
 * ```typescript
 * const traceContext = extractTraceParent(request.headers);
 * if (traceContext) {
 *   const spanContext = createSpanContext({
 *     traceId: traceContext.traceId,
 *     parentSpanId: traceContext.spanId,
 *     spanName: `${request.method} ${request.path}`
 *   });
 *   logger.info('Incoming request', spanContext);
 * }
 * ```
 */
export function extractTraceParent(
  headers: Record<string, string | string[] | undefined>
): { traceId: string; spanId: string; sampled: boolean } | undefined {
  // W3C Trace Context: HTTP header names are case-insensitive.
  // Perform a case-insensitive lookup because callers may pass headers from
  // sources that preserve original casing (fetch wrappers, gRPC interceptors,
  // manually-constructed fixtures, etc.). Node's built-in HTTP parser
  // lower-cases incoming headers, but this function accepts a generic Record.
  let traceParent: string | string[] | undefined = headers['traceparent'];
  if (traceParent === undefined) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'traceparent') {
        traceParent = headers[key];
        break;
      }
    }
  }

  if (!traceParent || typeof traceParent !== 'string') {
    return undefined;
  }

  // Format: 00-traceId-spanId-sampled
  const match = traceParent.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (!match) {
    return undefined;
  }

  return {
    traceId: match[1]!,
    spanId: match[2]!,
    sampled: match[3] === '01'
  };
}

/**
 * Create a W3C traceparent header value.
 *
 * Generates a properly formatted traceparent header string for propagating
 * distributed trace context to downstream services. The format follows the
 * W3C Trace Context specification: `{version}-{trace-id}-{span-id}-{trace-flags}`
 *
 * @see {@link https://www.w3.org/TR/trace-context/} W3C Trace Context specification
 * @see {@link extractTraceParent} for parsing traceparent headers
 *
 * @param traceId - The 32-character lowercase hexadecimal trace ID
 * @param spanId - The 16-character lowercase hexadecimal span ID
 * @param sampled - Whether this trace should be sampled (recorded). Defaults to `true`.
 *                  When `false`, downstream services may skip recording spans.
 * @returns A W3C-compliant traceparent header string
 *
 * @example Basic usage
 * ```typescript
 * const traceparent = createTraceParent(
 *   '4bf92f3577b34da6a3ce929d0e0e4736',
 *   '00f067aa0ba902b7'
 * );
 * // '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
 * ```
 *
 * @example With sampling disabled
 * ```typescript
 * const traceparent = createTraceParent(
 *   '4bf92f3577b34da6a3ce929d0e0e4736',
 *   '00f067aa0ba902b7',
 *   false // Not sampled
 * );
 * // '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00'
 * ```
 *
 * @example Propagating trace context in HTTP requests
 * ```typescript
 * async function callDownstreamService(data: unknown) {
 *   const traceparent = createTraceParent(currentTraceId, currentSpanId);
 *
 *   const response = await fetch('https://downstream-service/api', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'traceparent': traceparent,
 *       ...createCorrelationHeaders()
 *     },
 *     body: JSON.stringify(data)
 *   });
 *
 *   return response.json();
 * }
 * ```
 *
 * @example Complete distributed tracing flow
 * ```typescript
 * // Service A (initiator)
 * const traceId = generateTraceId();
 * const spanId = generateSpanId();
 *
 * const response = await fetch('https://service-b/api', {
 *   headers: {
 *     'traceparent': createTraceParent(traceId, spanId)
 *   }
 * });
 *
 * // Service B (receiver)
 * app.use((req, res, next) => {
 *   const context = extractTraceParent(req.headers);
 *   if (context) {
 *     // Create child span and propagate to downstream
 *     const childSpanId = generateSpanId();
 *     res.locals.traceparent = createTraceParent(context.traceId, childSpanId);
 *   }
 *   next();
 * });
 * ```
 */
export function createTraceParent(
  traceId: string,
  spanId: string,
  sampled: boolean = true
): string {
  const sampledFlag = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${sampledFlag}`;
}

/**
 * Add correlation ID to an existing log context.
 *
 * Merges the current correlation ID (from context or newly generated) into
 * the provided log context object. The correlation ID is added as `requestId`
 * to maintain compatibility with the ILogContext interface.
 *
 * This is useful when you have an existing context object and want to ensure
 * it includes the correlation ID for logging.
 *
 * @param context - An optional existing log context to extend. Defaults to empty object.
 * @returns A new context object with the requestId (correlation ID) added
 *
 * @example Basic usage
 * ```typescript
 * const context = addCorrelationToContext({ userId: '123' });
 * // { requestId: '550e8400-e29b-41d4-a716-446655440000', userId: '123' }
 * ```
 *
 * @example With empty context
 * ```typescript
 * const context = addCorrelationToContext();
 * // { requestId: '550e8400-e29b-41d4-a716-446655440000' }
 * ```
 *
 * @example Using with structured logging
 * ```typescript
 * function logBusinessEvent(event: string, details: Record<string, unknown>) {
 *   const context = addCorrelationToContext({
 *     event,
 *     ...details
 *   });
 *   logger.info('Business event', context);
 * }
 *
 * logBusinessEvent('order.created', { orderId: 'ord-123', amount: 99.99 });
 * ```
 */
export function addCorrelationToContext(context: ILogContext = {}): ILogContext {
  return {
    ...context,
    requestId: getOrCreateCorrelationId()
  };
}

/**
 * Generate a formatted log message string with correlation ID.
 *
 * Creates a human-readable string containing the correlation ID, useful for
 * console debugging or adding correlation context to unstructured log output.
 * For production use, prefer structured logging with `addCorrelationToContext()`.
 *
 * @param prefix - The label to use before the correlation ID. Defaults to 'correlation-id'.
 * @param suffix - Optional additional text to append after the correlation ID.
 * @returns A formatted string in the format `[prefix=correlationId]` or `[prefix=correlationId, suffix]`
 *
 * @example Basic usage
 * ```typescript
 * console.log(getCorrelationLogMessage());
 * // '[correlation-id=550e8400-e29b-41d4-a716-446655440000]'
 * ```
 *
 * @example With custom prefix
 * ```typescript
 * console.log(getCorrelationLogMessage('request'));
 * // '[request=550e8400-e29b-41d4-a716-446655440000]'
 * ```
 *
 * @example With suffix for additional context
 * ```typescript
 * console.log(getCorrelationLogMessage('trace', 'payment-service'));
 * // '[trace=550e8400-e29b-41d4-a716-446655440000, payment-service]'
 * ```
 *
 * @example In console debugging
 * ```typescript
 * console.log(`${getCorrelationLogMessage()} Starting payment processing`);
 * // '[correlation-id=550e8400-...] Starting payment processing'
 * ```
 */
export function getCorrelationLogMessage(prefix = 'correlation-id', suffix = ''): string {
  const correlationId = getOrCreateCorrelationId();
  return `[${prefix}=${correlationId}${suffix ? `, ${suffix}` : ''}]`;
}

/**
 * Format correlation information as a space-separated key=value string.
 *
 * Creates a formatted string containing the correlation ID and any additional
 * trace information. Useful for including in log messages or debug output.
 * Automatically includes the correlation ID and filters out undefined values.
 *
 * @param info - An object containing key-value pairs to include in the formatted string.
 *               Values that are `undefined` are omitted from the output.
 * @returns A space-separated string of key=value pairs, starting with correlationId
 *
 * @example Basic formatting
 * ```typescript
 * const formatted = formatCorrelationInfo({
 *   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   spanId: '00f067aa0ba902b7',
 *   userId: '123'
 * });
 * // 'correlationId=550e8400-... traceId=4bf92f3577b34da6a3ce929d0e0e4736 spanId=00f067aa0ba902b7 userId=123'
 * ```
 *
 * @example With undefined values filtered out
 * ```typescript
 * const formatted = formatCorrelationInfo({
 *   traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   spanId: undefined,
 *   userId: '123'
 * });
 * // 'correlationId=550e8400-... traceId=4bf92f3577b34da6a3ce929d0e0e4736 userId=123'
 * ```
 *
 * @example In structured log prefix
 * ```typescript
 * function logWithContext(message: string, context: Record<string, string | undefined>) {
 *   const prefix = formatCorrelationInfo(context);
 *   console.log(`${prefix} | ${message}`);
 * }
 *
 * logWithContext('Payment processed', {
 *   orderId: 'ord-123',
 *   status: 'completed'
 * });
 * // 'correlationId=550e8400-... orderId=ord-123 status=completed | Payment processed'
 * ```
 */
export function formatCorrelationInfo(info: Record<string, string | undefined>): string {
  const correlationId = getOrCreateCorrelationId();
  const parts = [`correlationId=${correlationId}`];

  for (const [key, value] of Object.entries(info)) {
    if (value) {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(' ');
}

/**
 * OpenTelemetry tracing utilities for distributed tracing.
 *
 * This module provides helper functions for creating spans, managing trace context,
 * and recording span attributes and exceptions. These utilities wrap the OpenTelemetry
 * API to provide a consistent, type-safe interface for infrastructure operations.
 *
 * @remarks
 * Spans are the building blocks of distributed traces. Each span represents a single
 * operation within a trace and contains timing information, attributes, and status.
 * Use these utilities in decorators, providers, and services that need observability.
 *
 * @see {@link https://opentelemetry.io/docs/concepts/signals/traces/ | OpenTelemetry Traces}
 * @see {@link https://opentelemetry.io/docs/specs/otel/trace/api/ | OpenTelemetry Trace API}
 *
 * @example Basic span creation
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 *
 * async function fetchUser(userId: string): Promise<User> {
 *   return withSpan('user.fetch', async (span) => {
 *     span.setAttribute('user.id', userId);
 *     const user = await userRepository.findById(userId);
 *     return user;
 *   });
 * }
 * ```
 *
 * @example Nested spans with parent context
 * ```typescript
 * import { withSpan, addSpanAttributes } from '@package/core/opentelemetry';
 *
 * async function processOrder(orderId: string): Promise<void> {
 *   return withSpan('order.process', async (parentSpan) => {
 *     parentSpan.setAttribute('order.id', orderId);
 *
 *     // Child spans automatically inherit parent context
 *     await withSpan('order.validate', async (childSpan) => {
 *       childSpan.setAttribute('validation.type', 'schema');
 *       await validateOrder(orderId);
 *     });
 *
 *     await withSpan('order.persist', async (childSpan) => {
 *       await saveOrder(orderId);
 *     });
 *   });
 * }
 * ```
 *
 * @module
 */

import { trace, SpanKind } from '@opentelemetry/api';

import { toAttributes } from './utilities';

import type { Span, SpanOptions, Tracer } from '@opentelemetry/api';

/**
 * Default tracer name used when no custom name is provided.
 *
 * @remarks
 * The tracer name identifies the instrumentation library in trace data.
 * Using a consistent name helps with filtering and analyzing traces.
 *
 * @example
 * ```typescript
 * import { DEFAULT_TRACER_NAME, getTracer } from '@package/core/opentelemetry';
 *
 * // Use default tracer
 * const tracer = getTracer();
 *
 * // Or explicitly pass the default
 * const sameTracer = getTracer(DEFAULT_TRACER_NAME);
 * ```
 */
export const DEFAULT_TRACER_NAME = '@package/core';

/**
 * Re-export of OpenTelemetry SpanKind for infrastructure operations.
 *
 * SpanKind describes the relationship between a span and its parent/children:
 * - `INTERNAL` - Default, internal operation with no remote parent/child
 * - `SERVER` - Server-side handling of a remote request
 * - `CLIENT` - Client-side of a remote request
 * - `PRODUCER` - Producer of an async message
 * - `CONSUMER` - Consumer of an async message
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/trace/api/#spankind | OpenTelemetry SpanKind}
 *
 * @example
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 *
 * // Mark a span as a message producer
 * await withSpanKind('event.publish', InfrastructureSpanKind.PRODUCER, async (span) => {
 *   await publishEvent(event);
 * });
 *
 * // Mark a span as a message consumer
 * await withSpanKind('event.process', InfrastructureSpanKind.CONSUMER, async (span) => {
 *   await processEvent(event);
 * });
 * ```
 */
export const InfrastructureSpanKind = SpanKind;

/**
 * Type definition for span attributes in infrastructure operations.
 *
 * Span attributes provide additional context about an operation. Values can be
 * strings, numbers, or booleans. Null and undefined values are filtered out
 * when applied to spans.
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/common/#attribute | OpenTelemetry Attributes}
 *
 * @example
 * ```typescript
 * const attributes: IInfrastructureSpanAttributes = {
 *   'db.system': 'postgresql',
 *   'db.name': 'users',
 *   'db.operation': 'SELECT',
 *   'retry.count': 2,
 *   'cache.hit': true,
 *   'optional.value': undefined // Will be filtered out
 * };
 * ```
 */
export interface IInfrastructureSpanAttributes {
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Type definition for span attributes in infrastructure operations.
 *
 * @deprecated Use {@link IInfrastructureSpanAttributes} instead. This alias
 *   is preserved for backward compatibility and will be removed in a future
 *   major version.
 * @see {@link IInfrastructureSpanAttributes}
 */
export type InfrastructureSpanAttributes = IInfrastructureSpanAttributes;

/**
 * Gets or creates a tracer instance for creating spans.
 *
 * A tracer is the entry point for creating spans. Each tracer is identified by
 * a name and optional version, which appear in trace data to identify the
 * instrumentation library.
 *
 * @param name - The name identifying this tracer/instrumentation library.
 *   Use a package name or descriptive identifier. Defaults to `DEFAULT_TRACER_NAME`.
 * @param version - Optional version string for the instrumentation library.
 *   Useful for tracking which version of instrumentation generated a span.
 * @returns A tracer instance that can be used to create spans.
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/trace/api/#get-a-tracer | OpenTelemetry Get Tracer}
 *
 * @example Using the default tracer
 * ```typescript
 * import { getTracer } from '@package/core/opentelemetry';
 *
 * const tracer = getTracer();
 * tracer.startActiveSpan('my.operation', (span) => {
 *   // ... operation code
 *   span.end();
 * });
 * ```
 *
 * @example Using a custom tracer name and version
 * ```typescript
 * import { getTracer } from '@package/core/opentelemetry';
 *
 * const tracer = getTracer('@myorg/payment-service', '2.1.0');
 * tracer.startActiveSpan('payment.process', (span) => {
 *   span.setAttribute('payment.provider', 'stripe');
 *   // ... process payment
 *   span.end();
 * });
 * ```
 */
export function getTracer(name: string = DEFAULT_TRACER_NAME, version?: string): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Executes an async function within a new span with automatic lifecycle management.
 *
 * This is the primary utility for creating traced operations. It:
 * - Creates a new span with the given name
 * - Automatically propagates parent context (nested spans work correctly)
 * - Sets span status to OK on success or ERROR on failure
 * - Records exceptions automatically
 * - Ensures the span is ended even if an error occurs
 *
 * @typeParam T - The return type of the callback function.
 * @param name - The name of the span. Use dot notation for hierarchical names
 *   (e.g., `'user.create'`, `'cache.get'`, `'db.query'`).
 * @param fn - The async function to execute within the span context.
 *   Receives the span as a parameter for adding attributes or events.
 * @param options - Optional span configuration. Supports all SpanOptions except `kind`
 *   (use `withSpanKind` for specifying span kind). Common options include:
 *   - `attributes`: Initial span attributes
 *   - `links`: Links to other spans
 *   - `startTime`: Custom start time
 * @returns A promise resolving to the callback's return value.
 * @throws Re-throws any error from the callback after recording it in the span.
 *
 * @see {@link withSpanKind} - For creating spans with a specific SpanKind
 * @see {@link addSpanAttributes} - For adding attributes outside span callbacks
 * @see {@link https://opentelemetry.io/docs/specs/otel/trace/api/#span | OpenTelemetry Span}
 *
 * @example Basic usage with attributes
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 *
 * async function createUser(email: string): Promise<User> {
 *   return withSpan('user.create', async (span) => {
 *     span.setAttribute('user.email_domain', email.split('@')[1]);
 *
 *     const user = await userRepository.create({ email });
 *     span.setAttribute('user.id', user.id);
 *
 *     return user;
 *   });
 * }
 * ```
 *
 * @example With initial attributes in options
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * async function queryUsers(): Promise<User[]> {
 *   return withSpan('db.query', async (span) => {
 *     const users = await db.select().from(usersTable);
 *     span.setAttribute('db.row_count', users.length);
 *     return users;
 *   }, {
 *     attributes: {
 *       [DB_ATTRS.SYSTEM]: DB_SYSTEMS.POSTGRESQL,
 *       [DB_ATTRS.OPERATION]: 'SELECT'
 *     }
 *   });
 * }
 * ```
 *
 * @example Error handling - errors are recorded automatically
 * ```typescript
 * import { withSpan } from '@package/core/opentelemetry';
 *
 * async function riskyOperation(): Promise<void> {
 *   try {
 *     await withSpan('risky.operation', async (span) => {
 *       span.setAttribute('attempt', 1);
 *       throw new Error('Operation failed');
 *       // Span automatically records exception and sets ERROR status
 *     });
 *   } catch (error) {
 *     // Error is re-thrown after being recorded
 *     console.error('Caught:', error.message);
 *   }
 * }
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options: Omit<SpanOptions, 'kind'> = {}
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Executes an async function within a new span with a specific SpanKind.
 *
 * Use this when you need to specify the semantic relationship of the span:
 * - `SpanKind.CLIENT` for outgoing requests
 * - `SpanKind.SERVER` for handling incoming requests
 * - `SpanKind.PRODUCER` for async message publishing
 * - `SpanKind.CONSUMER` for async message processing
 * - `SpanKind.INTERNAL` for internal operations (default)
 *
 * @typeParam T - The return type of the callback function.
 * @param name - The name of the span. Use dot notation for hierarchical names.
 * @param kind - The SpanKind describing the span's role. Use `InfrastructureSpanKind`
 *   or import `SpanKind` from `@opentelemetry/api`.
 * @param fn - The async function to execute within the span context.
 * @param options - Optional span configuration (attributes, links, startTime).
 * @returns A promise resolving to the callback's return value.
 * @throws Re-throws any error from the callback after recording it in the span.
 *
 * @see {@link withSpan} - For spans without a specific kind
 * @see {@link InfrastructureSpanKind} - Available span kinds
 *
 * @example HTTP client request
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import { HTTP_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * async function fetchExternalData(url: string): Promise<Response> {
 *   return withSpanKind('http.client', InfrastructureSpanKind.CLIENT, async (span) => {
 *     span.setAttribute(HTTP_ATTRS.METHOD, 'GET');
 *     span.setAttribute(HTTP_ATTRS.URL, url);
 *
 *     const response = await fetch(url);
 *     span.setAttribute(HTTP_ATTRS.STATUS_CODE, response.status);
 *
 *     return response;
 *   });
 * }
 * ```
 *
 * @example Message producer
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 * import { MESSAGING_ATTRS, MESSAGING_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * async function publishEvent(event: DomainEvent): Promise<void> {
 *   await withSpanKind('event.publish', InfrastructureSpanKind.PRODUCER, async (span) => {
 *     span.setAttribute(MESSAGING_ATTRS.SYSTEM, MESSAGING_SYSTEMS.RABBITMQ);
 *     span.setAttribute(MESSAGING_ATTRS.DESTINATION, event.type);
 *     span.setAttribute(MESSAGING_ATTRS.MESSAGE_ID, event.id);
 *
 *     await messageBroker.publish(event);
 *   });
 * }
 * ```
 *
 * @example Message consumer
 * ```typescript
 * import { withSpanKind, InfrastructureSpanKind } from '@package/core/opentelemetry';
 *
 * async function processJob(job: Job): Promise<void> {
 *   await withSpanKind('job.process', InfrastructureSpanKind.CONSUMER, async (span) => {
 *     span.setAttribute('job.id', job.id);
 *     span.setAttribute('job.type', job.name);
 *
 *     await job.execute();
 *   });
 * }
 * ```
 */
export async function withSpanKind<T>(
  name: string,
  kind: SpanKind,
  fn: (span: Span) => Promise<T> | T,
  options: Partial<SpanOptions> = {}
): Promise<T> {
  return withSpan(name, fn, { ...options, kind } as SpanOptions);
}

/**
 * Adds attributes to the currently active span, if one exists.
 *
 * Use this to add context to spans from code that doesn't have direct access
 * to the span object. This is useful in utility functions, middleware, or
 * deeply nested code where passing the span would be cumbersome.
 *
 * @param attributes - Key-value pairs to add as span attributes.
 *   Null and undefined values are automatically filtered out.
 * @returns void - This function has no return value and performs no action
 *   if there is no active span.
 *
 * @remarks
 * This function is safe to call even when no span is active. If no span
 * exists, the call is a no-op. Attributes with null or undefined values
 * are silently ignored.
 *
 * @see {@link withSpan} - For creating spans with direct attribute access
 * @see {@link toAttributes} - For converting raw attributes to OpenTelemetry format
 *
 * @example Adding attributes from a utility function
 * ```typescript
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 *
 * function enrichUserContext(user: User): void {
 *   addSpanAttributes({
 *     'user.id': user.id,
 *     'user.role': user.role,
 *     'user.tenant_id': user.tenantId,
 *     'user.is_admin': user.role === 'admin'
 *   });
 * }
 *
 * // Used within a traced operation
 * await withSpan('user.action', async (span) => {
 *   const user = await getUser();
 *   enrichUserContext(user); // Adds attributes to current span
 *   await performAction();
 * });
 * ```
 *
 * @example Safe usage when span may not exist
 * ```typescript
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 *
 * function logOperation(name: string, metadata: Record<string, unknown>): void {
 *   // Safe to call - no-op if no active span
 *   addSpanAttributes({
 *     'operation.name': name,
 *     'operation.timestamp': Date.now()
 *   });
 *
 *   logger.info(`Operation: ${name}`, metadata);
 * }
 * ```
 *
 * @example Filtering null/undefined values
 * ```typescript
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 *
 * function addOptionalContext(user?: User): void {
 *   addSpanAttributes({
 *     'user.id': user?.id,           // Added if user exists
 *     'user.email': user?.email,     // Added if user exists
 *     'user.name': null              // Filtered out (null)
 *   });
 * }
 * ```
 */
export function addSpanAttributes(attributes: IInfrastructureSpanAttributes): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes(toAttributes(attributes));
  }
}

/**
 * Records an exception in the currently active span, if one exists.
 *
 * Use this to record errors that occur during traced operations but don't
 * cause the entire operation to fail. For fatal errors, let `withSpan`
 * handle exception recording automatically by throwing.
 *
 * @param error - The error to record in the span. The error's message,
 *   name, and stack trace are captured as span events.
 * @returns void - This function has no return value and performs no action
 *   if there is no active span.
 *
 * @remarks
 * This function does NOT set the span status to ERROR. Use this for
 * non-fatal errors or warnings. For fatal errors that should mark the
 * span as failed, throw the error and let `withSpan` handle it.
 *
 * @see {@link withSpan} - Automatically records exceptions and sets ERROR status
 *
 * @example Recording a non-fatal error
 * ```typescript
 * import { withSpan, recordSpanException } from '@package/core/opentelemetry';
 *
 * async function fetchWithFallback(url: string): Promise<Data> {
 *   return withSpan('fetch.with_fallback', async (span) => {
 *     try {
 *       return await fetchPrimary(url);
 *     } catch (error) {
 *       // Record but don't fail - we have a fallback
 *       recordSpanException(error);
 *       span.setAttribute('fallback.used', true);
 *       return await fetchFallback(url);
 *     }
 *   });
 * }
 * ```
 *
 * @example Recording validation warnings
 * ```typescript
 * import { withSpan, recordSpanException, addSpanAttributes } from '@package/core/opentelemetry';
 *
 * async function processData(data: unknown[]): Promise<ProcessedData[]> {
 *   return withSpan('data.process', async (span) => {
 *     const results: ProcessedData[] = [];
 *     let errorCount = 0;
 *
 *     for (const item of data) {
 *       try {
 *         results.push(await processItem(item));
 *       } catch (error) {
 *         errorCount++;
 *         recordSpanException(error); // Record each failure
 *       }
 *     }
 *
 *     addSpanAttributes({
 *       'process.total': data.length,
 *       'process.success': results.length,
 *       'process.errors': errorCount
 *     });
 *
 *     return results;
 *   });
 * }
 * ```
 *
 * @example Safe usage outside traced context
 * ```typescript
 * import { recordSpanException } from '@package/core/opentelemetry';
 *
 * function handleError(error: Error): void {
 *   // Safe to call - no-op if no active span
 *   recordSpanException(error);
 *
 *   // Always log regardless of tracing
 *   logger.error('Error occurred', { error });
 * }
 * ```
 */
export function recordSpanException(error: Error): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.recordException(error);
  }
}

/**
 * Creates a SpanOptions object with pre-configured attributes.
 *
 * Helper function for building span options with attributes that need
 * null/undefined filtering. Useful when creating spans with the raw
 * OpenTelemetry API or when building reusable span configurations.
 *
 * @param attributes - Key-value pairs for span attributes.
 *   Null and undefined values are automatically filtered out.
 * @param options - Additional span options to merge (kind, links, startTime).
 * @returns A SpanOptions object with filtered attributes merged with other options.
 *
 * @see {@link withSpan} - Typically preferred over raw span creation
 * @see {@link toAttributes} - The underlying attribute filtering function
 *
 * @example Creating reusable span options for database operations
 * ```typescript
 * import { createSpanOptions, getTracer } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 * import { SpanKind } from '@opentelemetry/api';
 *
 * function createDbSpanOptions(operation: string, table?: string): SpanOptions {
 *   return createSpanOptions({
 *     [DB_ATTRS.SYSTEM]: DB_SYSTEMS.POSTGRESQL,
 *     [DB_ATTRS.OPERATION]: operation,
 *     [DB_ATTRS.NAME]: table  // May be undefined - will be filtered
 *   }, {
 *     kind: SpanKind.CLIENT
 *   });
 * }
 *
 * // Usage
 * const tracer = getTracer();
 * const options = createDbSpanOptions('SELECT', 'users');
 * tracer.startActiveSpan('db.query', options, (span) => {
 *   // ... execute query
 *   span.end();
 * });
 * ```
 *
 * @example Building cache operation options
 * ```typescript
 * import { createSpanOptions } from '@package/core/opentelemetry';
 * import { CACHE_ATTRS } from '@package/core/opentelemetry/attributes';
 *
 * const cacheGetOptions = createSpanOptions({
 *   [CACHE_ATTRS.OPERATION]: 'get',
 *   'cache.backend': 'redis'
 * });
 *
 * const cacheSetOptions = createSpanOptions({
 *   [CACHE_ATTRS.OPERATION]: 'set',
 *   'cache.backend': 'redis'
 * });
 * ```
 */
export function createSpanOptions(
  attributes: IInfrastructureSpanAttributes,
  options: Partial<SpanOptions> = {}
): SpanOptions {
  return {
    attributes: toAttributes(attributes),
    ...options
  };
}

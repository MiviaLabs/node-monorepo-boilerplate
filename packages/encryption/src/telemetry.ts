/**
 * OpenTelemetry integration for encryption
 *
 * Provides tracing and metrics for encryption operations
 */

import {
  trace,
  Span,
  SpanStatusCode,
  SpanKind,
  Attributes,
  context,
  Context as OtelContext
} from '@opentelemetry/api';

/**
 * Encryption operation names
 */
export enum EncryptionOperation {
  ENCRYPT = 'encryption.encrypt',
  DECRYPT = 'encryption.decrypt',
  GENERATE_DATA_KEY = 'encryption.generate_data_key',
  REWRAP_KEY = 'encryption.rewrap_key',
  ENVELOPE_ENCRYPT = 'encryption.envelope_encrypt',
  ENVELOPE_DECRYPT = 'encryption.envelope_decrypt',
  ENTITY_ENCRYPT = 'encryption.entity_encrypt',
  ENTITY_DECRYPT = 'encryption.entity_decrypt',
  KEY_ROTATION = 'encryption.key_rotation',
  DATA_MIGRATION = 'encryption.data_migration'
}

/**
 * Attribute keys
 */
export const AttributeKey = {
  PROVIDER: 'encryption.provider',
  KEY_ID: 'encryption.key_id',
  KEY_VERSION: 'encryption.key_version',
  ALGORITHM: 'encryption.algorithm',
  KEY_SIZE: 'encryption.key_size',
  DATA_SIZE: 'encryption.data_size',
  ENTITY_NAME: 'encryption.entity_name',
  FIELD_NAME: 'encryption.field_name',
  ERROR: 'error.message',
  ERROR_TYPE: 'error.type'
} as const;

/**
 * Tracer instance name
 */
const TRACER_NAME = 'encryption';
const TRACER_VERSION = '0.0.1';

/**
 * Get or create tracer
 */
function getTracer() {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/**
 * Encryption telemetry context
 */
export interface EncryptionTelemetryContext {
  /** Provider name (e.g., 'gcp', 'aws') */
  provider?: string;
  /** Key identifier */
  keyId?: string;
  /** Key version */
  keyVersion?: string;
  /** Encryption algorithm */
  algorithm?: string;
  /** Data size in bytes */
  dataSize?: number;
  /** Entity name (for entity-level encryption) */
  entityName?: string;
  /** Field name (for entity-level encryption) */
  fieldName?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Build attributes from context
 */
function buildAttributes(ctx: EncryptionTelemetryContext): Attributes {
  const attrs: Attributes = {};

  if (ctx.provider) attrs[AttributeKey.PROVIDER] = ctx.provider;
  if (ctx.keyId) attrs[AttributeKey.KEY_ID] = ctx.keyId;
  if (ctx.keyVersion) attrs[AttributeKey.KEY_VERSION] = ctx.keyVersion;
  if (ctx.algorithm) attrs[AttributeKey.ALGORITHM] = ctx.algorithm;
  if (ctx.dataSize !== undefined) attrs[AttributeKey.DATA_SIZE] = ctx.dataSize;
  if (ctx.entityName) attrs[AttributeKey.ENTITY_NAME] = ctx.entityName;
  if (ctx.fieldName) attrs[AttributeKey.FIELD_NAME] = ctx.fieldName;

  // Add metadata as additional attributes
  if (ctx.metadata) {
    for (const [key, value] of Object.entries(ctx.metadata)) {
      // Only add primitive types as attributes
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        attrs[`encryption.${key}`] = value;
      }
    }
  }

  return attrs;
}

/**
 * Wrap an async function with tracing
 *
 * @param operation - The encryption operation being performed
 * @param fn - Async function to wrap, receives the span as parameter
 * @param telemetryCtx - Optional telemetry context with provider, key, and algorithm info
 * @returns Promise resolving to the function result
 */
export async function withTracing<T>(
  operation: EncryptionOperation,
  fn: (span: Span) => Promise<T>,
  telemetryCtx: EncryptionTelemetryContext = {}
): Promise<T> {
  const tracer = getTracer();
  const attributes = buildAttributes(telemetryCtx);

  return tracer.startActiveSpan(
    operation,
    {
      kind: SpanKind.CLIENT,
      attributes
    },
    async (span: Span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.constructor.name : typeof error;

        span.recordException(error instanceof Error ? error : new Error(errorMessage));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage
        });

        span.setAttribute(AttributeKey.ERROR, errorMessage);
        span.setAttribute(AttributeKey.ERROR_TYPE, errorType);

        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Wrap a synchronous function with tracing
 *
 * @param operation - The encryption operation being performed
 * @param fn - Function to wrap, receives the span as parameter
 * @param telemetryCtx - Optional telemetry context with provider, key, and algorithm info
 * @returns The function result
 */
export function withTracingSync<T>(
  operation: EncryptionOperation,
  fn: (span: Span) => T,
  telemetryCtx: EncryptionTelemetryContext = {}
): T {
  const tracer = getTracer();
  const attributes = buildAttributes(telemetryCtx);

  return tracer.startActiveSpan(
    operation,
    {
      kind: SpanKind.CLIENT,
      attributes
    },
    (span: Span) => {
      try {
        const result = fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.constructor.name : typeof error;

        span.recordException(error instanceof Error ? error : new Error(errorMessage));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage
        });

        span.setAttribute(AttributeKey.ERROR, errorMessage);
        span.setAttribute(AttributeKey.ERROR_TYPE, errorType);

        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Add event to current span
 *
 * @param name - Event name
 * @param attributes - Optional event attributes
 */
export function addSpanEvent(name: string, attributes?: Attributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 *
 * @param key - Attribute key
 * @param value - Attribute value (will be converted to string if not primitive)
 */
export function setSpanAttribute(key: string, value: unknown): void {
  const span = trace.getActiveSpan();
  if (span) {
    // Convert value to a valid AttributeValue type
    let attributeValue: string | number | boolean | undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributeValue = value;
    } else if (value === undefined || value === null) {
      attributeValue = undefined;
    } else {
      attributeValue = String(value);
    }

    if (attributeValue !== undefined) {
      span.setAttribute(key, attributeValue);
    }
  }
}

/**
 * Get current trace ID
 *
 * @returns The current trace ID or undefined if not in a traced context
 */
export function getTraceId(): string | undefined {
  const currentContext = context.active();
  const span = trace.getSpan(currentContext);
  return span?.spanContext().traceId;
}

/**
 * Get current span ID
 *
 * @returns The current span ID or undefined if not in a traced context
 */
export function getSpanId(): string | undefined {
  const currentContext = context.active();
  const span = trace.getSpan(currentContext);
  return span?.spanContext().spanId;
}

/**
 * Create a new context with a parent span
 *
 * This function is useful when you want to create a new span as a child of
 * an existing context from a parent operation (e.g., in a background job).
 *
 * @param parentContext - The parent context to link to
 * @returns A context that links to the parent
 *
 * @example
 * ```typescript
 * // In a background job where you want to continue a trace
 * const parentContext = extractContextFromIncomingRequest(request);
 * const linkedContext = createContextWithParent(parentContext);
 *
 * // Use withTracingWithContext to create spans in this context
 * ```
 */
export function createContextWithParent(parentContext: OtelContext): OtelContext {
  // Return the parent context directly - it will be used as the active context
  // when starting new spans with trace.setSpan(parentContext, span)
  return parentContext;
}

/**
 * Wrap an async function with tracing using a specific context
 *
 * Use this when you have a parent context (e.g., from incoming request headers)
 * and want to continue the trace in background operations.
 *
 * @param operation - The operation name for the span
 * @param fn - The function to trace
 * @param telemetryCtx - Telemetry attributes to add
 * @param parentContext - The parent context to link from
 */
export async function withTracingInContext<T>(
  operation: EncryptionOperation,
  fn: (span: Span) => Promise<T>,
  telemetryCtx: EncryptionTelemetryContext = {},
  parentContext?: OtelContext
): Promise<T> {
  const tracer = getTracer();
  const attributes = buildAttributes(telemetryCtx);

  // If parent context is provided, start span as child of parent
  if (parentContext) {
    const span = tracer.startSpan(
      operation,
      {
        kind: SpanKind.CLIENT,
        attributes
      },
      parentContext
    );

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      });

      span.setAttribute(AttributeKey.ERROR, errorMessage);
      span.setAttribute(AttributeKey.ERROR_TYPE, errorType);

      throw error;
    } finally {
      span.end();
    }
  }

  // Fall back to regular withTracing if no parent context
  return withTracing(operation, fn, telemetryCtx);
}

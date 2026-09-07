/**
 * OpenTelemetry integration for auth
 *
 * Provides tracing and metrics for auth operations
 */

import { trace, SpanStatusCode, SpanKind, context } from '@opentelemetry/api';

import type { Span, Attributes, Context as OtelContext } from '@opentelemetry/api';

/**
 * Auth operation names
 */
export enum AuthOperation {
  AUTHENTICATE = 'auth.authenticate',
  VALIDATE_TOKEN = 'auth.validate_token',
  REFRESH_TOKEN = 'auth.refresh_token',
  LOGOUT = 'auth.logout',
  GET_USER_INFO = 'auth.get_user_info',
  GET_ROLES = 'auth.get_roles',
  GET_PERMISSIONS = 'auth.get_permissions',
  HEALTH_CHECK = 'auth.health_check',
  JWT_DECODE = 'auth.jwt_decode',
  JWT_VALIDATE = 'auth.jwt_validate'
}

/**
 * Attribute keys
 */
export const AttributeKey = {
  PROVIDER: 'auth.provider',
  PROVIDER_TYPE: 'auth.provider_type',
  USER_ID: 'auth.user_id',
  TENANT_ID: 'auth.tenant_id',
  TOKEN_ID: 'auth.token_id',
  ROLE: 'auth.role',
  PERMISSION: 'auth.permission',
  ERROR: 'error.message',
  ERROR_TYPE: 'error.type'
} as const;

/**
 * Tracer instance name
 */
const TRACER_NAME = 'auth';
const TRACER_VERSION = '0.0.1';

/**
 * Get or create tracer
 */
function getTracer() {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/**
 * Auth telemetry context
 */
export interface AuthTelemetryContext {
  /** Provider name (e.g., 'keycloak') */
  provider?: string;
  /** Provider type (e.g., 'keycloak') */
  providerType?: string;
  /** User ID */
  userId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Token ID (jti) */
  tokenId?: string;
  /** Role */
  role?: string;
  /** Permission */
  permission?: string;
}

/**
 * Build attributes from context
 */
function buildAttributes(ctx: AuthTelemetryContext): Attributes {
  const attrs: Attributes = {};

  if (ctx.provider) attrs[AttributeKey.PROVIDER] = ctx.provider;
  if (ctx.providerType) attrs[AttributeKey.PROVIDER_TYPE] = ctx.providerType;
  if (ctx.userId) attrs[AttributeKey.USER_ID] = ctx.userId;
  if (ctx.tenantId) attrs[AttributeKey.TENANT_ID] = ctx.tenantId;
  if (ctx.tokenId) attrs[AttributeKey.TOKEN_ID] = ctx.tokenId;
  if (ctx.role) attrs[AttributeKey.ROLE] = ctx.role;
  if (ctx.permission) attrs[AttributeKey.PERMISSION] = ctx.permission;

  return attrs;
}

/**
 * Wrap an async function with tracing
 *
 * @param operation - The auth operation being performed
 * @param fn - Async function to wrap, receives the span as parameter
 * @param telemetryCtx - Optional telemetry context with provider, user, and tenant info
 * @returns Promise resolving to the function result
 */
export async function withAuthTracing<T>(
  operation: AuthOperation,
  fn: (span: Span) => Promise<T>,
  telemetryCtx: AuthTelemetryContext = {}
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
 * @param operation - The auth operation being performed
 * @param fn - Function to wrap, receives the span as parameter
 * @param telemetryCtx - Optional telemetry context with provider, user, and tenant info
 * @returns The function result
 */
export function withAuthTracingSync<T>(
  operation: AuthOperation,
  fn: (span: Span) => T,
  telemetryCtx: AuthTelemetryContext = {}
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
 * @param _parentContext - Parent context to derive from (currently returns active context)
 * @returns OpenTelemetry context
 */
export function createContextWithParent(_parentContext: OtelContext): OtelContext {
  return context.active();
}

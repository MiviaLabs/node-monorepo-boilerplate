/**
 * Base Auth Provider
 *
 * Base class for all auth provider implementations with OpenTelemetry metrics and tracing
 */

import { metrics, trace, SpanStatusCode, context } from '@opentelemetry/api';

import type { IAuthProvider, BaseAuthProviderOptions } from './auth-provider.interface';
import type { Attributes, Counter, Histogram, Span } from '@opentelemetry/api';

/**
 * Base auth provider with OpenTelemetry metrics and distributed tracing
 *
 * All providers should extend this class to get automatic:
 * - Metrics collection (counters and histograms)
 * - Distributed tracing (spans with context propagation)
 * - Error tracking with status codes
 *
 * @example
 * ```typescript
 * class MyProvider extends BaseAuthProvider {
 *   async authenticate(credentials: UserCredentials) {
 *     return this.withSpan('authenticate', async (span) => {
 *       span.setAttribute('username', credentials.username);
 *       const result = await doAuth();
 *       if (!result.success) {
 *         span.setStatus({ code: SpanStatusCode.ERROR, message: 'Auth failed' });
 *       }
 *       return result;
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseAuthProvider implements IAuthProvider {
  protected authenticateCounter: Counter;
  protected validateTokenCounter: Counter;
  protected refreshTokenCounter: Counter;
  protected logoutCounter: Counter;
  protected getUserInfoCounter: Counter;
  protected getRolesCounter: Counter;
  protected getPermissionsCounter: Counter;
  protected setCustomClaimsCounter: Counter;
  protected authenticateHistogram: Histogram;
  protected validateTokenHistogram: Histogram;
  protected refreshTokenHistogram: Histogram;
  protected logoutHistogram: Histogram;
  protected getUserInfoHistogram: Histogram;
  protected getRolesHistogram: Histogram;
  protected getPermissionsHistogram: Histogram;
  protected setCustomClaimsHistogram: Histogram;

  /** OpenTelemetry tracer for creating spans */
  protected readonly tracer;

  constructor(
    public readonly name: string,
    public readonly type: string,
    protected readonly options: BaseAuthProviderOptions,
    protected readonly meter = metrics.getMeter('auth'),
    protected readonly tracerProvider = trace.getTracerProvider()
  ) {
    // Initialize tracer for distributed tracing
    this.tracer = this.tracerProvider.getTracer('auth', '1.0.0');

    // Initialize metrics
    this.authenticateCounter = this.meter.createCounter('auth.authenticate.total', {
      description: 'Total number of authentication attempts'
    });
    this.validateTokenCounter = this.meter.createCounter('auth.validate_token.total', {
      description: 'Total number of token validations'
    });
    this.refreshTokenCounter = this.meter.createCounter('auth.refresh_token.total', {
      description: 'Total number of token refresh attempts'
    });
    this.logoutCounter = this.meter.createCounter('auth.logout.total', {
      description: 'Total number of logout attempts'
    });
    this.getUserInfoCounter = this.meter.createCounter('auth.get_user_info.total', {
      description: 'Total number of user info retrievals'
    });
    this.getRolesCounter = this.meter.createCounter('auth.get_roles.total', {
      description: 'Total number of role retrievals'
    });
    this.getPermissionsCounter = this.meter.createCounter('auth.get_permissions.total', {
      description: 'Total number of permission retrievals'
    });
    this.setCustomClaimsCounter = this.meter.createCounter('auth.set_custom_claims.total', {
      description: 'Total number of custom claims set operations'
    });
    this.authenticateHistogram = this.meter.createHistogram('auth.authenticate.duration', {
      description: 'Duration of authentication operations',
      unit: 'ms'
    });
    this.validateTokenHistogram = this.meter.createHistogram('auth.validate_token.duration', {
      description: 'Duration of token validation operations',
      unit: 'ms'
    });
    this.refreshTokenHistogram = this.meter.createHistogram('auth.refresh_token.duration', {
      description: 'Duration of token refresh operations',
      unit: 'ms'
    });
    this.logoutHistogram = this.meter.createHistogram('auth.logout.duration', {
      description: 'Duration of logout operations',
      unit: 'ms'
    });
    this.getUserInfoHistogram = this.meter.createHistogram('auth.get_user_info.duration', {
      description: 'Duration of user info retrieval operations',
      unit: 'ms'
    });
    this.getRolesHistogram = this.meter.createHistogram('auth.get_roles.duration', {
      description: 'Duration of role retrieval operations',
      unit: 'ms'
    });
    this.getPermissionsHistogram = this.meter.createHistogram('auth.get_permissions.duration', {
      description: 'Duration of permission retrieval operations',
      unit: 'ms'
    });
    this.setCustomClaimsHistogram = this.meter.createHistogram('auth.set_custom_claims.duration', {
      description: 'Duration of custom claims set operations',
      unit: 'ms'
    });
  }

  /**
   * Record metrics for authenticate operation
   */
  protected recordAuthenticate(attributes: Attributes, duration: number): void {
    this.authenticateCounter.add(1, attributes);
    this.authenticateHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for validateToken operation
   */
  protected recordValidateToken(attributes: Attributes, duration: number): void {
    this.validateTokenCounter.add(1, attributes);
    this.validateTokenHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for refreshToken operation
   */
  protected recordRefreshToken(attributes: Attributes, duration: number): void {
    this.refreshTokenCounter.add(1, attributes);
    this.refreshTokenHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for logout operation
   */
  protected recordLogout(attributes: Attributes, duration: number): void {
    this.logoutCounter.add(1, attributes);
    this.logoutHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for getUserInfo operation
   */
  protected recordGetUserInfo(attributes: Attributes, duration: number): void {
    this.getUserInfoCounter.add(1, attributes);
    this.getUserInfoHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for getRoles operation
   */
  protected recordGetRoles(attributes: Attributes, duration: number): void {
    this.getRolesCounter.add(1, attributes);
    this.getRolesHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for getPermissions operation
   */
  protected recordGetPermissions(attributes: Attributes, duration: number): void {
    this.getPermissionsCounter.add(1, attributes);
    this.getPermissionsHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for setCustomClaims operation
   */
  protected recordSetCustomClaims(attributes: Attributes, duration: number): void {
    this.setCustomClaimsCounter.add(1, attributes);
    this.setCustomClaimsHistogram.record(duration, attributes);
  }

  /**
   * Build common attributes for metrics
   */
  protected buildAttributes(error?: string, additional?: Attributes): Attributes {
    const attrs: Attributes = {
      provider: this.name,
      provider_type: this.type,
      ...additional
    };
    if (error) {
      (attrs as Record<string, unknown>)['error'] = error;
    }
    return attrs;
  }

  /**
   * Execute a function within an OpenTelemetry span
   *
   * Creates a span with automatic context propagation, error recording,
   * and metric recording. Use this method to wrap any operation that
   * should be traced.
   *
   * @param name - Span name (e.g., 'authenticate', 'validateToken')
   * @param fn - Async function to execute within the span
   * @param attributes - Optional span attributes
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * async authenticate(credentials: UserCredentials) {
   *   return this.withSpan('authenticate', async (span) => {
   *     span.setAttribute('auth.username', credentials.username);
   *     const result = await performAuth(credentials);
   *     if (result.error) {
   *       span.setStatus({
   *         code: SpanStatusCode.ERROR,
   *         message: result.error
   *       });
   *     }
   *     return result;
   *   }, { tenant_id: credentials.tenantId });
   * }
   * ```
   */
  protected async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes: Attributes = {}
  ): Promise<T> {
    const spanName = `auth.${name}`;
    const span = this.tracer.startSpan(spanName, {
      attributes: {
        provider: this.name,
        provider_type: this.type,
        ...attributes
      }
    });

    try {
      // Run the function within the span's context
      const result = await context.with(trace.setSpan(context.active(), span), async () =>
        fn(span)
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Record error in span
      const errorMessage = error instanceof Error ? error.message : String(error);
      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Start a span for manual management
   *
   * For complex operations where you need to manage the span lifecycle
   * manually (e.g., multiple async operations within one span).
   *
   * @param name - Span name
   * @param attributes - Optional span attributes
   * @returns A span that must be manually ended
   *
   * @example
   * ```typescript
   * async complexOperation() {
   *   const span = this.startSpan('complex_operation', { user_id: '123' });
   *   try {
   *     await step1();
   *     span.addEvent('step1_complete');
   *     await step2();
   *     span.addEvent('step2_complete');
   *   } catch (error) {
   *     span.recordException(error as Error);
   *     throw error;
   *   } finally {
   *     span.end();
   *   }
   * }
   * ```
   */
  protected startSpan(name: string, attributes: Attributes = {}): Span {
    const spanName = `auth.${name}`;
    return this.tracer.startSpan(spanName, {
      attributes: {
        provider: this.name,
        provider_type: this.type,
        ...attributes
      }
    });
  }

  /**
   * Record an error in a span with proper status code
   *
   * @param span - The span to record error in
   * @param error - The error to record
   */
  protected recordSpanError(span: Span, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    span.recordException(error instanceof Error ? error : new Error(errorMessage));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage
    });
  }

  // Abstract methods that must be implemented by providers
  abstract authenticate(
    credentials: import('../types/user.types').UserCredentials
  ): Promise<import('../types/auth.types').AuthResult>;
  abstract validateToken(
    token: string,
    requestContext?: import('../types/auth.types').RequestContext
  ): Promise<import('../types/auth.types').TokenValidationResult>;
  abstract refreshToken(
    refreshToken: string
  ): Promise<import('../types/auth.types').TokenRefreshResult>;
  abstract logout(refreshToken: string, accessToken?: string): Promise<void>;
  abstract getUserInfo(
    userId: string,
    tenantId: string
  ): Promise<import('../types/auth.types').UserInfo>;
  abstract getUserInfoFromToken(token: string): Promise<import('../types/auth.types').UserInfo>;
  abstract getRoles(userId: string, tenantId: string): Promise<string[]>;
  abstract getRolesFromToken(token: string): Promise<string[]>;
  abstract getPermissions(userId: string, tenantId: string): Promise<string[]>;
  abstract getPermissionsFromToken(token: string): Promise<string[]>;
  abstract isAvailable(): Promise<boolean>;
  abstract healthCheck(): Promise<boolean>;
  abstract deleteUser(userId: string, tenantId?: string): Promise<void>;
  abstract deleteTenantUsers(tenantId: string): Promise<void>;
}

import { Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_HEADERS } from '@package/constants';
import { setRequestContext } from '@package/observability';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { isEmailWebhookRoute } from '../constants/routes.constants';
import { buildRequestTrace } from '../cqrs/request-trace';

interface RequestWithUser {
  id?: string;
  method?: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  headers: Record<string, unknown>;
  user?: {
    id?: string;
    organizationId?: string;
  };
  tenant?: {
    id?: string;
  };
}

interface ResponseWithStatus {
  statusCode?: number;
}

const WEBHOOK_BODY_LOG_PLACEHOLDER = '[omitted for webhook route]';

/**
 * HTTP Logging Interceptor
 *
 * Logs all HTTP requests and responses with:
 * - Request ID generation for traceability
 * - Request method, URL, query params
 * - Sanitized request body (PII redacted)
 * - Response status and duration
 * - Error logging with stack traces
 *
 * Features:
 * - Automatic PII redaction (password, token, secret, apiKey)
 * - Request context propagation via AsyncLocalStorage
 * - Structured logging for observability
 * - Performance metrics (request duration)
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { APP_INTERCEPTOR } from '@nestjs/core';
 * import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
 *
 * @Module({
 *   providers: [
 *     {
 *       provide: APP_INTERCEPTOR,
 *       useClass: LoggingInterceptor,
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly apiPrefix: string;

  constructor(private readonly configService: ConfigService) {
    this.apiPrefix = (this.configService.get<string>('API_PREFIX') ?? 'api').trim();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const { method, url, body, query, headers } = request;
    const start = Date.now();
    const requestPath = this.getRequestPath(request);
    const shouldSuppressBodyLogging = this.isWebhookRoute(requestPath);

    const requestIdHeader = headers[API_HEADERS.X_REQUEST_ID];
    const inboundRequestId =
      typeof requestIdHeader === 'string' ? requestIdHeader.trim() : undefined;

    // Preserve an inbound request ID when present; otherwise generate one.
    request.id =
      inboundRequestId && inboundRequestId.length > 0
        ? inboundRequestId
        : (request.id ?? this.generateRequestId());
    const trace = buildRequestTrace(request);

    // Extract user context from request (if authenticated)
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId ?? request.tenant?.id;

    // Set request context for AsyncLocalStorage propagation
    setRequestContext({
      requestId: trace.requestId,
      correlationId: trace.correlationId,
      causationId: trace.causationId,
      userId,
      organizationId
    });

    // Log incoming request (with sanitized body)
    this.logger.debug(
      JSON.stringify({
        type: 'request',
        method,
        url,
        query,
        body: shouldSuppressBodyLogging ? WEBHOOK_BODY_LOG_PLACEHOLDER : this.sanitizeBody(body),
        requestId: request.id,
        userId,
        organizationId,
        headers: this.sanitizeHeaders(headers)
      })
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const response = context.switchToHttp().getResponse<ResponseWithStatus>();
          const statusCode = response?.statusCode ?? 200;
          const httpResponse = context.switchToHttp().getResponse<{
            statusCode?: number;
            setHeader?: (name: string, value: string) => void;
          }>();

          if (trace.requestId) {
            httpResponse?.setHeader?.(API_HEADERS.X_REQUEST_ID, trace.requestId);
          }
          if (trace.correlationId) {
            httpResponse?.setHeader?.(API_HEADERS.X_CORRELATION_ID, trace.correlationId);
          }
          if (trace.causationId) {
            httpResponse?.setHeader?.(API_HEADERS.X_CAUSATION_ID, trace.causationId);
          }

          this.logger.debug(
            JSON.stringify({
              type: 'response',
              method,
              url,
              status: statusCode,
              duration,
              durationMs: duration,
              requestId: trace.requestId,
              correlationId: trace.correlationId,
              causationId: trace.causationId
            })
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - start;
          const errorWithStatus = error as Error & { status?: number };
          const statusCode = errorWithStatus.status ?? 500;

          this.logger.error(
            `Request error: ${method} ${url} - ${error.message}`,
            error.stack,
            JSON.stringify({
              type: 'error',
              method,
              url,
              status: statusCode,
              duration,
              durationMs: duration,
              requestId: trace.requestId,
              correlationId: trace.correlationId,
              causationId: trace.causationId
            })
          );
        }
      })
    );
  }

  /**
   * Generate unique request ID
   * Format: req_timestamp_randomstring
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private getRequestPath(request: RequestWithUser): string {
    return (request.path ?? request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
  }

  private isWebhookRoute(path: string): boolean {
    const versionMatch = path.match(
      this.apiPrefix.length > 0
        ? new RegExp(`^(?:/${escapeRegExp(this.apiPrefix)})?/(v\\d+)/`)
        : /^\/(v\d+)\//
    );
    if (!versionMatch?.[1]) {
      return false;
    }

    return isEmailWebhookRoute(path, versionMatch[1], this.apiPrefix);
  }

  /**
   * Sanitize request body to remove sensitive fields
   * Redacts: password, token, secret, apiKey, accessToken, refreshToken
   */
  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }

    if (Array.isArray(body)) {
      return body.map((item) => this.sanitizeBody(item));
    }

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      'apiSecret',
      'privateKey',
      'creditCard',
      'ssn',
      'socialSecurityNumber'
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        (sanitized as Record<string, unknown>)[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize headers to remove sensitive information
   * Redacts: authorization, cookie, set-cookie
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

    for (const header of sensitiveHeaders) {
      if (header in sanitized) {
        sanitized[header] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

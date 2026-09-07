/**
 * NestJS Metric Decorators
 *
 * NestJS-specific decorators for automatic metric collection.
 *
 * @module common/decorators
 */

import { SetMetadata, Injectable } from '@nestjs/common';
import {
  MetricCounter,
  MetricHistogram,
  MetricRecorder,
  type CounterDecoratorOptions,
  type HistogramDecoratorOptions,
  MetricAttributes
} from '@package/observability';
import { tap } from 'rxjs/operators';

import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';

/**
 * Metric metadata key for storing decorator options
 */
export const METRIC_COUNTER_METADATA = 'metric_counter';
export const METRIC_HISTOGRAM_METADATA = 'metric_histogram';

/**
 * NestJS-specific counter decorator options
 */
export interface NestJSCounterOptions extends CounterDecoratorOptions {
  /**
   * Apply only to specific HTTP methods
   */
  methods?: string[];
}

/**
 * NestJS-specific histogram decorator options
 */
export interface NestJSHistogramOptions extends HistogramDecoratorOptions {
  /**
   * Apply only to specific HTTP methods
   */
  methods?: string[];

  /**
   * Extract route from request
   */
  extractRoute?: (context: ExecutionContext) => string;
}

/**
 * Mark a controller method for automatic counter metric collection.
 *
 * @param options - Configuration options for the counter metric
 * @returns A method decorator that tracks invocation counts
 *
 * @example
 * ```typescript
 * @Controller('users')
 * export class PeopleController {
 *   @Post()
 *   @TrackMetricCounter({
 *     name: 'http.server.requests',
 *     description: 'HTTP request count',
 *     attributes: { component: 'users' }
 *   })
 *   async create(@Body() dto: CreateUserDto) {
 *     // Handler implementation
 *   }
 * }
 * ```
 */
export function TrackMetricCounter(options: NestJSCounterOptions = {}): MethodDecorator {
  return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    SetMetadata(METRIC_COUNTER_METADATA, options)(descriptor.value);

    // Apply the base counter decorator
    MetricCounter(options)(_target, _propertyKey as string, descriptor);

    return descriptor;
  };
}

/**
 * Mark a controller method for automatic duration histogram collection.
 *
 * @param options - Configuration options for the histogram metric
 * @returns A method decorator that tracks method execution duration
 *
 * @example
 * ```typescript
 * @Controller('users')
 * export class PeopleController {
 *   @Get(':id')
 *   @TrackMetricHistogram({
 *     name: 'http.server.request.duration',
 *     description: 'HTTP request duration',
 *     unit: 'ms'
 *   })
 *   async findOne(@Param('id') id: string) {
 *     // Handler implementation
 *   }
 * }
 * ```
 */
export function TrackMetricHistogram(options: NestJSHistogramOptions = {}): MethodDecorator {
  return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    SetMetadata(METRIC_HISTOGRAM_METADATA, options)(descriptor.value);

    // Apply the base histogram decorator
    MetricHistogram(options)(_target, _propertyKey as string, descriptor);

    return descriptor;
  };
}

/**
 * Interceptor for automatic HTTP metrics collection
 *
 * Applies to all controller methods to collect:
 * - Request counter
 * - Request duration
 * - Response status codes
 *
 * @example
 * ```typescript
 * // In app.module.ts or controller module
 * {
 *   provide: APP_INTERCEPTOR,
 *   useClass: HttpMetricsInterceptor,
 * }
 * ```
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly requestCounterName = 'http.server.requests';
  private readonly requestDurationName = 'http.server.request.duration';

  constructor() {
    // Initialize metrics
    MetricRecorder.increment(this.requestCounterName, 0);
    MetricRecorder.record(this.requestDurationName, 0);
  }

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const startTime = performance.now();
    const method = request.method ?? 'GET';
    const route = this.extractRoute(request);

    return next.handle().pipe(
      // Track successful requests
      tap({
        next: () => {
          const duration = performance.now() - startTime;
          const statusCode = response.status ?? 200;

          MetricRecorder.increment(this.requestCounterName, 1, {
            [MetricAttributes.METHOD]: method,
            [MetricAttributes.STATUS_CODE]: String(statusCode),
            [MetricAttributes.ROUTE]: route,
            [MetricAttributes.COMPONENT]: 'http'
          });

          MetricRecorder.record(this.requestDurationName, duration, {
            [MetricAttributes.METHOD]: method,
            [MetricAttributes.ROUTE]: route,
            [MetricAttributes.COMPONENT]: 'http'
          });
        },
        error: (error: unknown) => {
          const duration = performance.now() - startTime;
          const statusCode = (error as { status?: number }).status ?? 500;
          const errorName = (error as { name?: string }).name ?? 'unknown';

          MetricRecorder.increment(this.requestCounterName, 1, {
            [MetricAttributes.METHOD]: method,
            [MetricAttributes.STATUS_CODE]: String(statusCode),
            [MetricAttributes.ROUTE]: route,
            [MetricAttributes.COMPONENT]: 'http',
            error: errorName
          });

          MetricRecorder.record(this.requestDurationName, duration, {
            [MetricAttributes.METHOD]: method,
            [MetricAttributes.ROUTE]: route,
            [MetricAttributes.COMPONENT]: 'http',
            error: errorName
          });
        }
      })
    );
  }

  private extractRoute(request: Request): string {
    const req = request as unknown as { route?: { path?: string }; url?: string };
    return req.route?.path ?? req.url ?? 'unknown';
  }
}

/**
 * Interceptor for database query metrics
 *
 * Tracks query count and duration for all database operations.
 *
 * @example
 * ```typescript
 * // In data-source.ts or repository module
 * @UseInterceptors(DatabaseMetricsInterceptor)
 * export class DataSource { }
 * ```
 */
@Injectable()
export class DatabaseMetricsInterceptor implements NestInterceptor {
  private readonly queryCounterName = 'db.queries';
  private readonly queryDurationName = 'db.query.duration';

  intercept(_context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const startTime = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = performance.now() - startTime;

          MetricRecorder.increment(this.queryCounterName, 1, {
            [MetricAttributes.DB_SYSTEM]: 'postgresql',
            [MetricAttributes.COMPONENT]: 'database'
          });

          MetricRecorder.record(this.queryDurationName, duration, {
            [MetricAttributes.DB_SYSTEM]: 'postgresql',
            [MetricAttributes.COMPONENT]: 'database'
          });
        }
      })
    );
  }
}

/**
 * Cache metrics decorator for tracking cache hit/miss rates
 *
 * @example
 * ```typescript
 * @TrackCacheMetrics('user_cache')
 * async getUser(id: string) {
 *   return this.cache.get(id);
 * }
 * ```
 */
export interface CacheMetricsOptions {
  /**
   * Cache name for attribution
   */
  cacheName: string;

  /**
   * Cache system type (redis, memory, etc.)
   */
  cacheSystem?: string;
}

/**
 * Decorator for tracking cache hit/miss rates and duration.
 *
 * @param options - Cache metrics configuration including cache name and system type
 * @returns A method decorator that tracks cache performance metrics
 */
export function TrackCacheMetrics(options: CacheMetricsOptions): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const cacheHitsName = 'cache.hits';
    const cacheMissesName = 'cache.misses';
    const cacheDurationName = 'cache.duration';

    descriptor.value = async function (...args: unknown[]) {
      const startTime = performance.now();

      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - startTime;

        // Determine if it was a hit or miss based on result
        const isHit = result !== null && result !== undefined;

        if (isHit) {
          MetricRecorder.increment(cacheHitsName, 1, {
            [MetricAttributes.CACHE_SYSTEM]: options.cacheSystem ?? 'unknown',
            cache_name: options.cacheName
          });
        } else {
          MetricRecorder.increment(cacheMissesName, 1, {
            [MetricAttributes.CACHE_SYSTEM]: options.cacheSystem ?? 'unknown',
            cache_name: options.cacheName
          });
        }

        MetricRecorder.record(cacheDurationName, duration, {
          [MetricAttributes.CACHE_SYSTEM]: options.cacheSystem ?? 'unknown',
          cache_name: options.cacheName,
          cache_hit: String(isHit)
        });

        return result;
      } catch (error) {
        // Still record duration on error
        const duration = performance.now() - startTime;

        MetricRecorder.record(cacheDurationName, duration, {
          [MetricAttributes.CACHE_SYSTEM]: options.cacheSystem ?? 'unknown',
          cache_name: options.cacheName,
          cache_hit: 'false',
          error: error instanceof Error ? error.name : 'unknown'
        });

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Business operation tracking decorator
 *
 * Tracks business metrics like orders created, payments processed, etc.
 *
 * @example
 * ```typescript
 * @TrackBusinessOperation({
 *   operationType: 'order.created',
 *   revenueAttribute: 'total'
 * })
 * async createOrder(dto: CreateOrderDto) {
 *   // Creates order and returns it with total amount
 * }
 * ```
 */
export interface BusinessOperationOptions {
  /**
   * Type of business operation
   */
  operationType: string;

  /**
   * Whether to track errors separately
   */
  recordErrors?: boolean;

  /**
   * Record a numeric value from the result (e.g., revenue)
   */
  valueAttribute?: string;
}

/**
 * Decorator for tracking business operation metrics.
 *
 * @param options - Business operation configuration including operation type and error recording
 * @returns A method decorator that tracks business operation success/failure counts
 */
export function TrackBusinessOperation(options: BusinessOperationOptions): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const baseName = 'business.operations';
    const operationType = options.operationType ?? String(_propertyKey);

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      try {
        const result = await originalMethod.apply(this, args);

        // Record successful operation
        MetricRecorder.increment(`${baseName}.success`, 1, {
          [MetricAttributes.OPERATION_TYPE]: operationType
        });

        // Record value if specified
        if (options.valueAttribute && typeof result === 'object' && result !== null) {
          const value = (result as Record<string, unknown>)[options.valueAttribute];
          if (typeof value === 'number') {
            MetricRecorder.record('business.operation.value', value, {
              [MetricAttributes.OPERATION_TYPE]: operationType
            });
          }
        }

        return result;
      } catch (error) {
        // Record failed operation
        if (options.recordErrors !== false) {
          MetricRecorder.increment(`${baseName}.error`, 1, {
            [MetricAttributes.OPERATION_TYPE]: operationType,
            [MetricAttributes.ERROR_TYPE]: error instanceof Error ? error.name : 'unknown'
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}

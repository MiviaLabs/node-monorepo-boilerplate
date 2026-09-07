/**
 * OpenTelemetry integration for redis
 *
 * Provides basic cache operation tracking and metrics.
 */

import {
  withSpan,
  createCounter,
  createHistogram,
  incrementCounter,
  recordHistogram,
  InfrastructureMetrics,
  DB_SYSTEMS
} from '@package/core';

/**
 * Standard span attributes for cache operations
 */
export interface CacheSpanAttributes {
  'cache.operation': string;
  'cache.key'?: string;
  'cache.hit'?: boolean;
  'db.system'?: string;
}

/**
 * Wrap cache operation with OpenTelemetry tracing
 *
 * @param operation - Cache operation (get, set, delete, etc.)
 * @param key - Cache key
 * @param fn - Function to execute
 * @returns Result of the function
 */
export async function traceCacheOperation<T>(
  operation: string,
  key: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`cache.${operation}`, async (span) => {
    span.setAttributes({
      'cache.operation': operation,
      ...(key && { 'cache.key': sanitizeKey(key) }),
      'db.system': DB_SYSTEMS.REDIS
    });

    const startTime = Date.now();

    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      incrementCacheCounter(operation, 'error');
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      recordCacheDuration(operation, duration);
    }
  });
}

/**
 * Trace cache hit/miss
 *
 * @param _key - Cache key (unused, for future context)
 * @param hit - Whether the cache lookup was a hit
 */
export function traceCacheHit(_key: string, hit: boolean): void {
  incrementCacheCounter(hit ? 'hit' : 'miss', 'success');
}

/**
 * Sanitize cache key for logging/tracing
 */
function sanitizeKey(key: string): string {
  // Show first 8 chars and last 8 chars, mask the middle
  if (key.length <= 16) {
    return '****';
  }
  return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
}

// Metrics

let cacheHitCounter: ReturnType<typeof createCounter> | null = null;
// Reserved for future use
// let cacheOperationCounter: ReturnType<typeof createCounter> | null = null;
let cacheDurationHistogram: ReturnType<typeof createHistogram> | null = null;

/**
 * Get or create cache hit/miss counter
 */
function getCacheHitCounter() {
  if (!cacheHitCounter) {
    cacheHitCounter = createCounter(InfrastructureMetrics.CACHE_HIT, {
      description: 'Cache hits and misses',
      unit: '1'
    });
  }
  return cacheHitCounter;
}

/**
 * Get or create cache operation counter
 */
// Reserved for future use
// function getCacheOperationCounter() {
//   if (!cacheOperationCounter) {
//     cacheOperationCounter = createCounter(InfrastructureMetrics.OPERATION_COUNT, {
//       description: 'Cache operations count',
//       unit: '1',
//     });
//   }
//   return cacheOperationCounter;
// }

/**
 * Get or create cache duration histogram
 */
function getCacheDurationHistogram() {
  if (!cacheDurationHistogram) {
    cacheDurationHistogram = createHistogram(InfrastructureMetrics.CACHE_DURATION, {
      description: 'Cache operation duration in milliseconds',
      unit: 'ms'
    });
  }
  return cacheDurationHistogram;
}

/**
 * Increment cache hit/miss counter
 */
function incrementCacheCounter(operation: string, status: string): void {
  const counter = getCacheHitCounter();
  incrementCounter(counter, 1, {
    'cache.operation': operation,
    'cache.status': status
  });
}

/**
 * Record cache operation duration
 */
function recordCacheDuration(operation: string, durationMs: number): void {
  const histogram = getCacheDurationHistogram();
  recordHistogram(histogram, durationMs, {
    'cache.operation': operation
  });
}

/**
 * Trace Redis connection
 *
 * @param host - Redis host
 * @param port - Redis port
 */
export function traceRedisConnection(host: string, port: number): void {
  const span = (
    global as unknown as {
      __redisConnectionSpan?: { setAttributes: (attrs: Record<string, string>) => void };
    }
  ).__redisConnectionSpan;
  if (span) {
    span.setAttributes({
      'db.system': DB_SYSTEMS.REDIS,
      'db.connection_string': `${host}:${port}`
    });
  }
}

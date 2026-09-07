import { Logger } from '@nestjs/common';
import { getRequestContext, metricsService } from '@package/observability';

type DiagnosticAttributeValue = string | number | boolean | null | undefined;
type DiagnosticAttributes = Record<string, DiagnosticAttributeValue>;
const LOG_ONLY_ATTRIBUTE_KEYS = new Set(['requestId', 'correlationId', 'causationId']);

const PHASE0_DIAGNOSTICS_ENABLED = process.env['LATENCY_PHASE0_ENABLED'] === 'true';
const API_PHASE0_DURATION_METRIC = 'api.phase0.latency.duration';
const API_PHASE0_EVENTS_METRIC = 'api.phase0.latency.events';
const logger = new Logger('Phase0Diagnostics');

metricsService.createHistogram(API_PHASE0_DURATION_METRIC, 'Phase 0 latency duration in api', {
  unit: 'ms'
});
metricsService.createCounter(API_PHASE0_EVENTS_METRIC, 'Phase 0 latency events in api');

function sanitizeAttributes(
  attributes: DiagnosticAttributes
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function sanitizeMetricAttributes(
  attributes: DiagnosticAttributes
): Record<string, string | number | boolean> {
  return sanitizeAttributes(
    Object.fromEntries(
      Object.entries(attributes).filter(([key]) => !LOG_ONLY_ATTRIBUTE_KEYS.has(key))
    )
  );
}

function getPhase0TraceLogAttributes(): Record<string, string> {
  const requestContext = getRequestContext();
  const requestId =
    typeof requestContext?.['requestId'] === 'string' ? requestContext['requestId'] : undefined;
  const correlationId =
    typeof requestContext?.['correlationId'] === 'string'
      ? requestContext['correlationId']
      : undefined;
  const causationId =
    typeof requestContext?.['causationId'] === 'string' ? requestContext['causationId'] : undefined;

  return sanitizeAttributes({
    requestId,
    correlationId,
    causationId
  }) as Record<string, string>;
}

export function isPhase0DiagnosticsEnabled(): boolean {
  return PHASE0_DIAGNOSTICS_ENABLED;
}

export function getPhase0Region(): string {
  return (
    process.env['APP_REGION'] ??
    process.env['RAILWAY_DEPLOYMENT_REGION'] ??
    process.env['RAILWAY_REGION'] ??
    process.env['FLY_REGION'] ??
    process.env['VERCEL_REGION'] ??
    process.env['AWS_REGION'] ??
    process.env['REGION'] ??
    'unknown'
  );
}

export function getPhase0RedisTarget(): { redisHost?: string; redisOrigin?: string } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      return {
        redisHost: parsed.host,
        redisOrigin: parsed.origin
      };
    } catch {
      return {
        redisHost: redisUrl,
        redisOrigin: redisUrl
      };
    }
  }

  const redisHost = process.env['REDIS_HOST'];
  const redisPort = process.env['REDIS_PORT'];
  if (!redisHost) {
    return {};
  }

  return {
    redisHost: redisPort ? `${redisHost}:${redisPort}` : redisHost
  };
}

export function recordPhase0Note(stage: string, attributes: DiagnosticAttributes = {}): void {
  if (!PHASE0_DIAGNOSTICS_ENABLED) {
    return;
  }

  metricsService.incrementCounter(API_PHASE0_EVENTS_METRIC, 1, {
    ...sanitizeMetricAttributes(attributes),
    stage,
    event: 'note',
    region: getPhase0Region()
  });

  const logAttributes = {
    ...sanitizeAttributes(attributes),
    ...getPhase0TraceLogAttributes()
  };

  logger.log(
    JSON.stringify({
      event: 'note',
      stage,
      region: getPhase0Region(),
      ...logAttributes
    })
  );
}

export async function measurePhase0<T>(
  stage: string,
  attributes: DiagnosticAttributes,
  operation: () => Promise<T>
): Promise<T> {
  if (!PHASE0_DIAGNOSTICS_ENABLED) {
    return operation();
  }

  const start = performance.now();
  const metricAttributes = sanitizeMetricAttributes({
    stage,
    region: getPhase0Region(),
    ...attributes
  });
  const logAttributes = {
    ...metricAttributes,
    ...getPhase0TraceLogAttributes()
  };

  metricsService.incrementCounter(API_PHASE0_EVENTS_METRIC, 1, {
    ...metricAttributes,
    event: 'start'
  });

  if (PHASE0_DIAGNOSTICS_ENABLED) {
    logger.log(
      JSON.stringify({
        event: 'start',
        stage,
        ...logAttributes
      })
    );
  }

  try {
    const result = await operation();
    const durationMs = performance.now() - start;

    metricsService.recordHistogram(API_PHASE0_DURATION_METRIC, durationMs, {
      ...metricAttributes,
      outcome: 'success'
    });
    metricsService.incrementCounter(API_PHASE0_EVENTS_METRIC, 1, {
      ...metricAttributes,
      event: 'finish',
      outcome: 'success'
    });

    if (PHASE0_DIAGNOSTICS_ENABLED) {
      logger.log(
        JSON.stringify({
          event: 'finish',
          stage,
          durationMs,
          ...logAttributes
        })
      );
    }

    return result;
  } catch (error) {
    const durationMs = performance.now() - start;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    metricsService.recordHistogram(API_PHASE0_DURATION_METRIC, durationMs, {
      ...metricAttributes,
      outcome: 'error',
      error_name: errorName
    });
    metricsService.incrementCounter(API_PHASE0_EVENTS_METRIC, 1, {
      ...metricAttributes,
      event: 'error',
      error_name: errorName
    });

    if (PHASE0_DIAGNOSTICS_ENABLED) {
      logger.warn(
        JSON.stringify({
          event: 'error',
          stage,
          durationMs,
          errorName,
          ...logAttributes
        })
      );
    }

    throw error;
  }
}

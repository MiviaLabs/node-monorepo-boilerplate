/**
 * Default configuration values for observability package
 *
 * These defaults are designed for production use with balanced
 * logging, telemetry, and metrics collection.
 */

import { LogLevel } from './interfaces';

import type { LoggerConfig, InternalTelemetryConfig, MetricsConfig } from './interfaces';

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: Omit<Required<LoggerConfig>, 'prettyOptions'> & {
  prettyOptions: {
    colorize: boolean;
    translateTime: string;
    ignore: string;
  };
} = {
  level: LogLevel.INFO,
  isDevelopment: process.env['NODE_ENV'] === 'development',
  prettyOptions: {
    colorize: true,
    translateTime: 'HH:MM:ss Z',
    ignore: 'pid,hostname'
  },
  environment: process.env['NODE_ENV'] ?? 'development',
  serviceName: process.env['SERVICE_NAME'] ?? 'api'
};

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: Omit<
  Required<InternalTelemetryConfig>,
  'exporterUrl' | 'enabled'
> & {
  exporterUrl?: string;
  enabled?: boolean;
} = {
  serviceName: process.env['SERVICE_NAME'] ?? 'api',
  serviceVersion: process.env['SERVICE_VERSION'] ?? '1.0.0',
  environment: process.env['NODE_ENV'] ?? 'development'
};

const _exporterUrl = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
const _enabled = process.env['OTEL_ENABLED'] === 'true';

if (_exporterUrl !== undefined) {
  (DEFAULT_TELEMETRY_CONFIG as { exporterUrl?: string }).exporterUrl = _exporterUrl;
}
if (_enabled !== undefined) {
  (DEFAULT_TELEMETRY_CONFIG as { enabled?: boolean }).enabled = _enabled;
}

/**
 * Default metrics configuration
 */
export const DEFAULT_METRICS_CONFIG: Required<MetricsConfig> = {
  enabled: true
};

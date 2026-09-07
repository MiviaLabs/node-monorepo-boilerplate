/**
 * Configuration interfaces for observability package
 *
 * This module defines all configuration interfaces that allow users to override
 * default settings via input options, with environment variables as fallback.
 */

/**
 * Log levels for the logger
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Pino pretty print options for development mode
 */
export interface PinoPrettyOptions {
  /** Enable colorization in console output */
  colorize?: boolean;
  /** Translate time format */
  translateTime?: string;
  /** Comma-separated list of fields to ignore */
  ignore?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /**
   * Log level for the logger
   * @default LogLevel.INFO
   */
  level?: LogLevel;

  /**
   * Enable development mode with pretty printing
   * @default process.env.NODE_ENV === 'development'
   */
  isDevelopment?: boolean;

  /**
   * Custom Pino pretty options for development mode
   */
  prettyOptions?: PinoPrettyOptions;

  /**
   * Environment name for log context
   * @default process.env.NODE_ENV
   */
  environment?: string;

  /**
   * Service name for log context
   * @default process.env.SERVICE_NAME
   */
  serviceName?: string;
}

/**
 * Telemetry configuration (internal use for config resolver)
 *
 * Note: The public TelemetryConfig type is exported from ./telemetry.ts
 * This interface is used internally by the config resolver.
 */
export interface InternalTelemetryConfig {
  /** Service name for telemetry */
  serviceName: string;

  /** Service version for telemetry */
  serviceVersion: string;

  /** Deployment environment */
  environment: string;

  /** OpenTelemetry exporter URL (optional) */
  exporterUrl?: string;

  /**
   * Enable/disable OpenTelemetry
   * @default process.env.OTEL_ENABLED === 'true'
   */
  enabled?: boolean;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /**
   * Enable/disable metrics collection
   * @default true
   */
  enabled?: boolean;
}

/**
 * Environment variable name mappings
 *
 * Allows customization of environment variable names for different deployment scenarios.
 */
export interface EnvironmentVariableNames {
  /** Log level (default: LOG_LEVEL) */
  logLevel?: string;

  /** Node environment (default: NODE_ENV) */
  nodeEnv?: string;

  /** Service name (default: SERVICE_NAME) */
  serviceName?: string;

  /** OpenTelemetry enabled (default: OTEL_ENABLED) */
  otelEnabled?: string;

  /** OpenTelemetry exporter endpoint (default: OTEL_EXPORTER_OTLP_ENDPOINT) */
  otelExporterEndpoint?: string;

  /** Service version (default: SERVICE_VERSION) */
  serviceVersion?: string;
}

/**
 * Main configuration interface for observability package
 *
 * All configuration options are optional. If not provided, they will be
 * read from environment variables, or fall back to default values.
 */
export interface InfrastructureObservabilityConfig {
  /** Logger configuration */
  logger?: LoggerConfig;

  /** Telemetry configuration */
  telemetry?: InternalTelemetryConfig;

  /** Metrics configuration */
  metrics?: MetricsConfig;

  /** Custom environment variable names (optional) */
  envVarNames?: EnvironmentVariableNames;
}

/**
 * Resolved logger configuration with all defaults applied
 */
export interface ResolvedLoggerConfig {
  /** Log level */
  level: LogLevel;

  /** Enable development mode with pretty printing */
  isDevelopment: boolean;

  /** Pino pretty options for development mode */
  prettyOptions: PinoPrettyOptions;

  /** Environment name for log context */
  environment: string;

  /** Service name for log context */
  serviceName: string;
}

/**
 * Resolved telemetry configuration with all defaults applied
 */
export interface ResolvedTelemetryConfig {
  /** Service name for telemetry */
  serviceName: string;

  /** Service version for telemetry */
  serviceVersion: string;

  /** Deployment environment */
  environment: string;

  /** OpenTelemetry exporter URL */
  exporterUrl?: string;

  /** Enable/disable OpenTelemetry */
  enabled?: boolean;
}

/**
 * Resolved metrics configuration with all defaults applied
 */
export interface ResolvedMetricsConfig {
  /** Enable/disable metrics collection */
  enabled: boolean;
}

/**
 * Resolved configuration with all defaults applied
 *
 * This interface represents the final configuration after merging user options,
 * environment variables, and defaults.
 */
export interface ResolvedInfrastructureObservabilityConfig {
  /** Logger configuration (with defaults) */
  logger: ResolvedLoggerConfig;

  /** Telemetry configuration (with defaults, exporterUrl may be undefined) */
  telemetry: ResolvedTelemetryConfig;

  /** Metrics configuration (with defaults) */
  metrics: ResolvedMetricsConfig;
}

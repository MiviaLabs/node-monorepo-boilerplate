/**
 * Configuration resolver for observability package
 *
 * Merges user configuration, environment variables, and defaults
 * to produce the final resolved configuration.
 *
 * Priority order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import {
  DEFAULT_LOGGER_CONFIG,
  DEFAULT_TELEMETRY_CONFIG,
  DEFAULT_METRICS_CONFIG
} from './defaults';
import { LogLevel } from './interfaces';

import type {
  InfrastructureObservabilityConfig,
  ResolvedInfrastructureObservabilityConfig,
  EnvironmentVariableNames,
  InternalTelemetryConfig,
  ResolvedLoggerConfig,
  ResolvedTelemetryConfig,
  ResolvedMetricsConfig
} from './interfaces';

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<EnvironmentVariableNames> = {
  logLevel: 'LOG_LEVEL',
  nodeEnv: 'NODE_ENV',
  serviceName: 'SERVICE_NAME',
  otelEnabled: 'OTEL_ENABLED',
  otelExporterEndpoint: 'OTEL_EXPORTER_OTLP_ENDPOINT',
  serviceVersion: 'SERVICE_VERSION'
};

/**
 * Configuration resolver class
 */
export class ConfigResolver {
  constructor(
    private userConfig: InfrastructureObservabilityConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolve a configuration value with priority: user > env > default
   *
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional parser function for environment values
   * @returns Resolved value
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) return userValue;
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName];
      return parser ? parser(envValue) : (envValue as unknown as T);
    }
    return defaultValue;
  }

  /**
   * Resolve log level with proper type checking
   */
  private resolveLogLevel(
    userValue: LogLevel | undefined,
    envVarName: string | undefined,
    defaultValue: LogLevel
  ): LogLevel {
    if (userValue !== undefined) return userValue;
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName] as string;
      // Validate that the env value is a valid log level
      const validLevels: LogLevel[] = [
        LogLevel.DEBUG,
        LogLevel.INFO,
        LogLevel.WARN,
        LogLevel.ERROR,
        LogLevel.FATAL
      ];
      if (validLevels.includes(envValue as LogLevel)) {
        return envValue as LogLevel;
      }
    }
    return defaultValue;
  }

  /**
   * Parse string to boolean
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<EnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Get logger configuration
   */
  getLoggerConfig(): ResolvedLoggerConfig {
    const envNames = this.getEnvVarNames();
    const userLogger = this.userConfig.logger || {};

    const isDevelopment = this.resolveValue(
      userLogger.isDevelopment,
      envNames.nodeEnv,
      DEFAULT_LOGGER_CONFIG.isDevelopment,
      (v) => v === 'development'
    );

    return {
      level: this.resolveLogLevel(userLogger.level, envNames.logLevel, DEFAULT_LOGGER_CONFIG.level),
      isDevelopment,
      prettyOptions: userLogger.prettyOptions ?? DEFAULT_LOGGER_CONFIG.prettyOptions,
      environment: this.resolveValue(
        userLogger.environment,
        envNames.nodeEnv,
        DEFAULT_LOGGER_CONFIG.environment
      ),
      serviceName: this.resolveValue(
        userLogger.serviceName,
        envNames.serviceName,
        DEFAULT_LOGGER_CONFIG.serviceName
      )
    };
  }

  /**
   * Get telemetry configuration
   */
  getTelemetryConfig(): ResolvedTelemetryConfig {
    const envNames = this.getEnvVarNames();
    const userTelemetry = this.userConfig.telemetry as InternalTelemetryConfig | undefined;

    const config: ResolvedTelemetryConfig = {
      serviceName: this.resolveValue(
        userTelemetry?.serviceName,
        envNames.serviceName,
        DEFAULT_TELEMETRY_CONFIG.serviceName
      ),
      serviceVersion: this.resolveValue(
        userTelemetry?.serviceVersion,
        envNames.serviceVersion,
        DEFAULT_TELEMETRY_CONFIG.serviceVersion
      ),
      environment: this.resolveValue(
        userTelemetry?.environment,
        envNames.nodeEnv,
        DEFAULT_TELEMETRY_CONFIG.environment
      )
    };

    const exporterUrl = this.resolveValue(
      userTelemetry?.exporterUrl,
      envNames.otelExporterEndpoint,
      DEFAULT_TELEMETRY_CONFIG.exporterUrl
    );
    if (exporterUrl !== undefined) {
      config.exporterUrl = exporterUrl;
    }

    const enabled = this.resolveValue(
      userTelemetry?.enabled,
      envNames.otelEnabled,
      DEFAULT_TELEMETRY_CONFIG.enabled,
      this.parseBoolean
    );
    if (enabled !== undefined) {
      config.enabled = enabled;
    }

    return config;
  }

  /**
   * Get metrics configuration
   */
  getMetricsConfig(): ResolvedMetricsConfig {
    const userMetrics = this.userConfig.metrics || {};

    return {
      enabled: this.resolveValue(userMetrics.enabled, undefined, DEFAULT_METRICS_CONFIG.enabled)
    };
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): ResolvedInfrastructureObservabilityConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    return {
      logger: this.getLoggerConfig(),
      telemetry: this.getTelemetryConfig(),
      metrics: this.getMetricsConfig()
    };
  }
}

/**
 * Resolve configuration from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/observability/config';
 *
 * const config = resolveConfig({
 *   logger: {
 *     level: 'debug',
 *     serviceName: 'my-app',
 *   },
 *   telemetry: {
 *     serviceName: 'my-app',
 *     serviceVersion: '1.0.0',
 *     environment: 'production',
 *     enabled: true,
 *   },
 * });
 * ```
 */
export function resolveConfig(
  userConfig: InfrastructureObservabilityConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedInfrastructureObservabilityConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

/**
 * Create a configuration logger that logs configuration resolution
 *
 * @param config - Resolved configuration
 * @returns Object with log method for structured configuration logging
 *
 * @example
 * ```typescript
 * import { resolveConfig, createConfigLogger } from '@package/observability/config';
 *
 * const config = resolveConfig({
 *   telemetry: { serviceName: 'my-app' }
 * });
 *
 * const configLogger = createConfigLogger(config);
 * configLogger.log(); // Logs resolved configuration
 * ```
 */
export function createConfigLogger(config: ResolvedInfrastructureObservabilityConfig) {
  return {
    /**
     * Log the resolved configuration (for debugging)
     */
    log(): void {
      const logData = {
        logger: {
          level: config.logger.level,
          isDevelopment: config.logger.isDevelopment,
          environment: config.logger.environment,
          serviceName: config.logger.serviceName
        },
        telemetry: {
          serviceName: config.telemetry.serviceName,
          serviceVersion: config.telemetry.serviceVersion,
          environment: config.telemetry.environment,
          exporterUrl: config.telemetry.exporterUrl ?? '(not set)',
          enabled: config.telemetry.enabled
        },
        metrics: {
          enabled: config.metrics.enabled
        }
      };

      // Use console.log for configuration debugging (acceptable for config logger)
      // eslint-disable-next-line no-console
      console.log(
        '[Observability Config] Resolved configuration:',
        JSON.stringify(logData, null, 2)
      );
    }
  };
}

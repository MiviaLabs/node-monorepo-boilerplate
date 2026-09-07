/**
 * Configuration resolver for the @package/core package.
 *
 * This module implements the three-tier configuration resolution system that
 * merges user configuration, environment variables, and defaults to produce
 * the final resolved configuration.
 *
 * ## Priority Order (highest to lowest)
 *
 * 1. **User-provided configuration** - Values passed directly to `resolveConfig()`
 * 2. **Environment variables** - Read from `process.env` using the `INFRA_*` prefix
 * 3. **Default values** - Sensible defaults defined in `./defaults.ts`
 *
 * ## Environment Variable Naming Convention
 *
 * All environment variables use the `INFRA_` prefix by default:
 *
 * | Configuration | Environment Variable |
 * |--------------|---------------------|
 * | `timeouts.default` | `INFRA_TIMEOUT_DEFAULT` |
 * | `timeouts.short` | `INFRA_TIMEOUT_SHORT` |
 * | `retry.maxAttempts` | `INFRA_RETRY_MAX_ATTEMPTS` |
 * | `healthCheck.intervalMs` | `INFRA_HEALTH_CHECK_INTERVAL_MS` |
 * | `openTelemetry.enableTracing` | `INFRA_OTEL_TRACING_ENABLED` |
 *
 * Exceptions (following OpenTelemetry conventions):
 * - `openTelemetry.serviceName` → `SERVICE_NAME`
 * - `openTelemetry.serviceVersion` → `SERVICE_VERSION`
 *
 * @see IInfrastructureCoreConfig - Input configuration type
 * @see IResolvedInfrastructureCoreConfig - Output configuration type
 * @see defaults - Default configuration values
 *
 * @example Basic usage with user configuration
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * const config = resolveConfig({
 *   timeouts: { default: 60000 },
 *   retry: { maxAttempts: 5 }
 * });
 *
 * console.log(config.timeouts.default);  // 60000 (user value)
 * console.log(config.timeouts.short);    // 5000 (default)
 * console.log(config.retry.maxAttempts); // 5 (user value)
 * ```
 *
 * @example Environment variable override
 * ```typescript
 * // In your environment or .env file:
 * // INFRA_TIMEOUT_DEFAULT=45000
 * // INFRA_RETRY_MAX_ATTEMPTS=4
 *
 * import { resolveConfig } from '@package/core';
 *
 * // No user config - values come from environment
 * const config = resolveConfig({});
 *
 * console.log(config.timeouts.default);  // 45000 (from env)
 * console.log(config.retry.maxAttempts); // 4 (from env)
 * ```
 *
 * @example Complete resolution workflow
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * // Environment has: INFRA_TIMEOUT_SHORT=3000
 *
 * const config = resolveConfig({
 *   timeouts: {
 *     default: 60000,  // User override
 *     // short: not provided, will use env (3000)
 *     // medium: not provided, will use default (15000)
 *   }
 * });
 *
 * console.log(config.timeouts.default);  // 60000 (user)
 * console.log(config.timeouts.short);    // 3000 (env)
 * console.log(config.timeouts.medium);   // 15000 (default)
 * ```
 *
 * @module
 */

import {
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_HEALTH_CHECK_CONFIG,
  DEFAULT_OPENTELEMETRY_CONFIG
} from './defaults';

import type {
  IInfrastructureCoreConfig,
  IResolvedInfrastructureCoreConfig,
  IEnvironmentVariableNames,
  ITimeoutConfig,
  IRetryConfig,
  IHealthCheckConfig,
  IOpenTelemetryConfig
} from './interfaces';

/**
 * Validation bounds for ITimeoutConfig fields.
 *
 * These bounds match the @minimum and @maximum annotations in the
 * ITimeoutConfig interface documentation and are enforced at runtime.
 *
 * @internal
 */
const TIMEOUT_BOUNDS = {
  default: { min: 100, max: 600000 },
  short: { min: 100, max: 30000 },
  medium: { min: 1000, max: 60000 },
  long: { min: 5000, max: 300000 },
  veryLong: { min: 30000, max: 3600000 }
} as const;

/**
 * Default environment variable names for configuration resolution.
 *
 * Maps configuration keys to their corresponding environment variable names.
 * All variables use the `INFRA_` prefix except for OpenTelemetry service
 * identification which follows standard conventions.
 *
 * @internal
 */
const DEFAULT_ENV_VAR_NAMES: Required<IEnvironmentVariableNames> = {
  enableGracefulShutdown: 'INFRA_ENABLE_GRACEFUL_SHUTDOWN',

  timeoutDefault: 'INFRA_TIMEOUT_DEFAULT',
  timeoutShort: 'INFRA_TIMEOUT_SHORT',
  timeoutMedium: 'INFRA_TIMEOUT_MEDIUM',
  timeoutLong: 'INFRA_TIMEOUT_LONG',
  timeoutVeryLong: 'INFRA_TIMEOUT_VERY_LONG',

  retryMaxAttempts: 'INFRA_RETRY_MAX_ATTEMPTS',
  retryInitialDelayMs: 'INFRA_RETRY_INITIAL_DELAY_MS',
  retryMaxDelayMs: 'INFRA_RETRY_MAX_DELAY_MS',
  retryBackoffMultiplier: 'INFRA_RETRY_BACKOFF_MULTIPLIER',

  healthCheckIntervalMs: 'INFRA_HEALTH_CHECK_INTERVAL_MS',
  healthCheckTimeoutMs: 'INFRA_HEALTH_CHECK_TIMEOUT_MS',
  healthCheckUnhealthyThreshold: 'INFRA_HEALTH_CHECK_UNHEALTHY_THRESHOLD',

  otelTracingEnabled: 'INFRA_OTEL_TRACING_ENABLED',
  otelMetricsEnabled: 'INFRA_OTEL_METRICS_ENABLED',
  otelTracerName: 'INFRA_OTEL_TRACER_NAME',
  otelMeterName: 'INFRA_OTEL_METER_NAME',
  otelServiceName: 'SERVICE_NAME',
  otelServiceVersion: 'SERVICE_VERSION'
};

/**
 * Configuration resolver that implements the three-tier priority system.
 *
 * This class handles the merging of user configuration, environment variables,
 * and default values for each configuration section. It provides type-safe
 * resolution with proper parsing of environment variable strings.
 *
 * @remarks
 * The resolver is typically used via the {@link resolveConfig} function rather
 * than instantiated directly. Direct instantiation is useful for testing or
 * when custom environment objects are needed.
 *
 * @see {@link resolveConfig} - Convenience function for configuration resolution
 *
 * @example Direct usage with custom environment
 * ```typescript
 * import { ConfigResolver } from '@package/core';
 *
 * // Useful for testing with mock environment
 * const mockEnv = {
 *   INFRA_TIMEOUT_DEFAULT: '45000',
 *   SERVICE_NAME: 'test-service'
 * };
 *
 * const resolver = new ConfigResolver({}, mockEnv);
 * const config = resolver.resolve();
 *
 * console.log(config.timeouts.default);           // 45000
 * console.log(config.openTelemetry.serviceName);  // 'test-service'
 * ```
 *
 * @example Accessing individual configuration sections
 * ```typescript
 * import { ConfigResolver } from '@package/core';
 *
 * const resolver = new ConfigResolver({
 *   retry: { maxAttempts: 5 }
 * });
 *
 * // Get just the retry configuration
 * const retryConfig = resolver.getRetryConfig();
 * console.log(retryConfig.maxAttempts);      // 5
 * console.log(retryConfig.initialDelayMs);   // 1000 (default)
 * ```
 */
export class ConfigResolver {
  /**
   * Creates a new ConfigResolver instance.
   *
   * @param userConfig - User-provided configuration (highest priority).
   *   All fields are optional and will fall back to environment variables
   *   or defaults when not provided.
   * @param env - Environment variables object for resolution.
   *   Defaults to `process.env`. Pass a custom object for testing.
   */
  constructor(
    private userConfig: IInfrastructureCoreConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolves a configuration value using the three-tier priority system.
   *
   * Resolution order:
   * 1. If `userValue` is defined (not undefined), return it
   * 2. If environment variable exists and is non-empty, parse and return it
   * 3. Return the default value
   *
   * @typeParam T - The type of the configuration value
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name to check
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional function to parse environment variable string.
   *   If not provided, the string value is returned as-is (with type cast).
   * @returns The resolved configuration value
   *
   * @internal
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) return userValue;
    if (envVarName) {
      const raw = this.env[envVarName];
      if (raw !== undefined && raw !== '') {
        return parser ? parser(raw) : (raw as unknown as T);
      }
    }
    return defaultValue;
  }

  /**
   * Parses a string environment variable to a boolean.
   *
   * Only the string `'true'` (case-insensitive) is considered true.
   * All other values are considered false.
   *
   * @param value - The string value to parse
   * @returns `true` if value is 'true' (case-insensitive), `false` otherwise
   *
   * @internal
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Parses a string environment variable to a number.
   *
   * Uses `Number()` to support both integers and floats (e.g., backoffMultiplier=1.5).
   * Logs a warning if the value cannot be parsed as a valid number but still
   * returns `NaN` to allow the application to handle invalid configuration.
   *
   * @param value - The string value to parse
   * @returns The parsed number (integer or float), or `NaN` if parsing fails
   *
   * @internal
   */
  private parseNumber(value: string): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      console.warn(
        `[ConfigResolver] Invalid number value from environment: "${value}". Using NaN. ` +
          `Please check your environment variables.`
      );
    }
    return parsed;
  }

  /**
   * Validates a timeout value against its configured bounds.
   *
   * Clamps values to the valid range and emits a warning when values
   * are outside the documented bounds. This ensures runtime enforcement
   * of the @minimum and @maximum constraints from ITimeoutConfig.
   *
   * When the value is NaN (from invalid environment variable parsing),
   * falls back to bounds.min to ensure setTimeout always receives a
   * finite number.
   *
   * @param field - The name of the timeout field being validated
   *   (e.g., 'ITimeoutConfig.default', 'ITimeoutConfig.short')
   * @param value - The resolved timeout value to validate
   * @param bounds - The min/max bounds for this field
   * @returns The validated value, always a finite number within [bounds.min, bounds.max]
   *
   * @internal
   */
  private validateTimeoutValue(
    field: string,
    value: number,
    bounds: { min: number; max: number }
  ): number {
    if (Number.isNaN(value)) {
      // NaN is already warned about in parseNumber, fall back to minimum bound
      // to ensure setTimeout always receives a finite number
      console.warn(
        `[ConfigResolver] Invalid numeric value for ${field}. Clamping to minimum ${bounds.min}.`
      );
      return bounds.min;
    }

    if (value < bounds.min) {
      console.warn(
        `[ConfigResolver] ${field} value ${value} is below minimum ${bounds.min}. ` +
          `Clamping to ${bounds.min}.`
      );
      return bounds.min;
    }

    if (value > bounds.max) {
      console.warn(
        `[ConfigResolver] ${field} value ${value} is above maximum ${bounds.max}. ` +
          `Clamping to ${bounds.max}.`
      );
      return bounds.max;
    }

    return value;
  }

  /**
   * Gets the merged environment variable names.
   *
   * Combines default environment variable names with any custom names
   * provided in the user configuration.
   *
   * @returns Complete environment variable name mappings
   *
   * @internal
   */
  private getEnvVarNames(): Required<IEnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Resolves timeout configuration.
   *
   * Merges user-provided timeout values with environment variables and
   * defaults to produce a complete timeout configuration. Values are
   * validated against the documented bounds and clamped if out of range.
   *
   * **Validation bounds:**
   * - `ITimeoutConfig.default`: 100–600000ms
   * - `ITimeoutConfig.short`: 100–30000ms
   * - `ITimeoutConfig.medium`: 1000–60000ms
   * - `ITimeoutConfig.long`: 5000–300000ms
   * - `ITimeoutConfig.veryLong`: 30000–3600000ms
   *
   * @returns Fully resolved timeout configuration with all tiers defined
   *   and validated against bounds
   *
   * @example
   * ```typescript
   * const resolver = new ConfigResolver({ timeouts: { short: 3000 } });
   * const timeouts = resolver.getTimeoutConfig();
   *
   * console.log(timeouts.short);    // 3000 (user)
   * console.log(timeouts.default);  // 30000 (default)
   * ```
   *
   * @example Validation clamping
   * ```typescript
   * // Value below minimum is clamped (with console warning)
   * const resolver = new ConfigResolver({ timeouts: { short: 50 } });
   * const timeouts = resolver.getTimeoutConfig();
   * console.log(timeouts.short);    // 100 (clamped to minimum)
   * ```
   */
  getTimeoutConfig(): Required<ITimeoutConfig> {
    const envNames = this.getEnvVarNames();
    const userTimeouts = this.userConfig.timeouts || {};

    return {
      default: this.validateTimeoutValue(
        'ITimeoutConfig.default',
        this.resolveValue(
          userTimeouts.default,
          envNames.timeoutDefault,
          DEFAULT_TIMEOUT_CONFIG.default,
          this.parseNumber
        ),
        TIMEOUT_BOUNDS.default
      ),
      short: this.validateTimeoutValue(
        'ITimeoutConfig.short',
        this.resolveValue(
          userTimeouts.short,
          envNames.timeoutShort,
          DEFAULT_TIMEOUT_CONFIG.short,
          this.parseNumber
        ),
        TIMEOUT_BOUNDS.short
      ),
      medium: this.validateTimeoutValue(
        'ITimeoutConfig.medium',
        this.resolveValue(
          userTimeouts.medium,
          envNames.timeoutMedium,
          DEFAULT_TIMEOUT_CONFIG.medium,
          this.parseNumber
        ),
        TIMEOUT_BOUNDS.medium
      ),
      long: this.validateTimeoutValue(
        'ITimeoutConfig.long',
        this.resolveValue(
          userTimeouts.long,
          envNames.timeoutLong,
          DEFAULT_TIMEOUT_CONFIG.long,
          this.parseNumber
        ),
        TIMEOUT_BOUNDS.long
      ),
      veryLong: this.validateTimeoutValue(
        'ITimeoutConfig.veryLong',
        this.resolveValue(
          userTimeouts.veryLong,
          envNames.timeoutVeryLong,
          DEFAULT_TIMEOUT_CONFIG.veryLong,
          this.parseNumber
        ),
        TIMEOUT_BOUNDS.veryLong
      )
    };
  }

  /**
   * Resolves retry configuration.
   *
   * Merges user-provided retry values with environment variables and
   * defaults to produce a complete retry configuration with exponential
   * backoff settings.
   *
   * @returns Fully resolved retry configuration
   *
   * @example
   * ```typescript
   * const resolver = new ConfigResolver({
   *   retry: { maxAttempts: 5, initialDelayMs: 2000 }
   * });
   * const retry = resolver.getRetryConfig();
   *
   * console.log(retry.maxAttempts);       // 5 (user)
   * console.log(retry.initialDelayMs);    // 2000 (user)
   * console.log(retry.maxDelayMs);        // 10000 (default)
   * console.log(retry.backoffMultiplier); // 2 (default)
   * ```
   */
  getRetryConfig(): Required<IRetryConfig> {
    const envNames = this.getEnvVarNames();
    const userRetry = this.userConfig.retry || {};

    return {
      maxAttempts: this.resolveValue(
        userRetry.maxAttempts,
        envNames.retryMaxAttempts,
        DEFAULT_RETRY_CONFIG.maxAttempts,
        this.parseNumber
      ),
      initialDelayMs: this.resolveValue(
        userRetry.initialDelayMs,
        envNames.retryInitialDelayMs,
        DEFAULT_RETRY_CONFIG.initialDelayMs,
        this.parseNumber
      ),
      maxDelayMs: this.resolveValue(
        userRetry.maxDelayMs,
        envNames.retryMaxDelayMs,
        DEFAULT_RETRY_CONFIG.maxDelayMs,
        this.parseNumber
      ),
      backoffMultiplier: this.resolveValue(
        userRetry.backoffMultiplier,
        envNames.retryBackoffMultiplier,
        DEFAULT_RETRY_CONFIG.backoffMultiplier,
        this.parseNumber
      )
    };
  }

  /**
   * Resolves health check configuration.
   *
   * Merges user-provided health check values with environment variables
   * and defaults to produce a complete health check configuration.
   *
   * @returns Fully resolved health check configuration
   *
   * @example
   * ```typescript
   * const resolver = new ConfigResolver({
   *   healthCheck: { intervalMs: 10000 }
   * });
   * const healthCheck = resolver.getHealthCheckConfig();
   *
   * console.log(healthCheck.intervalMs);         // 10000 (user)
   * console.log(healthCheck.timeoutMs);          // 5000 (default)
   * console.log(healthCheck.unhealthyThreshold); // 3 (default)
   * ```
   */
  getHealthCheckConfig(): Required<IHealthCheckConfig> {
    const envNames = this.getEnvVarNames();
    const userHealthCheck = this.userConfig.healthCheck || {};

    return {
      intervalMs: this.resolveValue(
        userHealthCheck.intervalMs,
        envNames.healthCheckIntervalMs,
        DEFAULT_HEALTH_CHECK_CONFIG.intervalMs,
        this.parseNumber
      ),
      timeoutMs: this.resolveValue(
        userHealthCheck.timeoutMs,
        envNames.healthCheckTimeoutMs,
        DEFAULT_HEALTH_CHECK_CONFIG.timeoutMs,
        this.parseNumber
      ),
      unhealthyThreshold: this.resolveValue(
        userHealthCheck.unhealthyThreshold,
        envNames.healthCheckUnhealthyThreshold,
        DEFAULT_HEALTH_CHECK_CONFIG.unhealthyThreshold,
        this.parseNumber
      )
    };
  }

  /**
   * Resolves OpenTelemetry configuration.
   *
   * Merges user-provided OpenTelemetry values with environment variables
   * and defaults. Service identification fields (serviceName, serviceVersion)
   * may be undefined if not provided.
   *
   * @returns Resolved OpenTelemetry configuration. Core settings are guaranteed,
   *   but serviceName and serviceVersion may be undefined.
   *
   * @example
   * ```typescript
   * // With SERVICE_NAME=my-service in environment
   * const resolver = new ConfigResolver({
   *   openTelemetry: { enableTracing: true }
   * });
   * const otel = resolver.getOpenTelemetryConfig();
   *
   * console.log(otel.enableTracing); // true (user)
   * console.log(otel.enableMetrics); // true (default)
   * console.log(otel.serviceName);   // 'my-service' (env)
   * ```
   */
  getOpenTelemetryConfig(): Omit<
    Required<IOpenTelemetryConfig>,
    'serviceName' | 'serviceVersion'
  > & {
    serviceName?: string;
    serviceVersion?: string;
  } {
    const envNames = this.getEnvVarNames();
    const userOtel = this.userConfig.openTelemetry || {};

    const serviceName = this.resolveValue(
      userOtel.serviceName,
      envNames.otelServiceName,
      DEFAULT_OPENTELEMETRY_CONFIG.serviceName
    );
    const serviceVersion = this.resolveValue(
      userOtel.serviceVersion,
      envNames.otelServiceVersion,
      DEFAULT_OPENTELEMETRY_CONFIG.serviceVersion
    );

    const result: Omit<Required<IOpenTelemetryConfig>, 'serviceName' | 'serviceVersion'> & {
      serviceName?: string;
      serviceVersion?: string;
    } = {
      enableTracing: this.resolveValue(
        userOtel.enableTracing,
        envNames.otelTracingEnabled,
        DEFAULT_OPENTELEMETRY_CONFIG.enableTracing,
        this.parseBoolean
      ),
      enableMetrics: this.resolveValue(
        userOtel.enableMetrics,
        envNames.otelMetricsEnabled,
        DEFAULT_OPENTELEMETRY_CONFIG.enableMetrics,
        this.parseBoolean
      ),
      tracerName: this.resolveValue(
        userOtel.tracerName,
        envNames.otelTracerName,
        DEFAULT_OPENTELEMETRY_CONFIG.tracerName
      ),
      meterName: this.resolveValue(
        userOtel.meterName,
        envNames.otelMeterName,
        DEFAULT_OPENTELEMETRY_CONFIG.meterName
      )
    };
    if (serviceName !== undefined) {
      result.serviceName = serviceName;
    }
    if (serviceVersion !== undefined) {
      result.serviceVersion = serviceVersion;
    }
    return result;
  }

  /**
   * Resolves the complete configuration.
   *
   * Combines all configuration sections (timeouts, retry, health check,
   * OpenTelemetry) into a single resolved configuration object with all
   * defaults applied.
   *
   * @returns Fully resolved configuration object
   *
   * @example
   * ```typescript
   * const resolver = new ConfigResolver({
   *   timeouts: { default: 60000 },
   *   retry: { maxAttempts: 5 }
   * });
   *
   * const config = resolver.resolve();
   *
   * // All sections are fully resolved
   * console.log(config.timeouts.default);        // 60000
   * console.log(config.retry.maxAttempts);       // 5
   * console.log(config.healthCheck.intervalMs);  // 30000 (default)
   * ```
   */
  resolve(): IResolvedInfrastructureCoreConfig {
    const envNames = this.getEnvVarNames();

    // Resolve enableGracefulShutdown with proper three-tier priority:
    // 1. User config (if explicitly set)
    // 2. Environment variable
    // 3. Default (true)
    const enableGracefulShutdown = this.resolveValue(
      this.userConfig.enableGracefulShutdown,
      envNames.enableGracefulShutdown,
      true,
      this.parseBoolean
    );

    return {
      enableGracefulShutdown,
      timeouts: this.getTimeoutConfig(),
      retry: this.getRetryConfig(),
      healthCheck: this.getHealthCheckConfig(),
      openTelemetry: this.getOpenTelemetryConfig()
    };
  }
}

/**
 * Resolves configuration from user config and environment variables.
 *
 * This is the primary function for configuration resolution. It merges
 * user-provided configuration, environment variables, and defaults using
 * the three-tier priority system.
 *
 * ## Priority Order
 *
 * 1. **User config** (highest) - Values in the `userConfig` parameter
 * 2. **Environment variables** - Values from `process.env` (or custom `env`)
 * 3. **Defaults** (lowest) - Built-in default values
 *
 * @param userConfig - User-provided configuration. All fields are optional.
 *   Undefined fields fall back to environment variables, then defaults.
 * @param env - Environment variables object. Defaults to `process.env`.
 *   Pass a custom object for testing or custom resolution.
 * @returns Fully resolved configuration with all defaults applied.
 *   All fields are guaranteed to have values (except optional service fields).
 *
 * @see IInfrastructureCoreConfig - Input configuration type
 * @see IResolvedInfrastructureCoreConfig - Output configuration type
 * @see ConfigResolver - Underlying resolver class
 *
 * @example Basic usage with partial configuration
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * const config = resolveConfig({
 *   timeouts: { default: 60000 },
 *   retry: { maxAttempts: 5 }
 * });
 *
 * // User values
 * console.log(config.timeouts.default);  // 60000
 * console.log(config.retry.maxAttempts); // 5
 *
 * // Default values (not overridden)
 * console.log(config.timeouts.short);    // 5000
 * console.log(config.retry.maxDelayMs);  // 10000
 * ```
 *
 * @example Using environment variables
 * ```typescript
 * // Set in environment:
 * // INFRA_TIMEOUT_DEFAULT=45000
 * // INFRA_RETRY_MAX_ATTEMPTS=4
 * // SERVICE_NAME=my-api
 *
 * import { resolveConfig } from '@package/core';
 *
 * const config = resolveConfig({});
 *
 * console.log(config.timeouts.default);          // 45000 (from env)
 * console.log(config.retry.maxAttempts);         // 4 (from env)
 * console.log(config.openTelemetry.serviceName); // 'my-api' (from env)
 * ```
 *
 * @example Testing with mock environment
 * ```typescript
 * import { resolveConfig } from '@package/core';
 *
 * const mockEnv = {
 *   INFRA_TIMEOUT_DEFAULT: '10000',
 *   SERVICE_NAME: 'test-service'
 * };
 *
 * const config = resolveConfig({}, mockEnv);
 *
 * console.log(config.timeouts.default);          // 10000
 * console.log(config.openTelemetry.serviceName); // 'test-service'
 * ```
 *
 * @example Priority demonstration
 * ```typescript
 * // Environment has: INFRA_TIMEOUT_DEFAULT=45000
 *
 * import { resolveConfig } from '@package/core';
 *
 * // User config takes priority over environment
 * const config = resolveConfig({
 *   timeouts: { default: 60000 }
 * });
 *
 * console.log(config.timeouts.default); // 60000 (user wins over env)
 * ```
 */
export function resolveConfig(
  userConfig: IInfrastructureCoreConfig = {},
  env: NodeJS.ProcessEnv = process.env
): IResolvedInfrastructureCoreConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

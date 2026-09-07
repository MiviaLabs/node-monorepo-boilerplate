/**
 * Configuration resolver for redis package
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
  DEFAULT_REDIS_CONNECTION_CONFIG,
  DEFAULT_CACHE_SERVICE_CONFIG,
  DEFAULT_PUBSUB_SERVICE_CONFIG,
  DEFAULT_TELEMETRY_CONFIG,
  DEFAULT_TEST_MODE
} from './defaults';
import type {
  InfrastructureRedisConfig,
  ResolvedInfrastructureRedisConfig,
  EnvironmentVariableNames,
  ResolvedRedisConnectionConfig,
  ResolvedCacheServiceConfig,
  ResolvedPubSubServiceConfig,
  ResolvedTelemetryConfig
} from './interfaces';

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<EnvironmentVariableNames> = {
  redisHost: 'REDIS_HOST',
  redisPort: 'REDIS_PORT',
  redisUser: 'REDIS_USER',
  redisPassword: 'REDIS_PASSWORD',
  redisDb: 'REDIS_DB',
  testMode: 'TEST_MODE'
};

/**
 * Configuration resolver class
 */
export class ConfigResolver {
  constructor(
    private userConfig: InfrastructureRedisConfig = {},
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
   * Parse string to number
   */
  private parseNumber(value: string): number {
    return parseInt(value, 10);
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<EnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Get Redis connection configuration
   */
  getConnectionConfig(): ResolvedRedisConnectionConfig {
    const envNames = this.getEnvVarNames();
    const userConnection = this.userConfig.connection || {};

    const resolved: ResolvedRedisConnectionConfig = {
      host: this.resolveValue(
        userConnection.host,
        envNames.redisHost,
        DEFAULT_REDIS_CONNECTION_CONFIG.host
      ),
      port: this.resolveValue(
        userConnection.port,
        envNames.redisPort,
        DEFAULT_REDIS_CONNECTION_CONFIG.port,
        this.parseNumber
      ),
      db: this.resolveValue(
        userConnection.db,
        envNames.redisDb,
        DEFAULT_REDIS_CONNECTION_CONFIG.db,
        this.parseNumber
      ),
      maxRetriesPerRequest:
        userConnection.maxRetriesPerRequest ?? DEFAULT_REDIS_CONNECTION_CONFIG.maxRetriesPerRequest,
      retryStrategy: userConnection.retryStrategy ?? DEFAULT_REDIS_CONNECTION_CONFIG.retryStrategy
    };

    const username = this.resolveValue(
      userConnection.username,
      envNames.redisUser,
      DEFAULT_REDIS_CONNECTION_CONFIG.username
    );
    if (username !== undefined) {
      resolved.username = username;
    }

    const password = this.resolveValue(
      userConnection.password,
      envNames.redisPassword,
      DEFAULT_REDIS_CONNECTION_CONFIG.password
    );
    if (password !== undefined) {
      resolved.password = password;
    }

    resolved.maxRetriesPerRequest =
      userConnection.maxRetriesPerRequest ?? DEFAULT_REDIS_CONNECTION_CONFIG.maxRetriesPerRequest;
    resolved.retryStrategy =
      userConnection.retryStrategy ?? DEFAULT_REDIS_CONNECTION_CONFIG.retryStrategy;

    return resolved;
  }

  /**
   * Get cache service configuration
   */
  getCacheConfig(): ResolvedCacheServiceConfig {
    const userCache = this.userConfig.cache || {};

    return {
      enabled: this.resolveValue(
        userCache.enabled,
        undefined,
        DEFAULT_CACHE_SERVICE_CONFIG.enabled
      ),
      defaultTtl: this.resolveValue(
        userCache.defaultTtl,
        undefined,
        DEFAULT_CACHE_SERVICE_CONFIG.defaultTtl
      )
    };
  }

  /**
   * Get pub/sub service configuration
   */
  getPubSubConfig(): ResolvedPubSubServiceConfig {
    const userPubSub = this.userConfig.pubSub || {};

    return {
      enabled: this.resolveValue(
        userPubSub.enabled,
        undefined,
        DEFAULT_PUBSUB_SERVICE_CONFIG.enabled
      )
    };
  }

  /**
   * Get telemetry configuration
   */
  getTelemetryConfig(): ResolvedTelemetryConfig {
    const userTelemetry = this.userConfig.telemetry || {};

    return {
      enabled: this.resolveValue(userTelemetry.enabled, undefined, DEFAULT_TELEMETRY_CONFIG.enabled)
    };
  }

  /**
   * Get test mode flag
   */
  getTestMode(): boolean {
    return DEFAULT_TEST_MODE;
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): ResolvedInfrastructureRedisConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    return {
      connection: this.getConnectionConfig(),
      cache: this.getCacheConfig(),
      pubSub: this.getPubSubConfig(),
      telemetry: this.getTelemetryConfig(),
      testMode: this.getTestMode()
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
 * import { resolveConfig } from '@package/redis/config';
 *
 * const config = resolveConfig({
 *   connection: {
 *     host: 'localhost',
 *     port: 6379,
 *     db: 0,
 *   },
 *   cache: {
 *     defaultTtl: 600,
 *   },
 * });
 *
 * console.log(config.connection.host); // 'localhost'
 * console.log(config.cache.defaultTtl); // 600
 * ```
 */
export function resolveConfig(
  userConfig: InfrastructureRedisConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedInfrastructureRedisConfig {
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
 * import { resolveConfig, createConfigLogger } from '@package/redis/config';
 *
 * const config = resolveConfig({
 *   connection: { host: 'localhost' }
 * });
 *
 * const configLogger = createConfigLogger(config);
 * configLogger.log(); // Logs resolved configuration
 * ```
 */
export function createConfigLogger(config: ResolvedInfrastructureRedisConfig) {
  return {
    /**
     * Log the resolved configuration (for debugging)
     */
    log(): void {
      const logData = {
        connection: {
          host: config.connection.host,
          port: config.connection.port,
          db: config.connection.db,
          username: config.connection.username ?? '(not set)',
          password: config.connection.password ? '(set)' : '(not set)',
          maxRetriesPerRequest: config.connection.maxRetriesPerRequest
        },
        cache: {
          enabled: config.cache.enabled,
          defaultTtl: config.cache.defaultTtl
        },
        pubSub: {
          enabled: config.pubSub.enabled
        },
        telemetry: {
          enabled: config.telemetry.enabled
        },
        testMode: config.testMode
      };

      // Use console.log for configuration debugging (acceptable for config logger)
      // eslint-disable-next-line no-console
      console.log('[Redis Config] Resolved configuration:', JSON.stringify(logData, null, 2));
    }
  };
}

/**
 * Configuration interfaces for redis package
 *
 * This module defines all configuration interfaces that allow users to override
 * default settings via input options, with environment variables as fallback.
 */

/**
 * Retry strategy options for Redis client
 *
 * @param times - Number of retries attempted
 * @returns Delay in milliseconds to wait before retrying, or null/void to stop retrying
 */
export type RetryStrategy = (times: number) => number | null | void;

/**
 * Redis connection configuration
 */
export interface RedisConnectionConfig {
  /**
   * Redis server host
   * @default process.env.REDIS_HOST or 'localhost'
   */
  host?: string;

  /**
   * Redis server port
   * @default process.env.REDIS_PORT or 6379
   */
  port?: number;

  /**
   * Optional username for Redis 6+ ACL authentication
   * @default process.env.REDIS_USER
   */
  username?: string;

  /**
   * Optional password for authentication
   * @default process.env.REDIS_PASSWORD
   */
  password?: string;

  /**
   * Redis database number (0-15)
   * @default process.env.REDIS_DB or 0
   */
  db?: number;

  /**
   * Maximum number of retries per request
   * @default 3
   */
  maxRetriesPerRequest?: number;

  /**
   * Custom retry strategy function
   * @default Exponential backoff with max delay of 2000ms
   */
  retryStrategy?: RetryStrategy;
}

/**
 * Cache service configuration
 */
export interface CacheServiceConfig {
  /**
   * Enable/disable cache service
   * @default true
   */
  enabled?: boolean;

  /**
   * Default TTL for cache entries in seconds
   * @default 300 (5 minutes)
   */
  defaultTtl?: number;
}

/**
 * Pub/Sub service configuration
 */
export interface PubSubServiceConfig {
  /**
   * Enable/disable pub/sub service
   * @default true
   */
  enabled?: boolean;
}

/**
 * Telemetry configuration for Redis operations
 */
export interface TelemetryConfig {
  /**
   * Enable/disable OpenTelemetry tracing for cache operations
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
  /** Redis host (default: REDIS_HOST) */
  redisHost?: string;

  /** Redis port (default: REDIS_PORT) */
  redisPort?: string;

  /** Redis username (default: REDIS_USER) */
  redisUser?: string;

  /** Redis password (default: REDIS_PASSWORD) */
  redisPassword?: string;

  /** Redis database (default: REDIS_DB) */
  redisDb?: string;

  /** Test mode flag (default: TEST_MODE) */
  testMode?: string;
}

/**
 * Main configuration interface for redis package
 *
 * All configuration options are optional. If not provided, they will be
 * read from environment variables, or fall back to default values.
 */
export interface InfrastructureRedisConfig {
  /** Redis connection configuration */
  connection?: RedisConnectionConfig;

  /** Cache service configuration */
  cache?: CacheServiceConfig;

  /** Pub/Sub service configuration */
  pubSub?: PubSubServiceConfig;

  /** Telemetry configuration */
  telemetry?: TelemetryConfig;

  /** Custom environment variable names (optional) */
  envVarNames?: EnvironmentVariableNames;
}

/**
 * Resolved Redis connection configuration with all defaults applied
 */
export interface ResolvedRedisConnectionConfig {
  /** Redis server host */
  host: string;

  /** Redis server port */
  port: number;

  /** Optional username for Redis 6+ ACL authentication */
  username?: string;

  /** Optional password for authentication */
  password?: string;

  /** Redis database number (0-15) */
  db: number;

  /** Maximum number of retries per request */
  maxRetriesPerRequest: number;

  /** Custom retry strategy function */
  retryStrategy: RetryStrategy;
}

/**
 * Resolved cache service configuration with all defaults applied
 */
export interface ResolvedCacheServiceConfig {
  /** Enable/disable cache service */
  enabled: boolean;

  /** Default TTL for cache entries in seconds */
  defaultTtl: number;
}

/**
 * Resolved pub/sub service configuration with all defaults applied
 */
export interface ResolvedPubSubServiceConfig {
  /** Enable/disable pub/sub service */
  enabled: boolean;
}

/**
 * Resolved telemetry configuration with all defaults applied
 */
export interface ResolvedTelemetryConfig {
  /** Enable/disable OpenTelemetry tracing */
  enabled: boolean;
}

/**
 * Resolved configuration with all defaults applied
 *
 * This interface represents the final configuration after merging user options,
 * environment variables, and defaults.
 */
export interface ResolvedInfrastructureRedisConfig {
  /** Redis connection configuration (with defaults) */
  connection: ResolvedRedisConnectionConfig;

  /** Cache service configuration (with defaults) */
  cache: ResolvedCacheServiceConfig;

  /** Pub/Sub service configuration (with defaults) */
  pubSub: ResolvedPubSubServiceConfig;

  /** Telemetry configuration (with defaults) */
  telemetry: ResolvedTelemetryConfig;

  /** Test mode flag */
  testMode: boolean;
}

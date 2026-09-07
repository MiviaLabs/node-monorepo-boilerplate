/**
 * Default configuration values for redis package
 *
 * These defaults are designed for production use with balanced
 * performance and reliability.
 */

import type {
  RedisConnectionConfig,
  CacheServiceConfig,
  PubSubServiceConfig,
  TelemetryConfig
} from './interfaces';

/**
 * Parse Redis connection URL into connection config
 * Supports: redis://[:password@]host:port/db
 *           rediss://[:password@]host:port/db (TLS)
 *
 * @param redisUrl - Redis connection URL
 * @returns Parsed config or null if invalid
 *
 * @example
 * parseRedisUrl('redis://localhost:6379/0')
 * // => { host: 'localhost', port: 6379, db: 0, password: undefined }
 *
 * parseRedisUrl('redis://:mypassword@redis.example.com:6379/1')
 * // => { host: 'redis.example.com', port: 6379, db: 1, password: 'mypassword' }
 */
export function parseRedisUrl(redisUrl: string | undefined): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
} | null {
  if (!redisUrl) {
    return null;
  }

  try {
    const url = new URL(redisUrl);

    const result: {
      host: string;
      port: number;
      username?: string;
      password?: string;
      db: number;
    } = {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      db: parseInt(url.pathname.slice(1) || '0', 10)
    };
    if (url.username !== '') {
      result.username = url.username;
    }
    if (url.password !== '') {
      result.password = url.password;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Default Redis connection configuration
 *
 * Priority:
 * 1. REDIS_URL environment variable (if set and valid)
 * 2. Individual REDIS_* environment variables
 * 3. Hardcoded defaults (localhost:6379)
 */
export const DEFAULT_REDIS_CONNECTION_CONFIG: Omit<
  Required<RedisConnectionConfig>,
  'username' | 'password' | 'retryStrategy'
> & {
  username?: string;
  password?: string;
  retryStrategy: (times: number) => number | void;
} = (() => {
  // First, try parsing REDIS_URL
  const parsedUrl = parseRedisUrl(process.env['REDIS_URL']);

  if (parsedUrl) {
    const result: Omit<
      Required<RedisConnectionConfig>,
      'username' | 'password' | 'retryStrategy'
    > & {
      username?: string;
      password?: string;
      retryStrategy: (times: number) => number | void;
    } = {
      host: parsedUrl.host,
      port: parsedUrl.port,
      db: parsedUrl.db,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };
    if (parsedUrl.username !== undefined) {
      result.username = parsedUrl.username;
    }
    if (parsedUrl.password !== undefined) {
      result.password = parsedUrl.password;
    }
    return result;
  }

  // Fallback to individual env vars
  const result: Omit<Required<RedisConnectionConfig>, 'username' | 'password' | 'retryStrategy'> & {
    username?: string;
    password?: string;
    retryStrategy: (times: number) => number | void;
  } = {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };

  const username = process.env['REDIS_USER'];
  if (username !== undefined) {
    result.username = username;
  }
  const password = process.env['REDIS_PASSWORD'];
  if (password !== undefined) {
    result.password = password;
  }

  return result;
})();

/**
 * Default cache service configuration
 */
export const DEFAULT_CACHE_SERVICE_CONFIG: Required<CacheServiceConfig> = {
  enabled: true,
  defaultTtl: 300 // 5 minutes
};

/**
 * Default pub/sub service configuration
 */
export const DEFAULT_PUBSUB_SERVICE_CONFIG: Required<PubSubServiceConfig> = {
  enabled: true
};

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: Required<TelemetryConfig> = {
  enabled: true
};

/**
 * Default test mode flag
 */
export const DEFAULT_TEST_MODE: boolean =
  process.env['NODE_ENV'] === 'test' || process.env['TEST_MODE'] === 'true';

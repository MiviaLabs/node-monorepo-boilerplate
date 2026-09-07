import Redis from 'ioredis';

import { resolveConfig } from './config';

/**
 * Test mode flag to bypass actual Redis connections in tests
 *
 * @returns Boolean indicating if test mode is enabled
 * @deprecated Use resolveConfig().testMode instead
 * @see {@link resolveConfig}
 */
export const TEST_MODE = (() => {
  const config = resolveConfig();
  return config.testMode;
})();

// Flag to track if tests are done and logging should be suppressed
let loggingEnabled = true;

/**
 * Disable logging (call this in test cleanup)
 *
 * Call this in afterAll() hooks to prevent "Cannot log after tests are done" warnings.
 *
 * @returns void
 */
export function disableLogging(): void {
  loggingEnabled = false;
}

/**
 * Enable logging (call this in test setup if needed)
 *
 * @returns void
 */
export function enableLogging(): void {
  loggingEnabled = true;
}

/**
 * Safe logging function that checks if logging is enabled
 *
 * @param fn - Logging function to execute if logging is enabled
 */
function safeLog(fn: () => void): void {
  if (loggingEnabled) {
    fn();
  }
}

// Shared state for all MockRedis instances (for pub/sub support)
const mockRedisData = new Map<string, string>();
const mockRedisSortedSets = new Map<string, Map<string, number>>();
const mockRedisTimers = new Map<string, NodeJS.Timeout>();
const mockRedisSubscriptions = new Map<string, Set<(channel: string, message: string) => void>>();
const mockRedisMessageHandlers = new Map<string, (channel: string, message: string) => void>();

function scheduleMockRedisExpiry(key: string, seconds: number): void {
  const existingTimer = mockRedisTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    mockRedisData.delete(key);
    mockRedisSortedSets.delete(key);
    mockRedisTimers.delete(key);
  }, seconds * 1000);

  timer.unref?.();
  mockRedisTimers.set(key, timer);
}

function mockRedisHasKey(key: string): boolean {
  return mockRedisData.has(key) || mockRedisSortedSets.has(key);
}

function normalizeSortedSetScore(score: string | number): number {
  if (score === '-inf') {
    return Number.NEGATIVE_INFINITY;
  }

  if (score === '+inf') {
    return Number.POSITIVE_INFINITY;
  }

  return Number(score);
}

/**
 * Mock Redis class for testing
 */
class MockRedis {
  private localSubscriptions = new Set<string>();
  private messageHandler?: (channel: string, message: string) => void;

  on(event: string, handler: (...args: unknown[]) => void): this {
    if (event === 'message') {
      // Store message handler for pub/sub
      this.messageHandler = handler as (channel: string, message: string) => void;
      mockRedisMessageHandlers.set(
        `${this}`,
        handler as (channel: string, message: string) => void
      );
    }
    return this;
  }

  async get(key: string): Promise<string | null> {
    return mockRedisData.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    let expirySeconds: number | undefined;
    let onlyIfMissing = false;

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (typeof arg !== 'string') continue;

      if (arg === 'EX') {
        const ttl = args[index + 1];
        if (typeof ttl === 'number') {
          expirySeconds = ttl;
        }
      }

      if (arg === 'NX') {
        onlyIfMissing = true;
      }
    }

    if (onlyIfMissing && mockRedisData.has(key)) {
      return null;
    }

    mockRedisData.set(key, value);
    if (expirySeconds !== undefined) {
      scheduleMockRedisExpiry(key, expirySeconds);
    }
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    mockRedisData.set(key, value);
    scheduleMockRedisExpiry(key, seconds);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const removedString = mockRedisData.delete(key);
      const removedSortedSet = mockRedisSortedSets.delete(key);
      if (removedString || removedSortedSet) count++;
      const timer = mockRedisTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        mockRedisTimers.delete(key);
      }
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return Array.from(new Set([...mockRedisData.keys(), ...mockRedisSortedSets.keys()])).filter(
      (key) => regex.test(key)
    );
  }

  /**
   * SCAN iteration over keys matching a pattern, mimicking the ioredis
   * `scan(cursor, 'MATCH', pattern, 'COUNT', count)` contract. Returns
   * `[nextCursor, matchedKeys]`. In the mock we complete the iteration
   * in a single call (cursor is always 0 after), which is consistent
   * with ioredis's behavior on a small in-memory dataset.
   */
  async scan(
    _cursor: number,
    _matchFlag: string,
    pattern: string,
    _countFlag: string,
    _count: number
  ): Promise<[string, string[]]> {
    const matchedKeys = await this.keys(pattern);
    return ['0', matchedKeys];
  }

  async exists(key: string): Promise<number> {
    return mockRedisHasKey(key) ? 1 : 0;
  }

  async incrby(key: string, increment: number): Promise<number> {
    const current = parseInt(mockRedisData.get(key) ?? '0', 10);
    const newValue = current + increment;
    mockRedisData.set(key, String(newValue));
    return newValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (mockRedisHasKey(key)) {
      scheduleMockRedisExpiry(key, seconds);
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    if (!mockRedisHasKey(key)) return -2;
    if (!mockRedisTimers.has(key)) return -1;
    // Can't determine exact TTL in mock
    return -1;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const sortedSet = mockRedisSortedSets.get(key) ?? new Map<string, number>();
    const existed = sortedSet.has(member);

    sortedSet.set(member, score);
    mockRedisSortedSets.set(key, sortedSet);

    return existed ? 0 : 1;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const sortedSet = mockRedisSortedSets.get(key);
    if (!sortedSet) {
      return [];
    }

    const members = Array.from(sortedSet.entries())
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);

    const normalizedStart = start < 0 ? Math.max(members.length + start, 0) : start;
    const normalizedStop = stop < 0 ? members.length + stop : stop;

    return members.slice(normalizedStart, normalizedStop + 1);
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const sortedSet = mockRedisSortedSets.get(key);
    if (!sortedSet) {
      return 0;
    }

    let removed = 0;
    for (const member of members) {
      if (sortedSet.delete(member)) {
        removed += 1;
      }
    }

    if (sortedSet.size === 0) {
      mockRedisSortedSets.delete(key);
    }

    return removed;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number> {
    const sortedSet = mockRedisSortedSets.get(key);
    if (!sortedSet) {
      return 0;
    }

    const minScore = normalizeSortedSetScore(min);
    const maxScore = normalizeSortedSetScore(max);
    let removed = 0;

    for (const [member, score] of sortedSet.entries()) {
      if (score >= minScore && score <= maxScore) {
        sortedSet.delete(member);
        removed += 1;
      }
    }

    if (sortedSet.size === 0) {
      mockRedisSortedSets.delete(key);
    }

    return removed;
  }

  async eval(script: string, numKeys: number, ...args: string[]): Promise<number> {
    const keys = args.slice(0, numKeys);
    const values = args.slice(numKeys);
    const normalizedScript = script.replace(/\s+/g, ' ').trim().toLowerCase();

    const isCompareAndDeleteScript =
      normalizedScript.includes('redis.call("get", keys[1]) == argv[1]') &&
      normalizedScript.includes('return redis.call("del", keys[1])');

    if (isCompareAndDeleteScript) {
      const [key] = keys;
      const [expectedValue] = values;

      if (key && expectedValue && mockRedisData.get(key) === expectedValue) {
        await this.del(key);
        return 1;
      }

      return 0;
    }

    throw new Error(`MockRedis.eval does not support script: ${script}`);
  }

  async publish(channel: string, message: string): Promise<number> {
    // Notify all subscribers of this channel
    const handlers = mockRedisSubscriptions.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        handler(channel, message);
      }
    }
    return handlers?.size ?? 0;
  }

  async subscribe(...channels: string[]): Promise<'OK'> {
    if (!this.messageHandler) return 'OK';

    for (const channel of channels) {
      this.localSubscriptions.add(channel);
      if (!mockRedisSubscriptions.has(channel)) {
        mockRedisSubscriptions.set(channel, new Set());
      }
      // Subscribe to messages on this channel
      mockRedisSubscriptions.get(channel)?.add(this.messageHandler);
    }
    return 'OK';
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    if (!this.messageHandler) return 0;

    let count = 0;
    for (const channel of channels) {
      const handlers = mockRedisSubscriptions.get(channel);
      if (handlers) {
        handlers.delete(this.messageHandler);
        this.localSubscriptions.delete(channel);
        if (handlers.size === 0) {
          mockRedisSubscriptions.delete(channel);
        }
        count++;
      }
    }
    return count;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  duplicate(): this {
    return new MockRedis() as this;
  }

  removeAllListeners(): this {
    // No-op for mock - real Redis uses EventEmitter
    return this;
  }

  async quit(): Promise<'OK'> {
    // Clean up this instance's subscriptions
    if (this.messageHandler) {
      for (const channel of this.localSubscriptions) {
        const handlers = mockRedisSubscriptions.get(channel);
        if (handlers) {
          handlers.delete(this.messageHandler);
          if (handlers.size === 0) {
            mockRedisSubscriptions.delete(channel);
          }
        }
      }
    }
    return 'OK';
  }
}

let redisClient: Redis | null = null;

// Track all created Redis clients for cleanup
const createdClients = new Set<Redis>();

/**
 * Redis connection configuration options
 *
 * @deprecated Use ResolvedRedisConnectionConfig from @package/redis/config instead
 * @see {@link ResolvedRedisConnectionConfig}
 */
export interface IRedisConfig {
  /**
   * Redis server host
   */
  host: string;

  /**
   * Redis server port
   */
  port: number;

  /**
   * Optional username for Redis 6+ ACL authentication
   */
  username?: string;

  /**
   * Optional password for authentication
   */
  password?: string;

  /**
   * Redis database number (0-15)
   * @default 0
   */
  db?: number;

  /**
   * Maximum number of retries per request
   * @default 3
   */
  maxRetriesPerRequest?: number;

  /**
   * Custom retry strategy function
   * @param times - Number of retries attempted
   * @returns Delay in milliseconds to wait before retrying, or null/void to stop retrying
   */
  retryStrategy?: (times: number) => number | null | void;
}

/**
 * Redis connection configuration options
 *
 * @deprecated Use ResolvedRedisConnectionConfig from @package/redis/config instead
 * @see {@link IRedisConfig}
 */
export type RedisConfig = IRedisConfig;

/**
 * Creates a new Redis client with the specified configuration
 *
 * @param config - Redis connection configuration
 * @returns Configured Redis client instance
 *
 * @example
 * ```typescript
 * const client = createRedisClient({
 *   host: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   db: 0,
 * });
 * ```
 */
export function createRedisClient(config: RedisConfig): Redis {
  // Use mock Redis in test mode
  if (TEST_MODE) {
    return new MockRedis() as unknown as Redis;
  }

  // Log connection details (without password)
  const connectionDetails = {
    host: config.host,
    port: config.port,
    db: config.db ?? 0,
    username: config.username,
    hasPassword: !!config.password
  };

  safeLog(() => {
    // eslint-disable-next-line no-console
    console.log('[Redis] Creating client with config:', JSON.stringify(connectionDetails, null, 2));
  });

  const redisOptions: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryStrategy: (times: number) => number | null | void;
    enableOfflineQueue: boolean;
    enableReadyCheck: boolean;
    lazyConnect: boolean;
  } = {
    host: config.host,
    port: config.port,
    db: config.db ?? 0,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
    retryStrategy:
      config.retryStrategy ??
      ((times: number) => {
        // Exponential backoff capped at 2 seconds
        const delay = Math.min(times * 50, 2000);
        return delay;
      }),
    // Lazy connect - don't connect until first command
    lazyConnect: true,
    // Enable offline queue to prevent errors during reconnection
    enableOfflineQueue: true,
    // Enable ready check to ensure connection is ready before commands
    enableReadyCheck: true
  };

  if (config.username !== undefined) {
    redisOptions.username = config.username;
  }
  if (config.password !== undefined) {
    redisOptions.password = config.password;
  }

  const client = new Redis(redisOptions);

  // Track client for cleanup
  createdClients.add(client);

  // IMPORTANT: Attach error handler IMMEDIATELY to prevent unhandled error events
  // ioredis can emit error events synchronously during construction if connection fails
  /* eslint-disable no-console */
  client.on('error', (err) => {
    // Log the error but don't throw - this is a connection issue that will be retried
    safeLog(() => {
      console.error(`[Redis] Error connecting to ${config.host}:${config.port}:`, err.message);
    });
  });

  // Log successful connection
  client.on('connect', () => {
    safeLog(() => {
      console.log(`[Redis] Connected to ${config.host}:${config.port}`);
    });
  });

  client.on('ready', () => {
    safeLog(() => {
      console.log(`[Redis] Ready to accept commands on ${config.host}:${config.port}`);
    });
  });

  client.on('close', () => {
    safeLog(() => {
      console.log(`[Redis] Connection closed to ${config.host}:${config.port}`);
    });
  });

  client.on('reconnecting', () => {
    safeLog(() => {
      console.log(`[Redis] Reconnecting to ${config.host}:${config.port}...`);
    });
  });
  /* eslint-enable no-console */

  return client;
}

/**
 * Gets the singleton Redis client instance, creating it if necessary
 *
 * The client is configured from:
 * 1. Environment variables (REDIS_HOST, REDIS_PORT, REDIS_USER, REDIS_PASSWORD, REDIS_DB)
 * 2. Default values (localhost:6379, db 0)
 *
 * For custom configuration, use createRedisClient() instead.
 *
 * @returns Redis client instance
 *
 * @example
 * ```typescript
 * const client = getRedisClient();
 * await client.set('key', 'value');
 * ```
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const config = resolveConfig();
    redisClient = createRedisClient(config.connection);
  }
  return redisClient;
}

/**
 * Closes the Redis client connection
 *
 * Also disables logging to prevent async log messages after tests complete.
 *
 * @returns Promise that resolves when the connection is closed
 *
 * @example
 * ```typescript
 * await closeRedisClient();
 * ```
 */
export async function closeRedisClient(): Promise<void> {
  // Disable logging first to prevent any async log messages
  disableLogging();

  if (redisClient) {
    const clientToClose = redisClient;
    // Remove all event listeners to prevent async logging after cleanup
    clientToClose.removeAllListeners();
    try {
      await clientToClose.quit();
    } catch {
      // Ignore errors during quit
    }
    // Remove from tracking Set to prevent memory leak
    createdClients.delete(clientToClose);
    redisClient = null;
  }
}

/**
 * Closes all Redis client connections created by this module
 *
 * Call this in test cleanup (afterAll) to prevent hanging tests.
 *
 * @returns Promise that resolves when all connections are closed
 *
 * @example
 * ```typescript
 * afterAll(async () => {
 *   await closeAllRedisClients();
 * });
 * ```
 */
export async function closeAllRedisClients(): Promise<void> {
  // Disable logging first to prevent any async log messages
  disableLogging();

  const closePromises: Promise<void>[] = [];

  for (const client of createdClients) {
    client.removeAllListeners();
    closePromises.push(
      (async () => {
        try {
          await client.quit();
        } catch {
          // Ignore errors during quit
        }
      })()
    );
  }

  await Promise.all(closePromises);

  // In test mode, clear all mock state to prevent test leakage
  if (TEST_MODE) {
    // Clear all mock timers (from setex/expire calls)
    for (const timer of mockRedisTimers.values()) {
      clearTimeout(timer);
    }
    mockRedisTimers.clear();

    // Clear mock data and subscriptions
    mockRedisData.clear();
    mockRedisSubscriptions.clear();
    mockRedisMessageHandlers.clear();
  }

  createdClients.clear();
  redisClient = null;
}

/**
 * Performs a health check on the Redis connection
 *
 * @returns Promise that resolves to true if Redis is healthy, false otherwise
 *
 * @example
 * ```typescript
 * const isHealthy = await healthCheck();
 * if (!isHealthy) {
 *   console.error('Redis is not responding');
 * }
 * ```
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Reset the Redis client state
 *
 * Clears all mock data and resets the singleton client.
 * Useful for testing.
 *
 * @returns void
 */
export function resetRedisClient(): void {
  // Disable logging and clean up all real clients
  disableLogging();
  for (const client of createdClients) {
    client.removeAllListeners();
    client.disconnect();
  }
  createdClients.clear();

  // Clear mock data
  mockRedisData.clear();
  for (const timer of mockRedisTimers.values()) {
    clearTimeout(timer);
  }
  mockRedisTimers.clear();
  mockRedisSubscriptions.clear();
  mockRedisMessageHandlers.clear();
  redisClient = null;
  loggingEnabled = true;
}

// Testcontainers is an optional dependency - only available when running tests
// This allows test-utils to be used in production builds without testcontainers

let RedisContainer: unknown = null;

// Store multiple named Redis containers
const redisContainers = new Map<string, unknown>();

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const testcontainers = require('@testcontainers/redis');
  RedisContainer = testcontainers.RedisContainer;
} catch {
  // Testcontainers not installed - this is expected in production builds
  RedisContainer = null;
}

/**
 * Configuration options for starting a Redis Testcontainer.
 *
 * All options have sensible defaults that can be overridden via environment
 * variables or explicit configuration.
 *
 * @example
 * ```ts
 * // Using defaults (redis:8-alpine, no password)
 * await startRedisContainer('main');
 *
 * // With password authentication
 * await startRedisContainer('cache', {
 *   password: 'secret_password'
 * });
 *
 * // Custom image
 * await startRedisContainer('session', {
 *   image: 'redis:7-alpine',
 *   password: 'session_pass'
 * });
 * ```
 */
export interface IRedisContainerOptions {
  /**
   * Docker image to use for the Redis container.
   * @default process.env.TEST_REDIS_IMAGE || 'redis:8-alpine'
   */
  image?: string;
  /**
   * Optional password for Redis authentication.
   * When set, clients must use AUTH command to connect.
   * @default process.env.TEST_REDIS_PASSWORD || '' (no password)
   */
  password?: string;
}

/**
 * Starts a named Redis Testcontainer for integration testing.
 *
 * This function manages named Redis containers using a Map-based registry,
 * allowing multiple containers to run simultaneously with different configurations
 * (e.g., 'cache' for application cache, 'session' for session storage).
 *
 * Redis containers start quickly (typically 1-3 seconds) and are suitable
 * for per-test or per-suite lifecycle management.
 *
 * BREAKING CHANGE: The container name is now REQUIRED.
 *
 * @param name - Unique container identifier (e.g., 'main', 'cache', 'session')
 * @param options - Container configuration options
 * @returns The started container instance
 * @throws Error if testcontainers is not installed
 * @throws Error if container fails to start
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * await startRedisContainer('main');
 * const url = getRedisConnectionUrl('main');
 *
 * // With password authentication
 * await startRedisContainer('cache', { password: 'testpass' });
 * const envVars = getRedisConnectionEnvVars('cache');
 * process.env.REDIS_HOST = envVars.REDIS_HOST;
 * process.env.REDIS_PORT = envVars.REDIS_PORT;
 * process.env.REDIS_PASSWORD = envVars.REDIS_PASSWORD;
 *
 * // Multiple containers for different purposes
 * await startRedisContainer('cache', { password: 'cache_pass' });
 * await startRedisContainer('session', { password: 'session_pass' });
 *
 * // Cleanup after tests
 * await stopRedisContainer('cache');
 * await stopRedisContainer('session');
 * // Or stop all: await stopRedisContainer();
 * ```
 */
export async function startRedisContainer(
  name: string,
  options: IRedisContainerOptions = {}
): Promise<unknown> {
  if (!RedisContainer) {
    throw new Error(
      'Testcontainers is not installed. Install it with: pnpm add -D @testcontainers/redis testcontainers'
    );
  }

  if (redisContainers.has(name)) {
    // eslint-disable-next-line no-console
    console.log(`[Redis Container] Container '${name}' already started, reusing...`);
    return redisContainers.get(name);
  }

  const {
    image = process.env['TEST_REDIS_IMAGE'] || 'redis:8-alpine',
    password = process.env['TEST_REDIS_PASSWORD'] || ''
  } = options;

  // eslint-disable-next-line no-console
  console.log(`[Redis Container] Starting container '${name}'...`);

  // Cast to any to avoid type errors with dynamically loaded Testcontainers
  const RedisContainerClass = RedisContainer as {
    new (image: string): {
      withPassword(password: string): { start(): Promise<unknown> };
      start(): Promise<unknown>;
    };
  };
  const container = password
    ? new RedisContainerClass(image).withPassword(password)
    : new RedisContainerClass(image);

  const startedContainer = await container.start();
  redisContainers.set(name, startedContainer);

  // eslint-disable-next-line no-console
  console.log(`[Redis Container] Container '${name}' started successfully`);

  return startedContainer;
}

/**
 * Stops a named Redis Testcontainer, or all containers if no name is provided.
 *
 * This function gracefully shuts down the container(s) and removes them from
 * the internal registry. Always call this in test teardown to avoid resource leaks.
 *
 * @param name - Container identifier (optional, stops all if not provided)
 * @returns Promise that resolves when container(s) have stopped
 *
 * @example
 * ```ts
 * // Stop a specific container
 * await stopRedisContainer('cache');
 *
 * // Stop all containers (useful in global teardown)
 * await stopRedisContainer();
 *
 * // Typical test lifecycle
 * beforeAll(async () => {
 *   await startRedisContainer('main');
 * });
 *
 * afterAll(async () => {
 *   await stopRedisContainer('main');
 * });
 * ```
 */
export async function stopRedisContainer(name?: string): Promise<void> {
  if (name) {
    // Stop specific container
    const container = redisContainers.get(name);
    if (container) {
      const containerWithStop = container as { stop(): Promise<void> };
      await containerWithStop.stop();
      redisContainers.delete(name);
      // eslint-disable-next-line no-console
      console.log(`[Redis Container] Container '${name}' stopped`);
    }
  } else {
    // Stop all containers
    const stopPromises = Array.from(redisContainers.entries()).map(
      async ([containerName, container]) => {
        const containerWithStop = container as { stop(): Promise<void> };
        await containerWithStop.stop();
        // eslint-disable-next-line no-console
        console.log(`[Redis Container] Container '${containerName}' stopped`);
      }
    );
    await Promise.all(stopPromises);
    redisContainers.clear();
  }
}

/**
 * Gets the connection URL for a named Redis container.
 *
 * Returns the connection URL in Redis URL format:
 * `redis://[:password@]host:port/db`
 *
 * @param name - Container identifier
 * @returns Redis connection URL
 * @throws Error if container with the given name has not been started
 *
 * @example
 * ```ts
 * // Get URL for ioredis or node-redis
 * await startRedisContainer('main');
 * const url = getRedisConnectionUrl('main');
 * const redis = new Redis(url);
 *
 * // With BullMQ
 * const connection = new IORedis(getRedisConnectionUrl('main'));
 * const queue = new Queue('myqueue', { connection });
 * ```
 */
export function getRedisConnectionUrl(name: string): string {
  const container = redisContainers.get(name);
  if (!container) {
    throw new Error(
      `Redis container '${name}' not started. Call startRedisContainer('${name}') first.`
    );
  }
  const containerWithUrl = container as { getConnectionUrl(): string };
  return containerWithUrl.getConnectionUrl();
}

/**
 * Parses Redis connection URL into individual environment variables.
 *
 * Extracts host, port, password, and database number from the connection URL
 * and returns them as separate values. This is useful for applications that
 * expect individual environment variables rather than a connection URL.
 *
 * @param name - Container identifier
 * @returns Object with REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB
 * @throws Error if container with the given name has not been started
 *
 * @example
 * ```ts
 * // Full environment variable setup
 * await startRedisContainer('main', { password: 'testpass' });
 * const envVars = getRedisConnectionEnvVars('main');
 *
 * // Set all environment variables at once
 * Object.assign(process.env, envVars);
 *
 * // Or set individually
 * process.env.REDIS_HOST = envVars.REDIS_HOST;     // e.g., 'localhost'
 * process.env.REDIS_PORT = envVars.REDIS_PORT;     // e.g., '54321'
 * process.env.REDIS_PASSWORD = envVars.REDIS_PASSWORD; // e.g., 'testpass'
 * process.env.REDIS_DB = envVars.REDIS_DB;         // e.g., '0'
 *
 * // Useful for NestJS config validation
 * const config = {
 *   host: envVars.REDIS_HOST,
 *   port: parseInt(envVars.REDIS_PORT, 10),
 *   password: envVars.REDIS_PASSWORD || undefined,
 *   db: parseInt(envVars.REDIS_DB, 10)
 * };
 * ```
 */
export function getRedisConnectionEnvVars(name: string): {
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD: string;
  REDIS_DB: string;
} {
  const connectionUrl = getRedisConnectionUrl(name);

  // Parse Redis URL: redis://[:password@]host:port/db
  const url = new URL(connectionUrl);

  return {
    REDIS_HOST: url.hostname,
    REDIS_PORT: url.port || '6379',
    REDIS_PASSWORD: url.password || '',
    REDIS_DB: url.pathname.slice(1) || '0'
  };
}

/**
 * Gets the raw Redis container instance by name.
 *
 * Returns the underlying Testcontainers instance for advanced use cases
 * such as accessing container logs, executing commands, or inspecting state.
 *
 * @param name - Container identifier
 * @returns The started container instance, or undefined if not started
 *
 * @example
 * ```ts
 * await startRedisContainer('main');
 * const container = getRedisContainer('main');
 *
 * if (container) {
 *   // Access container methods directly
 *   const containerTyped = container as { getHost(): string };
 *   const host = containerTyped.getHost();
 * }
 * ```
 */
export function getRedisContainer(name: string): unknown {
  return redisContainers.get(name);
}

/**
 * Gets all started Redis container names.
 *
 * Returns an array of container identifiers that have been started and
 * are currently running. Useful for cleanup operations or debugging.
 *
 * @returns Array of container names that are currently running
 *
 * @example
 * ```ts
 * await startRedisContainer('cache');
 * await startRedisContainer('session');
 *
 * const names = getRedisContainerNames();
 * console.log(names); // ['cache', 'session']
 *
 * // Clean up all containers
 * for (const name of names) {
 *   await stopRedisContainer(name);
 * }
 * ```
 */
export function getRedisContainerNames(): string[] {
  return Array.from(redisContainers.keys());
}

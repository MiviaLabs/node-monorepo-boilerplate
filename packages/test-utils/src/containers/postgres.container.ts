// Testcontainers is an optional dependency - only available when running tests
// This allows test-utils to be used in production builds without testcontainers

let PostgreSqlContainer: unknown = null;

// Store multiple named PostgreSQL containers
const postgresContainers = new Map<string, unknown>();

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const testcontainers = require('@testcontainers/postgresql');
  PostgreSqlContainer = testcontainers.PostgreSqlContainer;
} catch {
  // Testcontainers not installed - this is expected in production builds
  PostgreSqlContainer = null;
}

/**
 * Pattern for validating PostgreSQL database names.
 * Must start with a letter and contain only letters, numbers, and underscores.
 */
const VALID_DATABASE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Configuration options for starting a PostgreSQL Testcontainer.
 *
 * All options have sensible defaults that can be overridden via environment
 * variables or explicit configuration.
 *
 * @example
 * ```ts
 * // Using defaults (postgres:18-alpine, test_db, test_user, test_password)
 * await startPostgresContainer('main');
 *
 * // Custom configuration
 * await startPostgresContainer('events', {
 *   image: 'postgres:17-alpine',
 *   database: 'events_db',
 *   username: 'events_user',
 *   password: 'events_pass'
 * });
 * ```
 */
export interface IPostgresContainerOptions {
  /**
   * Docker image to use for the PostgreSQL container.
   * @default process.env.TEST_POSTGRES_IMAGE || 'postgres:18-alpine'
   */
  image?: string;
  /**
   * Database name to create inside the container.
   * @default process.env.TEST_POSTGRES_DATABASE || 'test_db'
   */
  database?: string;
  /**
   * Username for database authentication.
   * @default process.env.TEST_POSTGRES_USER || 'test_user'
   */
  username?: string;
  /**
   * Password for database authentication.
   * @default process.env.TEST_POSTGRES_PASSWORD || 'test_password'
   */
  password?: string;
}

/**
 * Validates a PostgreSQL database name to prevent SQL injection.
 *
 * Database names must start with a letter and contain only letters, numbers,
 * and underscores. This follows PostgreSQL's identifier naming rules and
 * prevents malicious input from being interpolated into SQL queries.
 *
 * @internal
 * @param database - The database name to validate
 * @throws Error if the database name contains invalid characters
 *
 * @example
 * ```ts
 * validateDatabaseName('test_db');     // OK
 * validateDatabaseName('my_db_123');   // OK
 * validateDatabaseName('123db');       // Throws - must start with letter
 * validateDatabaseName('db; DROP');    // Throws - invalid characters
 * ```
 */
function validateDatabaseName(database: string): void {
  if (!VALID_DATABASE_NAME_PATTERN.test(database)) {
    throw new Error(
      `Invalid database name: '${database}'. Database names must start with a letter and contain only letters, numbers, and underscores.`
    );
  }
}

/**
 * Creates a database in the PostgreSQL container after startup.
 *
 * Testcontainers only creates the 'postgres' database by default. This function
 * connects to the container, creates the target database, and updates the
 * container's connection URI to point to the new database.
 *
 * @internal
 * @param startedContainer - The started PostgreSQL container instance
 * @param name - Container identifier for logging purposes
 * @param database - Name of the database to create
 * @throws Error if database name is invalid (SQL injection prevention)
 * @throws Error if database creation fails or connection cannot be established
 */
async function createDatabaseInContainer(
  startedContainer: unknown,
  name: string,
  database: string
): Promise<void> {
  // Validate database name to prevent SQL injection
  validateDatabaseName(database);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg');

  // @ts-expect-error - startedContainer has getConnectionUri method when testcontainers is loaded
  const initialConnectionUri = startedContainer.getConnectionUri();

  // Wait a bit for the container to be fully ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const pool = new Pool({
    connectionString: initialConnectionUri,
    connectionTimeoutMillis: 30000 // Increased for CI environments
  });

  // CRITICAL: Verify connection with retry logic
  let client;
  let retries = 5;
  while (retries > 0) {
    try {
      client = await pool.connect();
      break;
    } catch (err: unknown) {
      retries--;
      if (retries === 0) throw err;
      // eslint-disable-next-line no-console
      console.log(`Connection failed, retrying... (${retries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  try {
    // Verify connection is alive
    await client.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log(`[Postgres Container] Container '${name}' connection verified`);

    // Check if database exists
    const result = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${database}'`);

    if (result.rowCount === 0) {
      // Database doesn't exist, create it
      // eslint-disable-next-line no-console
      console.log(`[Postgres Container] Container '${name}' creating database: ${database}`);
      await client.query(`CREATE DATABASE "${database}"`);
      // eslint-disable-next-line no-console
      console.log(`[Postgres Container] Container '${name}' created database: ${database}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Postgres Container] Container '${name}' database already exists: ${database}`);
    }
  } finally {
    client.release();
  }

  await pool.end();

  // Update the connection URI to point to the new database
  const url = new URL(initialConnectionUri);
  url.pathname = `/${database}`;
  const updatedConnectionUri = url.toString();

  // Store the updated connection URI on the container
  // The user created by Testcontainers is a superuser, so no need for separate URLs
  // @ts-expect-error - We're adding properties to the TestContainer object
  startedContainer.connectionUri = updatedConnectionUri;
  // @ts-expect-error - We're overriding getConnectionUri to return the updated URI
  startedContainer.getConnectionUri = () => updatedConnectionUri;
  // @ts-expect-error - We're adding getSuperuserConnectionUri method
  startedContainer.getSuperuserConnectionUri = () => updatedConnectionUri;
}

/**
 * Starts a named PostgreSQL Testcontainer for integration testing.
 *
 * This function manages named PostgreSQL containers using a Map-based registry,
 * allowing multiple containers to run simultaneously with different configurations
 * (e.g., 'main' for db-core schema, 'events' for db-outbox schema).
 *
 * The container automatically:
 * - Creates the target database (not just 'postgres')
 * - Configures the user as a superuser for migration support
 * - Retries connection with fixed 2-second delay for CI reliability
 *
 * BREAKING CHANGE: The container name is now REQUIRED.
 *
 * @param name - Unique container identifier (e.g., 'main', 'events', 'auth')
 * @param options - Container configuration options
 * @returns The started container instance
 * @throws Error if testcontainers is not installed
 * @throws Error if container fails to start or database creation fails
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * await startPostgresContainer('main');
 * const url = getPostgresConnectionUrl('main');
 * process.env.DATABASE_URL = url;
 *
 * // Multiple containers for multi-database testing
 * await startPostgresContainer('main', { database: 'test_main' });
 * await startPostgresContainer('events', { database: 'test_events' });
 * const mainUrl = getPostgresConnectionUrl('main');
 * const eventsUrl = getPostgresConnectionUrl('events');
 *
 * // Custom image and credentials
 * await startPostgresContainer('custom', {
 *   image: 'postgres:17-alpine',
 *   database: 'custom_db',
 *   username: 'custom_user',
 *   password: 'custom_pass'
 * });
 *
 * // Cleanup after tests
 * await stopPostgresContainer('main');
 * await stopPostgresContainer('events');
 * // Or stop all: await stopPostgresContainer();
 * ```
 */
export async function startPostgresContainer(
  name: string,
  options: IPostgresContainerOptions = {}
): Promise<unknown> {
  if (!PostgreSqlContainer) {
    throw new Error(
      'Testcontainers is not installed. Install it with: pnpm add -D @testcontainers/postgresql testcontainers'
    );
  }

  if (postgresContainers.has(name)) {
    // eslint-disable-next-line no-console
    console.log(`[Postgres Container] Container '${name}' already started, reusing...`);
    const container = postgresContainers.get(name);
    if (!container) {
      throw new Error(`Container '${name}' should exist but was not found in map`);
    }
    return container;
  }

  const {
    image = process.env['TEST_POSTGRES_IMAGE'] || 'postgres:18-alpine',
    database = process.env['TEST_POSTGRES_DATABASE'] || 'test_db',
    username = process.env['TEST_POSTGRES_USER'] || 'test_user',
    password = process.env['TEST_POSTGRES_PASSWORD'] || 'test_password'
  } = options;

  // eslint-disable-next-line no-console
  console.log(`[Postgres Container] Starting container '${name}'...`);

  // CRITICAL: Start with 'postgres' database (always exists in Testcontainers)
  // Testcontainers only creates the 'postgres' database by default
  // We will create the target database (e.g., 'test_db') after startup
  const PostgreSqlContainerClass = PostgreSqlContainer as {
    new (image: string): {
      withDatabase(database: string): {
        withUsername(username: string): {
          withPassword(password: string): { start(): Promise<unknown> };
        };
      };
    };
  };
  const container = new PostgreSqlContainerClass(image)
    .withDatabase('postgres')
    .withUsername(username)
    .withPassword(password);

  const startedContainer = await container.start();

  // CRITICAL: Verify the container is actually started and valid before storing it
  // @ts-expect-error - startedContainer has getConnectionUri method when testcontainers is loaded
  if (!startedContainer || typeof startedContainer.getConnectionUri !== 'function') {
    throw new Error(`Container '${name}' failed to start properly`);
  }

  postgresContainers.set(name, startedContainer);

  // CRITICAL FIX: Create the target database before using it
  // Testcontainers only creates the 'postgres' database by default
  // Drizzle migrations need the target database to exist before creating schemas
  try {
    await createDatabaseInContainer(startedContainer, name, database);

    // eslint-disable-next-line no-console
    console.log(`[Postgres Container] Container '${name}' started successfully`, {
      database,
      name
    });
  } catch (error: unknown) {
    // If database creation fails, clean up and throw
    // Only try to stop if the container has a stop method
    // @ts-expect-error - startedContainer has stop method when testcontainers is loaded
    const stopContainer = startedContainer.stop;
    if (stopContainer && typeof stopContainer === 'function') {
      try {
        await stopContainer();
      } catch (stopError: unknown) {
        console.error(
          `[Postgres Container] Failed to stop container '${name}' during cleanup:`,
          stopError
        );
      }
    }
    postgresContainers.delete(name);
    throw new Error(
      `Failed to create database '${database}' for container '${name}': ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return startedContainer;
}

/**
 * Stops a named PostgreSQL Testcontainer, or all containers if no name is provided.
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
 * await stopPostgresContainer('main');
 *
 * // Stop all containers (useful in global teardown)
 * await stopPostgresContainer();
 *
 * // Typical test lifecycle
 * beforeAll(async () => {
 *   await startPostgresContainer('main');
 * });
 *
 * afterAll(async () => {
 *   await stopPostgresContainer('main');
 * });
 * ```
 */
export async function stopPostgresContainer(name?: string): Promise<void> {
  if (name) {
    // Stop specific container
    const container = postgresContainers.get(name);
    if (container) {
      // @ts-expect-error - container has stop method when testcontainers is loaded
      await container.stop();
      postgresContainers.delete(name);
      // eslint-disable-next-line no-console
      console.log(`[Postgres Container] Container '${name}' stopped`);
    }
  } else {
    // Stop all containers
    const stopPromises = Array.from(postgresContainers.entries()).map(
      async ([containerName, container]) => {
        // @ts-expect-error - container has stop method when testcontainers is loaded
        await container.stop();
        // eslint-disable-next-line no-console
        console.log(`[Postgres Container] Container '${containerName}' stopped`);
      }
    );
    await Promise.all(stopPromises);
    postgresContainers.clear();
  }
}

/**
 * Gets the connection URL for a named PostgreSQL container.
 *
 * Returns the connection URL pointing to the target database (e.g., 'test_db'),
 * not the default 'postgres' database. The URL format is:
 * `postgresql://username:password@host:port/database`
 *
 * @param name - Container identifier
 * @returns PostgreSQL connection URL for the target database
 * @throws Error if container with the given name has not been started
 *
 * @example
 * ```ts
 * // Set environment variable for Drizzle ORM
 * await startPostgresContainer('main');
 * const url = getPostgresConnectionUrl('main');
 * process.env.DATABASE_URL = url;
 *
 * // Use with multiple databases
 * const mainUrl = getPostgresConnectionUrl('main');
 * const eventsUrl = getPostgresConnectionUrl('events');
 * process.env.DATABASE_URL = mainUrl;
 * process.env.EVENTS_DATABASE_URL = eventsUrl;
 * ```
 */
export function getPostgresConnectionUrl(name: string): string {
  const container = postgresContainers.get(name);
  if (!container) {
    throw new Error(
      `PostgreSQL container '${name}' not started. Call startPostgresContainer('${name}') first.`
    );
  }
  // We override getConnectionUri() to return the URL with the target database
  // @ts-expect-error - container has getConnectionUri method when testcontainers is loaded
  return container.getConnectionUri();
}

/**
 * Gets the superuser connection URL for a named PostgreSQL container.
 *
 * Note: Testcontainers creates the user specified in withUsername() as a database
 * superuser with full privileges. This returns the same connection URL as
 * `getPostgresConnectionUrl()` since the user already has CREATE SCHEMA,
 * CREATE TABLE, and other administrative permissions needed for migrations.
 *
 * @param name - Container identifier
 * @returns Superuser connection URL (same as connection URL)
 * @throws Error if container with the given name has not been started
 * @throws Error if superuser URL was not properly configured during startup
 *
 * @example
 * ```ts
 * // Use for administrative operations
 * await startPostgresContainer('main');
 * const superuserUrl = getPostgresSuperuserUrl('main');
 *
 * // Run migrations with superuser privileges
 * const pool = new Pool({ connectionString: superuserUrl });
 * await runMigrations(pool);
 *
 * // Note: For most use cases, getPostgresConnectionUrl() is sufficient
 * // since the Testcontainers user already has superuser privileges
 * ```
 */
export function getPostgresSuperuserUrl(name: string): string {
  const container = postgresContainers.get(name);
  if (!container) {
    throw new Error(
      `PostgreSQL container '${name}' not started. Call startPostgresContainer('${name}') first.`
    );
  }
  // We added this property dynamically to the started container
  // @ts-expect-error - container has getSuperuserConnectionUri method when we add it
  const getSuperuserUrl = container.getSuperuserConnectionUri as (() => string) | undefined;
  if (!getSuperuserUrl) {
    throw new Error('Superuser URL not available. Was the container started correctly?');
  }
  return getSuperuserUrl();
}

/**
 * Gets the raw PostgreSQL container instance by name.
 *
 * Returns the underlying Testcontainers instance for advanced use cases
 * such as accessing container logs, executing commands, or inspecting state.
 *
 * @param name - Container identifier
 * @returns The started container instance, or undefined if not started
 *
 * @example
 * ```ts
 * await startPostgresContainer('main');
 * const container = getPostgresContainer('main');
 *
 * if (container) {
 *   // Access container methods directly
 *   // @ts-expect-error - container has getHost method
 *   const host = container.getHost();
 *   // @ts-expect-error - container has getMappedPort method
 *   const port = container.getMappedPort(5432);
 * }
 * ```
 */
export function getPostgresContainer(name: string): unknown {
  return postgresContainers.get(name);
}

/**
 * Gets all started PostgreSQL container names.
 *
 * Returns an array of container identifiers that have been started and
 * are currently running. Useful for cleanup operations or debugging.
 *
 * @returns Array of container names that are currently running
 *
 * @example
 * ```ts
 * await startPostgresContainer('main');
 * await startPostgresContainer('events');
 *
 * const names = getPostgresContainerNames();
 * console.log(names); // ['main', 'events']
 *
 * // Clean up all containers
 * for (const name of names) {
 *   await stopPostgresContainer(name);
 * }
 * ```
 */
export function getPostgresContainerNames(): string[] {
  return Array.from(postgresContainers.keys());
}

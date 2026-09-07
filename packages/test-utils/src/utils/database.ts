/**
 * Database Utility Functions
 *
 * Core utilities for creating, cleaning, and closing test databases.
 * These functions handle the dual migration pattern required for the outbox pattern:
 *
 * - **db-core migrations**: Core tables (users, organizations, etc.)
 * - **db-outbox migrations**: Event sourcing tables (outbox, events, etc.)
 *
 * Both migration sets are applied to the SAME database to enable transactional
 * consistency between business operations and event publishing.
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { MIGRATIONS_TABLE as EVENTS_MIGRATIONS_TABLE } from '@package/db-outbox';
import * as schema from '@package/db-core';
import { MIGRATIONS_TABLE as MAIN_MIGRATIONS_TABLE } from '@package/db-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Directory containing this script, used to resolve relative paths to migrations */
const SCRIPT_DIRNAME = path.dirname(__filename);

/** Path to db-core migrations folder */
const MIGRATIONS_FOLDER = path.resolve(SCRIPT_DIRNAME, '../../../db-core/drizzle');

/** Path to db-outbox migrations folder */
const EVENTS_MIGRATIONS_FOLDER = path.resolve(SCRIPT_DIRNAME, '../../../db-outbox/drizzle');

/**
 * Pauses execution for a specified number of milliseconds.
 *
 * Used internally for retry logic when database connections fail.
 *
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Redacts credentials from a database connection URL.
 *
 * Replaces the password portion of the URL with '[REDACTED]' to prevent
 * credential exposure in error messages and logs.
 *
 * @param url - Database connection URL (e.g., postgresql://user:password@host/db)
 * @returns URL with password redacted, or '[invalid URL]' if parsing fails
 */
function redactConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '[REDACTED]';
    }
    return parsed.toString();
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Safely extracts error properties without exposing credentials.
 *
 * Filters out properties that may contain sensitive connection information
 * such as passwords, connection strings, or authentication tokens.
 *
 * @param error - The error object to sanitize
 * @returns A sanitized object safe for logging/error messages
 */
function sanitizeErrorForLogging(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { type: 'null_or_undefined' };
  }

  if (typeof error !== 'object') {
    return { type: typeof error, value: String(error) };
  }

  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /credential/i,
    /connectionString/i,
    /connection_string/i,
    /auth/i,
    /token/i,
    /key/i,
    /cert/i,
    /ssl/i
  ];

  const sanitized: Record<string, unknown> = {};
  const errorObj = error as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(errorObj)) {
    // Skip properties that might contain credentials
    if (sensitivePatterns.some((pattern) => pattern.test(key))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    const value = errorObj[key];

    // Redact string values that look like connection URLs
    if (typeof value === 'string' && value.includes('://')) {
      sanitized[key] = redactConnectionUrl(value);
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      // For arrays (like stacktrace), keep string values only
      sanitized[key] = value.filter((v) => typeof v === 'string');
    } else {
      sanitized[key] = '[object]';
    }
  }

  return sanitized;
}

/**
 * Represents a test database instance with both Drizzle ORM client and raw pg Pool.
 *
 * The `db` property provides type-safe Drizzle queries with schema inference.
 * The `pool` property provides access to the underlying pg Pool for raw SQL
 * queries or advanced operations not supported by Drizzle.
 *
 * @example Using the ITestDatabase instance
 * ```ts
 * const testDb: ITestDatabase = await createTestDatabase(connectionUrl);
 *
 * // Type-safe Drizzle queries
 * const users = await testDb.db.select().from(usersTable);
 *
 * // Raw SQL when needed
 * const result = await testDb.pool.query('SELECT COUNT(*) FROM users');
 *
 * // Clean up when done
 * await closeTestDatabase(testDb.pool);
 * ```
 */
export interface ITestDatabase {
  /** Drizzle ORM client with db-core schema inference */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Raw pg Pool for direct database access */
  pool: Pool;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Validates that the migrations folder exists.
 *
 * @throws {Error} If migrations folder not found
 */
function validateMigrationsFolder(): void {
  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    throw new Error(
      `Migrations folder not found at: ${MIGRATIONS_FOLDER}\n` +
        `Run: pnpm db:generate db-core\n` +
        `This will create the drizzle/ folder with migration files.`
    );
  }
}

/**
 * Creates a PostgreSQL connection pool configured for test environment.
 *
 * @param databaseUrl - PostgreSQL connection URL
 * @returns Configured Pool instance
 */
function buildTestPool(databaseUrl: string): Pool {
  // CRITICAL: Increase connectionTimeoutMillis for GitHub Actions
  // CI environments have slower Docker networking than local development
  return new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000, // Increased from 5000 to 30000ms for CI
    statement_timeout: 10000
  });
}

/**
 * Verifies database connection by executing a simple query.
 *
 * @param pool - PostgreSQL connection pool
 * @param attempt - Current retry attempt number
 * @param maxRetries - Maximum number of retries
 * @throws {Error} If connection verification fails
 */
async function verifyConnection(pool: Pool, attempt: number, maxRetries: number): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[DB] Verifying connection (attempt ${attempt}/${maxRetries})...`);
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log('[DB] Connection verified successfully');
  } finally {
    client.release();
  }
}

/**
 * Checks if an error is a connection-related error that might be resolved by retrying.
 *
 * @param error - The error to check
 * @returns True if this is a retryable connection error
 */
function isRetryableConnectionError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes('connect') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('Connection terminated') ||
    errorMessage.includes('getaddrinfo')
  );
}

/**
 * Creates a sanitized error message for throwing, with credentials redacted.
 *
 * @param error - The original error
 * @param attempt - Number of attempts made
 * @param databaseUrl - Database URL (will be redacted)
 * @returns Sanitized error message
 */
function createSanitizedErrorMessage(error: unknown, attempt: number, databaseUrl: string): string {
  const sanitizedError = sanitizeErrorForLogging(error);
  const redactedUrl = redactConnectionUrl(databaseUrl);

  // Extract sanitized message and stack from the sanitized error object
  const sanitizedMessage =
    typeof sanitizedError['message'] === 'string' ? sanitizedError['message'] : 'Unknown error';
  const sanitizedStack = typeof sanitizedError['stack'] === 'string' ? sanitizedError['stack'] : '';

  return (
    `Failed to run migrations after ${attempt} attempt(s)\n` +
    `Error: ${sanitizedMessage}\n` +
    `Database URL: ${redactedUrl}\n` +
    `Stack: ${sanitizedStack}\n\n` +
    `Error details: ${JSON.stringify(sanitizedError, null, 2)}`
  );
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Runs database migrations on an existing test database.
 *
 * This function applies both db-core and db-outbox migrations to an existing
 * database connection. Use this after calling `cleanTestDatabase()` to restore
 * the database schema.
 *
 * **Important**: This requires the migration folders to exist. If they don't,
 * the function will log warnings but won't fail for missing events migrations.
 *
 * @param testDb - The test database instance (db and pool)
 * @returns Promise that resolves when migrations are complete
 * @throws {Error} If main migrations folder doesn't exist
 * @throws {Error} If migrations fail to apply
 *
 * @example Re-apply migrations after cleanup
 * ```ts
 * await cleanTestDatabase(testDb.pool);
 * await runMigrations(testDb);
 * // Database now has fresh schema with all tables
 * ```
 */
export async function runMigrations(testDb: ITestDatabase): Promise<void> {
  const { db, pool } = testDb;

  // Validate migrations folder exists
  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    throw new Error(
      `Migrations folder not found at: ${MIGRATIONS_FOLDER}\n` +
        `Run: pnpm db:generate db-core\n` +
        `This will create the drizzle/ folder with migration files.`
    );
  }

  // Run db-core migrations
  // eslint-disable-next-line no-console
  console.log('[DB] Running main database migrations...');
  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: MAIN_MIGRATIONS_TABLE
  });
  // eslint-disable-next-line no-console
  console.log('[DB] Main database migrations completed successfully');

  // Run db-outbox migrations if folder exists
  if (fs.existsSync(EVENTS_MIGRATIONS_FOLDER)) {
    // eslint-disable-next-line no-console
    console.log('[DB] Running events database migrations...');
    try {
      await migrate(db, {
        migrationsFolder: EVENTS_MIGRATIONS_FOLDER,
        migrationsTable: EVENTS_MIGRATIONS_TABLE
      });
      // eslint-disable-next-line no-console
      console.log('[DB] Events database migrations completed successfully');

      // Verify outbox table was created
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'outbox')`
      );
      // eslint-disable-next-line no-console
      console.log(`[DB] Outbox table exists after migration: ${result.rows[0].exists}`);
    } catch (migrationError) {
      console.error('[DB] Events migration error:', sanitizeErrorForLogging(migrationError));
      throw migrationError;
    }
  } else {
    console.warn('[DB] Events migrations folder not found, skipping...');
  }
}

/**
 * Creates a test database with both db-core and db-outbox migrations applied.
 *
 * This is the core function for initializing a test database. It:
 * 1. Validates that migration folders exist
 * 2. Creates a connection pool with CI-optimized timeouts
 * 3. Verifies database connectivity with retry logic
 * 4. Runs db-core migrations (users, organizations, etc.)
 * 5. Runs db-outbox migrations (outbox table for event sourcing)
 *
 * **Dual Migration Pattern**:
 * Both `db-core` and `db-outbox` migrations run on the SAME database.
 * This is required for the outbox pattern where a single transaction must:
 * - Insert/update business entities (from db-core schema)
 * - Insert outbox events (from db-outbox schema)
 *
 * **Migrations Tables**:
 * Each package uses its own migrations tracking table to prevent conflicts:
 * - `drizzle_main_migrations` for db-core
 * - `drizzle_events_migrations` for db-outbox
 *
 * **Connection Requirements**:
 * For Testcontainers, you must pass the superuser URL (not test_user) because
 * migrations need permission to create schemas and extensions.
 *
 * **Retry Logic**:
 * The function retries up to 5 times with 2-second delays for connection errors.
 * This handles flaky Docker networking in CI environments (GitHub Actions).
 *
 * @param databaseUrl - PostgreSQL connection URL (use superuser for Testcontainers)
 * @returns ITestDatabase instance with Drizzle client and pg Pool
 * @throws {Error} If migrations folder not found
 * @throws {Error} If database connection fails after all retries
 * @throws {Error} If migrations fail to apply
 *
 * @example Basic usage with Testcontainers
 * ```ts
 * import { createTestDatabase, closeTestDatabase } from '@package/test-utils';
 * import { getPostgresSuperuserUrl, startPostgresContainer } from '@package/test-utils';
 *
 * // Start container and get superuser URL
 * await startPostgresContainer('main');
 * const superuserUrl = getPostgresSuperuserUrl('main');
 *
 * // Create database with migrations
 * const testDb = await createTestDatabase(superuserUrl);
 *
 * // Use the database
 * const users = await testDb.db.select().from(usersTable);
 *
 * // Clean up
 * await closeTestDatabase(testDb.pool);
 * ```
 *
 * @example With error handling
 * ```ts
 * try {
 *   const testDb = await createTestDatabase(connectionUrl);
 *   // ... run tests ...
 * } catch (error) {
 *   if (error.message.includes('Migrations folder not found')) {
 *     console.error('Run: pnpm db:generate db-core');
 *   } else if (error.message.includes('Failed to run migrations')) {
 *     console.error('Database connection or migration error');
 *   }
 *   throw error;
 * }
 * ```
 */
export async function createTestDatabase(databaseUrl: string): Promise<ITestDatabase> {
  validateMigrationsFolder();

  const pool = buildTestPool(databaseUrl);
  const db = drizzle(pool, { schema });
  const testDb: ITestDatabase = { db, pool };

  // CRITICAL: Add retry logic with connection verification
  // GitHub Actions Docker networking can be flaky on first connection
  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await verifyConnection(pool, attempt, maxRetries);
      await runMigrations(testDb);
      return testDb;
    } catch (error: unknown) {
      // Log sanitized error details (credentials redacted)
      const sanitizedError = sanitizeErrorForLogging(error);

      console.error(`[DB] Attempt ${attempt}/${maxRetries} failed:`, sanitizedError['message']);

      console.error('[DB] Error details:', sanitizedError);

      if (attempt < maxRetries && isRetryableConnectionError(error)) {
        // eslint-disable-next-line no-console
        console.log(`[DB] Retrying in ${retryDelay}ms...`);
        await sleep(retryDelay);
        continue;
      }

      // Clean up on failure
      await pool.end();

      throw new Error(createSanitizedErrorMessage(error, attempt, databaseUrl));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected error in database migration retry logic');
}

/**
 * Cleans the test database by dropping and recreating the public schema.
 *
 * This is a fast way to reset the database to a clean state. It removes
 * all tables, views, functions, and data in the public schema, then
 * recreates the schema with default permissions.
 *
 * **Important**: After calling this function, you need to re-run migrations
 * or re-initialize the database to use it again. This is typically handled
 * by the test framework's setup logic.
 *
 * **Performance**: This is faster than `TRUNCATE` on individual tables
 * because it bypasses foreign key checks and triggers.
 *
 * @param pool - The pg Pool instance to use for the cleanup
 * @returns Promise that resolves when cleanup is complete
 *
 * @example Cleaning database between tests
 * ```ts
 * import { cleanTestDatabase, getTestDb } from '@package/test-utils';
 *
 * describe('MyService', () => {
 *   afterEach(async () => {
 *     const { pool } = getTestDb();
 *     await cleanTestDatabase(pool);
 *   });
 *
 *   it('should work with clean database', async () => {
 *     // Each test starts with an empty database
 *   });
 * });
 * ```
 *
 * @example Manual cleanup
 * ```ts
 * const { pool } = await createTestDatabase(connectionUrl);
 *
 * // ... run some tests that create data ...
 *
 * // Reset to clean state
 * await cleanTestDatabase(pool);
 *
 * // Note: Tables are gone, need to re-run migrations to use again
 * ```
 */
export async function cleanTestDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Drop and recreate schema
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
  } finally {
    client.release();
  }
}

/**
 * Closes the test database connection pool.
 *
 * Gracefully terminates all connections in the pool and releases resources.
 * Call this in `afterAll()` or during teardown to prevent connection leaks.
 *
 * **Important**: After calling this function, the pool cannot be reused.
 * Any subsequent queries will fail.
 *
 * @param pool - The pg Pool instance to close
 * @returns Promise that resolves when all connections are closed
 *
 * @example Standard teardown pattern
 * ```ts
 * import { createTestDatabase, closeTestDatabase } from '@package/test-utils';
 *
 * let testDb: ITestDatabase;
 *
 * beforeAll(async () => {
 *   testDb = await createTestDatabase(connectionUrl);
 * });
 *
 * afterAll(async () => {
 *   await closeTestDatabase(testDb.pool);
 * });
 * ```
 *
 * @example In global teardown
 * ```ts
 * // jest.global-teardown.ts
 * export default async function globalTeardown(): Promise<void> {
 *   const testDb = getTestDb();
 *   await closeTestDatabase(testDb.pool);
 * }
 * ```
 */
export async function closeTestDatabase(pool: Pool): Promise<void> {
  await pool.end();
}

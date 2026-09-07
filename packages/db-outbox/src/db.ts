/**
 * Lazy-initialized database connection for the events database.
 *
 * This module provides a Drizzle ORM database instance that is lazily initialized
 * using the Proxy pattern. The connection is not established until the first
 * database operation is performed, allowing environment variables to be set
 * before the connection is created.
 *
 * ## Why Lazy Initialization?
 *
 * In testing scenarios, the database URL may not be known at module load time.
 * Tests often use Testcontainers which provides the database URL after the
 * container starts. The Proxy pattern defers connection creation until the
 * database is actually used.
 *
 * ## Connection String Resolution
 *
 * The connection string is resolved in this order:
 * 1. `EVENTS_DATABASE_URL` environment variable (preferred)
 * 2. `DATABASE_URL` environment variable (fallback)
 *
 * ## Pool Management
 *
 * The module automatically detects when the connection string changes and
 * recreates the pool. This is important for tests that may use different
 * database containers across test suites.
 *
 * @module @package/db-outbox/db
 */
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Redacts credentials from a PostgreSQL connection string for safe logging.
 *
 * Connection strings follow the format: postgresql://user:password@host:port/database
 * This function masks the password portion to prevent credential leakage in logs.
 *
 * @param connectionString - The connection string to redact
 * @returns A redacted version safe for logging
 * @internal
 */
function redactConnectionString(connectionString: string | undefined): string {
  if (!connectionString) {
    return '<not set>';
  }

  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***REDACTED***';
    }
    return url.toString();
  } catch {
    // If URL parsing fails, use regex fallback to mask password
    // Matches :password@ in connection strings
    return connectionString.replace(/:([^:@]+)@/, ':***REDACTED***@');
  }
}

/**
 * Database connection pool instance.
 * @internal Managed by {@link getPool}, not exported directly.
 */
let pool: Pool | null = null;

/**
 * Tracks the connection string used to create the current pool.
 * @internal Used to detect connection string changes.
 */
let currentConnectionString: string | undefined = undefined;

/**
 * Gets or creates the PostgreSQL connection pool.
 *
 * This function implements lazy initialization with automatic pool recreation
 * when the connection string changes. This is essential for testing scenarios
 * where different test suites may use different database containers.
 *
 * @returns The PostgreSQL connection pool instance
 *
 * @remarks
 * - Uses `EVENTS_DATABASE_URL` or falls back to `DATABASE_URL`
 * - Automatically closes old pool if connection string changes
 * - Logs pool creation and recreation for debugging
 *
 * @example
 * ```typescript
 * import { getPool } from '@package/db-outbox';
 *
 * // Direct pool access (advanced use cases)
 * const pool = getPool();
 * const client = await pool.connect();
 * try {
 *   const result = await client.query('SELECT NOW()');
 *   console.log(result.rows[0]);
 * } finally {
 *   client.release();
 * }
 * ```
 */
function getPool(): Pool {
  const connectionString = process.env['EVENTS_DATABASE_URL'] || process.env['DATABASE_URL'];

  // If pool exists but connection string changed, reset the pool
  // This ensures tests get a fresh connection when env vars change
  if (pool && currentConnectionString !== connectionString) {
    // eslint-disable-next-line no-console
    console.log(
      `[db-outbox] Connection string changed, resetting pool. Old: ${redactConnectionString(currentConnectionString)} New: ${redactConnectionString(connectionString)}`
    );
    pool.end().catch(() => {
      // Ignore errors during pool cleanup
    });
    pool = null;
  }

  if (!pool) {
    // eslint-disable-next-line no-console
    console.log(
      `[db-outbox] Creating new pool with connection string: ${redactConnectionString(connectionString)}`
    );
    pool = new Pool({
      connectionString
    });
    currentConnectionString = connectionString;
  }
  return pool;
}

/**
 * Gets or creates the Drizzle ORM instance.
 *
 * @internal Used by the {@link db} proxy to create the database instance on demand.
 * @returns The Drizzle ORM database instance configured with the outbox schema
 */
function getDb(): NodePgDatabase<typeof schema> {
  return drizzle(getPool(), { schema });
}

/**
 * Lazy-initialized Drizzle ORM database instance.
 *
 * This is a Proxy that defers database connection until the first property access.
 * This allows tests to set `EVENTS_DATABASE_URL` before any database operation,
 * even if this module was imported earlier.
 *
 * ## Proxy Pattern
 *
 * The Proxy intercepts all property accesses and delegates them to a freshly
 * obtained Drizzle instance. This ensures:
 * - Connection is created on first use, not on module load
 * - Environment variable changes are detected and handled
 * - The database instance always uses the current connection string
 *
 * @example
 * ```typescript
 * import { db, outbox, OutboxStatus } from '@package/db-outbox';
 * import { eq, and } from 'drizzle-orm';
 *
 * // Query pending events (always filter by tenantId for multi-tenant isolation)
 * const pendingEvents = await db
 *   .select()
 *   .from(outbox)
 *   .where(
 *     and(
 *       eq(outbox.tenantId, currentTenantId),
 *       eq(outbox.status, OutboxStatus.PENDING)
 *     )
 *   )
 *   .limit(100);
 *
 * // Insert a new event (always include tenantId for tenant isolation)
 * await db.insert(outbox).values({
 *   tenantId: currentTenantId,
 *   eventId: crypto.randomUUID(),
 *   eventType: 'user.created',
 *   aggregateId: userId,
 *   payload: { userId, action: 'registered' }
 * });
 *
 * // Use transactions for atomic operations (ensure tenantId in all records)
 * await db.transaction(async (tx) => {
 *   await tx.insert(outbox).values({ ...event1, tenantId: currentTenantId });
 *   await tx.insert(outbox).values({ ...event2, tenantId: currentTenantId });
 * });
 * ```
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    const dbInstance = getDb();
    return dbInstance[prop as keyof typeof dbInstance];
  },
  has(_target, prop) {
    const dbInstance = getDb();
    return prop in dbInstance;
  },
  ownKeys() {
    const dbInstance = getDb();
    return Object.getOwnPropertyNames(dbInstance);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const dbInstance = getDb();
    return Object.getOwnPropertyDescriptor(dbInstance, prop);
  }
});

/**
 * Resets the database connection pool.
 *
 * Call this function in tests before setting new environment variables to ensure
 * the next database access creates a new connection with the updated URL.
 * This is essential when using Testcontainers, where each test suite may
 * spin up a new database container with a different connection string.
 *
 * ## When to Use
 *
 * - Before setting `EVENTS_DATABASE_URL` in test setup
 * - When switching between different database containers
 * - In `afterAll` hooks to clean up connections
 *
 * @returns A promise that resolves when the pool is closed
 *
 * @example
 * ```typescript
 * import { resetPool } from '@package/db-outbox';
 * import { PostgreSqlContainer } from '@testcontainers/postgresql';
 *
 * describe('OutboxRepository', () => {
 *   let container: StartedPostgreSqlContainer;
 *
 *   beforeAll(async () => {
 *     // Reset any existing pool before starting new container
 *     await resetPool();
 *
 *     // Start a fresh database container
 *     container = await new PostgreSqlContainer().start();
 *     process.env.EVENTS_DATABASE_URL = container.getConnectionUri();
 *   });
 *
 *   afterAll(async () => {
 *     // Clean up the pool and container
 *     await resetPool();
 *     await container.stop();
 *   });
 *
 *   it('should insert events', async () => {
 *     // Tests use the new container's connection
 *   });
 * });
 * ```
 */
export async function resetPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    currentConnectionString = undefined;
  }
}

/**
 * Export pool getter for direct access when needed.
 *
 * @remarks
 * Prefer using the {@link db} Drizzle instance for most operations.
 * Direct pool access is useful for:
 * - Raw SQL queries not supported by Drizzle
 * - Connection management in advanced scenarios
 * - Debugging connection issues
 *
 * @see {@link getPool} for documentation
 */
export { getPool };

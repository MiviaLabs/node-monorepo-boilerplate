/**
 * @fileoverview Database connection configuration for the main application database.
 *
 * This module provides the primary database connection for the application using
 * Drizzle ORM with node-postgres. It exports a configured Drizzle instance with
 * full schema awareness for type-safe queries.
 *
 * ## Architecture
 *
 * The main database (`db-core`) stores core application entities:
 * - Users and authentication
 * - Tenants and organizations
 * - User roles and permissions
 * - encrypted-store entries for sensitive data
 * - API keys
 *
 * For event sourcing data, use the separate `@package/db-outbox` package.
 *
 * ## Connection Strategy
 *
 * This module uses lazy initialization - the connection pool is created on first
 * access rather than at module load time. This enables:
 * - Test environments to set DATABASE_URL before first database access
 * - Testcontainers to provide dynamic connection strings
 * - Graceful handling when database is not yet available
 *
 * @module @package/db-core
 *
 * See also: `@package/db-outbox` for event store database connections
 *
 * @example Basic query usage with tenant scoping
 * ```typescript
 * import { db } from '@package/db-core';
 * import { users, eq, and } from '@package/db-core/schema';
 *
 * // Type-safe query with tenant isolation
 * const user = await db.query.users.findFirst({
 *   where: and(
 *     eq(users.id, userId),
 *     eq(users.organizationId, currentOrgId)
 *   )
 * });
 * ```
 *
 * @example Transaction usage with proper relationships
 * ```typescript
 * import { db } from '@package/db-core';
 * import { users, organizations } from '@package/db-core/schema';
 *
 * await db.transaction(async (tx) => {
 *   const [org] = await tx.insert(organizations).values({ name: 'Acme' }).returning();
 *   await tx.insert(users).values({
 *     emailHash: sha256(email.toLowerCase()),
 *     emailEncrypted: encrypt(email),
 *     organizationId: org.id
 *   });
 * });
 * ```
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** Internal type alias for the Drizzle database instance with schema */
type MainDbInstance = NodePgDatabase<typeof schema>;

// Database connection pool (lazy initialization)
let _pool: Pool | null = null;
// Cached Drizzle instance (lazy initialization)
let _db: MainDbInstance | null = null;
// Track the connection string used to create the current pool
let _currentConnectionString: string | undefined = undefined;

/**
 * Get or create the PostgreSQL connection pool.
 *
 * The pool manages connections efficiently, reusing connections across queries
 * and automatically handling connection lifecycle. It reads the connection
 * string from the `DATABASE_URL` environment variable.
 *
 * This function uses lazy initialization - the pool is created on first call.
 * If the connection string changes (e.g., in tests), the pool is automatically
 * reset and recreated with the new connection string.
 *
 * @returns The PostgreSQL connection pool
 * @throws {Error} If DATABASE_URL environment variable is not set
 *
 * @example Health check using pool
 * ```typescript
 * import { getPool } from '@package/db-core';
 *
 * async function healthCheck(): Promise<boolean> {
 *   try {
 *     const pool = getPool();
 *     const client = await pool.connect();
 *     await client.query('SELECT 1');
 *     client.release();
 *     return true;
 *   } catch {
 *     return false;
 *   }
 * }
 * ```
 *
 * @example Pool statistics
 * ```typescript
 * import { getPool } from '@package/db-core';
 *
 * const pool = getPool();
 * console.log({
 *   total: pool.totalCount,
 *   idle: pool.idleCount,
 *   waiting: pool.waitingCount
 * });
 * ```
 */
export function getPool(): Pool {
  const connectionString = process.env['DATABASE_URL'];

  // Validate connection string on first access
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required but not set. ' +
        'Please set DATABASE_URL to a valid PostgreSQL connection string.'
    );
  }

  // If pool exists but connection string changed, reset the pool and cached db
  // This ensures tests get a fresh connection when env vars change
  if (_pool && _currentConnectionString !== connectionString) {
    _pool.end().catch(() => {
      // Ignore errors during pool cleanup
    });
    _pool = null;
    _db = null;
  }

  if (!_pool) {
    _pool = new Pool({
      connectionString
    });
    _currentConnectionString = connectionString;
  }

  return _pool;
}

/**
 * Get or create the Drizzle database instance.
 *
 * Uses lazy initialization with caching - the Drizzle instance is created
 * on first access and reused for subsequent calls. The instance is automatically
 * reset when the connection pool changes (e.g., when DATABASE_URL changes).
 *
 * @returns Drizzle database instance with schema
 */
function getDb(): MainDbInstance {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

/**
 * Drizzle ORM database instance configured with the main application schema.
 *
 * This is the primary export for database operations. It provides:
 * - Type-safe queries with full schema inference
 * - Relational query builder (`db.query.*`)
 * - Insert/update/delete operations with type checking
 * - Transaction support with rollback on error
 *
 * The instance uses lazy initialization via a Proxy - the actual connection
 * is not created until the first database operation. This allows test
 * environments to set DATABASE_URL before the first access.
 *
 * @example Query builder syntax with tenant isolation
 * ```typescript
 * import { db } from '@package/db-core';
 * import { users, eq, and, isNull } from '@package/db-core/schema';
 *
 * const activeUsers = await db
 *   .select()
 *   .from(users)
 *   .where(and(
 *     eq(users.organizationId, currentOrgId),
 *     eq(users.isActive, true),
 *     isNull(users.deletedAt)
 *   ));
 * ```
 *
 * @example Relational queries with tenant isolation
 * ```typescript
 * import { db } from '@package/db-core';
 * import { users, eq } from '@package/db-core/schema';
 *
 * // Uses schema relations for type-safe joins with tenant scoping
 * const usersWithTenants = await db.query.users.findMany({
 *   where: eq(users.organizationId, currentOrgId),
 *   with: {
 *     userTenants: {
 *       with: { tenant: true }
 *     }
 *   }
 * });
 * ```
 *
 * @see {@link getPool} For direct PostgreSQL pool access
 * @see {@link https://orm.drizzle.team/docs/rqb | Drizzle Relational Queries}
 */
export const db: MainDbInstance = new Proxy({} as MainDbInstance, {
  get(_target, prop) {
    const dbInstance = getDb();
    return dbInstance[prop as keyof MainDbInstance];
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
 * Reset the database connection pool.
 *
 * Call this in tests before setting new environment variables to ensure
 * the next database access uses the correct connection string.
 *
 * @example
 * ```typescript
 * import { resetPool } from '@package/db-core';
 *
 * beforeEach(async () => {
 *   await resetPool();
 *   process.env.DATABASE_URL = 'postgres://...';
 * });
 * ```
 */
export async function resetPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    _currentConnectionString = undefined;
  }
}

/**
 * Legacy export for backwards compatibility.
 *
 * @deprecated Use `getPool()` instead for lazy initialization.
 * Direct pool access will throw if DATABASE_URL is not set.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const poolInstance = getPool();
    return poolInstance[prop as keyof Pool];
  },
  has(_target, prop) {
    const poolInstance = getPool();
    return prop in poolInstance;
  },
  ownKeys() {
    const poolInstance = getPool();
    return Object.getOwnPropertyNames(poolInstance);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const poolInstance = getPool();
    return Object.getOwnPropertyDescriptor(poolInstance, prop);
  }
});

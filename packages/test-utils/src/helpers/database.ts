/**
 * Test Database Helper for E2E Tests
 *
 * Provides database utilities for E2E tests that depend on @package/test-utils.
 * These helpers wrap the lower-level database utilities with E2E-specific patterns.
 *
 * ## Usage with Lazy Imports
 *
 * For Nx module boundary compliance, use lazy imports in E2E test files:
 *
 * ```ts
 * const { setupE2ETestDatabaseJest, cleanTestDatabase } = await import('@package/test-utils');
 * ```
 *
 * @packageDocumentation
 */

import { cleanTestDatabase as cleanDbPool } from '../utils/database';

import type { ITestDatabase } from '../utils/database';
import type { Pool } from 'pg';

/**
 * Sets up an E2E test database for Jest tests.
 *
 * Auto-detects whether to use a global test database or start a new Testcontainers instance.
 *
 * **Global Mode**: If `.test-db-connection.json` exists (created by `global-test-db.ts`),
 * connects to the pre-existing global database. This is faster for E2E test suites.
 *
 * **Isolated Mode**: If no global database is found, starts a fresh PostgreSQL Testcontainer,
 * runs both db-core and db-outbox migrations, and sets DATABASE_URL environment variable.
 *
 * **Critical**: This runs BOTH main and events migrations on the same database.
 * This is required for the outbox pattern to work correctly.
 *
 * @returns Promise that resolves when setup is complete
 * @throws {Error} If database setup fails
 *
 * @example Basic E2E test setup
 * ```ts
 * import { describe, it, beforeAll, afterAll } from '@jest/globals';
 *
 * describe('E2E Tests', () => {
 *   beforeAll(async () => {
 *     const { setupE2ETestDatabaseJest } = await import('@package/test-utils');
 *     await setupE2ETestDatabaseJest();
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     const { teardownTestDatabase } = await import('@package/test-utils');
 *     await teardownTestDatabase();
 *   });
 *
 *   it('should work with test database', async () => {
 *     // Test implementation
 *   });
 * });
 * ```
 */
export async function setupE2ETestDatabaseJest(): Promise<void> {
  // Delegate to setupTestDatabaseJest which handles both global and isolated modes
  const { setupTestDatabaseJest: setupDb } = await import('./setup');
  await setupDb();
}

/**
 * Closes the database connection pool.
 *
 * Gracefully terminates all database connections and releases resources.
 * Safe to call with null/undefined pool (no-op in that case).
 *
 * @param pool - Database pool to close (may be null/undefined)
 * @returns Promise that resolves when pool is closed
 *
 * @example Standard cleanup in afterAll
 * ```ts
 * let testDb: ITestDatabase;
 *
 * afterAll(async () => {
 *   const { closeTestDatabase } = await import('@package/test-utils');
 *   await closeTestDatabase(testDb?.pool);
 * });
 * ```
 *
 * @example Safe cleanup with error handling
 * ```ts
 * afterAll(async () => {
 *   const { closeTestDatabase } = await import('@package/test-utils');
 *   try {
 *     await closeTestDatabase(testDb?.pool);
 *   } catch (error) {
 *     console.error('Failed to close database pool:', error);
 *     // Continue with cleanup even if pool close fails
 *   }
 * });
 * ```
 */
export async function closeTestDatabase(pool: Pool): Promise<void> {
  if (pool) {
    await pool.end();
  }
}

/**
 * Cleans up all test data from the database.
 *
 * Drops and recreates the public schema, removing all tables, views,
 * and data. Use this between tests to ensure isolation.
 *
 * **Warning**: This is destructive and removes ALL data. Only use in tests.
 *
 * **Note**: After cleanup, migrations are NOT automatically re-run.
 * This is typically handled by the test framework's setup logic.
 *
 * @param db - ITestDatabase instance to clean
 * @returns Promise that resolves when cleanup is complete
 *
 * @example Per-test cleanup for isolation
 * ```ts
 * describe('OrderService E2E', () => {
 *   let testDb: ITestDatabase;
 *
 *   beforeAll(async () => {
 *     const { setupE2ETestDatabaseJest } = await import('@package/test-utils');
 *     testDb = await setupE2ETestDatabaseJest(connectionUrl);
 *   }, 60000);
 *
 *   afterEach(async () => {
 *     const { cleanTestDatabase } = await import('@package/test-utils');
 *     await cleanTestDatabase(testDb);
 *   });
 *
 *   it('should create an order', async () => {
 *     // Test runs with clean database
 *   });
 *
 *   it('should list orders (empty after cleanup)', async () => {
 *     // Previous test's data is gone
 *   });
 * });
 * ```
 *
 * @example With multi-tenant test data recreation
 * ```ts
 * let testDb: ITestDatabase;
 * let org1Id: number;
 * let org2Id: number;
 *
 * afterEach(async () => {
 *   const { cleanTestDatabase } = await import('@package/test-utils');
 *   await cleanTestDatabase(testDb);
 *
 *   // Re-create base test data after cleanup
 *   org1Id = await createTestOrganization(testDb, 'Org 1');
 *   org2Id = await createTestOrganization(testDb, 'Org 2');
 * });
 * ```
 */
export async function cleanTestDatabase(db: ITestDatabase): Promise<void> {
  await cleanDbPool(db.pool);
}

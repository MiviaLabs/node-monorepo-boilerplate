/**
 * Test Database Setup Helpers
 *
 * Provides utilities for setting up and tearing down test databases for E2E tests.
 * Supports two modes:
 *
 * 1. **Isolated mode** (`setupTestDatabaseJest`): Starts a fresh Testcontainers instance
 *    for each test file. Slower but fully isolated.
 *
 * 2. **Global mode** (`setupGlobalTestDatabaseJest`): Connects to a pre-existing
 *    Testcontainers instance started by `global-test-db.ts`. Faster for E2E test suites.
 *
 * Both modes run BOTH `db-core` and `db-outbox` migrations on the same database,
 * which is required for the outbox pattern to work correctly.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import {
  startPostgresContainer,
  stopPostgresContainer,
  getPostgresSuperuserUrl,
  getPostgresConnectionUrl
} from '../containers/postgres.container';
import {
  createTestDatabase,
  closeTestDatabase,
  cleanTestDatabase,
  runMigrations,
  ITestDatabase
} from '../utils/database';

/** Module-level test database instance */
let testDb: ITestDatabase | null = null;

/** Flag indicating if database setup has been completed */
let isSetup = false;

/** Flag indicating if using global database mode */
let isGlobalMode = false;

/**
 * Extended globalThis with E2E test cleanup function.
 * Used for Jest global teardown integration.
 */
declare global {
  var __E2E_TEST_CLEANUP__: (() => Promise<void>) | undefined;
}

/**
 * Reads the global test database connection URL from the `.test-db-connection.json` file.
 *
 * This file is created by `global-test-db.ts` when starting a global database server.
 * It contains connection information for both main and events databases.
 *
 * File format (current):
 * ```json
 * {
 *   "databases": {
 *     "main": { "connectionUrl": "postgresql://..." },
 *     "events": { "connectionUrl": "postgresql://..." }
 *   }
 * }
 * ```
 *
 * File format (legacy):
 * ```json
 * {
 *   "connectionUrl": "postgresql://..."
 * }
 * ```
 *
 * @returns The main database connection URL, or null if file doesn't exist or is invalid
 *
 * @example
 * ```ts
 * const url = getGlobalTestDatabaseUrl();
 * if (url) {
 *   console.log('Global database is running at:', url);
 * } else {
 *   console.log('No global database found, will start a new container');
 * }
 * ```
 */
function getGlobalTestDatabaseUrl(): string | null {
  const connectionFile = resolve(process.cwd(), '.test-db-connection.json');

  if (!existsSync(connectionFile)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(connectionFile, 'utf-8')) as {
      databases?: {
        main?: { connectionUrl?: string };
        events?: { connectionUrl?: string };
      };
      connectionUrl?: string; // Legacy format
    };

    // New format: multiple databases
    if (data.databases?.main?.connectionUrl) {
      return data.databases.main.connectionUrl;
    }

    // Legacy format: single database
    return data.connectionUrl || null;
  } catch {
    return null;
  }
}

/**
 * Sets up an isolated test database for a single test file (Jest-compatible).
 *
 * Starts a fresh PostgreSQL Testcontainer, runs both `db-core` and `db-outbox`
 * migrations, and sets the `DATABASE_URL` and `EVENTS_DATABASE_URL` environment
 * variables. The container is stopped when `teardownTestDatabase()` is called.
 *
 * Use this for isolated test files or when you need a completely fresh database
 * state. For faster E2E test suites, consider `setupGlobalTestDatabaseJest()`.
 *
 * **Critical**: This runs BOTH main and events migrations on the same database.
 * This is required for the outbox pattern to work correctly, as transactions
 * must span both main tables (users, organizations) and events tables (outbox).
 *
 * **Environment Variables Set**:
 * - `DATABASE_URL`: Points to the test database for the API
 * - `EVENTS_DATABASE_URL`: Points to the same database (outbox pattern)
 *
 * @returns Promise that resolves when setup is complete
 *
 * @example Basic isolated test setup
 * ```ts
 * import { setupTestDatabaseJest, teardownTestDatabase } from '@package/test-utils';
 *
 * describe('UserRepository', () => {
 *   beforeAll(async () => {
 *     // Starts a fresh PostgreSQL container with migrations
 *     await setupTestDatabaseJest();
 *   }, 60000); // Allow 60s for container startup
 *
 *   afterAll(async () => {
 *     // Stops the container and closes connections
 *     await teardownTestDatabase();
 *   });
 *
 *   it('should create a user', async () => {
 *     const user = await userRepository.create({ name: 'Test User' });
 *     expect(user.id).toBeDefined();
 *   });
 * });
 * ```
 *
 * @example With test isolation via cleanupTestDatabase
 * ```ts
 * import {
 *   setupTestDatabaseJest,
 *   teardownTestDatabase,
 *   cleanupTestDatabase
 * } from '@package/test-utils';
 *
 * describe('OrderService E2E', () => {
 *   beforeAll(async () => {
 *     await setupTestDatabaseJest();
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     await teardownTestDatabase();
 *   });
 *
 *   afterEach(async () => {
 *     // Clean database between tests for isolation
 *     await cleanupTestDatabase();
 *   });
 *
 *   // tests...
 * });
 * ```
 */
export async function setupTestDatabaseJest(): Promise<void> {
  // Only setup once, even if called from multiple test files
  if (isSetup) {
    return;
  }

  try {
    await startPostgresContainer('main');
    // Use superuser URL for migrations (required to create schemas)
    const superuserUrl = getPostgresSuperuserUrl('main');
    testDb = await createTestDatabase(superuserUrl);

    // CRITICAL: Set DATABASE_URL environment variable for CI mode
    // This allows bootstrap.ts to detect CI mode and skip reading connection file
    // The connection URL points to the test_db database created by Testcontainers
    const connectionUrl = getPostgresConnectionUrl('main');
    process.env['DATABASE_URL'] = connectionUrl;
    // Also set EVENTS_DATABASE_URL to the same database (outbox pattern requires both on same DB)
    process.env['EVENTS_DATABASE_URL'] = connectionUrl;

    // Mark setup complete AFTER all async work succeeds
    isSetup = true;

    // Register cleanup function for Jest global teardown
    // This ensures Testcontainers are stopped after all tests complete
    if (typeof globalThis !== 'undefined') {
      globalThis.__E2E_TEST_CLEANUP__ = async () => {
        await teardownTestDatabase();
      };
    }
  } catch (error) {
    // Roll back partial state on failure
    isSetup = false;
    await teardownTestDatabase();
    throw error;
  }
}

/**
 * Tears down the test database and stops the Testcontainer.
 *
 * Closes the database connection pool and stops the PostgreSQL container.
 * Call this in `afterAll()` to clean up resources after tests complete.
 *
 * **Important**: This is idempotent and can be called multiple times safely.
 * If called when no database is set up, it does nothing.
 *
 * @returns Promise that resolves when teardown is complete
 *
 * @example Standard teardown in afterAll
 * ```ts
 * import { setupTestDatabaseJest, teardownTestDatabase } from '@package/test-utils';
 *
 * describe('MyService', () => {
 *   beforeAll(async () => {
 *     await setupTestDatabaseJest();
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     await teardownTestDatabase();
 *   });
 *
 *   // tests...
 * });
 * ```
 *
 * @example In Jest global teardown
 * ```ts
 * // jest.global-teardown.ts
 * import { teardownTestDatabase } from '@package/test-utils';
 *
 * export default async function globalTeardown(): Promise<void> {
 *   await teardownTestDatabase();
 * }
 * ```
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testDb) {
    await closeTestDatabase(testDb.pool);
    testDb = null;
  }
  await stopPostgresContainer('main');
  isSetup = false;
  isGlobalMode = false;
}

/**
 * Sets up a test database using node:test hooks (deprecated).
 *
 * @returns void
 * @deprecated Use {@link setupTestDatabaseJest} for Jest tests instead.
 * This function is kept for backward compatibility but does nothing useful
 * since Jest doesn't execute node:test hooks.
 */
export function setupTestDatabase(): void {
  // This function is kept for backward compatibility but does nothing
  // Jest doesn't execute node:test hooks, so this won't work
  console.warn('setupTestDatabase() uses node:test hooks which are not compatible with Jest.');
  console.warn('Please use setupTestDatabaseJest() in your beforeAll() hook instead.');
}

/**
 * Sets up a test database using a globally running database server (Jest-compatible).
 *
 * Connects to an existing Testcontainers instance started by `global-test-db.ts`.
 * This is significantly faster than `setupTestDatabaseJest()` because it reuses
 * a pre-existing container instead of starting a new one for each test file.
 *
 * **Recommended for E2E test suites** where test isolation can be achieved
 * through data cleanup rather than fresh containers.
 *
 * **Critical**: This runs BOTH main and events migrations on the same database.
 * This is required for the outbox pattern to work correctly.
 *
 * **Prerequisites**:
 * Start the global database before running tests:
 * ```bash
 * node test/global-test-db.ts start
 * # or
 * pnpm test:e2e:setup
 * ```
 *
 * **The `.test-db-connection.json` File**:
 * When the global database starts, it creates a `.test-db-connection.json` file
 * in the project root containing the connection URLs:
 * ```json
 * {
 *   "databases": {
 *     "main": { "connectionUrl": "postgresql://test_user:test_pass@localhost:5432/test_db" },
 *     "events": { "connectionUrl": "postgresql://test_user:test_pass@localhost:5432/test_db" }
 *   }
 * }
 * ```
 *
 * @returns Promise that resolves when setup is complete
 * @throws {Error} If the global database is not running (no `.test-db-connection.json` file)
 *
 * @example Standard E2E test setup with global database
 * ```ts
 * import { setupGlobalTestDatabaseJest, cleanupTestDatabase } from '@package/test-utils';
 *
 * describe('User E2E Tests', () => {
 *   beforeAll(async () => {
 *     // Connects to pre-existing global container (~100ms vs ~10s)
 *     await setupGlobalTestDatabaseJest();
 *   });
 *
 *   afterEach(async () => {
 *     // Clean database between tests for isolation
 *     await cleanupTestDatabase();
 *   });
 *
 *   it('should create user via API', async () => {
 *     const response = await request(app)
 *       .post('/api/users')
 *       .send({ name: 'Test User' });
 *     expect(response.status).toBe(201);
 *   });
 * });
 * ```
 *
 * @example CI/CD pipeline setup
 * ```yaml
 * # .github/workflows/e2e.yml
 * jobs:
 *   e2e:
 *     steps:
 *       - name: Start global test database
 *         run: pnpm test:e2e:setup
 *       - name: Run E2E tests
 *         run: pnpm test:e2e
 *       - name: Stop global test database
 *         run: pnpm test:e2e:teardown
 * ```
 */
export async function setupGlobalTestDatabaseJest(): Promise<void> {
  if (isSetup) {
    return;
  }

  const connectionUrl = getGlobalTestDatabaseUrl();

  if (!connectionUrl) {
    throw new Error(
      'Global test database not found. Please start it with:\n' +
        '  node test/global-test-db.ts start\n' +
        'Or run:\n' +
        '  pnpm test:e2e:setup'
    );
  }

  try {
    testDb = await createTestDatabase(connectionUrl);
    // Mark setup complete AFTER all async work succeeds
    isSetup = true;
    isGlobalMode = true;
  } catch (error) {
    // Roll back partial state on failure
    isSetup = false;
    isGlobalMode = false;
    if (testDb) {
      await closeTestDatabase(testDb.pool);
      testDb = null;
    }
    throw error;
  }
}

/**
 * Sets up a test database using a globally running database server with node:test hooks (deprecated).
 *
 * @returns void
 * @deprecated Use {@link setupGlobalTestDatabaseJest} for Jest tests instead.
 * This function is kept for backward compatibility but does nothing useful
 * since Jest doesn't execute node:test hooks.
 */
export function setupGlobalTestDatabase(): void {
  // This function is kept for backward compatibility but does nothing
  // Jest doesn't execute node:test hooks, so this won't work
  console.warn(
    'setupGlobalTestDatabase() uses node:test hooks which are not compatible with Jest.'
  );
  console.warn('Please use setupGlobalTestDatabaseJest() in your beforeAll() hook instead.');
}

/**
 * Gets the current test database instance.
 *
 * Returns the ITestDatabase instance containing the Drizzle client and
 * connection pool. Must be called after `setupTestDatabaseJest()` or
 * `setupGlobalTestDatabaseJest()`.
 *
 * @returns The ITestDatabase instance with Drizzle client and pg Pool
 * @throws {Error} If database has not been initialized
 *
 * @example Accessing the database in tests
 * ```ts
 * import { setupTestDatabaseJest, getTestDb } from '@package/test-utils';
 *
 * describe('Database Tests', () => {
 *   beforeAll(async () => {
 *     await setupTestDatabaseJest();
 *   }, 60000);
 *
 *   it('should query users', async () => {
 *     const { db } = getTestDb();
 *     const users = await db.select().from(usersTable);
 *     expect(users).toHaveLength(0);
 *   });
 *
 *   it('should use raw pool for complex queries', async () => {
 *     const { pool } = getTestDb();
 *     const result = await pool.query('SELECT COUNT(*) FROM users');
 *     expect(result.rows[0].count).toBe('0');
 *   });
 * });
 * ```
 */
export function getTestDb(): ITestDatabase {
  if (!testDb) {
    throw new Error(
      'Test database not initialized. Call setupTestDatabaseJest() or setupGlobalTestDatabaseJest() first.'
    );
  }
  return testDb;
}

/**
 * Checks if the current test is using global database mode.
 *
 * Returns `true` if `setupGlobalTestDatabaseJest()` was used,
 * `false` if `setupTestDatabaseJest()` was used or no setup has occurred.
 *
 * This is useful for conditional logic based on the test mode, such as
 * deciding whether to run expensive cleanup operations.
 *
 * @returns `true` if using the global database server, `false` otherwise
 *
 * @example Conditional cleanup based on mode
 * ```ts
 * import { isGlobalDatabaseMode, cleanupTestDatabase } from '@package/test-utils';
 *
 * afterEach(async () => {
 *   if (isGlobalDatabaseMode()) {
 *     // In global mode, clean data for test isolation
 *     await cleanupTestDatabase();
 *   }
 *   // In isolated mode, each test file gets a fresh container anyway
 * });
 * ```
 */
export function isGlobalDatabaseMode(): boolean {
  return isGlobalMode;
}

/**
 * Cleans up test data between tests for isolation.
 *
 * Drops and recreates the public schema, then re-applies all migrations
 * (db-core and db-outbox) to restore the database to a clean state with
 * all tables ready for the next test. Call this in `afterEach()` when
 * using global database mode.
 *
 * **Important**: This is a destructive operation that removes all data.
 * Only use in test environments.
 *
 * **Performance Note**: This is faster than deleting rows individually
 * because it bypasses foreign key checks and triggers. Migrations are
 * automatically re-run to ensure tables exist for subsequent tests.
 *
 * @returns Promise that resolves when cleanup and migration re-application is complete
 * @throws {Error} If migrations fail to re-apply
 *
 * @example Test isolation in global mode
 * ```ts
 * import {
 *   setupGlobalTestDatabaseJest,
 *   cleanupTestDatabase
 * } from '@package/test-utils';
 *
 * describe('OrderService', () => {
 *   beforeAll(async () => {
 *     await setupGlobalTestDatabaseJest();
 *   });
 *
 *   afterEach(async () => {
 *     // Reset database state between tests (drops all data, re-runs migrations)
 *     await cleanupTestDatabase();
 *   });
 *
 *   it('should create an order', async () => {
 *     const order = await orderService.create({ ... });
 *     expect(order).toBeDefined();
 *   });
 *
 *   it('should start with clean database', async () => {
 *     // Previous test's data is gone, but tables exist
 *     const orders = await orderService.findAll();
 *     expect(orders).toHaveLength(0);
 *   });
 * });
 * ```
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (testDb) {
    await cleanTestDatabase(testDb.pool);
    // Re-apply migrations so tables exist for subsequent tests
    await runMigrations(testDb);
  }
}

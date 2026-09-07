/**
 * Programmatic migration runner for the events database.
 *
 * This module provides utilities to run Drizzle ORM migrations programmatically,
 * which is useful for:
 * - Test setup (via {@link OutboxDbModule} or directly)
 * - CI/CD pipelines
 * - Docker container initialization
 * - Development environment setup
 *
 * ## Migration Isolation
 *
 * Each database package in the monorepo uses a separate migrations tracking table
 * to prevent conflicts. This package uses `__drizzle_migrations_events` to track
 * which migrations have been applied, distinct from `db-core` or other packages.
 *
 * ## Migration Files Location
 *
 * Migration SQL files are located in `packages/db-outbox/drizzle/` and are
 * generated using the Drizzle Kit CLI:
 *
 * ```bash
 * pnpm run db-outbox:generate  # Generate new migration
 * pnpm run db-outbox:migrate   # Apply migrations via CLI
 * ```
 *
 * @module @package/db-outbox/migrations/runner
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '../schema';
import { MIGRATIONS_TABLE } from './constants';

/**
 * Re-export migration constants for external use.
 *
 * @see {@link MIGRATIONS_TABLE} - Name of the migrations tracking table
 * @see {@link MIGRATIONS_SCHEMA} - Schema where migrations table is created
 */
export { MIGRATIONS_TABLE, MIGRATIONS_SCHEMA } from './constants';

/**
 * Resolves the path to the migrations folder.
 *
 * Uses `__dirname` to locate migrations relative to this file, ensuring
 * correct resolution regardless of the current working directory.
 * Falls back to `process.cwd()` for Docker production builds where
 * the directory structure may differ.
 *
 * @internal
 * @returns Absolute path to the drizzle migrations folder
 */
const getMigrationsFolder = (): string => {
  // Get the directory of this file using __dirname (CommonJS)
  const currentDir = __dirname;

  // Navigate from packages/db-outbox/src/migrations/ to packages/db-outbox/drizzle
  const migrationsPath = resolve(currentDir, '..', '..', 'drizzle');

  // Fallback: if the relative path doesn't exist, try from process.cwd()
  // This handles production Docker where the directory structure may differ
  if (!existsSync(migrationsPath)) {
    const cwdPath = join(process.cwd(), 'packages', 'db-outbox', 'drizzle');
    if (existsSync(cwdPath)) {
      return cwdPath;
    }
  }

  return migrationsPath;
};

/**
 * Runs database migrations programmatically.
 *
 * Creates a temporary connection pool, applies all pending migrations from the
 * `drizzle/` folder, and closes the pool. Uses a package-specific migrations
 * table (`__drizzle_migrations_events`) to prevent conflicts with other packages.
 *
 * ## Idempotency
 *
 * This function is idempotent - calling it multiple times is safe. Drizzle
 * tracks applied migrations and skips those already executed.
 *
 * ## Connection Management
 *
 * The function creates and closes its own connection pool. It does not use
 * the shared pool from {@link db} to avoid connection lifecycle issues.
 *
 * @param databaseUrl - PostgreSQL connection string from `EVENTS_DATABASE_URL` or `DATABASE_URL`
 * @returns A promise that resolves when all migrations are applied
 *
 * @throws Error if the database connection fails
 * @throws Error if any migration fails to apply
 *
 * @example
 * ```typescript
 * import { runMigrations } from '@package/db-outbox';
 *
 * // In a setup script
 * async function setupDatabase() {
 *   const databaseUrl = process.env.EVENTS_DATABASE_URL || process.env.DATABASE_URL;
 *
 *   if (!databaseUrl) {
 *     throw new Error('DATABASE_URL is required');
 *   }
 *
 *   console.log('Running events database migrations...');
 *   await runMigrations(databaseUrl);
 *   console.log('Migrations completed successfully');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In Testcontainers test setup
 * import { runMigrations } from '@package/db-outbox';
 * import { PostgreSqlContainer } from '@testcontainers/postgresql';
 *
 * describe('Integration Tests', () => {
 *   let container: StartedPostgreSqlContainer;
 *
 *   beforeAll(async () => {
 *     container = await new PostgreSqlContainer().start();
 *     const connectionUri = container.getConnectionUri();
 *
 *     // Apply migrations to the test container
 *     await runMigrations(connectionUri);
 *   });
 *
 *   afterAll(async () => {
 *     await container.stop();
 *   });
 * });
 * ```
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const migrationsFolder = getMigrationsFolder();

  // eslint-disable-next-line no-console
  console.log(`Running migrations from: ${migrationsFolder}`);

  // Use the package-specific migrations table to prevent conflicts
  // with other database packages (e.g., db-core)
  await migrate(db, {
    migrationsFolder,
    migrationsTable: MIGRATIONS_TABLE
  });

  // eslint-disable-next-line no-console
  console.log('Migrations completed');

  await pool.end();
}

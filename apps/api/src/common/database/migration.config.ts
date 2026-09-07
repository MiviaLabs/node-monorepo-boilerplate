import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Resolve db-core migration folder across different working directories.
 *
 * CI E2E runs from `apps/api`, while other flows may run from repo root.
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    resolve(process.cwd(), 'packages/db-core/drizzle'),
    resolve(process.cwd(), '../packages/db-core/drizzle'),
    resolve(process.cwd(), '../../packages/db-core/drizzle')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Keep the original default path in the error surface if none exist.
  return candidates[0] ?? resolve(process.cwd(), 'packages/db-core/drizzle');
}

/**
 * Migrations folder path for the main database.
 *
 * Points to the drizzle migrations folder in the @package/db-core package.
 * This is used by DatabaseModule to run migrations in test environments.
 */
export const MIGRATIONS_FOLDER = resolveMigrationsFolder();

/**
 * Get the migrations table name from @package/db-core
 *
 * This is a dynamic import to avoid module boundary issues with lazy-loaded packages.
 */
export async function getMigrationsConfig(): Promise<{ MIGRATIONS_TABLE: string }> {
  const { MIGRATIONS_TABLE } = await import('@package/db-core');
  return { MIGRATIONS_TABLE };
}

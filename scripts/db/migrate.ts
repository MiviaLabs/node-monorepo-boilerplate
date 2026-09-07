#!/usr/bin/env tsx
/**
 * Database migration runner
 * Usage: pnpm run db:migrate <db-package> <action>
 *
 * Supported packages: db-core, db-outbox, db-auth
 * Supported actions: generate, push, migrate, studio
 */

import { execSync } from 'child_process';

// Allowed values for security validation
const ALLOWED_DB_PACKAGES = ['db-core', 'db-outbox', 'db-auth'] as const;
const ALLOWED_ACTIONS = ['generate', 'push', 'migrate', 'studio'] as const;

function validateDbPackage(pkg: string): asserts pkg is (typeof ALLOWED_DB_PACKAGES)[number] {
  if (!ALLOWED_DB_PACKAGES.includes(pkg as any)) {
    console.error(`Invalid db-package: ${pkg}`);
    console.error(`Allowed packages: ${ALLOWED_DB_PACKAGES.join(', ')}`);
    process.exit(1);
  }
}

function validateAction(action: string): asserts action is (typeof ALLOWED_ACTIONS)[number] {
  if (!ALLOWED_ACTIONS.includes(action as any)) {
    console.error(`Invalid action: ${action}`);
    console.error(`Allowed actions: ${ALLOWED_ACTIONS.join(', ')}`);
    process.exit(1);
  }
}

/**
 * Validate DATABASE_URL environment variable
 * Prevents command injection via database URL
 */
function validateDatabaseUrl(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Check for valid PostgreSQL connection string format
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    console.error('Invalid DATABASE_URL: must start with postgresql:// or postgres://');
    process.exit(1);
  }

  // Check for suspicious characters that could indicate injection attempts
  const dangerousChars = [';', '|', '&', '$', '`', '\n', '\r'];
  const hasDangerousChars = dangerousChars.some((char) => databaseUrl.includes(char));
  if (hasDangerousChars) {
    console.error('DATABASE_URL contains invalid characters');
    process.exit(1);
  }
}

const [, , dbPackage, action = 'push'] = process.argv;

if (!dbPackage) {
  console.error('Usage: pnpm run db:migrate <db-package> <action>');
  console.error('Example: pnpm run db:migrate db-core push');
  process.exit(1);
}

// Security: Validate inputs before use
validateDatabaseUrl();
validateDbPackage(dbPackage);
validateAction(action);

// Map actions to actual npm scripts (only use commands that exist)
const commandMap: Record<(typeof ALLOWED_ACTIONS)[number], string> = {
  generate: `pnpm --filter @package/${dbPackage} db:generate`,
  push: `pnpm --filter @package/${dbPackage} db:push`,
  migrate: `pnpm --filter @package/${dbPackage} db:migrate`,
  studio: `pnpm --filter @package/${dbPackage} db:studio`
};

try {
  console.log(`Running ${action} for ${dbPackage}...`);
  execSync(commandMap[action], { stdio: 'inherit', timeout: 60000 });
  console.log(`✓ ${action} completed successfully`);
} catch (error) {
  console.error(`✗ ${action} failed`);
  process.exit(1);
}

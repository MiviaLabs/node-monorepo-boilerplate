#!/usr/bin/env node
/**
 * Migration CLI runner
 * This script runs Drizzle migrations programmatically without requiring drizzle-kit CLI
 */

/* eslint-disable no-console */
import { runMigrations } from './runner';

async function main() {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  try {
    await runMigrations(databaseUrl);
    console.log('✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();

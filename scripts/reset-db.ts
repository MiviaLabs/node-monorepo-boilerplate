#!/usr/bin/env tsx
/**
 * Local Development Database Reset Script
 *
 * Resets the local development database by clearing all data
 * and re-seeding with fresh sample data.
 *
 * Usage:
 *   pnpm dev:reset-db
 *   tsx scripts/reset-db.ts
 *
 * Environment:
 *   Uses DATABASE_URL from environment or defaults to local development database
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@package/db-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { Pool } = pg;

// Get current directory using import.meta.url for ES modules
const currentModuleUrl = import.meta.url;
const currentFilePath = fileURLToPath(currentModuleUrl);
const currentDirPath = dirname(currentFilePath);

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://starter:starter_dev@localhost:5432/starter_db';

async function reset() {
  console.log('🔄 Resetting local development database...');
  console.log(`   Database: ${DATABASE_URL}`);
  console.log('');

  const pool = new Pool({
    connectionString: DATABASE_URL
  });

  const db = drizzle(pool, { schema });

  try {
    // Clear existing data (in correct order for foreign keys)
    console.log('🧹 Clearing existing data...');

    // Delete in reverse dependency order
    await db.delete(schema.userRoles);
    await db.delete(schema.userTenants);
    await db.delete(schema.userIdentities);
    await db.delete(schema.users);
    await db.delete(schema.organizations);
    await db.delete(schema.tenants);

    console.log('✅ Database cleared successfully!');
    console.log('');

    await pool.end();

    // Run seed script
    console.log('🌱 Running seed script...');
    const seedScriptPath = join(currentDirPath, 'seed.ts');

    return new Promise<void>((resolve, reject) => {
      const child = spawn('npx', ['tsx', seedScriptPath], {
        env: { ...process.env, DATABASE_URL },
        stdio: 'inherit',
        shell: true
      });

      child.on('exit', (code) => {
        if (code === 0) {
          console.log('');
          console.log('✅ Database reset and seed completed successfully!');
          resolve();
        } else {
          console.error('');
          console.error(`❌ Seed failed with exit code ${code}`);
          reject(new Error(`Seed script exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        console.error('❌ Failed to start seed script:', error);
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Reset failed:', error);
    await pool.end();
    throw error;
  }
}

// Run reset if called directly
reset().catch((error) => {
  console.error(error);
  process.exit(1);
});

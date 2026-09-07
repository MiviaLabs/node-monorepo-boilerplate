#!/usr/bin/env tsx
/**
 * Local Development Seed Script
 *
 * This is a convenience wrapper around the db-core seed script.
 * It seeds the local development database with sample data.
 *
 * Usage:
 *   pnpm dev:seed
 *   tsx scripts/seed.ts
 *
 * Environment:
 *   Uses DATABASE_URL from environment or defaults to local development database
 */

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get current directory using import.meta.url for ES modules
const currentModuleUrl = import.meta.url;
const currentFilePath = fileURLToPath(currentModuleUrl);
const currentDirPath = dirname(currentFilePath);

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://starter:starter_dev@localhost:5432/starter_db';

async function seed() {
  console.log('🌱 Starting local development database seed...');
  console.log(`   Database: ${DATABASE_URL}`);
  console.log('');

  // Set DATABASE_URL for the child process
  const env = { ...process.env, DATABASE_URL };

  // Path to the db-core seed script
  const seedScriptPath = join(currentDirPath, '..', 'packages', 'db-core', 'src', 'seed.ts');

  return new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', seedScriptPath], {
      env,
      stdio: 'inherit',
      shell: true
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('');
        console.log('✅ Seed completed successfully!');
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
}

// Run seed if called directly
seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

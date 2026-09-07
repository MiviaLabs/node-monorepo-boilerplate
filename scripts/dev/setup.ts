#!/usr/bin/env tsx
/**
 * Development environment setup
 * Runs all necessary setup steps for a new developer
 */

import { execSync } from 'child_process';

interface SetupStep {
  name: string;
  command: string;
  critical?: boolean;
}

const steps: SetupStep[] = [
  { name: 'Installing dependencies', command: 'pnpm install', critical: true },
  { name: 'Checking OPA CLI (optional)', command: 'pnpm opa:check', critical: false },
  { name: 'Building packages', command: 'pnpm nx run-many --target=build --all', critical: true },
  { name: 'Starting Docker services', command: 'pnpm dev:start', critical: true },
  { name: 'Waiting for services to be ready', command: 'pnpm dev:health', critical: true }, // Changed from sleep
  { name: 'Running database migrations', command: 'pnpm db:migrate', critical: true },
  {
    name: 'Seeding database',
    command: 'ENVIRONMENT=development pnpm --filter @package/db-core seed',
    critical: false
  }
];

async function runSetup(): Promise<void> {
  console.log('Setting up development environment...\n');

  for (const step of steps) {
    console.log(`\n▶ ${step.name}...`);

    try {
      execSync(step.command, { stdio: 'inherit', timeout: 120000 });
      console.log(`✓ ${step.name} completed`);
    } catch (error) {
      console.error(`✗ ${step.name} failed`);
      if (step.critical) {
        console.error('\n❌ Setup failed at critical step.');
        console.error('🔧 Troubleshooting:');
        console.error(`   1. Check the error output above for specific issues`);
        console.error(`   2. Make sure Docker is running: docker ps`);
        console.error(`   3. Try running the failed command manually:`);
        console.error(`      ${step.command}`);
        console.error(`   4. Check logs: pnpm dev:logs`);
        console.error(`   5. Fix the issue and run setup again`);
        process.exit(1);
      } else {
        console.warn('  (Non-critical, continuing...)');
      }
    }
  }

  console.log('\n✓ Development environment setup complete!');
  console.log('\nYou can now:');
  console.log('  - Run API: pnpm nx serve api');
  console.log('  - Run Web: pnpm nx dev web');
  console.log('  - Check health: pnpm dev:health');
  console.log('  - View logs: pnpm dev:logs');
}

runSetup().catch(console.error);

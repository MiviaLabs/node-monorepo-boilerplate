#!/usr/bin/env tsx
/**
 * Run linting across all projects
 */

import { execSync } from 'child_process';

const projects = ['api', 'web', 'types', 'utils', 'schema', 'constants'];

async function lintAll() {
  console.log('Linting all projects...\n');

  let failed = false;

  for (const project of projects) {
    try {
      console.log(`Linting ${project}...`);
      execSync(`pnpm nx lint ${project}`, { stdio: 'inherit' });
      console.log(`✓ ${project} passed\n`);
    } catch {
      console.log(`✗ ${project} failed\n`);
      failed = true;
    }
  }

  if (failed) {
    console.error('Some projects failed linting');
    process.exit(1);
  }

  console.log('All projects passed linting!');
}

lintAll().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

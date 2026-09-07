#!/usr/bin/env tsx
/**
 * Run type checking across all projects
 */

import { execSync } from 'child_process';

const projects = [
  'api',
  'admin',
  'admin-e2e',
  'web',
  'types',
  'utils',
  'schema',
  'constants'
];

async function typecheckAll() {
  console.log('Type checking all projects...\n');

  let failed = false;

  for (const project of projects) {
    try {
      console.log(`Type checking ${project}...`);
      execSync(`pnpm nx typecheck ${project}`, { stdio: 'inherit' });
      console.log(`✓ ${project} passed\n`);
    } catch {
      console.log(`✗ ${project} failed\n`);
      failed = true;
    }
  }

  if (failed) {
    console.error('Some projects failed type checking');
    process.exit(1);
  }

  console.log('All projects passed type checking!');
}

typecheckAll().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

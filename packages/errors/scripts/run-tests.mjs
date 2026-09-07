#!/usr/bin/env node
/**
 * Test Runner Script
 *
 * Runs all unit tests using Node.js built-in test runner with TypeScript support.
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = __dirname;
const TESTS_DIR = join(ROOT_DIR, '..', 'tests');

function runTests() {
  // eslint-disable-next-line no-console
  console.log('🧪 Running tests...\n');

  // Use node:test with TypeScript via tsx ESM loader.
  const command = `node --test --experimental-test-coverage "${TESTS_DIR}/unit/**/*.test.ts"`;

  try {
    execSync(command, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: '--import tsx/esm'
      }
    });
    // eslint-disable-next-line no-console
    console.log('\n✅ All tests passed!');
  } catch {
    // eslint-disable-next-line no-console
    console.error('\n❌ Tests failed!');
    process.exit(1);
  }
}

runTests();

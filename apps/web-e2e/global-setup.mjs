import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');

export default async function globalSetup() {
  try {
    execSync('pnpm --dir apps/api test:e2e:teardown', {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
  } catch {
    // Ignore teardown failures when no previous daemon is active.
  }

  // eslint-disable-next-line no-console
  console.log('[web-e2e] Starting API testcontainers stack...');
  execSync('pnpm --dir apps/api test:e2e:setup', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
}

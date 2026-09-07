import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');
const WEB_E2E_CONNECTION_FILE = resolve(workspaceRoot, 'apps/web-e2e/.test-db-connection.json');

export default async function globalTeardown() {
  // eslint-disable-next-line no-console
  console.log('[web-e2e] Stopping API testcontainers stack...');
  execSync('pnpm --dir apps/api test:e2e:teardown', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });

  rmSync(WEB_E2E_CONNECTION_FILE, { force: true });
}

import { execSync } from 'node:child_process';

export default async function globalSetup() {
  // eslint-disable-next-line no-console
  console.log('[admin-e2e] Starting API testcontainers stack...');
  execSync('pnpm --dir apps/api test:e2e:setup', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
}

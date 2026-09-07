import { execSync } from 'node:child_process';

export default async function globalTeardown() {
  // eslint-disable-next-line no-console
  console.log('[admin-e2e] Stopping API testcontainers stack...');
  execSync("bash -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --dir apps/api test:e2e:teardown'", {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
}

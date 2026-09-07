import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] || 'http://localhost:3002';
const reuseExistingServer = process.env['CI'] !== 'true';

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
  fullyParallel: false,
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command:
        "bash -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && node apps/admin-e2e/scripts/start-api-e2e.mjs'",
      url: 'http://localhost:3000/api/v1/ops/health',
      reuseExistingServer,
      timeout: 180000,
      cwd: workspaceRoot
    },
    {
      command:
        "bash -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && API_URL=http://localhost:3000 node apps/admin-e2e/scripts/start-admin-e2e.mjs'",
      url: 'http://localhost:3002',
      reuseExistingServer,
      timeout: 120000,
      cwd: workspaceRoot
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});

import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

// For CI, you may want to set BASE_URL to the deployed application.
// Note: Nx Next.js dev server uses port 3001 by default
const baseURL = process.env['BASE_URL'] || 'http://localhost:3001';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry'
  },
  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'node apps/web-e2e/scripts/start-api-e2e.mjs',
      url: 'http://localhost:3000/api/v1/ops/health',
      reuseExistingServer: true,
      timeout: 180000,
      cwd: workspaceRoot
    },
    {
      command: 'node apps/web-e2e/scripts/start-web-e2e.mjs',
      url: 'http://localhost:3001/login',
      reuseExistingServer: true,
      timeout: 240000,
      cwd: workspaceRoot
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ]
});

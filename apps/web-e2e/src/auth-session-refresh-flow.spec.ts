import { expect, test } from '@playwright/test';

test.describe('Auth Session Refresh Flow (real API + testcontainers)', () => {
  test('session refresh survives access token expiry on protected reload', async ({ page }) => {
    test.setTimeout(120_000);

    const runId = `${Date.now()}`;
    const email = `session-refresh-${runId}@example.com`;
    const password = 'Passw0rd!Strong';
    const organizationName = `session-refresh-${runId.slice(-6)}`;

    await page.goto('/register');

    await page.getByLabel('Display name').fill('Session Refresh User');
    await page.getByLabel('Organization / Team name').fill(organizationName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('checkbox').check();

    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Create account' }).click()
    ]);

    await page.evaluate(() => {
      const raw = localStorage.getItem('auth_sessionId');
      if (!raw) {
        throw new Error('Missing auth_sessionId local storage payload');
      }

      const session = JSON.parse(raw) as {
        expiresAt: string;
        tokens: {
          accessToken: string;
          refreshToken: string;
          idToken: string;
          expiresIn: number;
          refreshExpiresIn: number;
        };
      };

      session.expiresAt = new Date(Date.now() - 60_000).toISOString();
      session.tokens.accessToken = 'expired-access-token';
      localStorage.setItem('auth_sessionId', JSON.stringify(session));

      document.cookie = 'accessToken=expired-access-token; path=/; max-age=3600; SameSite=Lax';
    });

    await page.goto('/dashboard/profile');

    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(page.getByText('Edit Profile', { exact: true })).toBeVisible();
  });
});

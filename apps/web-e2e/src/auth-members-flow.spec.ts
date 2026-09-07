import { expect, test } from '@playwright/test';

test.describe('Auth Members Flow (real API + testcontainers)', () => {
  test('registers user, updates profile and password, and keeps protected routes healthy', async ({
    page
  }) => {
    const runId = `${Date.now()}`;
    const email = `pw-e2e-${runId}@example.com`;
    const password = 'Passw0rd!Strong';
    const organizationName = `team-${runId.slice(-6)}`;
    const authMeStatuses: number[] = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/auth/me')) {
        authMeStatuses.push(response.status());
      }
    });

    await page.goto('/register');

    await page.getByLabel('Display name').fill('Playwright E2E');
    await page.getByLabel('Organization / Team name').fill(organizationName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password$/).fill(password);
    await page.getByLabel(/^Confirm password confirmation$/).fill(password);
    await page.getByRole('checkbox').check();

    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Create account' }).click()
    ]);

    const assertRouteAuthMeHealthy = async (
      path: string,
      visibleLabel: string,
      messagePrefix: string
    ) => {
      const startIndex = authMeStatuses.length;

      await page.goto(path);
      await expect(page.getByText(visibleLabel, { exact: true }).first()).toBeVisible();

      await expect
        .poll(() => authMeStatuses.slice(startIndex), {
          message: `${messagePrefix}: expected /api/auth/me to return 200 during hydration`
        })
        .toContain(200);

      const routeStatuses = authMeStatuses.slice(startIndex);
      expect(routeStatuses).not.toContain(400);
      expect(routeStatuses).not.toContain(401);
    };

    await assertRouteAuthMeHealthy('/dashboard', 'Workspace stats', 'Dashboard');
    await assertRouteAuthMeHealthy('/dashboard/members', 'Members Directory', 'Members');
    await assertRouteAuthMeHealthy('/dashboard/profile', 'Edit Profile', 'Profile');
    await assertRouteAuthMeHealthy('/dashboard/settings', 'Organization Profile', 'Settings');

    const updatedDisplayName = `Playwright E2E ${runId.slice(-4)}`;
    await page.goto('/dashboard/profile');
    await page.getByLabel('Display name').fill(updatedDisplayName);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/auth.updateMyProfile') && response.status() === 200
      ),
      page.getByRole('button', { name: 'Save changes' }).click()
    ]);

    await expect(page.getByText(updatedDisplayName).first()).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();

    const newPassword = `NewPass${runId.slice(-4)}!Aa`;
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel(/^New password$/).fill(newPassword);
    await page.getByLabel(/^Confirm new password$/).fill(newPassword);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/me/password') &&
          response.request().method() === 'PATCH' &&
          response.status() === 204
      ),
      page.getByRole('button', { name: 'Update password' }).click()
    ]);

    await page.waitForURL('**/login');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password$/).fill(newPassword);
    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Sign in' }).click()
    ]);

    await assertRouteAuthMeHealthy(
      '/dashboard/profile',
      'Edit Profile',
      'Profile after password change'
    );
  });
});

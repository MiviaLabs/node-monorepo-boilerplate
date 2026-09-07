import { expect, test } from '@playwright/test';

import {
  installSeededSession,
  seedAuthenticatedOwnerSession,
  seedProject
} from './support/seed-auth-session';

test.describe('My Work Protected Flow (real API + testcontainers)', () => {
  test('redirects unauthenticated visitors and renders the user-wide context for authenticated users', async ({
    page
  }) => {
    test.setTimeout(90_000);

    await page.goto('/my');
    await page.waitForURL('**/login?redirect=%2Fmy');

    const runId = `${Date.now()}`;
    const email = `my-work-e2e-${runId}@example.com`;
    const organizationName = `my-work-${runId.slice(-6)}`;

    const session = await seedAuthenticatedOwnerSession({
      displayName: 'My Work E2E',
      email,
      organizationName
    });
    const ownedProjectName = `My Work Owned ${runId.slice(-4)}`;
    await seedProject({
      organizationId: session.organizationId,
      createdByUserId: session.userId,
      name: ownedProjectName,
      visibility: 'private',
      memberUserIds: [session.userId]
    });
    await installSeededSession(page.context(), session);

    await page.goto('/my');
    await expect(page).toHaveURL(/\/my$/);
    await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
    await expect(page.getByText('User-wide', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assigned Project Spaces' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Continue In Projects' })).toBeVisible();
    await expect(page.getByText(ownedProjectName)).toBeVisible();
  });
});

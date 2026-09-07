import { expect, test } from '@playwright/test';

import { installSeededSession, seedAuthenticatedOwnerSession } from './support/seed-auth-session';

test.describe('Sidebar Section Order Flow (real API + testcontainers)', () => {
  test('persists sidebar section ordering for the authenticated workspace user', async ({
    page
  }) => {
    test.setTimeout(90_000);

    const runId = `${Date.now()}`;
    const email = `sidebar-order-e2e-${runId}@example.com`;
    const organizationName = `sidebar-order-${runId.slice(-6)}`;

    const session = await seedAuthenticatedOwnerSession({
      displayName: 'Sidebar Order E2E',
      email,
      organizationName
    });
    await installSeededSession(page.context(), session);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    const overviewSection = page.locator('[data-sidebar-section="yourWork"]');
    const organizationSection = page.locator('[data-sidebar-section="organization"]');
    const overviewHandle = page.locator('[data-sidebar-section-drag-handle="yourWork"]');
    const organizationHandle = page.locator('[data-sidebar-section-drag-handle="organization"]');
    await expect(overviewSection).toBeVisible();
    await expect(organizationSection).toBeVisible();
    await expect(overviewHandle).toBeVisible();
    await expect(organizationHandle).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/me/settings/sidebar.section_order') &&
          response.request().method() === 'PUT' &&
          response.status() === 200
      ),
      organizationHandle.dragTo(overviewHandle)
    ]);

    const overviewBoxAfterDrag = await overviewSection.boundingBox();
    const organizationBoxAfterDrag = await organizationSection.boundingBox();

    expect(overviewBoxAfterDrag).not.toBeNull();
    expect(organizationBoxAfterDrag).not.toBeNull();
    expect((organizationBoxAfterDrag?.y ?? 0) < (overviewBoxAfterDrag?.y ?? 0)).toBe(true);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    const overviewBoxAfterReload = await page
      .locator('[data-sidebar-section="yourWork"]')
      .boundingBox();
    const organizationBoxAfterReload = await page
      .locator('[data-sidebar-section="organization"]')
      .boundingBox();

    expect(overviewBoxAfterReload).not.toBeNull();
    expect(organizationBoxAfterReload).not.toBeNull();
    expect((organizationBoxAfterReload?.y ?? 0) < (overviewBoxAfterReload?.y ?? 0)).toBe(true);
  });

  test('persists dashboard default view and redirects from /dashboard on first load', async ({
    page
  }) => {
    test.setTimeout(90_000);

    const runId = `${Date.now()}-default`;
    const email = `dashboard-default-e2e-${runId}@example.com`;
    const organizationName = `dashboard-default-${runId.slice(-6)}`;

    const session = await seedAuthenticatedOwnerSession({
      displayName: 'Dashboard Default E2E',
      email,
      organizationName
    });
    await installSeededSession(page.context(), session);

    await page.goto('/account/settings');
    await expect(page.getByRole('heading', { name: 'Account Settings', exact: true })).toBeVisible();

    await page.getByRole('combobox', { name: 'Dashboard landing page' }).click();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/me/settings/dashboard.default_view') &&
          response.request().method() === 'PUT' &&
          response.status() === 200
      ),
      page.getByRole('option', { name: 'Projects', exact: true }).click()
    ]);

    await page.goto('/dashboard');
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  });
});

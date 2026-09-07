import { expect, test } from '@playwright/test';

import {
  installSeededSession,
  seedAuthenticatedOrganizationMemberSession,
  seedAuthenticatedOwnerSession
} from './support/seed-auth-session';

test.describe('Content Protected Flow (real API + testcontainers)', () => {
  test('creates organization pages and child pages from the nested content sidebar', async ({
    page
  }) => {
    test.setTimeout(90_000);

    const runId = `${Date.now()}`;
    const owner = await seedAuthenticatedOwnerSession({
      displayName: 'Content Owner',
      email: `content-owner-${runId}@example.com`,
      organizationName: `content-flow-${runId.slice(-6)}`
    });
    const memberSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: owner.organizationId,
      tenantRecordId: owner.tenantRecordId,
      displayName: 'Content Editor',
      email: `content-editor-${runId}@example.com`,
      permissions: ['tenant:content:read', 'tenant:content:create', 'tenant:content:update']
    });

    await installSeededSession(page.context(), memberSession);

    await page.goto('/content');
    await expect(page).toHaveURL(/\/content$/);
    await expect(page.getByRole('button', { name: 'Create page' })).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/content') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Create page' }).click()
    ]);

    await page.waitForURL(/\/content\/.+/);
    await expect(page.getByLabel('Page title')).toHaveValue('Untitled');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/content') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Create child page under Untitled' }).click()
    ]);

    await page.waitForURL(/\/content\/.+/);
    await expect(page.locator('[aria-label="Page breadcrumb"]')).toContainText('Untitled');
  });

  test('moves a later content entry by dragging it onto another row in the sidebar tree', async ({
    page
  }) => {
    test.setTimeout(90_000);

    const runId = `${Date.now()}-move`;
    const owner = await seedAuthenticatedOwnerSession({
      displayName: 'Content Move Owner',
      email: `content-move-owner-${runId}@example.com`,
      organizationName: `content-move-${runId.slice(-6)}`
    });
    const memberSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: owner.organizationId,
      tenantRecordId: owner.tenantRecordId,
      displayName: 'Content Move Editor',
      email: `content-move-editor-${runId}@example.com`,
      permissions: ['tenant:content:read', 'tenant:content:create', 'tenant:content:update']
    });

    await installSeededSession(page.context(), memberSession);

    await page.goto('/content');
    await expect(page).toHaveURL(/\/content$/);

    for (let index = 0; index < 3; index += 1) {
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/content') &&
            response.request().method() === 'POST' &&
            response.ok()
        ),
        page.getByRole('button', { name: 'Create page' }).click()
      ]);
      await page.waitForURL(/\/content\/.+/);
    }

    const contentRows = page.locator('[data-content-tree-row]');
    await expect(contentRows).toHaveCount(3);

    const targetRow = contentRows.nth(1);
    const draggedRow = contentRows.nth(2);
    const targetEntryId = Number(await targetRow.getAttribute('data-content-entry-id'));
    const draggedEntryId = Number(await draggedRow.getAttribute('data-content-entry-id'));

    expect(Number.isFinite(targetEntryId)).toBe(true);
    expect(Number.isFinite(draggedEntryId)).toBe(true);

    const moveRequestPromise = page.waitForRequest((request) => {
      if (
        !request.url().includes(`/api/content/${draggedEntryId}`) ||
        request.method() !== 'PATCH'
      ) {
        return false;
      }

      const payload = request.postDataJSON() as { parentId?: number; position?: number };
      return typeof payload.position === 'number';
    });
    const moveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/content/${draggedEntryId}`) &&
        response.request().method() === 'PATCH' &&
        response.ok()
    );

    await page
      .locator(`[data-content-tree-drag-handle="${draggedEntryId}"]`)
      .dragTo(page.locator(`[data-content-tree-drag-handle="${targetEntryId}"]`));

    await moveRequestPromise;
    await moveResponsePromise;
    await expect(contentRows).toHaveCount(3);
  });

  test('moves a child content entry from the nested tree', async ({ page }) => {
    test.setTimeout(90_000);

    const runId = `${Date.now()}-child-move`;
    const owner = await seedAuthenticatedOwnerSession({
      displayName: 'Content Child Move Owner',
      email: `content-child-move-owner-${runId}@example.com`,
      organizationName: `content-child-move-${runId.slice(-6)}`
    });
    const memberSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: owner.organizationId,
      tenantRecordId: owner.tenantRecordId,
      displayName: 'Content Child Move Editor',
      email: `content-child-move-editor-${runId}@example.com`,
      permissions: ['tenant:content:read', 'tenant:content:create', 'tenant:content:update']
    });

    await installSeededSession(page.context(), memberSession);

    await page.goto('/content');
    await expect(page).toHaveURL(/\/content$/);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/content') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Create page' }).click()
    ]);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/content') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Create child page under Untitled' }).click()
    ]);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/content') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Create page' }).click()
    ]);

    const contentRows = page.locator('[data-content-tree-row]');
    await expect(contentRows).toHaveCount(3);

    const childRow = contentRows.nth(1);
    const rootRow = contentRows.nth(2);
    const childEntryId = Number(await childRow.getAttribute('data-content-entry-id'));
    const rootEntryId = Number(await rootRow.getAttribute('data-content-entry-id'));

    expect(Number.isFinite(childEntryId)).toBe(true);
    expect(Number.isFinite(rootEntryId)).toBe(true);

    const moveRequestPromise = page.waitForRequest((request) => {
      if (
        !request.url().includes(`/api/content/${childEntryId}`) ||
        request.method() !== 'PATCH'
      ) {
        return false;
      }

      const payload = request.postDataJSON() as { position?: number };
      return typeof payload.position === 'number';
    });

    await page
      .locator(`[data-content-tree-drag-handle="${childEntryId}"]`)
      .dragTo(page.locator(`[data-content-tree-drag-handle="${rootEntryId}"]`));

    await moveRequestPromise;
  });
});

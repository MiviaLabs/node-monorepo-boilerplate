import { expect, test } from '@playwright/test';

import {
  installSeededSession,
  seedAuthenticatedOrganizationMemberSession,
  seedAuthenticatedOwnerSession
} from './support/seed-auth-session';

async function createIssueFromWorkspace(
  page: import('@playwright/test').Page,
  title: string
): Promise<{ issueId: string }> {
  await page.goto('/issues');
  await expect(page).toHaveURL(/\/issues$/);

  await page.getByRole('button', { name: 'Create issue' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Title').fill(title);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/issues') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    ),
    page.getByRole('button', { name: 'Create issue' }).last().click()
  ]);

  await page.waitForURL(/\/issues\/\d+/);
  const match = page.url().match(/\/issues\/(\d+)/);
  const issueId = match?.[1];
  expect(issueId).toBeTruthy();

  if (!issueId) {
    throw new Error(`Expected an issue URL, received ${page.url()}`);
  }

  return { issueId };
}

test.describe('Issues Delete Protected Flow (real API + testcontainers)', () => {
  test.setTimeout(180_000);

  test('deletes issues from the list, sidebar preview, and standalone detail page', async ({
    page
  }) => {
    const runId = `${Date.now()}`;
    const ownerSession = await seedAuthenticatedOwnerSession({
      displayName: 'Issues Owner',
      email: `issues-owner-${runId}@example.com`,
      organizationName: `issues-delete-${runId.slice(-6)}`
    });
    const memberSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: ownerSession.organizationId,
      tenantRecordId: ownerSession.tenantRecordId,
      displayName: 'Issues Manager',
      email: `issues-manager-${runId}@example.com`,
      role: 'tenant_admin',
      permissions: [
        'tenant:issues:read',
        'tenant:issues:create',
        'tenant:issues:update',
        'tenant:issues:delete',
        'tenant:projects:read'
      ]
    });

    await installSeededSession(page.context(), memberSession);

    const rowIssueTitle = `Row delete ${runId}`;
    const sidebarIssueTitle = `Sidebar delete ${runId}`;
    const detailIssueTitle = `Detail delete ${runId}`;

    const rowIssue = await createIssueFromWorkspace(page, rowIssueTitle);
    const sidebarIssue = await createIssueFromWorkspace(page, sidebarIssueTitle);
    const detailIssue = await createIssueFromWorkspace(page, detailIssueTitle);

    await page.goto('/issues');
    await expect(page.getByText(rowIssueTitle)).toBeVisible();
    await expect(page.getByText(sidebarIssueTitle)).toBeVisible();
    await expect(page.getByText(detailIssueTitle)).toBeVisible();

    const rowRecord = page.locator('[role="button"]').filter({ has: page.getByText(rowIssueTitle) });
    await rowRecord.getByRole('button', { name: 'Open issue row actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete issue' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Deleting this issue also deletes all comments, attached files, and subtasks.'
    );
    await expect(page.getByRole('dialog')).toContainText(
      'Attached files will be scheduled for permanent storage purge.'
    );
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/issues/${rowIssue.issueId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204
      ),
      page.getByRole('button', { name: 'Delete issue' }).click()
    ]);
    await expect(page.getByText(rowIssueTitle)).not.toBeVisible();

    const sidebarRecord = page
      .locator('[role="button"]')
      .filter({ has: page.getByText(sidebarIssueTitle) });
    await sidebarRecord.click();
    await expect(page).toHaveURL(new RegExp(`/issues\\?[^#]*issue=${sidebarIssue.issueId}`));
    await expect(page.getByRole('button', { name: 'Open sidebar issue actions' })).toBeVisible();
    await page.getByRole('button', { name: 'Open sidebar issue actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete issue' }).click();
    await expect(page.getByRole('dialog')).toContainText(sidebarIssueTitle);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/issues/${sidebarIssue.issueId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204
      ),
      page.getByRole('button', { name: 'Delete issue' }).click()
    ]);
    await expect(page).toHaveURL(/\/issues(?:\?.*)?$/);
    await expect(page.url()).not.toContain(`issue=${sidebarIssue.issueId}`);
    await expect(page.getByText(sidebarIssueTitle)).not.toBeVisible();

    await page.goto(`/issues/${detailIssue.issueId}`);
    await expect(page).toHaveURL(new RegExp(`/issues/${detailIssue.issueId}$`));
    await expect(page.getByText(detailIssueTitle)).toBeVisible();
    await page.getByRole('button', { name: 'Open issue detail actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete issue' }).click();
    await expect(page.getByRole('dialog')).toContainText(detailIssueTitle);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/issues/${detailIssue.issueId}`) &&
          response.request().method() === 'DELETE' &&
          response.status() === 204
      ),
      page.getByRole('button', { name: 'Delete issue' }).click()
    ]);
    await expect(page).toHaveURL(/\/issues(?:\?.*)?$/);
    await expect(page.getByText(detailIssueTitle)).not.toBeVisible();
  });
});

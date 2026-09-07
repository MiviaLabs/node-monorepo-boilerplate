import { expect, test } from '@playwright/test';

import {
  installSeededSession,
  seedAuthenticatedOrganizationMemberSession,
  seedAuthenticatedOwnerSession,
  seedProject
} from './support/seed-auth-session';

test.describe('Projects Management Flow (real API + testcontainers)', () => {
  test.setTimeout(180_000);

  test('registers a user and manages projects from the dashboard UI', async ({ page }) => {
    const runId = `${Date.now()}`;
    const email = `projects-e2e-${runId}@example.com`;
    const collaboratorEmail = `projects-collab-${runId}@example.com`;
    const organizationName = `projects-team-${runId.slice(-6)}`;
    const initialProjectName = `Atlas ${runId.slice(-4)}`;
    const updatedProjectName = `Atlas Revised ${runId.slice(-4)}`;

    const session = await seedAuthenticatedOwnerSession({
      displayName: 'Projects E2E',
      email,
      organizationName
    });
    const collaboratorSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: session.organizationId,
      tenantRecordId: session.tenantRecordId,
      displayName: 'Projects Collaborator',
      email: collaboratorEmail,
      permissions: ['tenant:projects:read', 'tenant:members:read', 'tenant:settings:read']
    });
    await installSeededSession(page.context(), session);

    await page.goto('/projects');
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);

    await page.getByRole('button', { name: 'New project' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByPlaceholder('Atlas').fill(initialProjectName);
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Private' }).click();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/projects.create') && response.status() === 200
      ),
      page.getByRole('button', { name: 'Create project' }).click()
    ]);

    await expect(page.getByText(initialProjectName)).toBeVisible();
    await expect(page.getByText('Private')).toBeVisible();

    await page.getByRole('button', { name: 'Manage' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await expect(page.getByRole('heading', { name: 'Project Overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current Members' })).toBeVisible();
    await expect(page.getByText('Projects E2E')).toBeVisible();
    await page.getByRole('link', { name: 'Open Issues' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/issues$/);
    await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();
    await expect(page.getByText('Preview workspace')).toBeVisible();
    await page.getByRole('link', { name: 'Back to overview' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await page.getByRole('link', { name: 'Open Wiki' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/wiki$/);
    await expect(page.getByRole('heading', { name: 'Wiki' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to overview' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await page.getByRole('link', { name: 'Open Integrations' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/integrations$/);
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to overview' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await page.getByRole('button', { name: 'Open context switcher' }).click();
    await expect(page.getByRole('menuitem', { name: 'Organization overview' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'My work' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'View all projects' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: initialProjectName })).toBeVisible();
    await page.getByRole('menuitem', { name: 'View all projects' }).click();
    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: initialProjectName }).click();
    await expect(page).toHaveURL(/\/projects\/\d+$/);
    await page.getByRole('link', { name: 'Project settings' }).click();
    await expect(page).toHaveURL(/\/projects\/\d+\/settings$/);
    await expect(page.getByRole('heading', { name: 'Project Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Project Members' })).toBeVisible();

    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByRole('heading', { name: 'Add Project Member' })).toBeVisible();
    await page.getByPlaceholder('Search by name or email').fill(collaboratorEmail);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/projects.addMember') && response.status() === 200
      ),
      page
        .locator('div')
        .filter({ hasText: collaboratorEmail })
        .getByRole('button', { name: 'Add' })
        .click()
    ]);

    await expect(page.getByText(collaboratorSession.userId.toString())).toBeVisible();
    await expect(page.getByText('Projects Collaborator')).toBeVisible();

    const collaboratorRow = page
      .locator('tr')
      .filter({ has: page.getByText(`User ID ${collaboratorSession.userId}`) });
    await collaboratorRow.getByRole('button', { name: 'Open member actions' }).click();
    await page.getByRole('menuitem', { name: 'Remove from project' }).click();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/projects.removeMember') && response.status() === 200
      ),
      page.getByRole('button', { name: 'Remove member' }).click()
    ]);

    await expect(page.getByText('Projects Collaborator')).not.toBeVisible();

    await page.getByLabel('Project name').fill(updatedProjectName);
    await page.getByLabel('Visibility').click();
    await page.getByRole('option', { name: 'Public' }).click();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/projects.update') && response.status() === 200
      ),
      page.getByRole('button', { name: 'Save changes' }).click()
    ]);

    await expect(page.getByText(updatedProjectName)).toBeVisible();
    await expect(page.getByText('Public')).toBeVisible();

    await page.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByText(`Delete ${updatedProjectName}?`)).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/projects.delete') && response.status() === 200
      ),
      page.getByRole('button', { name: 'Delete project' }).last().click()
    ]);

    await expect(page).toHaveURL('/projects');
    await expect(page.getByText(updatedProjectName)).not.toBeVisible();
    await expect(page.getByText('No projects match the current filters.')).toBeVisible();

    await page.goto('/projects');
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test('allows an assigned read-only member to view a private project without management access', async ({
    page
  }) => {
    const runId = `${Date.now()}-viewer`;
    const ownerEmail = `projects-owner-${runId}@example.com`;
    const viewerEmail = `projects-viewer-${runId}@example.com`;
    const organizationName = `projects-view-${runId.slice(-6)}`;
    const projectName = `Project Vault ${runId.slice(-4)}`;

    const ownerSession = await seedAuthenticatedOwnerSession({
      displayName: 'Projects Owner',
      email: ownerEmail,
      organizationName
    });
    const viewerSession = await seedAuthenticatedOrganizationMemberSession({
      organizationId: ownerSession.organizationId,
      tenantRecordId: ownerSession.tenantRecordId,
      displayName: 'Projects Viewer',
      email: viewerEmail,
      role: 'tenant_user',
      permissions: ['tenant:projects:read', 'tenant:members:read', 'tenant:settings:read']
    });
    const project = await seedProject({
      organizationId: ownerSession.organizationId,
      createdByUserId: ownerSession.userId,
      name: projectName,
      visibility: 'private',
      memberUserIds: [viewerSession.userId]
    });

    await installSeededSession(page.context(), viewerSession);

    await page.goto('/projects');
    await expect(page.getByText(projectName)).toBeVisible();
    await page.getByRole('link', { name: projectName }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    await expect(page.getByRole('heading', { name: 'Project Overview' })).toBeVisible();
    await expect(page.getByText(projectName)).toBeVisible();
    await expect(page.getByText('Projects Viewer')).toBeVisible();
    await page.getByRole('button', { name: 'Open context switcher' }).click();
    await page.getByRole('menuitem', { name: 'My work' }).click();
    await expect(page).toHaveURL('/my');
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole('heading', { name: 'Project Overview' })).toBeVisible();
    await page.getByRole('link', { name: 'Project settings' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/settings$`));
    await expect(page.getByRole('heading', { name: 'Project Settings' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add member' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete project' })).toBeDisabled();
    await expect(page.getByLabel('Project name')).toBeDisabled();
  });

  test('recovers safely from stale or unavailable project routes', async ({ page }) => {
    const runId = `${Date.now()}-stale`;
    const email = `projects-stale-${runId}@example.com`;
    const organizationName = `projects-stale-${runId.slice(-6)}`;

    const session = await seedAuthenticatedOwnerSession({
      displayName: 'Projects Recovery',
      email,
      organizationName
    });
    await installSeededSession(page.context(), session);

    await page.goto('/projects/99999999');
    await expect(page).toHaveURL(/\/projects\?projectContext=unavailable$/);
    await expect(page.getByText('Project context reset')).toBeVisible();
    await expect(page.getByText('returned to the project directory')).toBeVisible();
  });
});

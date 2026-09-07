import { expect, test } from '@playwright/test';

const API_BASE_URL = process.env['API_URL'] ?? 'http://localhost:3000';

function createRunId() {
  return `${Date.now()}`;
}

function unwrapData<T>(payload: T | { data?: T } | null | undefined): T | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return ((payload as { data?: T }).data ?? null) as T | null;
  }

  return payload as T;
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/login') &&
        response.request().method() === 'POST' &&
        response.ok()
    ),
    page.getByRole('button', { name: 'Sign in' }).click()
  ]);

  await page.waitForURL('**/inbox');
  await expect(page.getByText('All inbox')).toBeVisible();
}

async function openAccountMenu(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /system_owner|system owner/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
}

async function editDisplayName(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Edit' }).nth(0).click();
}

async function editPhoneNumber(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Edit' }).first().click();
}

async function ensureBootstrapped(
  page: import('@playwright/test').Page,
  {
    organizationName,
    organizationSlug,
    ownerDisplayName,
    ownerEmail,
    ownerPassword
  }: {
    organizationName: string;
    organizationSlug: string;
    ownerDisplayName: string;
    ownerEmail: string;
    ownerPassword: string;
  }
) {
  await page.goto('/');

  if (!page.url().includes('/install')) {
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
    return;
  }

  await expect(page.getByRole('heading', { name: 'Initialize this admin.' })).toBeVisible();

  await page.getByLabel('Organization name').fill(organizationName);
  await expect(page.getByLabel('Organization slug')).toHaveValue(organizationSlug);
  await page.getByLabel('Owner display name').fill(ownerDisplayName);
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(ownerPassword);
  await page.getByLabel('Confirm password').fill(ownerPassword);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/bootstrap/install') &&
        response.request().method() === 'POST' &&
        response.ok()
    ),
    page.getByRole('button', { name: 'Complete installation' }).click()
  ]);

  await page.waitForURL('**/');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
}

async function createLegacySessionCookies(
  page: import('@playwright/test').Page,
  baseURL: string,
  email: string,
  password: string
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/iam/sessions`, {
    data: {
      email,
      password
    }
  });

  expect(response.ok()).toBeTruthy();

  const payload = unwrapData(
    (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
      user?: { tenantId?: string };
      data?: {
        accessToken?: string;
        refreshToken?: string;
        user?: { tenantId?: string };
      };
    } | null
  );

  expect(payload?.accessToken).toBeTruthy();
  expect(payload?.refreshToken).toBeTruthy();
  expect(payload?.user?.tenantId).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'admin_access_token',
      value: payload!.accessToken!,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax'
    },
    {
      name: 'admin_refresh_token',
      value: payload!.refreshToken!,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax'
    },
    {
      name: 'admin_tenant_id',
      value: payload!.user!.tenantId!,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
}

test.describe.serial('Admin bootstrap install flow', () => {
  const runId = createRunId();
  const ownerEmail = `admin-bootstrap-${runId}@example.com`;
  const ownerPassword = `Boot${runId.slice(-6)}!Aa`;
  const organizationName = `Bootstrap Ops ${runId.slice(-4)}`;
  const organizationSlug = `bootstrap-ops-${runId.slice(-4)}`;
  const ownerDisplayName = 'Bootstrap Owner';

  test('fresh system redirects to install, completes bootstrap, and returns to login', async ({
    page
  }) => {
    await page.goto('/');
    await page.waitForURL('**/install');

    await expect(page.getByRole('heading', { name: 'Initialize this admin.' })).toBeVisible();
    await expect(
      page.getByText('Create the first organization and the first system owner')
    ).toBeVisible();

    await page.getByLabel('Organization name').fill(organizationName);
    await expect(page.getByLabel('Organization slug')).toHaveValue(organizationSlug);
    await page.getByLabel('Owner display name').fill(ownerDisplayName);
    await page.getByLabel('Email').fill(ownerEmail);
    await page.getByLabel('Password', { exact: true }).fill(ownerPassword);
    await page.getByLabel('Confirm password').fill(ownerPassword);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/bootstrap/install') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Complete installation' }).click()
    ]);

    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('initialized system blocks install and keeps protected dashboard behind login', async ({
    page
  }) => {
    await page.goto('/install');
    await page.waitForURL('**/');

    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    await page.goto('/dashboard');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();

    const postInstallResponse = await page.request.post('/api/bootstrap/install', {
      data: {
        organizationName: 'Blocked Bootstrap',
        organizationSlug: 'blocked-bootstrap',
        displayName: 'Blocked Owner',
        email: `blocked-${runId}@example.com`,
        password: 'BlockedPassword123!',
        confirmPassword: 'BlockedPassword123!'
      }
    });

    expect(postInstallResponse.status()).toBe(409);
  });

  test('login redirects to inbox after bootstrap initialization', async ({ page }) => {
    await login(page, ownerEmail, ownerPassword);

    await page.goto('/');
    await page.waitForURL('**/inbox');
    await expect(page.getByText('All inbox')).toBeVisible();
  });

  test('account menu navigation keeps the operator authenticated', async ({ page }) => {
    test.setTimeout(60_000);

    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Profile' }).click();
    await page.waitForURL('**/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.waitForURL('**/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.goto('/inbox');
    await page.waitForURL('**/inbox');
    await expect(page.getByText('All inbox')).toBeVisible();
  });

  test('health overview stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/health');
    await page.waitForURL('**/health');
    await expect(page.getByText('Current service table')).toBeVisible();
    await expect(page.getByText('Recent incident queue')).toBeVisible();
    await expect(page.getByText('Database')).toBeVisible();
    await expect(page.getByRole('main').getByText('Tenants', { exact: true })).toBeVisible();
  });

  test('statistics overview stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/statistics');
    await page.waitForURL('**/statistics');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
    await expect(main.getByText('Published deliveries, retries, and dead letters')).toBeVisible();
    await expect(main.getByText('Platform volume')).toBeVisible();
    await expect(main.getByText('Delivery state distribution')).toBeVisible();
    await expect(main.getByText('Operational summary')).toBeVisible();
    await expect(main.getByText('Deletion queue', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open deletion queue' })).toBeVisible();
    await expect(main.getByText('Outbox queue', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open outbox monitor' })).toBeVisible();
  });

  test('deletion queue stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/system/deletions');
    await page.waitForURL('**/system/deletions');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Deletion queue' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Pending deletions' })).toBeVisible();
    await expect(main.getByText('Purge policy')).toBeVisible();
    await expect(main.getByText('Age buckets')).toBeVisible();
  });

  test('outbox monitor stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/system/outbox');
    await page.waitForURL('**/system/outbox');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Outbox monitor' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Delivery backlog' })).toBeVisible();
    await expect(main.getByText('Queue posture')).toBeVisible();
    await expect(main.getByText('Delivery details')).toBeVisible();
  });

  test('tenants inventory stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/tenants');
    await page.waitForURL('**/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await expect(page.getByText('Tenant inventory')).toBeVisible();
    await expect(page.getByText('Provisioning gaps')).toBeVisible();
    await expect(page.getByText('Members tracked')).toBeVisible();
    await page.getByRole('link', { name: 'View memberships' }).first().click();
    await page.waitForURL(/\/access\?.*memberOrganizationId=.*memberTenantId=.*/);
    await expect(page.getByRole('heading', { name: 'Access' })).toBeVisible();
    await expect(page.getByText('Scoped member view')).toBeVisible();
  });

  test('tenant lifecycle create and edit flows work after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    const tenantName = `Phase3 Tenant ${runId.slice(-4)}`;
    const tenantSlug = `phase3-tenant-${runId.slice(-4)}`;
    const updatedTenantName = `${tenantName} Updated`;

    await page.goto('/tenants');
    await page.waitForURL('**/tenants');

    await page.getByRole('button', { name: 'Create tenant' }).click();
    const createDialog = page.getByRole('dialog');
    await expect(createDialog.getByRole('heading', { name: 'Create tenant' })).toBeVisible();
    await createDialog.getByLabel('Tenant name').fill(tenantName);
    await createDialog.getByLabel('Tenant slug').fill(tenantSlug);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/system/tenants') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      createDialog.getByRole('button', { name: 'Create tenant' }).click()
    ]);

    await expect(page.getByRole('link', { name: tenantName })).toBeVisible();
    await page.getByRole('link', { name: tenantName }).click();
    await page.waitForURL(/\/tenants\/\d+/);
    await expect(page.getByRole('heading', { name: tenantName })).toBeVisible();

    await page.getByRole('button', { name: 'Edit lifecycle' }).click();
    const updateDialog = page.getByRole('dialog');
    await expect(
      updateDialog.getByRole('heading', { name: 'Edit tenant lifecycle' })
    ).toBeVisible();
    await updateDialog.getByLabel('Tenant name').fill(updatedTenantName);
    await updateDialog.getByLabel('Lifecycle status').selectOption('suspended');

    await Promise.all([
      page.waitForResponse(
        (response) =>
          /\/api\/system\/tenants\/\d+$/.test(response.url()) &&
          response.request().method() === 'PATCH' &&
          response.ok()
      ),
      updateDialog.getByRole('button', { name: 'Save lifecycle' }).click()
    ]);

    await expect(page.getByText(updatedTenantName)).toBeVisible();
    await expect(page.getByText('Suspended')).toBeVisible();
  });

  test('access governance stays accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/access');
    await page.waitForURL('**/access');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Access' })).toBeVisible();
    await expect(main.getByText('Privileged access posture', { exact: true })).toBeVisible();
    await expect(main.getByText('Active invitations', { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'View invitations' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Members', exact: true })).toBeVisible();
  });

  test('access invitations stay accessible after login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/access/invitations');
    await page.waitForURL('**/access/invitations');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Access Invitations' })).toBeVisible();
    await expect(main.getByText('Invitation posture', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Apply invitation filters' })).toBeVisible();
  });

  test('profile updates persist through auth me hydration and page refresh', async ({ page }) => {
    const updatedDisplayName = `Bootstrap Owner ${runId.slice(-4)}`;
    const updatedPhoneNumber = '+14155552671';
    const main = page.locator('main');

    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Profile' }).click();
    await page.waitForURL('**/profile');

    await expect(main.getByText(ownerDisplayName).first()).toBeVisible();
    await expect(main.getByText(ownerEmail)).toBeVisible();
    await expect(main.getByText('Not set')).toBeVisible();

    await editDisplayName(page);
    await expect(page.getByLabel('Display name')).toHaveValue(ownerDisplayName);
    await page.getByLabel('Display name').fill(updatedDisplayName);

    await editPhoneNumber(page);
    await expect(page.getByLabel('Phone number')).toHaveValue('');
    await page.getByLabel('Phone number').fill(updatedPhoneNumber);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/trpc/auth.updateMyProfile') &&
          response.request().method() === 'POST' &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Save changes' }).click()
    ]);

    await expect(main.getByText(updatedDisplayName).first()).toBeVisible();
    await expect(main.getByText(updatedPhoneNumber)).toBeVisible();

    await page.reload();
    await page.waitForURL('**/profile');

    await expect(main.getByText(updatedDisplayName).first()).toBeVisible();
    await expect(main.getByText(updatedPhoneNumber)).toBeVisible();

    await editDisplayName(page);
    await expect(page.getByLabel('Display name')).toHaveValue(updatedDisplayName);

    await editPhoneNumber(page);
    await expect(page.getByLabel('Phone number')).toHaveValue(updatedPhoneNumber);
    await expect(main.getByText(updatedDisplayName).first()).toBeVisible();

    await openAccountMenu(page);
    await expect(
      page.getByRole('button', { name: new RegExp(updatedDisplayName, 'i') })
    ).toBeVisible();
  });

  test('profile exposes a downloadable self-service account export', async ({ page }) => {
    test.setTimeout(60_000);

    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/profile');
    await page.waitForURL('**/profile');
    await expect(page.getByText('Operator sessions')).toBeVisible();
    const exportLink = page.getByRole('link', { name: 'Download my account export' });
    await expect(exportLink).toBeVisible();
    const exportHref = await exportLink.getAttribute('href');

    expect(exportHref).toBeTruthy();

    const response = await page.context().request.get(exportHref!);

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-disposition']).toContain('user-');
    expect(response.headers()['content-disposition']).toContain('-export.json');
    await expect(response.text()).resolves.toContain('"data"');
  });

  test('logout route clears the session and returns the user to login', async ({ page }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await login(page, ownerEmail, ownerPassword);

    await page.goto('/logout');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();

    const clearedCookies = await page.context().cookies();
    expect(clearedCookies.find((cookie) => cookie.name === 'bo_session')).toBeFalsy();
    expect(clearedCookies.find((cookie) => cookie.name === 'admin_access_token')).toBeFalsy();
    expect(clearedCookies.find((cookie) => cookie.name === 'admin_refresh_token')).toBeFalsy();
    expect(clearedCookies.find((cookie) => cookie.name === 'admin_tenant_id')).toBeFalsy();

    await page.goto('/dashboard');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
  });

  test('legacy token cookies are migrated into the opaque redis-backed session', async ({
    page,
    baseURL
  }) => {
    await ensureBootstrapped(page, {
      organizationName,
      organizationSlug,
      ownerDisplayName,
      ownerEmail,
      ownerPassword
    });

    await createLegacySessionCookies(page, baseURL!, ownerEmail, ownerPassword);

    await page.goto('/dashboard');
    await page.waitForURL('**/inbox');
    await expect(page.getByText('All inbox')).toBeVisible();

    const migratedCookies = await page.context().cookies();
    expect(migratedCookies.find((cookie) => cookie.name === 'bo_session')?.value).toBeTruthy();
    expect(migratedCookies.find((cookie) => cookie.name === 'admin_access_token')).toBeFalsy();
    expect(
      migratedCookies.find((cookie) => cookie.name === 'admin_refresh_token')
    ).toBeFalsy();
    expect(migratedCookies.find((cookie) => cookie.name === 'admin_tenant_id')).toBeFalsy();

    await page.reload();
    await page.waitForURL('**/inbox');
    await expect(page.getByText('All inbox')).toBeVisible();
  });

  test('invalid opaque session redirects the user back to login', async ({ page, baseURL }) => {
    await login(page, ownerEmail, ownerPassword);

    await page.context().addCookies([
      {
        name: 'bo_session',
        value: 'invalid-session-id',
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ]);

    await page.goto('/dashboard');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();

    const clearedCookies = await page.context().cookies();
    expect(clearedCookies.find((cookie) => cookie.name === 'bo_session')).toBeFalsy();

    await page.goto('/dashboard');
    await page.waitForURL('**/');
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
  });
});

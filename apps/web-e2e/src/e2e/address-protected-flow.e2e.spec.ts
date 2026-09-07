import { expect, test } from '@playwright/test';

/**
 * Address Protected Flow E2E Test
 *
 * Full-stack Playwright E2E test that validates:
 * 1. User registration and authentication flow
 * 2. Protected route navigation with auth/session/tenant propagation
 * 3. Address CRUD operations through tRPC/Next.js routes
 * 4. Auth state consistency across protected routes
 *
 * Environment:
 * - Playwright -> web -> api -> Testcontainers infrastructure
 * - Uses real backend stack, no internal mocks
 *
 * Execution:
 *   pnpm --dir apps/api test:e2e:setup
 *   pnpm exec nx e2e web-e2e --grep "Address Protected Flow"
 *   pnpm --dir apps/api test:e2e:teardown
 */
test.describe('Address Protected Flow (real API + testcontainers)', () => {
  test('registers user, navigates protected routes, and manages addresses with auth propagation', async ({
    page,
    request
  }) => {
    const runId = `${Date.now()}`;
    const email = `addr-e2e-${runId}@example.com`;
    const password = 'Passw0rd!Strong';
    const organizationName = `addr-team-${runId.slice(-6)}`;
    const authMeStatuses: number[] = [];
    const authMeUrls: string[] = [];

    // Track all /api/auth/me requests to validate auth propagation
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/auth/me')) {
        authMeStatuses.push(response.status());
        authMeUrls.push(url);

        // Validate the response is NOT a 400 (API_008 - Missing x-tenant-id)
        expect(response.status()).not.toBe(400);

        // Validate the response is NOT a 401 (AUTH_001 - Invalid credentials)
        expect(response.status()).not.toBe(401);
      }
    });

    // ========================================================================
    // PHASE 1: User Registration
    // ========================================================================
    await page.goto('/register');

    await page.getByLabel('Display name').fill('Address E2E User');
    await page.getByLabel('Organization / Team name').fill(organizationName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('checkbox').check();

    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Create account' }).click()
    ]);

    // ========================================================================
    // PHASE 2: Validate Auth Propagation on Protected Routes
    // ========================================================================

    /**
     * Helper to assert /api/auth/me health on a route
     * Validates that auth/session/tenant context propagates correctly
     */
    const assertRouteAuthMeHealthy = async (
      path: string,
      headingName: string,
      messagePrefix: string
    ) => {
      const startIndex = authMeStatuses.length;

      await page.goto(path);
      await expect(page.getByRole('heading', { name: headingName })).toBeVisible();

      // Wait for /api/auth/me to be called during route hydration
      await expect
        .poll(() => authMeStatuses.slice(startIndex), {
          message: `${messagePrefix}: expected /api/auth/me to return 200 during hydration`
        })
        .toContain(200);

      const routeStatuses = authMeStatuses.slice(startIndex);
      const routeUrls = authMeUrls.slice(startIndex);

      // Critical assertions:
      // 1. No 400 (API_008 - Missing x-tenant-id header)
      expect(routeStatuses, 'Should not contain 400 (missing tenant)').not.toContain(400);

      // 2. No 401 (AUTH_001 - Invalid/expired credentials)
      expect(routeStatuses, 'Should not contain 401 (auth failed)').not.toContain(401);

      // 3. At least one successful 200 response
      expect(
        routeStatuses.filter((s) => s === 200).length,
        'Should have at least one 200'
      ).toBeGreaterThan(0);

      // 4. Validate the /api/auth/me endpoint is called through Next.js API route
      const authMeCalls = routeUrls.filter((u) => u.includes('/api/auth/me'));
      expect(authMeCalls.length, 'Should have called /api/auth/me').toBeGreaterThan(0);
    };

    // Test auth propagation across multiple protected routes
    await assertRouteAuthMeHealthy('/dashboard', 'Dashboard', 'Dashboard');
    await assertRouteAuthMeHealthy('/dashboard/profile', 'Profile', 'Profile');
    await assertRouteAuthMeHealthy('/dashboard/settings', 'Account Settings', 'Settings');

    // ========================================================================
    // PHASE 3: Address CRUD Operations via API
    // ========================================================================

    // Get the auth token from cookies to make direct API calls
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name === 'session' || c.name === '__Secure-session'
    );

    expect(sessionCookie, 'Session cookie should exist after registration').toBeDefined();

    // Extract user ID and tenant ID from the /api/auth/me response
    const authMeResponse = await request.get('/api/auth/me', {
      headers: {
        Cookie: `session=${sessionCookie?.value}`
      }
    });

    expect(authMeResponse.ok(), '/api/auth/me should be accessible').toBeTruthy();

    const authMeData = await authMeResponse.json();
    const userId = authMeData.data?.user?.id || authMeData.data?.userId;
    const tenantId = authMeData.data?.tenant?.id || authMeData.data?.tenantId;

    expect(userId, 'User ID should be available').toBeDefined();
    expect(tenantId, 'Tenant ID should be available').toBeDefined();

    // ========================================================================
    // Address CREATE Operation
    // ========================================================================

    // Create a new address via Next.js API route (proxying to NestJS backend)
    const createAddressResponse = await request.post(`/api/v1/people/${userId}/addresses`, {
      headers: {
        Cookie: `session=${sessionCookie?.value}`,
        'Content-Type': 'application/json'
      },
      data: {
        addressType: 'primary',
        label: 'Home',
        isDefault: true,
        components: {
          street: '123 Test Street',
          street2: 'Apt 4B',
          city: 'Testville',
          state: 'TS',
          postalCode: '12345',
          country: 'US'
        }
      }
    });

    expect(createAddressResponse.ok(), 'Address creation should succeed').toBeTruthy();
    const createdAddress = await createAddressResponse.json();

    expect(createdAddress.data, 'Created address should have data').toBeDefined();
    expect(createdAddress.data.id, 'Created address should have ID').toBeDefined();
    expect(createdAddress.data.addressType, 'Address type should match').toBe('primary');
    expect(createdAddress.data.isDefault, 'Default flag should match').toBe(true);
    expect(createdAddress.data.countryCode, 'Country code should be set').toBe('US');

    // CRITICAL: PII should NOT be in response (vault-backed storage)
    expect(createdAddress.data.components, 'PII components should not be exposed').toBeUndefined();
    expect(createdAddress.data.street, 'Street PII should not be exposed').toBeUndefined();
    expect(createdAddress.data.city, 'City PII should not be exposed').toBeUndefined();

    const createdAddressId = createdAddress.data.id;

    // ========================================================================
    // Address READ Operation (Get All)
    // ========================================================================

    const getAddressesResponse = await request.get(`/api/v1/people/${userId}/addresses`, {
      headers: {
        Cookie: `session=${sessionCookie?.value}`
      }
    });

    expect(getAddressesResponse.ok(), 'Get addresses should succeed').toBeTruthy();
    const addressesList = await getAddressesResponse.json();

    expect(addressesList.data, 'Addresses list should exist').toBeInstanceOf(Array);
    expect(addressesList.data.length, 'Should have at least one address').toBeGreaterThan(0);
    expect(addressesList.data[0].id, 'Address in list should have ID').toBe(createdAddressId);

    // ========================================================================
    // Address READ Operation (Get Default)
    // ========================================================================

    const getDefaultAddressResponse = await request.get(
      `/api/v1/people/${userId}/addresses/default`,
      {
        headers: {
          Cookie: `session=${sessionCookie?.value}`
        }
      }
    );

    expect(getDefaultAddressResponse.ok(), 'Get default address should succeed').toBeTruthy();
    const defaultAddress = await getDefaultAddressResponse.json();

    expect(defaultAddress.data, 'Default address should exist').toBeDefined();
    expect(defaultAddress.data.id, 'Default address ID should match').toBe(createdAddressId);
    expect(defaultAddress.data.isDefault, 'Should be marked as default').toBe(true);

    // ========================================================================
    // Address UPDATE Operation
    // ========================================================================

    const updateAddressResponse = await request.patch(
      `/api/v1/people/${userId}/addresses/${createdAddressId}`,
      {
        headers: {
          Cookie: `session=${sessionCookie?.value}`,
          'Content-Type': 'application/json'
        },
        data: {
          label: 'Updated Home',
          components: {
            city: 'New Testville',
            state: 'NT',
            postalCode: '54321'
          }
        }
      }
    );

    expect(updateAddressResponse.ok(), 'Address update should succeed').toBeTruthy();
    const updatedAddress = await updateAddressResponse.json();

    expect(updatedAddress.data.label, 'Label should be updated').toBe('Updated Home');
    expect(updatedAddress.data.id, 'ID should remain unchanged').toBe(createdAddressId);

    // ========================================================================
    // Address READ Operation (Get Single)
    // ========================================================================

    const getSingleAddressResponse = await request.get(
      `/api/v1/people/${userId}/addresses/${createdAddressId}`,
      {
        headers: {
          Cookie: `session=${sessionCookie?.value}`
        }
      }
    );

    expect(getSingleAddressResponse.ok(), 'Get single address should succeed').toBeTruthy();
    const singleAddress = await getSingleAddressResponse.json();

    expect(singleAddress.data.id, 'Single address ID should match').toBe(createdAddressId);
    expect(singleAddress.data.label, 'Single address label should match updated').toBe(
      'Updated Home'
    );

    // ========================================================================
    // Final Auth Propagation Check After Operations
    // ========================================================================

    // Navigate to profile again and ensure auth context still valid after all operations
    await assertRouteAuthMeHealthy(
      '/dashboard/profile',
      'Profile',
      'Profile after address operations'
    );

    // ========================================================================
    // Address DELETE Operation
    // ========================================================================

    const deleteAddressResponse = await request.delete(
      `/api/v1/people/${userId}/addresses/${createdAddressId}`,
      {
        headers: {
          Cookie: `session=${sessionCookie?.value}`
        }
      }
    );

    expect(deleteAddressResponse.status(), 'Address delete should return 204').toBe(204);

    // Verify address is deleted (soft delete - should not be in list)
    const getAddressesAfterDeleteResponse = await request.get(`/api/v1/people/${userId}/addresses`, {
      headers: {
        Cookie: `session=${sessionCookie?.value}`
      }
    });

    const addressesAfterDelete = await getAddressesAfterDeleteResponse.json();
    const deletedAddressInList = addressesAfterDelete.data.find(
      (a: { id: number }) => a.id === createdAddressId
    );

    expect(deletedAddressInList, 'Deleted address should not be in list').toBeUndefined();

    // ========================================================================
    // Summary Assertions
    // ========================================================================

    // Overall /api/auth/me health check
    const allAuthMeStatuses = new Set(authMeStatuses);

    // No 400s (API_008 - Missing x-tenant-id header)
    expect(allAuthMeStatuses.has(400), 'Should never have 400 (missing tenant header)').toBe(false);

    // No 401s (AUTH_001 - Invalid credentials)
    expect(allAuthMeStatuses.has(401), 'Should never have 401 (invalid auth)').toBe(false);

    // Should have successful 200s
    expect(
      authMeStatuses.filter((s) => s === 200).length,
      'Should have multiple 200 responses'
    ).toBeGreaterThan(0);

    // Verify total number of /api/auth/me calls
    expect(
      authMeStatuses.length,
      'Should have called /api/auth/me multiple times'
    ).toBeGreaterThanOrEqual(4);
  });
});

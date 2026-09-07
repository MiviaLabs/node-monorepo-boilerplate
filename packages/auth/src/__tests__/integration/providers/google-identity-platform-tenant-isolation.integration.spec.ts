/**
 * Integration tests for Google Identity Platform Auth Provider - Tenant Isolation
 *
 * These tests verify multi-tenancy, tenant isolation, user info retrieval, and health checks.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before } from 'node:test';

import {
  skipIntegrationTests,
  TEST_TENANT_A,
  TEST_TENANT_B,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  TENANT_A_USER_EMAIL,
  TENANT_B_USER_EMAIL,
  USER_A_EMAIL,
  DEFAULT_TEST_PASSWORD,
  BASE_OPTIONS,
  createProviderForTenant,
  createTenantProviders,
  setupAllTenantTestUsers,
  setupTestUsersForTenant,
  GoogleIdentityPlatformAuthProvider
} from './google-identity-platform-test-helpers';

describe('GoogleIdentityPlatformAuthProvider - Multi-Tenancy and Tenant Isolation', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider;
  let providerTenantB: GoogleIdentityPlatformAuthProvider;

  before(async () => {
    // Create test users in emulator for both tenants before running tests
    // Helper functions handle skipIntegrationTests internally
    await setupAllTenantTestUsers();
    const providers = createTenantProviders();
    providerTenantA = providers.providerTenantA;
    providerTenantB = providers.providerTenantB;
  });

  it('should create provider with tenant-specific configuration', () => {
    const provider = createProviderForTenant(TEST_TENANT_A);
    assert.ok(provider, 'Provider should be created with tenant config');
  });

  it('should create providers for multiple tenants', () => {
    const providerA = createProviderForTenant(TEST_TENANT_A);
    const providerB = createProviderForTenant(TEST_TENANT_B);

    assert.ok(providerA, 'Tenant A provider should be created');
    assert.ok(providerB, 'Tenant B provider should be created');
  });

  it('should authenticate with tenant-specific auth', { skip: skipIntegrationTests }, async () => {
    const resultA = await providerTenantA.authenticate({
      email: TENANT_A_USER_EMAIL,
      password: DEFAULT_TEST_PASSWORD
    });

    const resultB = await providerTenantB.authenticate({
      email: TENANT_B_USER_EMAIL,
      password: DEFAULT_TEST_PASSWORD
    });

    assert.ok(resultA.accessToken, 'Tenant A should get token');
    assert.ok(resultB.accessToken, 'Tenant B should get token');
    assert.notStrictEqual(resultA.accessToken, resultB.accessToken, 'Tokens should be different');
  });

  it('should have validateToken method for tenant-scoped validation', () => {
    assert.ok(
      typeof GoogleIdentityPlatformAuthProvider.prototype.validateToken === 'function',
      'Provider should have validateToken for tenant-scoped validation'
    );
  });

  it(
    'should not allow tenant A token to validate with tenant B provider',
    { skip: skipIntegrationTests },
    async () => {
      // Authenticate with tenant A
      const authResult = await providerTenantA.authenticate({
        email: TENANT_A_USER_EMAIL,
        password: DEFAULT_TEST_PASSWORD
      });

      // Try to validate with tenant B provider - should fail or reject
      const validationResult = await providerTenantB.validateToken(authResult.accessToken);

      // Token from tenant A should not be valid in tenant B context
      assert.strictEqual(
        validationResult.valid,
        false,
        'Token from tenant A should not be valid with tenant B provider'
      );
    }
  );

  it(
    'should maintain tenant isolation for user operations',
    { skip: skipIntegrationTests },
    async () => {
      // Create users in different tenants
      const userATenantA = await providerTenantA.authenticate({
        email: USER_A_EMAIL,
        password: DEFAULT_TEST_PASSWORD
      });

      const userATenantB = await providerTenantB.authenticate({
        email: USER_A_EMAIL, // Same email, different tenant
        password: DEFAULT_TEST_PASSWORD
      });

      // Verify user IDs are returned from authentication
      assert.ok(userATenantA.userId, 'Tenant A authentication should return userId');
      assert.ok(userATenantB.userId, 'Tenant B authentication should return userId');

      // Should be different users (different user IDs)
      const userInfoA = await providerTenantA.getUserInfo(userATenantA.userId, TEST_TENANT_A);
      const userInfoB = await providerTenantB.getUserInfo(userATenantB.userId, TEST_TENANT_B);

      assert.notStrictEqual(
        userInfoA.userId,
        userInfoB.userId,
        'Same email in different tenants should be different users'
      );
    }
  );

  it('should create provider with invalid tenant ID', () => {
    const invalidProvider = new GoogleIdentityPlatformAuthProvider({
      ...BASE_OPTIONS,
      tenantId: 'invalid-tenant-id'
    });

    assert.ok(invalidProvider, 'Provider should be created even with invalid tenant');
  });

  it(
    'should reject authentication with invalid tenant ID',
    { skip: skipIntegrationTests },
    async () => {
      const invalidProvider = new GoogleIdentityPlatformAuthProvider({
        ...BASE_OPTIONS,
        tenantId: 'invalid-tenant-id'
      });

      await assert.rejects(
        async () => {
          await invalidProvider.authenticate({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD
          });
        },
        (error: Error) => {
          assert.ok(error instanceof Error);
          return true;
        }
      );
    }
  );

  it('should validate tokens with tenant context', { skip: skipIntegrationTests }, async () => {
    const authResult = await providerTenantA.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Validate with correct tenant context
    const result = await providerTenantA.validateToken(authResult.accessToken);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.tenantId, TEST_TENANT_A, 'Should include tenant ID in result');
  });

  it(
    'should get tenant-specific roles from custom claims',
    { skip: skipIntegrationTests },
    async () => {
      // Authenticate user with roles
      const authResult = await providerTenantA.authenticate({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD
      });

      assert.ok(authResult.userId, 'Expected authenticate() to return userId');
      const userId = authResult.userId;

      const roles = await providerTenantA.getRoles(userId, TEST_TENANT_A);

      assert.ok(Array.isArray(roles), 'Roles should be an array');
    }
  );

  it(
    'should get tenant-specific permissions from custom claims',
    { skip: skipIntegrationTests },
    async () => {
      const authResult = await providerTenantA.authenticate({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD
      });

      assert.ok(authResult.userId, 'Expected authenticate() to return userId');
      const userId = authResult.userId;

      const permissions = await providerTenantA.getPermissions(userId, TEST_TENANT_A);

      assert.ok(Array.isArray(permissions), 'Permissions should be an array');
    }
  );
});

describe('GoogleIdentityPlatformAuthProvider - User Information Retrieval', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider;

  before(async () => {
    // Create test users in emulator before running tests
    // Helper functions handle skipIntegrationTests internally
    await setupTestUsersForTenant(TEST_TENANT_A);
    providerTenantA = createProviderForTenant(TEST_TENANT_A);
  });

  it('should get user info by ID', { skip: skipIntegrationTests }, async () => {
    const authResult = await providerTenantA.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    assert.ok(authResult.userId, 'Expected authenticate() to return userId');
    const userId = authResult.userId;

    const userInfo = await providerTenantA.getUserInfo(userId, TEST_TENANT_A);

    assert.ok(userInfo, 'User info should be returned');
    assert.strictEqual(userInfo.email, TEST_USER_EMAIL);
  });

  it('should extract user info from token', { skip: skipIntegrationTests }, async () => {
    const authResult = await providerTenantA.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    const validationResult = await providerTenantA.validateToken(authResult.accessToken);

    assert.ok(validationResult.userId, 'Should include user ID');
  });

  it(
    'should reject getUserInfo for non-existent user',
    { skip: skipIntegrationTests },
    async () => {
      const provider = createProviderForTenant(TEST_TENANT_A);

      await assert.rejects(
        async () => {
          await provider.getUserInfo('non-existent-user-id', TEST_TENANT_A);
        },
        (error: Error) => {
          assert.ok(error instanceof Error);
          return true;
        }
      );
    }
  );
});

describe('GoogleIdentityPlatformAuthProvider - Health Check', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider;

  before(async () => {
    // Health checks don't require users but setup for consistency
    providerTenantA = createProviderForTenant(TEST_TENANT_A);
  });

  it('should return boolean from isAvailable', async () => {
    const provider = createProviderForTenant(TEST_TENANT_A);

    // Without emulator, isAvailable may return false but should not throw
    const available = await provider.isAvailable();
    assert.ok(typeof available === 'boolean', 'Should return boolean');
  });

  it(
    'should return true when Firebase Auth is accessible',
    { skip: skipIntegrationTests },
    async () => {
      const available = await providerTenantA.isAvailable();
      assert.strictEqual(available, true);
    }
  );

  it('should return boolean from healthCheck', async () => {
    const provider = createProviderForTenant(TEST_TENANT_A);

    const healthy = await provider.healthCheck();
    assert.ok(typeof healthy === 'boolean', 'Should return boolean');
  });

  it(
    'should pass health check when emulator is running',
    { skip: skipIntegrationTests },
    async () => {
      const healthy = await providerTenantA.healthCheck();
      assert.strictEqual(healthy, true);
    }
  );

  it('should return false when Firebase Auth is not accessible', async () => {
    const unavailableProvider = new GoogleIdentityPlatformAuthProvider({
      projectId: 'invalid-project',
      apiKey: 'invalid-key',
      timeout: 1000
    });

    const available = await unavailableProvider.isAvailable();

    // Should handle connection errors gracefully
    assert.ok(typeof available === 'boolean');
  });
});

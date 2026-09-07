/**
 * Integration tests for Google Identity Platform Auth Provider - Authentication Flow
 *
 * These tests verify authentication flows including login, validation, refresh, and logout.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

import {
  skipIntegrationTests,
  TEST_TENANT_A,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  BASE_OPTIONS,
  createProviderForTenant,
  setupTestUsersForTenant,
  GoogleIdentityPlatformAuthProvider
} from './google-identity-platform-test-helpers';

describe('GoogleIdentityPlatformAuthProvider - Authentication Flow', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider;

  before(async () => {
    // Create test users in emulator before running tests
    // Helper functions handle skipIntegrationTests internally
    await setupTestUsersForTenant(TEST_TENANT_A);
    providerTenantA = createProviderForTenant(TEST_TENANT_A);
  });

  after(async () => {
    // Cleanup handled by emulator reset
  });

  it('should have authenticate and validateToken methods', () => {
    const provider = createProviderForTenant(TEST_TENANT_A);

    assert.ok(provider, 'Provider should be instantiated');
    assert.ok(
      typeof provider.authenticate === 'function',
      'Provider should have authenticate method'
    );
    assert.ok(
      typeof provider.validateToken === 'function',
      'Provider should have validateToken method'
    );
  });

  it(
    'should authenticate user with email and password',
    { skip: skipIntegrationTests },
    async () => {
      const result = await providerTenantA.authenticate({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      });

      assert.ok(result.accessToken, 'Should return access token');
      assert.ok(result.refreshToken, 'Should return refresh token');
    }
  );

  it('should fail authentication with wrong password', { skip: skipIntegrationTests }, async () => {
    await assert.rejects(
      async () => {
        await providerTenantA.authenticate({
          email: TEST_USER_EMAIL,
          password: 'wrongpassword'
        });
      },
      (error: Error) => {
        assert.ok(error instanceof Error);
        return true;
      }
    );
  });

  /**
   * Verifies GoogleIdentityPlatformAuthProvider accepts timeout configuration values.
   *
   * Note: This test only validates configuration acceptance, not runtime enforcement.
   * The Firebase Auth Emulator responds too quickly to reliably test actual timeout behavior.
   */
  it('should accept timeout configuration (does not test enforcement)', () => {
    const shortTimeoutProvider = new GoogleIdentityPlatformAuthProvider({
      ...BASE_OPTIONS,
      timeout: 100 // Very short timeout
    });

    assert.ok(shortTimeoutProvider, 'Provider should accept short timeout configuration');

    const defaultTimeoutProvider = new GoogleIdentityPlatformAuthProvider({
      ...BASE_OPTIONS
      // No timeout - should use default
    });

    assert.ok(defaultTimeoutProvider, 'Provider should accept default timeout configuration');

    const longTimeoutProvider = new GoogleIdentityPlatformAuthProvider({
      ...BASE_OPTIONS,
      timeout: 60000 // Long timeout
    });

    assert.ok(longTimeoutProvider, 'Provider should accept long timeout configuration');
  });
});

describe('GoogleIdentityPlatformAuthProvider - End-to-End Authentication Flow', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider;

  before(async () => {
    // Create test users in emulator before running tests
    // Helper functions handle skipIntegrationTests internally
    await setupTestUsersForTenant(TEST_TENANT_A);
    providerTenantA = createProviderForTenant(TEST_TENANT_A);
  });

  after(async () => {
    // Cleanup handled by emulator reset
  });

  it('should have all required methods for auth cycle', () => {
    const provider = createProviderForTenant(TEST_TENANT_A);

    assert.ok(typeof provider.authenticate === 'function');
    assert.ok(typeof provider.validateToken === 'function');
    assert.ok(typeof provider.refreshToken === 'function');
    assert.ok(typeof provider.logout === 'function');
  });

  it('should complete full authentication cycle', { skip: skipIntegrationTests }, async () => {
    // Step 1: Login
    const authResult = await providerTenantA.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });
    assert.ok(authResult.accessToken);
    assert.ok(authResult.refreshToken);

    // Step 2: Validate
    const validationResult = await providerTenantA.validateToken(authResult.accessToken);
    assert.strictEqual(validationResult.valid, true);

    // Step 3: Refresh
    const refreshResult = await providerTenantA.refreshToken(authResult.refreshToken);
    assert.ok(refreshResult.accessToken);

    // Step 4: Logout - use new refresh token if available, otherwise fall back to original
    const refreshTokenForLogout = refreshResult.refreshToken ?? authResult.refreshToken;
    const logoutResult = await providerTenantA.logout(refreshTokenForLogout);
    assert.strictEqual(logoutResult.success, true);
  });

  it('should handle concurrent requests', { skip: skipIntegrationTests }, async () => {
    // Perform multiple concurrent authentications
    const promises = Array.from({ length: 5 }, () =>
      providerTenantA.authenticate({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      })
    );

    const results = await Promise.all(promises);

    results.forEach((result, index) => {
      assert.ok(result.accessToken, `Request ${index} should return access token`);
    });

    // Extract access tokens and verify uniqueness (tokens should not be cached/reused)
    const accessTokens = results.map((result) => result.accessToken);
    const uniqueTokens = new Set(accessTokens);
    assert.strictEqual(
      uniqueTokens.size,
      5,
      `Expected 5 unique access tokens, but got ${uniqueTokens.size} (tokens should not be cached/reused across requests)`
    );
  });
});

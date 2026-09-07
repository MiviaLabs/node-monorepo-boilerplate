/**
 * Integration tests for Google Identity Platform Auth Provider - Token Lifecycle
 *
 * These tests verify token validation, refresh, blacklisting, and error handling.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

import {
  skipIntegrationTests,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  setupTenantAProvider,
  GoogleIdentityPlatformAuthProvider
} from './google-identity-platform-test-helpers';

describe('GoogleIdentityPlatformAuthProvider - Token Lifecycle', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider | null;

  before(async () => {
    providerTenantA = await setupTenantAProvider();
  });

  after(async () => {
    // Cleanup handled by emulator reset
  });

  it('should validate valid access token', { skip: skipIntegrationTests }, async () => {
    // First authenticate to get a token
    const authResult = await providerTenantA!.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Validate the token
    const validationResult = await providerTenantA!.validateToken(authResult.accessToken);

    assert.strictEqual(validationResult.valid, true);
    assert.ok(validationResult.userId);
  });

  it('should reject invalid access token', { skip: skipIntegrationTests }, async () => {
    const result = await providerTenantA!.validateToken('invalid-token');

    assert.strictEqual(result.valid, false);
    assert.ok(result.error, 'Should have error message');
  });

  it('should refresh access token', { skip: skipIntegrationTests }, async () => {
    // Authenticate to get tokens
    const authResult = await providerTenantA!.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Refresh the token
    const refreshResult = await providerTenantA!.refreshToken(authResult.refreshToken);

    assert.ok(refreshResult.accessToken, 'Should return new access token');
    assert.notStrictEqual(
      refreshResult.accessToken,
      authResult.accessToken,
      'Should be different token'
    );
  });

  it('should revoke refresh token on logout', { skip: skipIntegrationTests }, async () => {
    // Authenticate
    const authResult = await providerTenantA!.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Logout
    const logoutResult = await providerTenantA!.logout(authResult.refreshToken);

    assert.strictEqual(logoutResult.success, true);
  });
});

describe('GoogleIdentityPlatformAuthProvider - Token Blacklisting', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider | null;

  before(async () => {
    providerTenantA = await setupTenantAProvider();
  });

  after(async () => {
    // Cleanup handled by emulator reset
  });

  it('should invalidate access token after logout', { skip: skipIntegrationTests }, async () => {
    const authResult = await providerTenantA!.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Verify token is valid before logout
    const preLogoutValidation = await providerTenantA!.validateToken(authResult.accessToken);
    assert.strictEqual(preLogoutValidation.valid, true, 'Token should be valid before logout');

    // Logout with access token to blacklist it
    await providerTenantA!.logout(authResult.refreshToken, authResult.accessToken);

    // Subsequent validation should fail - token is blacklisted
    const postLogoutValidation = await providerTenantA!.validateToken(authResult.accessToken);
    assert.strictEqual(postLogoutValidation.valid, false, 'Token should be invalid after logout');
  });

  it('should invalidate refresh token after logout', { skip: skipIntegrationTests }, async () => {
    const authResult = await providerTenantA!.authenticate({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    // Logout to revoke the refresh token
    await providerTenantA!.logout(authResult.refreshToken);

    // Attempting to refresh should fail - refresh token is revoked
    await assert.rejects(
      async () => {
        await providerTenantA!.refreshToken(authResult.refreshToken);
      },
      (error: Error) => {
        assert.ok(error instanceof Error, 'Should throw an error');
        // Verify the error is related to token/auth issues (Firebase may use "invalid" or "expired" for revoked tokens)
        const message = error.message?.toLowerCase() || '';
        const isTokenError = /invalid|expired|revoked|token|refresh|unauthorized/i.test(message);
        assert.ok(isTokenError, `Expected token-related error but got: ${error.message}`);
        return true;
      },
      'Refresh should fail with revoked token'
    );
  });
});

describe('GoogleIdentityPlatformAuthProvider - Error Handling', () => {
  let providerTenantA: GoogleIdentityPlatformAuthProvider | null;

  before(async () => {
    providerTenantA = await setupTenantAProvider();
  });

  after(async () => {
    // Cleanup handled by emulator reset
  });

  it('should handle network errors gracefully', { skip: skipIntegrationTests }, async () => {
    // Create provider with invalid endpoint
    const badProvider = new GoogleIdentityPlatformAuthProvider({
      projectId: 'test-project',
      apiKey: 'test-key',
      timeout: 100 // Very short timeout to trigger error
    });

    const result = await badProvider.validateToken('some-token');

    // Should not throw, should return invalid result
    assert.strictEqual(result.valid, false);
  });

  it('should provide meaningful error messages', { skip: skipIntegrationTests }, async () => {
    // With emulator: test actual validation error messages
    const result = await providerTenantA!.validateToken('malformed-token');

    assert.strictEqual(result.valid, false);
    assert.ok(result.error, 'Should include error message');
    assert.ok(result.error.length > 0, 'Error message should not be empty');
  });
});

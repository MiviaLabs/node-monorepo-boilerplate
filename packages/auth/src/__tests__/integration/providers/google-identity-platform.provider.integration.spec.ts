/**
 * Integration tests for Google Cloud Identity Platform Auth Provider
 *
 * This file serves as the main entry point for Google Identity Platform integration tests.
 *
 * Tests are organized into focused modules:
 * - google-identity-platform-auth-flow.integration.spec.ts
 *   - Authentication Flow (login, validation, timeout handling)
 *   - End-to-End Authentication Flow (full auth cycle, concurrent requests)
 *
 * - google-identity-platform-token-lifecycle.integration.spec.ts
 *   - Token Lifecycle (validation, refresh, revocation)
 *   - Token Blacklisting (logout blacklisting, rejection)
 *   - Error Handling (network errors, meaningful messages)
 *
 * - google-identity-platform-tenant-isolation.integration.spec.ts
 *   - Multi-Tenancy and Tenant Isolation (tenant-specific auth, cross-tenant rejection)
 *   - User Information Retrieval (user info by ID, from token)
 *   - Health Check (availability, health status)
 *
 * Shared test utilities are in:
 * - google-identity-platform-test-helpers.ts
 *
 * Prerequisites:
 * 1. Firebase Auth Emulator running on port 9099
 * 2. Environment variable FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
 * 3. Test project configured
 *
 * Run with: FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 pnpm test:integration
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  skipIntegrationTests,
  createProviderForTenant,
  TEST_TENANT_A
} from './google-identity-platform-test-helpers';

describe('GoogleIdentityPlatformAuthProvider - Integration Tests', () => {
  it('should have provider available for testing', () => {
    const provider = createProviderForTenant(TEST_TENANT_A);

    assert.ok(provider, 'Provider should be instantiated');
    assert.ok(typeof provider.authenticate === 'function', 'Should have authenticate method');
    assert.ok(typeof provider.validateToken === 'function', 'Should have validateToken method');
    assert.ok(typeof provider.refreshToken === 'function', 'Should have refreshToken method');
    assert.ok(typeof provider.logout === 'function', 'Should have logout method');
    assert.ok(typeof provider.getUserInfo === 'function', 'Should have getUserInfo method');
    assert.ok(typeof provider.getRoles === 'function', 'Should have getRoles method');
    assert.ok(typeof provider.getPermissions === 'function', 'Should have getPermissions method');
    assert.ok(typeof provider.isAvailable === 'function', 'Should have isAvailable method');
    assert.ok(typeof provider.healthCheck === 'function', 'Should have healthCheck method');
  });

  it('should connect to emulator when available', { skip: skipIntegrationTests }, async () => {
    const provider = createProviderForTenant(TEST_TENANT_A);
    const available = await provider.isAvailable();
    assert.strictEqual(
      available,
      true,
      'Provider should report as available when emulator is running'
    );
  });
});

/**
 * Unit tests for Admin Credentials Configuration
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import { resolveAdminCredentials } from '../../../config/admin-credentials.config';
import { InvalidAuthProviderConfigError } from '../../../errors';

// Verify error type is available (used in assertions below)
void InvalidAuthProviderConfigError;

describe('resolveAdminCredentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env for each test
    process.env = { ...originalEnv };
    delete process.env['KEYCLOAK_ADMIN_USERNAME'];
    delete process.env['KEYCLOAK_ADMIN_PASSWORD'];
  });

  it('should return undefined when no credentials are provided', () => {
    const result = resolveAdminCredentials(undefined, process.env, {});
    assert.strictEqual(result, undefined);
  });

  it('should return credentials from user config', () => {
    const userCredentials = {
      username: 'admin',
      password: 'admin123'
    };

    const result = resolveAdminCredentials(userCredentials, process.env, {});

    assert.strictEqual(result?.username, 'admin');
    assert.strictEqual(result?.password, 'admin123');
  });

  it('should return credentials from environment variables', () => {
    process.env['KEYCLOAK_ADMIN_USERNAME'] = 'env-admin';
    process.env['KEYCLOAK_ADMIN_PASSWORD'] = 'env-password';

    const result = resolveAdminCredentials(undefined, process.env, {});

    assert.strictEqual(result?.username, 'env-admin');
    assert.strictEqual(result?.password, 'env-password');
  });

  it('should prioritize user config over environment variables', () => {
    const userCredentials = {
      username: 'user-admin',
      password: 'user-password'
    };

    process.env['KEYCLOAK_ADMIN_USERNAME'] = 'env-admin';
    process.env['KEYCLOAK_ADMIN_PASSWORD'] = 'env-password';

    const result = resolveAdminCredentials(userCredentials, process.env, {});

    assert.strictEqual(result?.username, 'user-admin');
    assert.strictEqual(result?.password, 'user-password');
  });

  it('should use custom environment variable names', () => {
    process.env['CUSTOM_ADMIN_USER'] = 'custom-admin';
    process.env['CUSTOM_ADMIN_PASS'] = 'custom-password';

    const result = resolveAdminCredentials(undefined, process.env, {
      keycloakAdminUsername: 'CUSTOM_ADMIN_USER',
      keycloakAdminPassword: 'CUSTOM_ADMIN_PASS'
    });

    assert.strictEqual(result?.username, 'custom-admin');
    assert.strictEqual(result?.password, 'custom-password');
  });

  it('should throw error when only username is provided', () => {
    process.env['KEYCLOAK_ADMIN_USERNAME'] = 'admin';

    assert.throws(
      () => {
        resolveAdminCredentials(undefined, process.env, {});
      },
      {
        name: 'InvalidAuthProviderConfigError',
        message: /Admin credentials must include both username and password/
      }
    );
  });

  it('should throw error when only password is provided', () => {
    process.env['KEYCLOAK_ADMIN_PASSWORD'] = 'password';

    assert.throws(
      () => {
        resolveAdminCredentials(undefined, process.env, {});
      },
      {
        name: 'InvalidAuthProviderConfigError',
        message: /Admin credentials must include both username and password/
      }
    );
  });

  it('should throw error when user config has only username', () => {
    assert.throws(
      () => {
        resolveAdminCredentials({ username: 'admin' }, process.env, {});
      },
      {
        name: 'InvalidAuthProviderConfigError'
      }
    );
  });

  it('should throw error when user config has only password', () => {
    assert.throws(
      () => {
        resolveAdminCredentials({ password: 'password' }, process.env, {});
      },
      {
        name: 'InvalidAuthProviderConfigError'
      }
    );
  });

  it('should throw helpful error message with env var names', () => {
    process.env['KEYCLOAK_ADMIN_USERNAME'] = 'admin';

    assert.throws(
      () => {
        resolveAdminCredentials(undefined, process.env, {});
      },
      {
        message: /KEYCLOAK_ADMIN_USERNAME/,
        message: /KEYCLOAK_ADMIN_PASSWORD/
      }
    );
  });

  it('should throw helpful error message with custom env var names', () => {
    process.env['CUSTOM_USER'] = 'admin';

    assert.throws(
      () => {
        resolveAdminCredentials(undefined, process.env, {
          keycloakAdminUsername: 'CUSTOM_USER',
          keycloakAdminPassword: 'CUSTOM_PASS'
        });
      },
      {
        message: /CUSTOM_USER/,
        message: /CUSTOM_PASS/
      }
    );
  });
});

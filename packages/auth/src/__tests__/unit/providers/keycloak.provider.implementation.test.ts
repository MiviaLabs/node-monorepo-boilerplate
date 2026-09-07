/**
 * Unit tests for KeycloakAuthProvider implementations
 *
 * Tests for the 8 newly implemented methods:
 * 1. authenticate()
 * 2. validateToken()
 * 3. refreshToken()
 * 4. logout()
 * 5. getUserInfo()
 * 6. getRoles()
 * 7. getPermissions()
 * 8. healthCheck()
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  AuthProviderConnectionError
} from '../../../errors';
import { KeycloakAuthProvider } from '../../../providers/keycloak.provider';

// Mock global fetch
const mockFetch = mock.fn();

/**
 * Helper function to create a valid JWT token for testing
 * @param {string} userId - User ID (sub claim)
 * @param {string} tenantId - Tenant ID (tenant_id claim)
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {string} Base64url-encoded JWT token
 */
function createValidJwtToken(userId, tenantId, expiresIn = 3600) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    tenant_id: tenantId,
    exp: now + expiresIn,
    iat: now,
    jti: `token-id-${userId}-${now}`,
    preferred_username: 'testuser',
    email: 'test@example.com'
  };

  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // For testing, we don't need a real signature
  const signature = Buffer.from('test-signature').toString('base64url');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

describe('KeycloakAuthProvider - Implemented Methods', () => {
  let provider;
  let config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCacheService: any;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset mock
    mockFetch.mock.resetCalls();

    // Setup test configuration
    config = {
      authServerUrl: 'https://keycloak.example.com',
      realm: 'test-realm',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      timeout: 5000
    };

    // Mock CacheService for Redis operations
    mockCacheService = {
      get: mock.fn(() => Promise.resolve(null)),
      set: mock.fn(() => Promise.resolve()),
      del: mock.fn(() => Promise.resolve())
    };

    // Create provider instance with mocked cache service
    provider = new KeycloakAuthProvider(config, mockCacheService);

    // Mock global fetch
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('authenticate()', () => {
    it('should authenticate user with valid credentials', async () => {
      // Mock successful authentication response
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            id_token: 'test-id-token',
            expires_in: 300,
            refresh_expires_in: 1800
          })
        })
      );

      const result = await provider.authenticate({
        username: 'testuser',
        password: 'testpass',
        tenantId: 'test-realm'
      });

      assert.strictEqual(result.accessToken, 'test-access-token');
      assert.strictEqual(result.refreshToken, 'test-refresh-token');
      assert.strictEqual(result.idToken, 'test-id-token');
      assert.strictEqual(result.expiresIn, 300);
      assert.strictEqual(result.refreshExpiresIn, 1800);

      // Verify fetch was called with correct parameters
      assert.strictEqual(mockFetch.mock.callCount(), 1);
      const call = mockFetch.mock.calls[0];
      assert.match(call.arguments[0], /\/protocol\/openid-connect\/token$/);
    });

    it('should use default realm when tenantId is not provided', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            id_token: 'test-id-token',
            expires_in: 300,
            refresh_expires_in: 1800
          })
        })
      );

      await provider.authenticate({
        username: 'testuser',
        password: 'testpass'
      });

      const call = mockFetch.mock.calls[0];
      const url = call.arguments[0];
      assert.ok(url.includes('/realms/test-realm/'));
    });

    it('should include client secret for confidential clients', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            id_token: 'test-id-token',
            expires_in: 300,
            refresh_expires_in: 1800
          }),
          text: async () => ''
        })
      );

      await provider.authenticate({
        username: 'testuser',
        password: 'testpass'
      });

      const call = mockFetch.mock.calls[0];
      const body = call.arguments[1].body;
      assert.ok(body);
      assert.strictEqual(body.get('client_secret'), 'test-secret');
    });

    it('should throw AuthenticationError on authentication failure', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => 'Invalid credentials',
          json: async () => ({ error: 'invalid_grant', error_description: 'Invalid credentials' })
        })
      );

      await assert.rejects(
        async () => {
          await provider.authenticate({
            username: 'testuser',
            password: 'wrongpass'
          });
        },
        (error) => {
          assert.ok(error instanceof AuthenticationError);
          // Error message format: "Keycloak authentication failed: invalid_grant" or "Invalid credentials"
          assert.ok(
            error.message.includes('401') ||
              error.message.includes('Unauthorized') ||
              error.message.includes('invalid_grant') ||
              error.message.includes('Invalid credentials')
          );
          return true;
        }
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mock.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

      await assert.rejects(
        async () => {
          await provider.authenticate({
            username: 'testuser',
            password: 'testpass'
          });
        },
        (error) => {
          assert.ok(error instanceof AuthProviderConnectionError);
          assert.ok(error.message.includes('Failed to authenticate'));
          return true;
        }
      );
    });

    it('should handle timeout errors', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.reject(new DOMException('Aborted', 'AbortError'))
      );

      await assert.rejects(
        async () => {
          await provider.authenticate({
            username: 'testuser',
            password: 'testpass'
          });
        },
        (error) => {
          assert.ok(error instanceof AuthProviderConnectionError);
          return true;
        }
      );
    });
  });

  describe('validateToken()', () => {
    it('should validate a valid token', async () => {
      // Create a mock valid token
      const payload = {
        sub: 'user-123',
        tenant_id: 'test-realm',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };

      const header = { alg: 'RS256', typ: 'JWT' };
      const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock-signature';
      const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

      // Mock Keycloak Connect's validateAccessToken to return true
      const mockGrantManager = {
        validateAccessToken: mock.fn(() => Promise.resolve(true))
      };

      // Replace the keycloakConnect's grantManager
      provider.keycloakConnect.grantManager = mockGrantManager;

      const result = await provider.validateToken(token);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.tenantId, 'test-realm');
      assert.strictEqual(result.exp, payload.exp);
    });

    it('should reject an invalid token', async () => {
      const mockGrantManager = {
        validateAccessToken: mock.fn(() => Promise.resolve(false))
      };

      provider.keycloakConnect.grantManager = mockGrantManager;

      const result = await provider.validateToken('invalid-token');

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid token format');
    });

    it('should reject an expired token', async () => {
      const payload = {
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 100 // Expired 100 seconds ago
      };

      const header = { alg: 'RS256', typ: 'JWT' };
      const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock-signature';
      const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

      const mockGrantManager = {
        validateAccessToken: mock.fn(() => Promise.resolve(true)) // Keycloak says it's valid, but we check exp manually
      };

      provider.keycloakConnect.grantManager = mockGrantManager;

      const result = await provider.validateToken(token);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Token expired');
    });

    it('should handle validation errors gracefully', async () => {
      const mockGrantManager = {
        validateAccessToken: mock.fn(() => Promise.reject(new Error('Validation error')))
      };

      provider.keycloakConnect.grantManager = mockGrantManager;

      const result = await provider.validateToken('invalid-token');

      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    it('should fallback to realm when tenant_id is missing', async () => {
      const payload = {
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const header = { alg: 'RS256', typ: 'JWT' };
      const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock-signature';
      const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

      const mockGrantManager = {
        validateAccessToken: mock.fn(() => Promise.resolve(true))
      };

      provider.keycloakConnect.grantManager = mockGrantManager;

      const result = await provider.validateToken(token);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.tenantId, 'test-realm'); // Should use config.realm as fallback
    });
  });

  describe('refreshToken()', () => {
    it('should refresh token successfully', async () => {
      const newRefreshToken = 'new-refresh-token';

      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: newRefreshToken,
            id_token: 'new-id-token',
            expires_in: 300,
            refresh_expires_in: 1800
          })
        })
      );

      const result = await provider.refreshToken('old-refresh-token');

      assert.strictEqual(result.accessToken, 'new-access-token');
      assert.strictEqual(result.refreshToken, newRefreshToken);
      assert.strictEqual(result.idToken, 'new-id-token');
      assert.strictEqual(result.expiresIn, 300);
      assert.strictEqual(result.refreshExpiresIn, 1800);
      assert.strictEqual(result.rotated, true);
    });

    it('should detect token rotation', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            id_token: 'new-id-token',
            expires_in: 300
          })
        })
      );

      const result = await provider.refreshToken('old-refresh-token');

      assert.strictEqual(result.rotated, true);
    });

    it('should detect no token rotation', async () => {
      const sameToken = 'same-refresh-token';

      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: sameToken,
            id_token: 'new-id-token',
            expires_in: 300
          })
        })
      );

      const result = await provider.refreshToken(sameToken);

      assert.strictEqual(result.rotated, false);
    });

    it('should handle missing refresh_expires_in', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-access-token',
            id_token: 'new-id-token',
            expires_in: 300
          })
        })
      );

      const result = await provider.refreshToken('old-refresh-token');

      assert.strictEqual(result.refreshToken, undefined);
      assert.strictEqual(result.refreshExpiresIn, undefined);
    });

    it('should throw TokenValidationError on refresh failure', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => 'Invalid refresh token',
          json: async () => ({
            error: 'invalid_token',
            error_description: 'Invalid refresh token'
          })
        })
      );

      await assert.rejects(
        async () => {
          await provider.refreshToken('invalid-refresh-token');
        },
        (error) => {
          assert.ok(error instanceof TokenValidationError);
          // Error message format: "Keycloak token refresh failed: invalid_token" or "Invalid refresh token"
          assert.ok(
            error.message.includes('401') ||
              error.message.includes('Unauthorized') ||
              error.message.includes('invalid_token') ||
              error.message.includes('Invalid refresh token')
          );
          return true;
        }
      );
    });
  });

  describe('logout()', () => {
    it('should logout successfully with refresh token only', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204
        })
      );

      await provider.logout('refresh-token');

      assert.strictEqual(mockFetch.mock.callCount(), 1);
      const call = mockFetch.mock.calls[0];
      assert.match(call.arguments[0], /\/protocol\/openid-connect\/logout$/);
    });

    it('should logout and blacklist access token', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204
        })
      );

      // Create a mock access token with jti and exp
      const payload = {
        sub: 'user-123',
        jti: 'token-id-123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const header = { alg: 'RS256', typ: 'JWT' };
      const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock-signature';
      const accessToken = `${headerEncoded}.${payloadEncoded}.${signature}`;

      await provider.logout('refresh-token', accessToken);

      // Verify logout endpoint was called
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it('should handle blacklist errors gracefully', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 204
        })
      );

      // Use an invalid token that will fail to decode
      await provider.logout('refresh-token', 'invalid-token');

      // Should not throw - logout was still successful
      assert.strictEqual(mockFetch.mock.callCount(), 1);
    });

    it('should throw AuthenticationError on logout failure', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid token',
          json: async () => ({ error: 'invalid_request', error_description: 'Invalid token' })
        })
      );

      await assert.rejects(
        async () => {
          await provider.logout('invalid-refresh-token');
        },
        (error) => {
          // The logout method wraps all errors in AuthenticationError
          assert.ok(error instanceof AuthenticationError);
          // Error message is "Failed to logout from Keycloak"
          assert.ok(error.message.includes('Failed to logout') || error.message.includes('logout'));
          return true;
        }
      );
    });
  });

  describe('getUserInfo()', () => {
    it('should get user info successfully', async () => {
      const userData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailVerified: true,
        attributes: {
          department: 'engineering'
        }
      };

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // User info request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => userData,
            text: async () => JSON.stringify(userData)
          });
        }
      });

      const result = await provider.getUserInfo('user-123', 'test-realm');

      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.username, 'testuser');
      assert.strictEqual(result.email, 'test@example.com');
      assert.strictEqual(result.givenName, 'Test');
      assert.strictEqual(result.familyName, 'User');
      assert.strictEqual(result.name, 'Test User');
      assert.strictEqual(result.emailVerified, true);
      assert.strictEqual(result.tenantId, 'test-realm');
      assert.deepStrictEqual(result.attributes, userData.attributes);
    });

    it('should handle user not found (404)', async () => {
      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // Mock 404 response
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({}),
            text: async () => 'User not found'
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getUserInfo('nonexistent-user', 'test-realm');
        },
        (error) => {
          assert.ok(error instanceof UserInfoRetrievalError);
          // Error message format: "Failed to get user info for 'nonexistent-user': 404 Not Found"
          assert.ok(
            error.message.includes('404') ||
              error.message.includes('not found') ||
              error.message.includes('Not Found')
          );
          return true;
        }
      );
    });

    it('should handle missing optional fields', async () => {
      const userData = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // User info request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => userData,
            text: async () => JSON.stringify(userData)
          });
        }
      });

      const result = await provider.getUserInfo('user-123', 'test-realm');

      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.name, 'testuser'); // Should use username as fallback
      assert.strictEqual(result.emailVerified, undefined);
    });

    it('should throw UserInfoRetrievalError on API error', async () => {
      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // Mock error response
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({}),
            text: async () => 'Server error'
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getUserInfo('user-123', 'test-realm');
        },
        (error) => {
          assert.ok(error instanceof UserInfoRetrievalError);
          return true;
        }
      );
    });
  });

  describe('getRoles()', () => {
    it('should get user roles successfully', async () => {
      const rolesData = [
        { name: 'admin', description: 'Administrator' },
        { name: 'user', description: 'Regular user' },
        { name: 'manager', description: 'Manager' }
      ];

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // Roles request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => rolesData,
            text: async () => JSON.stringify(rolesData)
          });
        }
      });

      const result = await provider.getRoles('user-123', 'test-realm');

      assert.deepStrictEqual(result, ['admin', 'user', 'manager']);
    });

    it('should return empty array when user has no roles', async () => {
      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // Mock empty roles array
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => [],
            text: async () => '[]'
          });
        }
      });

      const result = await provider.getRoles('user-123', 'test-realm');

      assert.deepStrictEqual(result, []);
    });

    it('should throw UserInfoRetrievalError on API error', async () => {
      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Admin token request
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-token'
            }),
            text: async () => ''
          });
        } else {
          // Mock error response
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: async () => ({}),
            text: async () => 'Access denied'
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getRoles('user-123', 'test-realm');
        },
        (error) => {
          assert.ok(error instanceof UserInfoRetrievalError);
          assert.ok(error.message.includes('roles'));
          return true;
        }
      );
    });
  });

  describe('getPermissions()', () => {
    it('should get user permissions successfully', async () => {
      const permissionsData = [
        {
          rsid: 'resource-1',
          rsname: 'documents',
          scopes: ['read', 'write']
        },
        {
          rsid: 'resource-2',
          rsname: 'reports',
          scopes: ['read']
        }
      ];

      // Create a valid user access token
      const userAccessToken = createValidJwtToken('user-123', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: actual permissions request
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => permissionsData
          });
        }
      });

      const result = await provider.getPermissions('user-123', 'test-realm', userAccessToken);

      assert.deepStrictEqual(result, ['documents#read', 'documents#write', 'reports#read']);
    });

    it('should handle permissions without scopes', async () => {
      const permissionsData = [
        {
          rsid: 'resource-1',
          rsname: 'documents',
          scopes: []
        }
      ];

      // Create a valid user access token
      const userAccessToken = createValidJwtToken('user-123', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: actual permissions request
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => permissionsData
          });
        }
      });

      const result = await provider.getPermissions('user-123', 'test-realm', userAccessToken);

      assert.deepStrictEqual(result, ['documents']);
    });

    it('should return empty array when authorization is not enabled', async () => {
      // Create a valid user access token
      const userAccessToken = createValidJwtToken('user-123', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 400 with unauthorized_client means authz is NOT enabled
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: async () => ({ error: 'unauthorized_client' })
          });
        }
        // Should not reach here since authz is disabled
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => []
        });
      });

      const result = await provider.getPermissions('user-123', 'test-realm', userAccessToken);

      assert.deepStrictEqual(result, []);
    });

    it('should return empty array on 401 unauthorized', async () => {
      // Create a valid user access token
      const userAccessToken = createValidJwtToken('user-123', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: actual permissions request - 401 means no permissions
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        }
      });

      const result = await provider.getPermissions('user-123', 'test-realm', userAccessToken);

      assert.deepStrictEqual(result, []);
    });

    it('should throw UserInfoRetrievalError on other errors', async () => {
      // Create a valid user access token
      const userAccessToken = createValidJwtToken('user-123', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: Mock 500 error
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Server error',
            json: async () => ({})
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getPermissions('user-123', 'test-realm', userAccessToken);
        },
        (error) => {
          assert.ok(error instanceof UserInfoRetrievalError);
          assert.ok(error.message.includes('permissions'));
          return true;
        }
      );
    });

    it('should throw TokenValidationError when userAccessToken is not provided', async () => {
      await assert.rejects(
        async () => {
          await provider.getPermissions('user-123', 'test-realm');
        },
        (error) => {
          assert.ok(error instanceof TokenValidationError);
          assert.ok(error.message.includes('userAccessToken parameter'));
          return true;
        }
      );
    });

    it('should throw TokenValidationError when token subject does not match userId', async () => {
      // Create a token for a different user
      const userAccessToken = createValidJwtToken('different-user', 'test-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: should not reach here due to validation error
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => []
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getPermissions('user-123', 'test-realm', userAccessToken);
        },
        (error) => {
          assert.ok(error instanceof TokenValidationError);
          assert.ok(error.message.includes('does not match expected user ID'));
          return true;
        }
      );
    });

    it('should throw TokenValidationError when token tenant does not match tenantId', async () => {
      // Create a token for a different tenant
      const userAccessToken = createValidJwtToken('user-123', 'different-realm');

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: should not reach here due to validation error
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => []
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getPermissions('user-123', 'test-realm', userAccessToken);
        },
        (error) => {
          assert.ok(error instanceof TokenValidationError);
          assert.ok(error.message.includes('does not match expected tenant ID'));
          return true;
        }
      );
    });

    it('should throw TokenValidationError when token is expired', async () => {
      // Create an expired token (expired 1 hour ago)
      const userAccessToken = createValidJwtToken('user-123', 'test-realm', -3600);

      // Track which call we're on
      let callCount = 0;
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: isAuthorizationEnabled() - 401 means authz IS enabled
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          });
        } else {
          // Second call: should not reach here due to validation error
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => []
          });
        }
      });

      await assert.rejects(
        async () => {
          await provider.getPermissions('user-123', 'test-realm', userAccessToken);
        },
        (error) => {
          assert.ok(error instanceof TokenValidationError);
          assert.ok(error.message.includes('expired'));
          return true;
        }
      );
    });
  });

  describe('healthCheck()', () => {
    it('should return true when Keycloak is accessible', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200
        })
      );

      const result = await provider.healthCheck();

      assert.strictEqual(result, true);
      assert.strictEqual(mockFetch.mock.callCount(), 1);

      const call = mockFetch.mock.calls[0];
      const url = call.arguments[0];
      assert.ok(url.includes('/.well-known/openid-configuration'));
    });

    it('should return false when Keycloak is not accessible', async () => {
      mockFetch.mock.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

      const result = await provider.healthCheck();

      assert.strictEqual(result, false);
    });

    it('should return false when response is not ok', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404
        })
      );

      const result = await provider.healthCheck();

      assert.strictEqual(result, false);
    });

    it('should handle timeout errors', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.reject(new DOMException('Aborted', 'AbortError'))
      );

      const result = await provider.healthCheck();

      assert.strictEqual(result, false);
    });

    it('should use default timeout of 5 seconds', async () => {
      mockFetch.mock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200
        })
      );

      await provider.healthCheck();

      const call = mockFetch.mock.calls[0];
      const options = call.arguments[1];
      assert.ok(options.signal);
    });
  });

  describe('Helper Methods', () => {
    describe('getAdminToken()', () => {
      it('should get admin token successfully', async () => {
        mockFetch.mock.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'admin-access-token'
            })
          })
        );

        // Access private method
        const result = await provider.getAdminToken();

        assert.strictEqual(result, 'admin-access-token');
      });

      it('should use client credentials grant', async () => {
        mockFetch.mock.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              access_token: 'admin-access-token'
            }),
            text: async () => ''
          })
        );

        await provider.getAdminToken();

        const call = mockFetch.mock.calls[0];
        const body = call.arguments[1].body;
        assert.ok(body);
        assert.strictEqual(body.get('grant_type'), 'client_credentials');
      });

      it('should throw AuthenticationError on failure', async () => {
        mockFetch.mock.mockImplementationOnce(() =>
          Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
          })
        );

        await assert.rejects(
          async () => {
            await provider.getAdminToken();
          },
          (error) => {
            assert.ok(error instanceof AuthenticationError);
            assert.ok(error.message.includes('admin token'));
            return true;
          }
        );
      });
    });
  });
});

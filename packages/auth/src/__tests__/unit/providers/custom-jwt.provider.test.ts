/**
 * Unit tests for Custom JWT Auth Provider
 *
 * Tests the CustomJwtAuthProvider implementation with proper mocking
 * of external dependencies (db-core, drizzle-orm, argon2, encryption)
 *
 * Note: These tests use node:test and TEST_MODE for proper isolation.
 * The provider uses dependency injection for all external dependencies.
 */

import { strict as assert } from 'node:assert';
import { describe, it, mock, beforeEach } from 'node:test';

import { CustomJwtAuthProvider } from '../../../providers/custom-jwt.provider';
import { REPLAY_DETECTION_FAIL_BEHAVIOR } from '../../../providers/factory.types';

describe('CustomJwtAuthProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTables: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockQueryUtils: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPasswordHasher: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEncryption: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRoleService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPermissionService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTokenService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCacheService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockConfigService: any;
  let provider: CustomJwtAuthProvider;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockDb = {
      select: mock.fn(() => ({
        from: mock.fn(() => ({
          where: mock.fn(() => ({
            limit: mock.fn(() => Promise.resolve([]))
          }))
        }))
      }))
    };

    mockTables = {
      users: {
        emailHash: 'emailHash',
        deletedAt: 'deletedAt',
        isActive: 'isActive',
        id: 'id',
        organizationId: 'organizationId',
        emailEncrypted: 'emailEncrypted',
        firstNameEncrypted: 'firstNameEncrypted',
        lastNameEncrypted: 'lastNameEncrypted',
        displayName: 'displayName',
        isVerified: 'isVerified',
        photoUrl: 'photoUrl',
        createdAt: 'createdAt',
        lastSignInAt: 'lastSignInAt'
      },
      userIdentities: {
        emailHash: 'emailHash',
        passwordHash: 'passwordHash'
      }
    };

    mockQueryUtils = {
      eq: mock.fn(() => ({})),
      and: mock.fn(() => ({})),
      isNull: mock.fn(() => ({}))
    };

    mockPasswordHasher = {
      verify: mock.fn(() => Promise.resolve(true))
    };

    mockEncryption = {
      decryptField: mock.fn((encrypted: string) => Promise.resolve(encrypted))
    };

    mockRoleService = {
      getSystemRoles: mock.fn(() => Promise.resolve(['user'])),
      getTenantRole: mock.fn(() => Promise.resolve('member'))
    };

    mockPermissionService = {
      getUserPermissions: mock.fn(() => Promise.resolve(['read:own', 'write:own']))
    };

    mockTokenService = {
      storeRefreshToken: mock.fn(() => Promise.resolve()),
      getRefreshToken: mock.fn(() => Promise.resolve(undefined)),
      deleteRefreshToken: mock.fn(() => Promise.resolve()),
      blacklistAccessToken: mock.fn(() => Promise.resolve())
    };

    mockCacheService = {
      get: mock.fn(() => Promise.resolve(null)),
      set: mock.fn(() => Promise.resolve()),
      delete: mock.fn(() => Promise.resolve())
    };

    mockConfigService = {
      get: mock.fn((key: string) => {
        const config: Record<string, string> = {
          JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
          JWT_EXPIRES_IN: '1h',
          REFRESH_TOKEN_EXPIRES_IN: '2592000'
        };
        return config[key];
      })
    };

    // Create provider with mocked dependencies
    provider = new CustomJwtAuthProvider({
      name: 'test-custom-jwt',
      dependencies: {
        db: mockDb,
        tables: mockTables,
        queryUtils: mockQueryUtils,
        passwordHasher: mockPasswordHasher,
        encryption: mockEncryption,
        roleService: mockRoleService,
        permissionService: mockPermissionService,
        tokenService: mockTokenService,
        cacheService: mockCacheService,
        configService: mockConfigService
      }
    });
  });

  describe('constructor', () => {
    it('should create provider with options', () => {
      assert.strictEqual(provider['name'], 'test-custom-jwt');
      assert.strictEqual(provider['type'], 'custom-jwt');
    });

    it('should use default name if not provided', () => {
      const defaultProvider = new CustomJwtAuthProvider({
        dependencies: {
          db: mockDb,
          tables: mockTables,
          queryUtils: mockQueryUtils,
          passwordHasher: mockPasswordHasher,
          encryption: mockEncryption,
          roleService: mockRoleService,
          permissionService: mockPermissionService,
          tokenService: mockTokenService,
          cacheService: mockCacheService,
          configService: mockConfigService
        }
      });
      assert.strictEqual(defaultProvider['name'], 'custom-jwt');
    });

    it('should default replayDetectionFailBehavior to fail-open', () => {
      const defaultProvider = new CustomJwtAuthProvider({
        dependencies: {
          db: mockDb,
          tables: mockTables,
          queryUtils: mockQueryUtils,
          passwordHasher: mockPasswordHasher,
          encryption: mockEncryption,
          roleService: mockRoleService,
          permissionService: mockPermissionService,
          tokenService: mockTokenService,
          cacheService: mockCacheService,
          configService: mockConfigService
        }
      });
      assert.strictEqual(
        defaultProvider.getReplayDetectionFailBehavior(),
        REPLAY_DETECTION_FAIL_BEHAVIOR.FailOpen
      );
    });

    it('should accept custom replayDetectionFailBehavior', () => {
      const failClosedProvider = new CustomJwtAuthProvider({
        replayDetectionFailBehavior: REPLAY_DETECTION_FAIL_BEHAVIOR.FailClosed,
        dependencies: {
          db: mockDb,
          tables: mockTables,
          queryUtils: mockQueryUtils,
          passwordHasher: mockPasswordHasher,
          encryption: mockEncryption,
          roleService: mockRoleService,
          permissionService: mockPermissionService,
          tokenService: mockTokenService,
          cacheService: mockCacheService,
          configService: mockConfigService
        }
      });
      assert.strictEqual(
        failClosedProvider.getReplayDetectionFailBehavior(),
        REPLAY_DETECTION_FAIL_BEHAVIOR.FailClosed
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when JWT_SECRET is configured', async () => {
      const result = await provider.isAvailable();
      assert.strictEqual(result, true);
    });

    it('should return false when JWT_SECRET is not configured', async () => {
      const configServiceNoSecret = {
        get: mock.fn(() => undefined)
      };
      const providerNoSecret = new CustomJwtAuthProvider({
        dependencies: {
          db: mockDb,
          tables: mockTables,
          queryUtils: mockQueryUtils,
          passwordHasher: mockPasswordHasher,
          encryption: mockEncryption,
          roleService: mockRoleService,
          permissionService: mockPermissionService,
          tokenService: mockTokenService,
          cacheService: mockCacheService,
          configService: configServiceNoSecret
        }
      });
      const result = await providerNoSecret.isAvailable();
      assert.strictEqual(result, false);
    });

    it('should return false when JWT_SECRET is too short', async () => {
      const configServiceShortSecret = {
        get: mock.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'short';
          return 'value';
        })
      };
      const providerShortSecret = new CustomJwtAuthProvider({
        dependencies: {
          db: mockDb,
          tables: mockTables,
          queryUtils: mockQueryUtils,
          passwordHasher: mockPasswordHasher,
          encryption: mockEncryption,
          roleService: mockRoleService,
          permissionService: mockPermissionService,
          tokenService: mockTokenService,
          cacheService: mockCacheService,
          configService: configServiceShortSecret
        }
      });
      const result = await providerShortSecret.isAvailable();
      assert.strictEqual(result, false);
    });
  });

  describe('healthCheck', () => {
    it('should return true when provider is configured', async () => {
      const result = await provider.healthCheck();
      assert.strictEqual(result, true);
    });
  });

  describe('validateToken', () => {
    it('should reject invalid token format', async () => {
      const result = await provider.validateToken('invalid-token');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    it('should reject empty token', async () => {
      const result = await provider.validateToken('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });

    it('should reject malformed JWT', async () => {
      const result = await provider.validateToken('not.a.jwt');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error);
    });
  });

  describe('logout', () => {
    it('should reject invalid refresh token', async () => {
      mockTokenService.getRefreshToken = mock.fn(() => Promise.resolve(undefined));

      await assert.rejects(async () => await provider.logout('invalid-refresh-token'), {
        message: /Logout failed/i
      });
    });
  });

  describe('refreshToken', () => {
    it('should reject invalid refresh token', async () => {
      mockTokenService.getRefreshToken = mock.fn(() => Promise.resolve(undefined));

      await assert.rejects(
        async () => await provider.refreshToken('invalid-refresh-token'),
        (err: Error) => {
          /Invalid|refresh/i.test(err.message);
          return true;
        }
      );
    });

    it('should reject revoked refresh token', async () => {
      mockTokenService.getRefreshToken = mock.fn(() =>
        Promise.resolve({
          userId: '123',
          tokenId: 'token-123',
          tenantId: 'tenant-1',
          expiresAt: new Date(Date.now() + 1000000),
          revoked: true
        })
      );

      await assert.rejects(
        async () => await provider.refreshToken('revoked-token'),
        (err: Error) => {
          /Invalid|refresh/i.test(err.message);
          return true;
        }
      );
    });
  });

  describe('getRoles', () => {
    it('should handle errors gracefully', async () => {
      mockRoleService.getSystemRoles = mock.fn(() => Promise.reject(new Error('DB error')));

      const roles = await provider.getRoles('user-123', 'tenant-1');
      // Should return empty array on error
      assert.deepStrictEqual(roles, []);
    });
  });

  describe('getPermissions', () => {
    it('should handle errors gracefully', async () => {
      mockPermissionService.getUserPermissions = mock.fn(() =>
        Promise.reject(new Error('DB error'))
      );

      const permissions = await provider.getPermissions('user-123', 'tenant-1');
      // Should return empty array on error
      assert.deepStrictEqual(permissions, []);
    });
  });

  describe('getRolesFromToken', () => {
    it('should reject invalid token', async () => {
      await assert.rejects(
        async () => await provider.getRolesFromToken('invalid-token'),
        (err: Error) => {
          /Invalid|token/i.test(err.message);
          return true;
        }
      );
    });
  });

  describe('getPermissionsFromToken', () => {
    it('should reject invalid token', async () => {
      await assert.rejects(
        async () => await provider.getPermissionsFromToken('invalid-token'),
        (err: Error) => {
          /Invalid|token/i.test(err.message);
          return true;
        }
      );
    });
  });

  describe('authenticate', () => {
    it('should reject missing email', async () => {
      await assert.rejects(
        async () =>
          await provider.authenticate({
            username: '',
            password: 'password123',
            tenantId: 'tenant-1'
          }),
        (err: Error) => {
          /required|Email/i.test(err.message);
          return true;
        }
      );
    });

    it('should reject missing password', async () => {
      await assert.rejects(
        async () =>
          await provider.authenticate({
            username: 'user@example.com',
            password: '',
            tenantId: 'tenant-1'
          }),
        (err: Error) => {
          /required|password/i.test(err.message);
          return true;
        }
      );
    });

    it('should handle authentication failures gracefully', async () => {
      // Mock database to return no users
      mockDb.select = mock.fn(() => ({
        from: mock.fn(() => ({
          where: mock.fn(() => ({
            limit: mock.fn(() => Promise.resolve([]))
          }))
        }))
      }));

      // The provider throws UnauthorizedException for invalid credentials
      await assert.rejects(
        async () =>
          await provider.authenticate({
            username: 'nonexistent@example.com',
            password: 'password123',
            tenantId: 'tenant-1'
          }),
        { message: /Invalid|credentials/i }
      );
    });
  });

  describe('getUserInfoFromToken', () => {
    it('should reject invalid token', async () => {
      await assert.rejects(
        async () => await provider.getUserInfoFromToken('invalid-token'),
        (err: Error) => {
          /Invalid|token/i.test(err.message);
          return true;
        }
      );
    });
  });

  describe('deleteUser', () => {
    it('should be a no-op for custom-jwt provider', async () => {
      // Should not throw
      await provider.deleteUser('user-123', 'tenant-1');
      // No assertion needed - just verify it doesn't throw
      assert.ok(true);
    });
  });

  describe('deleteTenantUsers', () => {
    it('should be a no-op for custom-jwt provider', async () => {
      // Should not throw
      await provider.deleteTenantUsers('tenant-1');
      // No assertion needed - just verify it doesn't throw
      assert.ok(true);
    });
  });
});

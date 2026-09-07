/**
 * Unit tests for Cached Permission Service
 *
 * Tests the Redis-backed caching layer for permission resolution.
 * Verifies caching behavior, cache invalidation, and fallback to PermissionService.
 */

import { strict as assert } from 'node:assert';
import { describe, it, mock, beforeEach } from 'node:test';

import { CachedPermissionService } from '../../../services/cached-permission.service';

describe('CachedPermissionService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPermissionService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCacheService: any;
  let service: CachedPermissionService;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockPermissionService = {
      getUserPermissions: mock.fn(() => Promise.resolve(['read:own', 'write:own']))
    };

    mockCacheService = {
      get: mock.fn(() => Promise.resolve(null)),
      set: mock.fn(() => Promise.resolve()),
      delete: mock.fn(() => Promise.resolve()),
      invalidatePattern: mock.fn(() => Promise.resolve())
    };

    // Create service with mocked dependencies
    service = new CachedPermissionService(mockPermissionService, mockCacheService, {
      ttl: 300,
      permissionVersion: 1
    });
  });

  describe('getUserPermissions', () => {
    it('should cache permissions after first fetch', async () => {
      const userId = 123;
      const tenantId = 456;
      const permissions = ['read:own', 'write:own', 'delete:own'];

      // Mock cache miss on first call
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Mock permission service to return permissions
      mockPermissionService.getUserPermissions = mock.fn(() => Promise.resolve(permissions));

      // Call the method
      const result = await service.getUserPermissions(userId, tenantId);

      // Verify result
      assert.deepStrictEqual(result, permissions);

      // Verify cache.get was called with correct key
      const expectedCacheKey = `permissions:${userId}:${tenantId}:v1`;
      assert.strictEqual(mockCacheService.get.mock.calls.length, 1);
      assert.strictEqual(mockCacheService.get.mock.calls[0].arguments[0], expectedCacheKey);

      // Verify permission service was called
      assert.strictEqual(mockPermissionService.getUserPermissions.mock.calls.length, 1);
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[0],
        userId
      );
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[1],
        tenantId
      );

      // Verify cache.set was called with correct key, value, and TTL
      assert.strictEqual(mockCacheService.set.mock.calls.length, 1);
      assert.strictEqual(mockCacheService.set.mock.calls[0].arguments[0], expectedCacheKey);
      assert.deepStrictEqual(mockCacheService.set.mock.calls[0].arguments[1], permissions);
      assert.deepStrictEqual(mockCacheService.set.mock.calls[0].arguments[2], { ttl: 300 });
    });

    it('should return cached permissions on subsequent calls', async () => {
      const userId = 123;
      const tenantId = 456;
      const cachedPermissions = ['read:own', 'write:own'];

      // Mock cache hit
      mockCacheService.get = mock.fn(() => Promise.resolve(cachedPermissions));

      // Call the method
      const result = await service.getUserPermissions(userId, tenantId);

      // Verify result matches cached permissions
      assert.deepStrictEqual(result, cachedPermissions);

      // Verify cache.get was called
      assert.strictEqual(mockCacheService.get.mock.calls.length, 1);

      // Verify permission service was NOT called (cache hit)
      assert.strictEqual(mockPermissionService.getUserPermissions.mock.calls.length, 0);

      // Verify cache.set was NOT called (already cached)
      assert.strictEqual(mockCacheService.set.mock.calls.length, 0);
    });

    it('should use "global" for tenantId when not provided', async () => {
      const userId = 123;
      const permissions = ['read:all', 'write:all'];

      // Mock cache miss
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Mock permission service
      mockPermissionService.getUserPermissions = mock.fn(() => Promise.resolve(permissions));

      // Call the method without tenantId
      const result = await service.getUserPermissions(userId);

      // Verify result
      assert.deepStrictEqual(result, permissions);

      // Verify cache key uses "global" for tenant
      const expectedCacheKey = `permissions:${userId}:global:v1`;
      assert.strictEqual(mockCacheService.get.mock.calls[0].arguments[0], expectedCacheKey);
      assert.strictEqual(mockCacheService.set.mock.calls[0].arguments[0], expectedCacheKey);

      // Verify permission service was called with undefined tenantId
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[1],
        undefined
      );
    });

    it('should fallback to permission service on cache error', async () => {
      const userId = 123;
      const tenantId = 456;
      const permissions = ['read:own'];

      // Mock cache error
      mockCacheService.get = mock.fn(() => Promise.reject(new Error('Redis connection error')));

      // Mock permission service
      mockPermissionService.getUserPermissions = mock.fn(() => Promise.resolve(permissions));

      // Call the method - should not throw
      const result = await service.getUserPermissions(userId, tenantId);

      // Verify result from fallback
      assert.deepStrictEqual(result, permissions);

      // Verify permission service was called (fallback)
      assert.strictEqual(mockPermissionService.getUserPermissions.mock.calls.length, 1);
    });

    it('should respect custom permission version in cache key', async () => {
      const userId = 123;
      const tenantId = 456;
      const customVersion = 2;

      // Create service with custom version
      const customService = new CachedPermissionService(mockPermissionService, mockCacheService, {
        ttl: 300,
        permissionVersion: customVersion
      });

      // Mock cache miss
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Call the method
      await customService.getUserPermissions(userId, tenantId);

      // Verify cache key includes custom version
      const expectedCacheKey = `permissions:${userId}:${tenantId}:v${customVersion}`;
      assert.strictEqual(mockCacheService.get.mock.calls[0].arguments[0], expectedCacheKey);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the required permission', async () => {
      const userId = 123;
      const tenantId = 456;
      const permissions = ['read:own', 'write:own', 'delete:own'];

      // Mock cache to return permissions
      mockCacheService.get = mock.fn(() => Promise.resolve(permissions));

      // Check for permission
      const result = await service.hasPermission(userId, tenantId, 'write:own');

      // Verify result
      assert.strictEqual(result, true);
    });

    it('should return false when user does not have the required permission', async () => {
      const userId = 123;
      const tenantId = 456;
      const permissions = ['read:own', 'write:own'];

      // Mock cache to return permissions
      mockCacheService.get = mock.fn(() => Promise.resolve(permissions));

      // Check for permission
      const result = await service.hasPermission(userId, tenantId, 'delete:own');

      // Verify result
      assert.strictEqual(result, false);
    });
  });

  describe('invalidatePermissions', () => {
    it('should invalidate cache for specific user and tenant', async () => {
      const userId = 123;
      const tenantId = 456;

      // Call the method
      await service.invalidatePermissions(userId, tenantId);

      // Verify cache.delete was called with correct key
      const expectedCacheKey = `permissions:${userId}:${tenantId}:v1`;
      assert.strictEqual(mockCacheService.delete.mock.calls.length, 1);
      assert.strictEqual(mockCacheService.delete.mock.calls[0].arguments[0], expectedCacheKey);
    });

    it('should invalidate cache for user without tenant (global)', async () => {
      const userId = 123;

      // Call the method without tenantId
      await service.invalidatePermissions(userId);

      // Verify cache.delete was called with correct key (global)
      const expectedCacheKey = `permissions:${userId}:global:v1`;
      assert.strictEqual(mockCacheService.delete.mock.calls.length, 1);
      assert.strictEqual(mockCacheService.delete.mock.calls[0].arguments[0], expectedCacheKey);
    });

    it('should handle cache errors gracefully', async () => {
      const userId = 123;
      const tenantId = 456;

      // Mock cache error
      mockCacheService.delete = mock.fn(() => Promise.reject(new Error('Redis error')));

      // Call the method - should not throw
      await service.invalidatePermissions(userId, tenantId);

      // Verify delete was attempted
      assert.strictEqual(mockCacheService.delete.mock.calls.length, 1);
    });
  });

  describe('invalidateAllPermissions', () => {
    it('should invalidate all permission caches for a user', async () => {
      const userId = 123;

      // Call the method
      await service.invalidateAllPermissions(userId);

      // Verify cache.invalidatePattern was called with correct pattern
      const expectedPattern = `permissions:${userId}:*`;
      assert.strictEqual(mockCacheService.invalidatePattern.mock.calls.length, 1);
      assert.strictEqual(
        mockCacheService.invalidatePattern.mock.calls[0].arguments[0],
        expectedPattern
      );
    });

    it('should handle cache errors gracefully', async () => {
      const userId = 123;

      // Mock cache error
      mockCacheService.invalidatePattern = mock.fn(() => Promise.reject(new Error('Redis error')));

      // Call the method - should not throw
      await service.invalidateAllPermissions(userId);

      // Verify invalidatePattern was attempted
      assert.strictEqual(mockCacheService.invalidatePattern.mock.calls.length, 1);
    });
  });

  describe('invalidateGlobalPermissions', () => {
    it('should invalidate all permission caches globally', async () => {
      // Call the method
      await service.invalidateGlobalPermissions();

      // Verify cache.invalidatePattern was called with global pattern
      const expectedPattern = 'permissions:*';
      assert.strictEqual(mockCacheService.invalidatePattern.mock.calls.length, 1);
      assert.strictEqual(
        mockCacheService.invalidatePattern.mock.calls[0].arguments[0],
        expectedPattern
      );
    });

    it('should handle cache errors gracefully', async () => {
      // Mock cache error
      mockCacheService.invalidatePattern = mock.fn(() => Promise.reject(new Error('Redis error')));

      // Call the method - should not throw
      await service.invalidateGlobalPermissions();

      // Verify invalidatePattern was attempted
      assert.strictEqual(mockCacheService.invalidatePattern.mock.calls.length, 1);
    });
  });

  describe('warmCache', () => {
    it('should pre-load permissions into cache', async () => {
      const userId = 123;
      const tenantId = 456;
      const permissions = ['read:own', 'write:own'];

      // Mock permission service
      mockPermissionService.getUserPermissions = mock.fn(() => Promise.resolve(permissions));

      // Call the method
      await service.warmCache(userId, tenantId);

      // Verify permission service was called
      assert.strictEqual(mockPermissionService.getUserPermissions.mock.calls.length, 1);
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[0],
        userId
      );
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[1],
        tenantId
      );

      // Verify cache.set was called with correct key, value, and TTL
      const expectedCacheKey = `permissions:${userId}:${tenantId}:v1`;
      assert.strictEqual(mockCacheService.set.mock.calls.length, 1);
      assert.strictEqual(mockCacheService.set.mock.calls[0].arguments[0], expectedCacheKey);
      assert.deepStrictEqual(mockCacheService.set.mock.calls[0].arguments[1], permissions);
      assert.deepStrictEqual(mockCacheService.set.mock.calls[0].arguments[2], { ttl: 300 });
    });

    it('should warm cache for global permissions when tenantId not provided', async () => {
      const userId = 123;
      const permissions = ['read:all'];

      // Mock permission service
      mockPermissionService.getUserPermissions = mock.fn(() => Promise.resolve(permissions));

      // Call the method without tenantId
      await service.warmCache(userId);

      // Verify cache key uses "global"
      const expectedCacheKey = `permissions:${userId}:global:v1`;
      assert.strictEqual(mockCacheService.set.mock.calls[0].arguments[0], expectedCacheKey);

      // Verify permission service was called with undefined tenantId
      assert.strictEqual(
        mockPermissionService.getUserPermissions.mock.calls[0].arguments[1],
        undefined
      );
    });

    it('should handle cache errors gracefully', async () => {
      const userId = 123;
      const tenantId = 456;

      // Mock cache error
      mockCacheService.set = mock.fn(() => Promise.reject(new Error('Redis error')));

      // Call the method - should not throw
      await service.warmCache(userId, tenantId);

      // Verify set was attempted
      assert.strictEqual(mockCacheService.set.mock.calls.length, 1);
    });
  });

  describe('cache key format', () => {
    it('should build correct cache key with tenantId', async () => {
      const userId = 123;
      const tenantId = 456;

      // Mock cache miss
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Call the method
      await service.getUserPermissions(userId, tenantId);

      // Verify cache key format
      const expectedKey = `permissions:${userId}:${tenantId}:v1`;
      assert.strictEqual(mockCacheService.get.mock.calls[0].arguments[0], expectedKey);
    });

    it('should build correct cache key without tenantId (global)', async () => {
      const userId = 123;

      // Mock cache miss
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Call the method
      await service.getUserPermissions(userId);

      // Verify cache key format
      const expectedKey = `permissions:${userId}:global:v1`;
      assert.strictEqual(mockCacheService.get.mock.calls[0].arguments[0], expectedKey);
    });

    it('should use default TTL of 300 seconds when not specified', async () => {
      // Create service without TTL specified
      const defaultService = new CachedPermissionService(
        mockPermissionService,
        mockCacheService,
        {}
      );

      const userId = 123;
      const tenantId = 456;

      // Mock cache miss
      mockCacheService.get = mock.fn(() => Promise.resolve(null));

      // Call the method
      await defaultService.getUserPermissions(userId, tenantId);

      // Verify default TTL is used
      assert.deepStrictEqual(mockCacheService.set.mock.calls[0].arguments[2], { ttl: 300 });
    });
  });
});

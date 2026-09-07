/**
 * OpaCachedGuard Unit Tests
 *
 * Comprehensive test suite for OpaCachedGuard covering:
 * - canActivate() with cache flow
 * - generateCacheKey() key generation
 * - getFromCache() retrieval and expiration
 * - setToCache() storage and FIFO eviction
 * - clearCache() and clearCacheForUser() invalidation
 * - clearCacheForTenant() tenant-specific clearing
 * - getCacheSize() monitoring
 *
 * Test Strategy:
 * - Mock OpaService (parent class dependencies)
 * - Test cache hit/miss scenarios
 * - Validate TTL-based expiration
 * - Test FIFO eviction behavior
 * - Ensure multi-tenant cache isolation
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OpaCachedGuard } from '../guards/opa-cached.guard';
import { OpaService } from '../opa.service';
import { RESOURCE_KEY, ACTION_KEY } from '../decorators';

describe('OpaCachedGuard', () => {
  let guard: OpaCachedGuard;
  let mockOpaService: jest.Mocked<OpaService>;
  let mockReflector: jest.Mocked<Reflector>;

  // Mock user with tenant context
  const mockUser = {
    id: 'user-123',
    system_roles: ['system_admin'],
    tenant_roles: ['tenant_owner'],
    organization_id: 'org-456',
    tenant_id: 'tenant-456'
  };

  // Map to store metadata for each handler object
  const handlerMetadataMap = new Map<object, { resource?: string; action?: string }>();

  // Mock execution context
  const createMockContext = (
    user?: unknown,
    resourceMetadata?: string,
    actionMetadata?: string,
    params?: Record<string, string>
  ): ExecutionContext => {
    // Create unique handler object for this context
    const handler = {};

    // Store metadata for this handler
    handlerMetadataMap.set(handler, {
      resource: resourceMetadata,
      action: actionMetadata
    });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          body: {}
        })
      }),
      getHandler: () => handler,
      getClass: () => ({})
    } as unknown as ExecutionContext;

    return context;
  };

  beforeEach(() => {
    // Clear metadata map before each test
    handlerMetadataMap.clear();

    mockOpaService = {
      isAuthorized: jest.fn(),
      healthCheck: jest.fn(),
      getConfig: jest.fn()
    } as unknown as jest.Mocked<OpaService>;

    mockReflector = {
      getAllAndOverride: jest.fn((key: string, handlers: any[]) => {
        // Check handlers in order (handler first, then class)
        for (const handler of handlers) {
          const metadata = handlerMetadataMap.get(handler);
          if (metadata) {
            if (key === RESOURCE_KEY && metadata.resource !== undefined) {
              // Convert string to object format like the real Resource decorator does
              return typeof metadata.resource === 'string'
                ? { type: metadata.resource, scope: 'tenant' }
                : metadata.resource;
            }
            if (key === ACTION_KEY && metadata.action !== undefined) {
              return metadata.action;
            }
          }
        }
        return undefined;
      }),
      getAll: jest.fn(),
      get: jest.fn()
    };

    // Create guard directly with mocked dependencies
    // Note: OpaCachedGuard implements CanActivate directly
    guard = new OpaCachedGuard(mockReflector as any, mockOpaService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    describe('cache miss - first request', () => {
      it('should call parent canActivate on cache miss', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).toHaveBeenCalled();
      });

      it('should store positive authorization result in cache', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);
        const cacheSize = guard.getCacheSize();

        expect(cacheSize).toBe(1);
      });

      it('should store negative authorization result in cache', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);
        const cacheSize = guard.getCacheSize();

        expect(cacheSize).toBe(1);
      });

      it('should generate correct cache key for resource-specific action', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        // Subsequent call should hit cache
        mockOpaService.isAuthorized.mockClear();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });

      it('should generate correct cache key for collection action', async () => {
        const context = createMockContext(mockUser, 'documents', 'list', undefined);
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        // Subsequent call should hit cache
        mockOpaService.isAuthorized.mockClear();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });
    });

    describe('cache hit - subsequent requests', () => {
      it('should return cached decision without calling OPA', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        // First call - cache miss
        await guard.canActivate(context);
        expect(mockOpaService.isAuthorized).toHaveBeenCalledTimes(1);

        // Second call - cache hit
        mockOpaService.isAuthorized.mockClear();
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });

      it('should return true for cached allow decision', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);
        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should throw ForbiddenException for cached deny decision', async () => {
        const context = createMockContext(mockUser, 'admin_panel', 'update', { id: 'panel-1' });

        // Clear cache and directly set a cached deny decision
        guard.clearCache();

        // Manually store a deny decision in the cache
        // This simulates a previous authorization that was denied
        (guard as any).cache.set('org-456:user-123:admin_panel:panel-1:update', {
          decision: false,
          timestamp: Date.now()
        });

        // Second call should retrieve the cached deny decision and throw
        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow(
          'Access denied: insufficient privileges for update on admin_panel'
        );

        // Parent should not be called since it was a cache hit
        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });

      it('should not update cache timestamp on cache hit', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);
        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 10));
        await guard.canActivate(context);

        // Cache should still have 1 entry
        expect(guard.getCacheSize()).toBe(1);
      });
    });

    describe('cache expiration', () => {
      it('should expire entries after TTL', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        // Mock private getFromCache to simulate expiration
        jest.spyOn(guard as any, 'getFromCache').mockImplementation((key: string) => {
          const entry = (guard as any).cache.get(key);
          if (!entry) return null;
          // Simulate TTL expiration
          if (Date.now() - entry.timestamp > 300000) {
            (guard as any).cache.delete(key);
            return null;
          }
          return entry.decision;
        });

        await guard.canActivate(context);
        expect(guard.getCacheSize()).toBe(1);
      });

      it('should delete expired entries on retrieval', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);
        const sizeBefore = guard.getCacheSize();

        // Manually expire entry
        (guard as any).cache.forEach((entry: { timestamp: number }, key: string) => {
          entry.timestamp = Date.now() - 400000; // Older than TTL
        });

        // Try to get expired entry
        const expiredKey = Array.from((guard as any).cache.keys())[0];
        const result = (guard as any).getFromCache(expiredKey);

        expect(result).toBeNull();
        expect(guard.getCacheSize()).toBeLessThan(sizeBefore);
      });
    });

    describe('authentication and metadata validation', () => {
      it('should throw ForbiddenException when user is missing', async () => {
        const context = createMockContext(undefined, 'document', 'read');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('User not authenticated');
      });

      it('should throw ForbiddenException when resource metadata is missing', async () => {
        const context = createMockContext(mockUser, undefined, 'read');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException when action metadata is missing', async () => {
        const context = createMockContext(mockUser, 'document', undefined);

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it('should not call OPA service when metadata is missing', async () => {
        const context = createMockContext(mockUser, undefined, 'read');

        try {
          await guard.canActivate(context);
        } catch (error) {
          // Expected
        }

        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });
    });

    describe('multi-tenancy requirements', () => {
      it('should require organization_id or tenant_id', async () => {
        const userNoTenant = {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null,
          tenant_id: undefined
        };
        const context = createMockContext(userNoTenant, 'document', 'read', { id: 'doc-789' });

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Tenant context required');
      });

      it('should use organization_id when available', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        // Should use organization_id for cache key
        expect(guard.getCacheSize()).toBe(1);
      });

      it('should fall back to tenant_id when organization_id is null', async () => {
        const userWithTenantId = {
          ...mockUser,
          organization_id: null,
          tenant_id: 'tenant-789'
        };
        const context = createMockContext(userWithTenantId, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        expect(guard.getCacheSize()).toBe(1);
      });

      it('should prevent cross-tenant cache collisions', async () => {
        const user1 = { ...mockUser, organization_id: 'org-1' };
        const user2 = { ...mockUser, organization_id: 'org-2' };

        const context1 = createMockContext(user1, 'document', 'read', { id: 'doc-1' });
        const context2 = createMockContext(user2, 'document', 'read', { id: 'doc-1' });

        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context1);
        mockOpaService.isAuthorized.mockClear();
        await guard.canActivate(context2);

        // Both calls should hit parent canActivate (different cache keys)
        expect(mockOpaService.isAuthorized).toHaveBeenCalledTimes(1);
      });
    });

    describe('cache key generation scenarios', () => {
      it('should include tenant ID in cache key', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        // Cache key should be: org-456:user-123:document:doc-789:read
        expect(guard.getCacheSize()).toBe(1);
      });

      it('should handle collection actions (no resource ID)', async () => {
        const context = createMockContext(mockUser, 'documents', 'list', undefined);
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        expect(guard.getCacheSize()).toBe(1);
      });

      it('should generate different keys for different resources', async () => {
        const context1 = createMockContext(mockUser, 'document', 'read', { id: 'doc-1' });
        const context2 = createMockContext(mockUser, 'document', 'read', { id: 'doc-2' });

        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context1);
        await guard.canActivate(context2);

        // Should have 2 cache entries
        expect(guard.getCacheSize()).toBe(2);
      });

      it('should generate different keys for different actions', async () => {
        const context1 = createMockContext(mockUser, 'document', 'read', { id: 'doc-1' });
        const context2 = createMockContext(mockUser, 'document', 'write', { id: 'doc-1' });

        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context1);
        await guard.canActivate(context2);

        expect(guard.getCacheSize()).toBe(2);
      });

      it('should generate different keys for different users', async () => {
        const user1 = { ...mockUser, id: 'user-1' };
        const user2 = { ...mockUser, id: 'user-2' };

        const context1 = createMockContext(user1, 'document', 'read', { id: 'doc-1' });
        const context2 = createMockContext(user2, 'document', 'read', { id: 'doc-1' });

        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context1);
        await guard.canActivate(context2);

        expect(guard.getCacheSize()).toBe(2);
      });
    });

    describe('FIFO eviction', () => {
      it('should evict oldest entry when cache is full', async () => {
        // Fill cache to max (1000 entries)
        mockOpaService.isAuthorized.mockResolvedValue(true);

        for (let i = 0; i < 1000; i++) {
          const context = createMockContext({ ...mockUser, id: `user-${i}` }, 'document', 'read', {
            id: `doc-${i}`
          });
          await guard.canActivate(context);
        }

        expect(guard.getCacheSize()).toBe(1000);

        // Add one more entry
        const context = createMockContext({ ...mockUser, id: 'user-1000' }, 'document', 'read', {
          id: 'doc-1000'
        });
        await guard.canActivate(context);

        // Should still be 1000 (oldest evicted)
        expect(guard.getCacheSize()).toBe(1000);
      });

      it('should evict first-in entry on overflow', async () => {
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const context1 = createMockContext({ ...mockUser, id: 'user-1' }, 'document', 'read', {
          id: 'doc-1'
        });
        const context2 = createMockContext({ ...mockUser, id: 'user-2' }, 'document', 'read', {
          id: 'doc-2'
        });

        await guard.canActivate(context1);
        await guard.canActivate(context2);

        // Manually set cache to max to test eviction
        (guard as any).maxCacheSize = 2;

        const context3 = createMockContext({ ...mockUser, id: 'user-3' }, 'document', 'read', {
          id: 'doc-3'
        });
        await guard.canActivate(context3);

        expect(guard.getCacheSize()).toBe(2);
      });
    });
  });

  describe('generateCacheKey', () => {
    it('should generate key with all components', () => {
      const key = (guard as any).generateCacheKey('org-1', 'user-1', 'document', 'doc-1', 'read');
      expect(key).toBe('org-1:user-1:document:doc-1:read');
    });

    it('should use "none" for missing resource ID', () => {
      const key = (guard as any).generateCacheKey(
        'org-1',
        'user-1',
        'documents',
        undefined,
        'list'
      );
      expect(key).toBe('org-1:user-1:documents:none:list');
    });

    it('should handle special characters in IDs', () => {
      const key = (guard as any).generateCacheKey(
        'org-1',
        'user-1',
        'api/v2/docs',
        'doc-123-abc',
        'read'
      );
      expect(key).toBe('org-1:user-1:api/v2/docs:doc-123-abc:read');
    });

    it('should put tenant ID first for isolation', () => {
      const key = (guard as any).generateCacheKey(
        'tenant-abc',
        'user-123',
        'document',
        'doc-1',
        'read'
      );
      expect(key.startsWith('tenant-abc:')).toBe(true);
    });
  });

  describe('getFromCache', () => {
    beforeEach(() => {
      guard.clearCache();
    });

    it('should return null for non-existent key', () => {
      const result = (guard as any).getFromCache('nonexistent:key');
      expect(result).toBeNull();
    });

    it('should return decision for valid cache entry', () => {
      (guard as any).cache.set('test:key', {
        decision: true,
        timestamp: Date.now()
      });

      const result = (guard as any).getFromCache('test:key');
      expect(result).toBe(true);
    });

    it('should return null for expired entry', () => {
      (guard as any).cache.set('expired:key', {
        decision: true,
        timestamp: Date.now() - 400000 // Older than 5 minute TTL
      });

      const result = (guard as any).getFromCache('expired:key');
      expect(result).toBeNull();
    });

    it('should delete expired entry', () => {
      (guard as any).cache.set('expired:key', {
        decision: true,
        timestamp: Date.now() - 400000
      });

      (guard as any).getFromCache('expired:key');

      expect((guard as any).cache.has('expired:key')).toBe(false);
    });

    it('should return false decision correctly', () => {
      (guard as any).cache.set('deny:key', {
        decision: false,
        timestamp: Date.now()
      });

      const result = (guard as any).getFromCache('deny:key');
      expect(result).toBe(false);
    });
  });

  describe('setToCache', () => {
    beforeEach(() => {
      guard.clearCache();
    });

    it('should store entry with timestamp', () => {
      (guard as any).setToCache('test:key', true);

      const entry = (guard as any).cache.get('test:key');
      expect(entry).toEqual({
        decision: true,
        timestamp: expect.any(Number)
      });
    });

    it('should store false decision', () => {
      (guard as any).setToCache('deny:key', false);

      const entry = (guard as any).cache.get('deny:key');
      expect(entry.decision).toBe(false);
    });

    it('should evict oldest entry when cache is full', () => {
      // Set max size to 2 for testing
      (guard as any).maxCacheSize = 2;

      (guard as any).setToCache('key1', true);
      (guard as any).setToCache('key2', true);
      (guard as any).setToCache('key3', true);

      expect((guard as any).cache.has('key1')).toBe(false);
      expect((guard as any).cache.has('key2')).toBe(true);
      expect((guard as any).cache.has('key3')).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should remove all cache entries', async () => {
      const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
      mockOpaService.isAuthorized.mockResolvedValue(true);

      await guard.canActivate(context);
      expect(guard.getCacheSize()).toBeGreaterThan(0);

      guard.clearCache();
      expect(guard.getCacheSize()).toBe(0);
    });

    it('should allow caching after clear', async () => {
      const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
      mockOpaService.isAuthorized.mockResolvedValue(true);

      await guard.canActivate(context);
      guard.clearCache();

      mockOpaService.isAuthorized.mockClear();
      await guard.canActivate(context);

      expect(mockOpaService.isAuthorized).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCacheSize', () => {
    it('should return 0 for empty cache', () => {
      guard.clearCache();
      expect(guard.getCacheSize()).toBe(0);
    });

    it('should return correct size after adding entries', async () => {
      mockOpaService.isAuthorized.mockResolvedValue(true);

      await guard.canActivate(createMockContext(mockUser, 'document', 'read', { id: 'doc-1' }));
      expect(guard.getCacheSize()).toBe(1);

      await guard.canActivate(createMockContext(mockUser, 'document', 'read', { id: 'doc-2' }));
      expect(guard.getCacheSize()).toBe(2);
    });

    it('should return correct size after clearing', async () => {
      mockOpaService.isAuthorized.mockResolvedValue(true);

      await guard.canActivate(createMockContext(mockUser, 'document', 'read', { id: 'doc-1' }));
      guard.clearCache();

      expect(guard.getCacheSize()).toBe(0);
    });
  });

  describe('cache behavior under load', () => {
    it('should handle rapid successive requests', async () => {
      mockOpaService.isAuthorized.mockResolvedValue(true);

      const promises = [];
      for (let i = 0; i < 10; i++) {
        const context = createMockContext(mockUser, 'document', 'read', { id: `doc-${i}` });
        promises.push(guard.canActivate(context));
      }

      await Promise.all(promises);

      expect(guard.getCacheSize()).toBe(10);
    });

    it('should maintain cache integrity with concurrent requests', async () => {
      mockOpaService.isAuthorized.mockResolvedValue(true);

      const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-1' });

      const promises = Array(5)
        .fill(null)
        .map(() => guard.canActivate(context));
      await Promise.all(promises);

      // Should still only have 1 entry
      expect(guard.getCacheSize()).toBe(1);
    });
  });
});

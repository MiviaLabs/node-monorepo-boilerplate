/**
 * Unit tests for TenantResolutionService
 *
 * Tests critical tenant resolution paths: findById, findBySlug, validation, and caching.
 * Focuses on happy paths and key error conditions.
 */

import { Test } from '@nestjs/testing';
import { CacheService } from '@package/redis';

import { MAIN_DB } from '../../database';
import { ApiException } from '../../errors';
import { TenantResolutionService } from '../tenant-resolution.service';

import type { TestingModule } from '@nestjs/testing';

// Mock cache service
const mockCache = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined)
};

// Type for query results
type QueryResult = unknown[] | undefined;

// Global query results queue - allows tests to set up multiple query results
const queryResults: QueryResult[] = [];

// Helper to create a proper chainable mock database that consumes query results
const createMockQuery = (): Record<string, jest.Mock> => {
  const mock: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn(() => {
      // Consume next query result from queue, or return empty array
      const result = queryResults.shift() ?? [];
      return Promise.resolve(result);
    })
  };
  return mock;
};

let mockDb: Record<string, jest.Mock>;

describe('TenantResolutionService', () => {
  let service: TenantResolutionService;

  const mockTenant = {
    id: 123,
    publicId: 'abc-123',
    type: 'organization' as const,
    status: 'active' as const,
    settings: { featureFlags: { beta: true } }
  };

  const mockOrganization = {
    id: 456,
    name: 'Acme Corp',
    slug: 'acme'
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    queryResults.length = 0; // Clear query results queue

    // Create fresh mock db for each test
    mockDb = createMockQuery();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantResolutionService,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: CacheService,
          useValue: mockCache
        }
      ]
    }).compile();

    service = module.get<TenantResolutionService>(TenantResolutionService);
  });

  describe('findById', () => {
    it('should return tenant from database on cache miss', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act - findById takes organizationId (not tenantId)
      const result = await service.findById('456');

      // Assert
      expect(result).toEqual({
        id: 123,
        publicId: 'abc-123',
        type: 'organization',
        status: 'active',
        settings: { featureFlags: { beta: true } },
        organization: {
          id: 456,
          name: 'Acme Corp',
          slug: 'acme'
        }
      });
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return tenant from cache', async () => {
      // Arrange
      const cachedTenant = { ...mockTenant, organization: mockOrganization };
      mockCache.get.mockResolvedValue(cachedTenant);

      // Act
      const result = await service.findById('123');

      // Assert
      expect(result).toEqual(cachedTenant);
      expect(mockDb['select']).not.toHaveBeenCalled();
    });

    it('should return null for non-existent tenant', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([]); // Empty result

      // Act
      const result = await service.findById('999');

      // Assert
      expect(result).toBeNull();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should throw API_023 for invalid tenant ID format', async () => {
      // Act & Assert
      await expect(service.findById('abc')).rejects.toThrow(ApiException);
      await expect(service.findById('abc')).rejects.toMatchObject({
        code: 'API_023',
        httpStatus: 400
      });
    });

    it('should throw API_023 for negative tenant ID', async () => {
      // Act & Assert
      await expect(service.findById('-1')).rejects.toThrow(ApiException);
      await expect(service.findById('-1')).rejects.toMatchObject({
        code: 'API_023',
        httpStatus: 400
      });
    });

    it('should handle cache get failures gracefully', async () => {
      // Arrange
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act
      const result = await service.findById('456');

      // Assert - should still return tenant from database
      expect(result).toBeDefined();
      expect(result?.id).toBe(123);
    });
  });

  describe('findBySlug', () => {
    it('should return tenant by organization slug', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act
      const result = await service.findBySlug('acme');

      // Assert
      expect(result).toEqual({
        id: 123,
        publicId: 'abc-123',
        type: 'organization',
        status: 'active',
        settings: { featureFlags: { beta: true } },
        organization: {
          id: 456,
          name: 'Acme Corp',
          slug: 'acme'
        }
      });
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return tenant from cache', async () => {
      // Arrange
      const cachedTenant = {
        ...mockTenant,
        organization: mockOrganization
      };
      mockCache.get.mockResolvedValue(cachedTenant);

      // Act
      const result = await service.findBySlug('acme');

      // Assert
      expect(result).toEqual(cachedTenant);
      expect(mockDb['select']).not.toHaveBeenCalled();
    });

    it('should return null for non-existent slug', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([]);

      // Act
      const result = await service.findBySlug('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw API_023 for slug too short', async () => {
      // Act & Assert
      await expect(service.findBySlug('a')).rejects.toThrow(ApiException);
      await expect(service.findBySlug('a')).rejects.toMatchObject({
        code: 'API_023',
        httpStatus: 400
      });
    });

    it('should throw API_023 for slug too long', async () => {
      // Act & Assert
      await expect(service.findBySlug('a'.repeat(51))).rejects.toThrow(ApiException);
      await expect(service.findBySlug('a'.repeat(51))).rejects.toMatchObject({
        code: 'API_023',
        httpStatus: 400
      });
    });
  });

  describe('validateTenant', () => {
    it('should return active tenant', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act - validateTenant takes organizationId
      const result = await service.validateTenant('456');

      // Assert
      expect(result.status).toBe('active');
      expect(result.id).toBe(123);
    });

    it('should throw API_021 for non-existent tenant', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([]); // Organization not found

      // Act & Assert
      await expect(service.validateTenant('999')).rejects.toThrow(ApiException);
      // Need fresh query result for second assertion
      queryResults.push([]);
      await expect(service.validateTenant('999')).rejects.toMatchObject({
        code: 'API_021',
        httpStatus: 404
      });
    });

    it('should throw API_022 for suspended tenant', async () => {
      // Arrange
      const suspendedTenant = { ...mockTenant, status: 'suspended' as const };
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: suspendedTenant.id,
          tenantPublicId: suspendedTenant.publicId,
          tenantType: suspendedTenant.type,
          tenantStatus: suspendedTenant.status,
          tenantSettings: suspendedTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act & Assert
      await expect(service.validateTenant('456')).rejects.toMatchObject({
        code: 'API_022',
        httpStatus: 403
      });
    });

    it('should throw API_022 for draft tenant', async () => {
      // Arrange
      const draftTenant = { ...mockTenant, status: 'draft' as const };
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: draftTenant.id,
          tenantPublicId: draftTenant.publicId,
          tenantType: draftTenant.type,
          tenantStatus: draftTenant.status,
          tenantSettings: draftTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act & Assert
      await expect(service.validateTenant('456')).rejects.toMatchObject({
        code: 'API_022',
        httpStatus: 403
      });
    });
  });

  describe('validateTenantBySlug', () => {
    it('should return active tenant by slug', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act
      const result = await service.validateTenantBySlug('acme');

      // Assert
      expect(result.status).toBe('active');
      expect(result.organization?.slug).toBe('acme');
    });

    it('should throw API_021 for non-existent slug', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      queryResults.push([]); // Organization not found

      // Act & Assert
      await expect(service.validateTenantBySlug('nonexistent')).rejects.toThrow(ApiException);
      await expect(service.validateTenantBySlug('nonexistent')).rejects.toMatchObject({
        code: 'API_021',
        httpStatus: 404
      });
    });

    it('should throw API_022 for suspended tenant by slug', async () => {
      // Arrange
      const suspendedTenant = { ...mockTenant, status: 'suspended' as const };
      mockCache.get.mockResolvedValue(null);
      queryResults.push([
        {
          tenantId: suspendedTenant.id,
          tenantPublicId: suspendedTenant.publicId,
          tenantType: suspendedTenant.type,
          tenantStatus: suspendedTenant.status,
          tenantSettings: suspendedTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act & Assert
      await expect(service.validateTenantBySlug('acme')).rejects.toMatchObject({
        code: 'API_022',
        httpStatus: 403
      });
    });
  });

  describe('invalidateTenantCache', () => {
    it('should invalidate tenant cache by organization ID', async () => {
      // Arrange
      queryResults.push([{ slug: mockOrganization.slug }]);

      // Act - takes organizationId
      await service.invalidateTenantCache(456);

      // Assert - cache key format is tenant:org:{organizationId}
      expect(mockCache.delete).toHaveBeenCalledWith('tenant:org:456');
      expect(mockCache.delete).toHaveBeenCalledWith('tenant:slug:acme');
    });

    it('should invalidate a previous slug key during rename flows', async () => {
      queryResults.push([{ slug: 'new-acme' }]);

      await service.invalidateTenantCache(456, { previousSlug: 'acme' });

      expect(mockCache.delete).toHaveBeenCalledWith('tenant:org:456');
      expect(mockCache.delete).toHaveBeenCalledWith('tenant:slug:acme');
      expect(mockCache.delete).toHaveBeenCalledWith('tenant:slug:new-acme');
    });

    it('should do nothing when cache is disabled', async () => {
      // Arrange - create service without cache
      const noCacheModule: TestingModule = await Test.createTestingModule({
        providers: [
          TenantResolutionService,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      const noCacheService = noCacheModule.get<TenantResolutionService>(TenantResolutionService);

      // Act
      await noCacheService.invalidateTenantCache(456);

      // Assert
      expect(mockCache.delete).not.toHaveBeenCalled();
    });

    it('should handle cache delete failures gracefully', async () => {
      // Arrange
      mockCache.delete.mockRejectedValue(new Error('Redis connection failed'));
      queryResults.push([{ slug: mockOrganization.slug }]);

      // Act - should not throw
      await expect(service.invalidateTenantCache(456)).resolves.not.toThrow();
    });

    it('should not invalidate slug cache when org not found', async () => {
      // Arrange
      queryResults.push([]);

      // Act
      await service.invalidateTenantCache(456);

      // Assert - only org ID deleted
      expect(mockCache.delete).toHaveBeenCalledWith('tenant:org:456');
      expect(mockCache.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('without database', () => {
    it('should handle service without database gracefully', async () => {
      // Arrange - create service without database
      const noDbModule: TestingModule = await Test.createTestingModule({
        providers: [TenantResolutionService]
      }).compile();

      const noDbService = noDbModule.get<TenantResolutionService>(TenantResolutionService);

      // Act & Assert - should not throw, will fail when trying to query
      // The service allows optional DB injection
      expect(noDbService).toBeDefined();
    });
  });

  describe('cache behavior', () => {
    it('should handle cache set failures gracefully', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error('Redis connection failed'));
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act - should still return tenant
      const result = await service.findById('456');

      // Assert
      expect(result).toBeDefined();
      if (result) {
        expect(result.id).toBe(123);
      }
    });

    it('should not call cache when disabled', async () => {
      // Arrange - create service without cache
      const noCacheModule: TestingModule = await Test.createTestingModule({
        providers: [
          TenantResolutionService,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      const noCacheService = noCacheModule.get<TenantResolutionService>(TenantResolutionService);
      queryResults.push([
        {
          tenantId: mockTenant.id,
          tenantPublicId: mockTenant.publicId,
          tenantType: mockTenant.type,
          tenantStatus: mockTenant.status,
          tenantSettings: mockTenant.settings,
          organizationId: mockOrganization.id,
          organizationName: mockOrganization.name,
          organizationSlug: mockOrganization.slug
        }
      ]);

      // Act
      await noCacheService.findById('456');

      // Assert
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
});

/**
 * Unit tests for GcpTenantRepository
 *
 * Tests the repository that manages GCP tenant ID storage and retrieval for organizations.
 * Verifies database operations for GCP tenant linking and lookups.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';

import { GcpTenantRepository } from '../gcp-tenant.repository';

import type { OrganizationWithGcpTenant } from '../../tenants.types';
import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('GcpTenantRepository', () => {
  let repository: GcpTenantRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockOrganization: OrganizationWithGcpTenant = {
    id: 123,
    tenantId: 456,
    ownerId: 789,
    publicId: 'org-public-id',
    name: 'Test Organization',
    displayName: 'Test Organization',
    slug: 'test-org',
    gcpTenantId: 'gcp-tenant-abc-123',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  beforeEach(async () => {
    const mockDb = {
      select: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
      transaction: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcpTenantRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<GcpTenantRepository>(GcpTenantRepository);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = module.get<NodePgDatabase>(MAIN_DB) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByIdWithGcpTenant', () => {
    it('should find organization by ID with GCP tenant info', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      const result = await repository.findByIdWithGcpTenant('system', mockOrganization.id);

      // Assert
      expect(result).toEqual(mockOrganization);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when organization not found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByIdWithGcpTenant('system', 999);

      // Assert
      expect(result).toBeNull();
    });

    it('should use correct where clause for organization ID', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByIdWithGcpTenant('system', 123);

      // Assert
      expect(db.select).toHaveBeenCalled();
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should limit results to 1', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByIdWithGcpTenant('system', 123);

      // Assert
      const limitCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where.mock.results[0]!.value.limit;
      expect(limitCall).toHaveBeenCalledWith(1);
    });

    it('should allow tenant-scoped reads without explicit user context', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      const result = await repository.findByIdWithGcpTenant('456', 123);

      expect(result).toEqual(mockOrganization);
    });
  });

  describe('updateGcpTenantId', () => {
    it('should update GCP tenant ID for organization', async () => {
      // Arrange
      const updatedOrg = {
        ...mockOrganization,
        gcpTenantId: 'new-gcp-tenant-id',
        updatedAt: new Date('2024-01-02T00:00:00.000Z')
      };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedOrg])
          })
        })
      });

      // Act
      const result = await repository.updateGcpTenantId(mockOrganization.id, 'new-gcp-tenant-id');

      // Assert
      expect(result).toEqual(updatedOrg);
      expect(db.update).toHaveBeenCalled();
    });

    it('should include updatedAt timestamp in update', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.updateGcpTenantId(123, 'gcp-tenant-id');

      // Assert
      const setCall = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith({
        gcpTenantId: 'gcp-tenant-id',
        updatedAt: expect.any(Date)
      });
    });

    it('should use correct where clause for organization ID', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.updateGcpTenantId(123, 'gcp-tenant-id');

      // Assert
      expect(db.update).toHaveBeenCalled();
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should return first element from returning array', async () => {
      // Arrange
      const updatedOrg = {
        ...mockOrganization,
        gcpTenantId: 'updated-gcp-tenant'
      };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedOrg])
          })
        })
      });

      // Act
      const result = await repository.updateGcpTenantId(123, 'updated-gcp-tenant');

      // Assert
      expect(result).toEqual(updatedOrg);
    });
  });

  describe('findByGcpTenantId', () => {
    it('should find organization by GCP tenant ID', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      const result = await repository.findByGcpTenantId(
        mockOrganization.gcpTenantId ?? 'default-gcp-tenant-id'
      );

      // Assert
      expect(result).toEqual(mockOrganization);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when no organization found for GCP tenant ID', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByGcpTenantId('non-existent-gcp-tenant');

      // Assert
      expect(result).toBeNull();
    });

    it('should use correct where clause for GCP tenant ID', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByGcpTenantId('gcp-tenant-abc-123');

      // Assert
      expect(db.select).toHaveBeenCalled();
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should limit results to 1', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByGcpTenantId('gcp-tenant-id');

      // Assert
      const limitCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where.mock.results[0]!.value.limit;
      expect(limitCall).toHaveBeenCalledWith(1);
    });
  });

  describe('BaseRepository integration', () => {
    it('should inherit findById method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findById).toBe('function');
    });

    it('should inherit findByIdOrThrow method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findByIdOrThrow).toBe('function');
    });

    it('should inherit findMany method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findMany).toBe('function');
    });

    it('should inherit exists method from BaseRepository', () => {
      // Assert
      expect(typeof repository.exists).toBe('function');
    });

    it('should inherit transaction method from BaseRepository', () => {
      // Assert
      expect(typeof repository.transaction).toBe('function');
    });

    it('should use organizations table', () => {
      // Assert - verify table configuration
      const table = repository['getTable']();
      expect(table).toBeDefined();
    });

    it('should use id column for queries', () => {
      // Assert - verify ID column configuration
      const idColumn = repository['getIdColumn']();
      expect(idColumn).toBeDefined();
    });

    it('should use tenantId column for scoping', () => {
      // Assert - verify tenant column configuration
      const tenantColumn = repository['getTenantColumn']();
      expect(tenantColumn).toBeDefined();
    });

    it('should have Organization as entity name', () => {
      // Assert - verify entity name
      const entityName = repository['getEntityName']();
      expect(entityName).toBe('Organization');
    });
  });

  describe('edge cases', () => {
    it('should handle organization without GCP tenant (gcpTenantId is null)', async () => {
      // Arrange
      const orgWithoutGcpTenant = {
        ...mockOrganization,
        gcpTenantId: null
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([orgWithoutGcpTenant])
          })
        })
      });

      // Act
      const result = await repository.findByIdWithGcpTenant('system', 123);

      // Assert
      expect(result?.gcpTenantId).toBeNull();
    });

    it('should handle empty string GCP tenant ID', async () => {
      // Arrange
      const orgWithEmptyGcpTenantId = {
        ...mockOrganization,
        gcpTenantId: ''
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([orgWithEmptyGcpTenantId])
          })
        })
      });

      // Act
      const result = await repository.findByGcpTenantId('');

      // Assert
      expect(result).toEqual(orgWithEmptyGcpTenantId);
    });

    it('should handle very long GCP tenant ID (UUID)', async () => {
      // Arrange
      const longGcpTenantId = '123e4567-e89b-12d3-a456-426614174000-very-long-id';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByGcpTenantId(longGcpTenantId);

      // Assert
      expect(db.select).toHaveBeenCalled();
    });

    it('should handle numeric organization ID', async () => {
      // Arrange
      const numericOrgId = 999999;

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      });

      // Act
      await repository.findByIdWithGcpTenant('system', numericOrgId);

      // Assert
      expect(db.select).toHaveBeenCalled();
    });
  });
});

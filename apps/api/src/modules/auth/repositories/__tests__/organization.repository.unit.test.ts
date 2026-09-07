/**
 * Unit Tests for OrganizationRepository
 *
 * Tests organization-related data access with tenant isolation.
 */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';

import { OrganizationRepository } from '../organization.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('OrganizationRepository', () => {
  let repository: OrganizationRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockOrganization = {
    id: 1,
    name: 'Test Organization',
    slug: 'test-org',
    ownerId: 100,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  };

  beforeEach(async () => {
    const mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      transaction: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<OrganizationRepository>(OrganizationRepository);
    db = module.get(MAIN_DB);
  });

  describe('findById', () => {
    it('should find organization by numeric string ID', async () => {
      // Arrange
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockOrganization])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await repository.findById('1');

      // Assert
      expect(db.select).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(expect.anything());
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockOrganization);
    });

    it('should return null for non-numeric string ID', async () => {
      // Act
      const result = await repository.findById('invalid');

      // Assert
      expect(result).toBeNull();
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should return null for empty string ID', async () => {
      // Act
      const result = await repository.findById('   ');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when organization not found', async () => {
      // Arrange
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await repository.findById('999');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByIdWithTransaction', () => {
    it('should find organization within transaction', async () => {
      // Arrange
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockOrganization])
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act
      const result = await repository.findByIdWithTransaction('1', mockTx);

      // Assert
      expect(mockTx.select).toHaveBeenCalled();
      expect(result).toEqual(mockOrganization);
    });

    it('should return null for invalid ID within transaction', async () => {
      // Arrange
      const mockTx = {
        select: jest.fn()
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act
      const result = await repository.findByIdWithTransaction('abc', mockTx);

      // Assert
      expect(result).toBeNull();
      expect(mockTx.select).not.toHaveBeenCalled();
    });
  });

  describe('allowsPublicRegistration', () => {
    it('should return true when organization is active', async () => {
      // Arrange
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockOrganization])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await repository.allowsPublicRegistration('1');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when organization is inactive', async () => {
      // Arrange
      const inactiveOrg = { ...mockOrganization, isActive: false };
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([inactiveOrg])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await repository.allowsPublicRegistration('1');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when organization not found', async () => {
      // Arrange
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      const result = await repository.allowsPublicRegistration('999');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('deleteWithTransaction', () => {
    it('should hard delete organization within transaction', async () => {
      // Arrange
      const mockTx = {
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockOrganization])
          })
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act
      const result = await repository.deleteWithTransaction(mockTx, 1);

      // Assert
      expect(mockTx.delete).toHaveBeenCalled();
      expect(result).toEqual(mockOrganization);
    });
  });

  describe('softDeleteWithTransaction', () => {
    it('should soft delete organization by setting deletedAt', async () => {
      // Arrange
      const softDeletedOrg = {
        ...mockOrganization,
        deletedAt: expect.any(Date),
        isActive: false
      };

      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([softDeletedOrg])
            })
          })
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act
      const result = await repository.softDeleteWithTransaction(mockTx, 1);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
      expect(result.deletedAt).toBeDefined();
      expect(result.isActive).toBe(false);
    });

    it('should throw DB_004 when organization not found during soft delete', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([])
            })
          })
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act & Assert
      await expect(repository.softDeleteWithTransaction(mockTx, 999)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('findExpiredSoftDeleted', () => {
    it('should find organizations soft deleted before cutoff date', async () => {
      // Arrange
      const expiredOrgs = [
        { ...mockOrganization, deletedAt: new Date('2023-01-01') },
        { ...mockOrganization, id: 2, deletedAt: new Date('2023-06-01') }
      ];

      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis()
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.where.mockResolvedValue(expiredOrgs);

      // Act
      const result = await repository.findExpiredSoftDeleted(30);

      // Assert
      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(expiredOrgs);
    });
  });

  describe('hardDeletePermanently', () => {
    it('should permanently delete organization', async () => {
      // Arrange
      const mockDeleteBuilder = {
        where: jest.fn().mockResolvedValue(undefined)
      };

      (db.delete as jest.Mock).mockReturnValue(mockDeleteBuilder);

      // Act
      await repository.hardDeletePermanently(1);

      // Assert
      expect(db.delete).toHaveBeenCalled();
      expect(mockDeleteBuilder.where).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('transferOwnership', () => {
    it('should transfer ownership to new owner', async () => {
      // Arrange
      const updatedOrg = { ...mockOrganization, ownerId: 200 };

      const mockUpdateBuilder = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedOrg])
          })
        })
      };

      (db.update as jest.Mock).mockReturnValue(mockUpdateBuilder);

      // Act
      const result = await repository.transferOwnership('1', 200);

      // Assert
      expect(db.update).toHaveBeenCalled();
      expect(result.ownerId).toBe(200);
      expect(result.updatedAt).toBeDefined();
    });

    it('should use transaction when provided', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...mockOrganization, ownerId: 300 }])
            })
          })
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act
      const result = await repository.transferOwnership('1', 300, mockTx);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
      expect(result.ownerId).toBe(300);
    });

    it('should throw VAL_002 for invalid tenantId', async () => {
      // Act & Assert
      await expect(repository.transferOwnership('invalid', 200)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw DB_004 when organization not found', async () => {
      // Arrange
      const mockUpdateBuilder = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      };

      (db.update as jest.Mock).mockReturnValue(mockUpdateBuilder);

      // Act & Assert
      await expect(repository.transferOwnership('1', 200)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('tenant scoping', () => {
    it('should scope all query operations to organization ID', async () => {
      // Arrange
      const orgId = '123';
      const mockQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockOrganization])
      };

      (db.select as jest.Mock).mockReturnValue(mockQueryBuilder);

      // Act
      await repository.findById(orgId);

      // Assert
      expect(db.select).toHaveBeenCalled();
      expect(mockQueryBuilder.from).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
    });

    it('should scope all update operations to organization ID', async () => {
      // Arrange
      const orgId = '456';
      const mockWhere = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...mockOrganization, id: 456 }])
      });
      const mockUpdateBuilder = {
        set: jest.fn().mockReturnValue({
          where: mockWhere
        })
      };

      (db.update as jest.Mock).mockReturnValue(mockUpdateBuilder);

      // Act
      await repository.transferOwnership(orgId, 200);

      // Assert
      expect(db.update).toHaveBeenCalled();
      expect(mockUpdateBuilder.set).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should scope all delete operations to organization ID', async () => {
      // Arrange
      const orgId = 789;
      const mockDeleteWhere = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockOrganization])
      });
      const mockUpdateWhere = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...mockOrganization, deletedAt: new Date() }])
      });
      const mockTx = {
        delete: jest.fn().mockReturnValue({
          where: mockDeleteWhere
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: mockUpdateWhere
          })
        })
      } as unknown as jest.Mocked<NodePgDatabase>;

      // Act - Test both hard delete and soft delete
      await repository.deleteWithTransaction(mockTx, orgId);
      await repository.softDeleteWithTransaction(mockTx, orgId);

      // Assert
      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
      expect(mockUpdateWhere).toHaveBeenCalled();
    });
  });
});

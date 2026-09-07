/**
 * TenantRepository Unit Tests
 *
 * Tests the TenantRepository data access layer.
 * Uses a mock database connection to isolate repository logic.
 *
 * Coverage:
 * - findByPublicId: Find tenant by public ID (UUID)
 * - findByPublicIdOrThrow: Find tenant by public ID or throw error
 * - updateStatus: Update tenant status
 * - updateSettings: Update tenant settings
 * - softDelete: Soft delete tenant by setting deletedAt timestamp
 * - countMembers: Count active members for a tenant
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Mock database requires any type */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

import { Test } from '@nestjs/testing';
import { tenants } from '@package/db-core';
import { RegisteredError } from '@package/errors';

import { TenantRepository } from '../tenant.repository';

import type { TenantStatus } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('TenantRepository', () => {
  let repository: TenantRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockTenant = {
    id: 1,
    type: 'organization' as const,
    status: 'active' as TenantStatus,
    settings: { featureFlag: true },
    publicId: 'abc123-def456-ghi789',
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

    const module = await Test.createTestingModule({
      providers: [
        TenantRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<TenantRepository>(TenantRepository);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = module.get<NodePgDatabase>(MAIN_DB) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByPublicId', () => {
    it('should find tenant by public ID', async () => {
      // Arrange
      const publicId = 'abc123-def456-ghi789';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockTenant])
          })
        })
      });

      // Act
      const result = await repository.findByPublicId(publicId);

      // Assert
      expect(result).toEqual(mockTenant);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when tenant not found', async () => {
      // Arrange
      const publicId = 'nonexistent-id';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByPublicId(publicId);

      // Assert
      expect(result).toBeNull();
    });

    it('should limit query to 1 result', async () => {
      // Arrange
      const publicId = 'test-id';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockTenant])
          })
        })
      });

      // Act
      await repository.findByPublicId(publicId);

      // Assert
      const limitMock = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where.mock.results[0]!.value.limit;
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  });

  describe('findByPublicIdOrThrow', () => {
    let repository: TenantRepository;
    let db: jest.Mocked<NodePgDatabase>;

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db = module.get<NodePgDatabase>(MAIN_DB) as any;
    });

    it('should return tenant when found', async () => {
      // Arrange
      const publicId = 'abc123-def456-ghi789';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockTenant])
          })
        })
      });

      // Act
      const result = await repository.findByPublicIdOrThrow(publicId);

      // Assert
      expect(result).toEqual(mockTenant);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      // Arrange
      const publicId = 'nonexistent-id';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.findByPublicIdOrThrow(publicId)).rejects.toThrow(RegisteredError);
    });
  });

  describe('updateStatus', () => {
    let repository: TenantRepository;
    let db: jest.Mocked<NodePgDatabase>;

    const updatedTenant = { ...mockTenant, status: 'suspended' as TenantStatus };

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db = module.get<NodePgDatabase>(MAIN_DB) as any;
    });

    it('should update tenant status', async () => {
      // Arrange
      const tenantId = 1;
      const newStatus: TenantStatus = 'suspended';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedTenant])
          })
        })
      });

      // Act
      const result = await repository.updateStatus(tenantId, newStatus);

      // Assert
      expect(result).toEqual(updatedTenant);
      expect(result.status).toBe('suspended');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      // Arrange
      const tenantId = 999;
      const newStatus: TenantStatus = 'suspended';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.updateStatus(tenantId, newStatus)).rejects.toThrow(RegisteredError);
    });

    it('should set updatedAt timestamp', async () => {
      // Arrange
      const tenantId = 1;
      const newStatus: TenantStatus = 'active';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedTenant])
          })
        })
      });

      // Act
      await repository.updateStatus(tenantId, newStatus);

      // Assert
      const setMock = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: newStatus,
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('updateSettings', () => {
    let repository: TenantRepository;
    let db: jest.Mocked<NodePgDatabase>;

    const updatedTenant = { ...mockTenant, settings: { featureFlag: false, newSetting: true } };

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db = module.get<NodePgDatabase>(MAIN_DB) as any;
    });

    it('should update tenant settings', async () => {
      // Arrange
      const tenantId = 1;
      const newSettings = { featureFlag: false, newSetting: true };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedTenant])
          })
        })
      });

      // Act
      const result = await repository.updateSettings(tenantId, newSettings);

      // Assert
      expect(result).toEqual(updatedTenant);
      expect(result.settings).toEqual(newSettings);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      // Arrange
      const tenantId = 999;
      const newSettings = { featureFlag: true };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.updateSettings(tenantId, newSettings)).rejects.toThrow(
        RegisteredError
      );
    });

    it('should set updatedAt timestamp', async () => {
      // Arrange
      const tenantId = 1;
      const newSettings = { setting: 'value' };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedTenant])
          })
        })
      });

      // Act
      await repository.updateSettings(tenantId, newSettings);

      // Assert
      const setMock = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: newSettings,
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('softDelete', () => {
    let repository: TenantRepository;
    let db: jest.Mocked<NodePgDatabase>;

    const deletedTenant = { ...mockTenant, status: 'deleted' as TenantStatus };

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db = module.get<NodePgDatabase>(MAIN_DB) as any;
    });

    it('should soft delete tenant by setting status to deleted', async () => {
      // Arrange
      const tenantId = 1;

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([deletedTenant])
          })
        })
      });

      // Act
      const result = await repository.softDelete(tenantId);

      // Assert
      expect(result).toEqual(deletedTenant);
      expect(result.status).toBe('deleted');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      // Arrange
      const tenantId = 999;

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.softDelete(tenantId)).rejects.toThrow(RegisteredError);
    });

    it('should set updatedAt timestamp', async () => {
      // Arrange
      const tenantId = 1;

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([deletedTenant])
          })
        })
      });

      // Act
      await repository.softDelete(tenantId);

      // Assert
      const setMock = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'deleted',
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('countMembers', () => {
    let repository: TenantRepository;
    let db: jest.Mocked<NodePgDatabase>;

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db = module.get<NodePgDatabase>(MAIN_DB) as any;
    });

    it('should return count of active members', async () => {
      // Arrange
      const tenantId = 1;

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 10 }])
        })
      });

      // Act
      const result = await repository.countMembers(tenantId);

      // Assert
      expect(result).toBe(10);
    });

    it('should return 0 when no members found', async () => {
      // Arrange
      const tenantId = 999;

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      // Act
      const result = await repository.countMembers(tenantId);

      // Assert
      expect(result).toBe(0);
    });

    it('should handle dynamic import of userTenants', async () => {
      // Arrange
      const tenantId = 1;

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }])
        })
      });

      // Act
      const result = await repository.countMembers(tenantId);

      // Assert
      expect(result).toBe(5);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('BaseRepository integration', () => {
    let repository: TenantRepository;

    beforeEach(async () => {
      const mockDb = {
        select: jest.fn(),
        update: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn()
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          }
        ]
      }).compile();

      repository = module.get<TenantRepository>(TenantRepository);
    });

    it('should have findById method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findById).toBe('function');
    });

    it('should have findByIdOrThrow method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findByIdOrThrow).toBe('function');
    });

    it('should have findMany method from BaseRepository', () => {
      // Assert
      expect(typeof repository.findMany).toBe('function');
    });

    it('should have create method from BaseRepository', () => {
      // Assert
      expect(typeof repository.create).toBe('function');
    });

    it('should have update method from BaseRepository', () => {
      // Assert
      expect(typeof repository.update).toBe('function');
    });

    it('should have delete method from BaseRepository', () => {
      // Assert
      expect(typeof repository.delete).toBe('function');
    });

    it('should have exists method from BaseRepository', () => {
      // Assert
      expect(typeof repository.exists).toBe('function');
    });

    it('should use correct table for tenant operations', () => {
      // Assert - verify getTable() returns tenants table
      expect(repository['getTable']()).toBe(tenants);
    });

    it('should use correct ID column', () => {
      // Assert - verify getIdColumn() returns tenants.id
      expect(repository['getIdColumn']()).toBe(tenants.id);
    });

    it('should use tenant column for scoping', () => {
      // Assert - verify getTenantColumn() returns tenants.id (tenants table has no org_id)
      expect(repository['getTenantColumn']()).toBe(tenants.id);
    });

    it('should have correct entity name', () => {
      // Assert - verify getEntityName() returns 'Tenant'
      expect(repository['getEntityName']()).toBe('Tenant');
    });

    it('should use organization ID for tenant scoping', () => {
      // Assert - verify usesOrganizationIdForTenant() returns false for tenants table
      expect(repository['usesOrganizationIdForTenant']()).toBe(false);
    });
  });
});

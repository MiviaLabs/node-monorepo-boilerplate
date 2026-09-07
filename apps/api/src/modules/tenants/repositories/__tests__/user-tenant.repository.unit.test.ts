/**
 * Unit Tests for UserTenantRepository
 *
 * Tests user-tenant membership operations including:
 * - Finding memberships by user/tenant
 * - Creating memberships
 * - Updating roles and status
 * - Deactivating memberships
 * - Transactional operations
 */

import { Test } from '@nestjs/testing';

import { MAIN_DB } from '../../../../common/database/database.constants';
import {
  createMockUserTenant,
  createMockUserTenants
} from '../../__tests__/fixtures/tenant.fixture';
import { UserTenantRepository } from '../user-tenant.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('UserTenantRepository', () => {
  let repository: UserTenantRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockMembership = createMockUserTenant();

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<NodePgDatabase>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTenantRepository,
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    repository = module.get<UserTenantRepository>(UserTenantRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUserAndTenant', () => {
    it('should return membership when found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockMembership])
          })
        })
      });

      // Act
      const result = await repository.findByUserAndTenant(1, 123);

      // Assert
      expect(result).toEqual(mockMembership);
    });

    it('should return null when not found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByUserAndTenant(1, 999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByUserAndTenantOrThrow', () => {
    it('should return membership when found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockMembership])
          })
        })
      });

      // Act
      const result = await repository.findByUserAndTenantOrThrow(1, 123);

      // Assert
      expect(result).toEqual(mockMembership);
    });

    it('should throw DB_004 when not found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.findByUserAndTenantOrThrow(1, 999)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('findByUserId', () => {
    it('should return all memberships for a user', async () => {
      // Arrange
      const memberships = createMockUserTenants(2);

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(memberships)
        })
      });

      // Act
      const result = await repository.findByUserId(123);

      // Assert
      expect(result).toEqual(memberships);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no memberships', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      // Act
      const result = await repository.findByUserId(999);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findByTenantId', () => {
    it('should return all members for a tenant', async () => {
      // Arrange
      const members = createMockUserTenants(2, { tenantId: 1 });

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(members)
        })
      });

      // Act
      const result = await repository.findByTenantId(1);

      // Assert
      expect(result).toEqual(members);
      expect(result).toHaveLength(2);
    });
  });

  describe('findActiveByTenantId', () => {
    it('should return only active members', async () => {
      // Arrange
      const activeMembers = [createMockUserTenant({ isActive: true })];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(activeMembers)
        })
      });

      // Act
      const result = await repository.findActiveByTenantId(1);

      // Assert
      expect(result).toEqual(activeMembers);
      expect(result.every((m) => m.isActive)).toBe(true);
    });
  });

  describe('createMembership', () => {
    it('should create and return new membership', async () => {
      // Arrange
      const newData = {
        userId: 123,
        tenantId: 1,
        role: 'tenant_user' as const,
        isActive: true
      };

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockMembership])
        })
      });

      // Act
      const result = await repository.createMembership(newData);

      // Assert
      expect(result).toEqual(mockMembership);
    });

    it('should throw error when creation fails', async () => {
      // Arrange
      const newData = {
        userId: 123,
        tenantId: 1,
        role: 'tenant_user' as const,
        isActive: true
      };

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([])
        })
      });

      // Act & Assert
      await expect(repository.createMembership(newData)).rejects.toThrow(
        'Failed to create user tenant membership'
      );
    });
  });

  describe('createMembershipWithTransaction', () => {
    it('should create membership within transaction', async () => {
      // Arrange
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockMembership])
          })
        })
      } as unknown as NodePgDatabase;

      const newData = {
        userId: 123,
        tenantId: 1,
        role: 'tenant_user' as const,
        isActive: true
      };

      // Act
      const result = await repository.createMembershipWithTransaction(tx, newData);

      // Assert
      expect(result).toEqual(mockMembership);
      expect(tx.insert).toHaveBeenCalled();
    });

    it('should throw error when transactional creation fails', async () => {
      // Arrange
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      } as unknown as NodePgDatabase;

      const newData = {
        userId: 123,
        tenantId: 1,
        role: 'tenant_user' as const,
        isActive: true
      };

      // Act & Assert
      await expect(repository.createMembershipWithTransaction(tx, newData)).rejects.toThrow(
        'Failed to create user tenant membership'
      );
    });
  });

  describe('updateRole', () => {
    it('should update and return membership with new role', async () => {
      // Arrange
      const updatedMembership = createMockUserTenant({ role: 'tenant_admin' });

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      // Act
      const result = await repository.updateRole(1, 123, 'tenant_admin');

      // Assert
      expect(result.role).toBe('tenant_admin');
    });

    it('should throw DB_004 when membership not found', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.updateRole(1, 999, 'tenant_admin')).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('deactivateMembership', () => {
    it('should deactivate and return membership', async () => {
      // Arrange
      const deactivatedMembership = createMockUserTenant({ isActive: false });

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([deactivatedMembership])
          })
        })
      });

      // Act
      const result = await repository.deactivateMembership(1, 123);

      // Assert
      expect(result.isActive).toBe(false);
    });

    it('should throw DB_004 when membership not found', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.deactivateMembership(1, 999)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('deleteMembershipWithTransaction', () => {
    it('should delete membership within transaction', async () => {
      // Arrange
      const tx = {
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      } as unknown as NodePgDatabase;

      // Act
      await repository.deleteMembershipWithTransaction(1, tx, 123);

      // Assert
      expect(tx.delete).toHaveBeenCalled();
    });
  });

  describe('countByUserIdWithTransaction', () => {
    it('should return membership count for user', async () => {
      // Arrange
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 2 }])
          })
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.countByUserIdWithTransaction(tx, 123);

      // Assert
      expect(result).toBe(2);
    });

    it('should return 0 when user has no memberships', async () => {
      // Arrange
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([])
          })
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.countByUserIdWithTransaction(tx, 123);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('setDefaultTenant', () => {
    it('should set default tenant and return membership', async () => {
      // Arrange
      const defaultMembership = createMockUserTenant({ isDefault: true });

      // First update (unset existing defaults)
      (db.update as jest.Mock)
        .mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        })
        // Second update (set new default)
        .mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([defaultMembership])
            })
          })
        });

      // Act
      const result = await repository.setDefaultTenant(1, 123);

      // Assert
      expect(result.isDefault).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('should throw DB_004 when membership not found', async () => {
      // Arrange
      (db.update as jest.Mock)
        .mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        })
        .mockReturnValueOnce({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([])
            })
          })
        });

      // Act & Assert
      await expect(repository.setDefaultTenant(1, 999)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('countActiveMembers', () => {
    it('should return count of active members', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 5 }])
        })
      });

      // Act
      const result = await repository.countActiveMembers(1);

      // Assert
      expect(result).toBe(5);
    });

    it('should return 0 when no active members', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      // Act
      const result = await repository.countActiveMembers(1);

      // Assert
      expect(result).toBe(0);
    });
  });
});

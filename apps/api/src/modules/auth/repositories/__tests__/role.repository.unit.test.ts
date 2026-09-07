/**
 * Unit Tests for RoleRepository
 *
 * Tests role repository for system and tenant role lookups.
 */

import { Test } from '@nestjs/testing';

import { RoleRepository } from '../role.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('RoleRepository', () => {
  let repository: RoleRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockDb = {
    select: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<RoleRepository>(RoleRepository);
    db = mockDb as never;

    jest.clearAllMocks();
  });

  describe('getSystemRolesForUser', () => {
    it('should return active system roles for user', async () => {
      // Arrange
      const mockRoles = [{ role: 'admin' }, { role: 'super_admin' }];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockRoles)
        })
      } as never);

      // Act
      const result = await repository.getSystemRolesForUser(123);

      // Assert
      expect(result).toEqual(['admin', 'super_admin']);
    });

    it('should return empty array when user has no system roles', async () => {
      // Arrange
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      } as never);

      // Act
      const result = await repository.getSystemRolesForUser(999);

      // Assert
      expect(result).toEqual([]);
    });

    it('should filter out expired roles', async () => {
      // Arrange
      // The mock simulates what the DB would return after filtering
      const mockRoles = [{ role: 'active_role' }];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockRoles)
        })
      } as never);

      // Act
      const result = await repository.getSystemRolesForUser(123);

      // Assert
      expect(result).toEqual(['active_role']);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('getTenantRoleForUser', () => {
    it('should return tenant role for active membership', async () => {
      // Arrange
      const mockMembership = [{ role: 'owner', isActive: true }];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockMembership)
          })
        })
      } as never);

      // Act
      const result = await repository.getTenantRoleForUser(456, 123);

      // Assert
      expect(result).toBe('owner');
    });

    it('should return null for inactive membership', async () => {
      // Arrange
      const mockMembership = [{ role: 'member', isActive: false }];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockMembership)
          })
        })
      } as never);

      // Act
      const result = await repository.getTenantRoleForUser(456, 123);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when user is not a member of tenant', async () => {
      // Arrange
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      } as never);

      // Act
      const result = await repository.getTenantRoleForUser(999, 123);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when membership role is null', async () => {
      // Arrange
      const mockMembership = [{ role: null, isActive: true }];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockMembership)
          })
        })
      } as never);

      // Act
      const result = await repository.getTenantRoleForUser(456, 123);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle undefined membership record gracefully', async () => {
      // Arrange
      const mockMembership = [undefined];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockMembership)
          })
        })
      } as never);

      // Act
      const result = await repository.getTenantRoleForUser(456, 123);

      // Assert
      expect(result).toBeNull();
    });

    it('should resolve organization ID to tenant ID for membership lookup', async () => {
      const firstSelect = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      };

      const secondSelect = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ tenantId: 77 }])
          })
        })
      };

      const thirdSelect = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ role: 'tenant_owner', isActive: true }])
          })
        })
      };

      jest
        .spyOn(db, 'select')
        .mockReturnValueOnce(firstSelect as never)
        .mockReturnValueOnce(secondSelect as never)
        .mockReturnValueOnce(thirdSelect as never);

      const result = await repository.getTenantRoleForUser(10, 123);

      expect(result).toBe('tenant_owner');
    });
  });

  describe('dependency injection', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });

    it('should have MAIN_DB injected', () => {
      // Verify the repository has the db connection
      expect(repository).toHaveProperty('db');
    });
  });
});

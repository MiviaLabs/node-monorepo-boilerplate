/**
 * UserRepository Unit Tests
 *
 * Tests the UserRepository data access layer.
 * Uses a mock database connection to isolate repository logic.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { UserRepository } from '../../repositories/user.repository';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('UserRepository', () => {
  let repository: UserRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockUser: User = {
    id: 1,
    organizationId: 123,
    emailHash: 'abc123',
    emailEncrypted: 'encrypted-email',
    firstNameEncrypted: 'encrypted-first',
    lastNameEncrypted: 'encrypted-last',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null
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
        UserRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = module.get<NodePgDatabase>(MAIN_DB) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('count', () => {
    it('should return count of users for tenant', async () => {
      // Arrange
      const mockCountResult = { count: 5 };
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockCountResult])
        })
      });

      // Act
      const result = await repository.count(123);

      // Assert
      expect(result).toBe(5);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('findWithPagination', () => {
    it('should return users with pagination', async () => {
      // Arrange
      const mockUsers = [mockUser, { ...mockUser, id: 2 }];
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockUsers)
              })
            })
          })
        })
      });

      // Act
      const result = await repository.findWithPagination(123, 1, 10);

      // Assert
      expect(result).toEqual(mockUsers);
      expect(result).toHaveLength(2);
    });

    it('should calculate correct offset for page > 1', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue([])
              })
            })
          })
        })
      });

      // Act
      await repository.findWithPagination(123, 3, 10);

      // Assert
      // Page 3, pageSize 10 = offset 20
      const limitCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where.mock.results[0]!.value.orderBy.mock.results[0]!.value.limit;
      expect(limitCall).toHaveBeenCalledWith(10);
      expect(limitCall.mock.results[0]!.value.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('createWithOrg', () => {
    it('should create user with organization ID from data', async () => {
      // Arrange
      const [user] = [mockUser];
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      // Act
      const result = await repository.createWithOrg({ organizationId: 123 });

      // Assert
      expect(result).toEqual(mockUser);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('create (backward compatibility)', () => {
    it('should create user directly with organizationId and emailHash from data', async () => {
      // Arrange
      const [user] = [mockUser];
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      // Act
      const result = await repository.create({
        organizationId: 123,
        emailHash: 'test-email-hash'
      });

      // Assert
      expect(result).toEqual(mockUser);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should verify user exists before updating', async () => {
      // Arrange
      const [updatedUser] = [{ ...mockUser, updatedAt: new Date('2024-01-02T00:00:00.000Z') }];
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedUser])
          })
        })
      });

      // Mock findByIdOrThrow by making it return the user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockUser);

      // Act
      const result = await repository.update(123, 1, {
        updatedAt: new Date('2024-01-02T00:00:00.000Z')
      });

      // Assert
      expect(result).toEqual(updatedUser);
      expect(repository['findByIdOrThrow']).toHaveBeenCalledWith(123, 1);
    });

    it('should throw DB_004 when user not found during verification', async () => {
      // Arrange
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(repository.update(123, 999, {})).rejects.toThrow(notFoundError);
    });
  });

  describe('delete', () => {
    it('should verify user exists before deleting', async () => {
      // Arrange
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });

      // Mock findByIdOrThrow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockUser);

      // Act
      await repository.delete(123, 1);

      // Assert
      expect(repository['findByIdOrThrow']).toHaveBeenCalledWith(123, 1);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should throw DB_004 when user not found during verification', async () => {
      // Arrange
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(repository.delete(123, 999)).rejects.toThrow(notFoundError);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('inherited methods from BaseRepository', () => {
    it('should have findById method', () => {
      // Assert
      expect(typeof repository.findById).toBe('function');
    });

    it('should have findByIdOrThrow method', () => {
      // Assert
      expect(typeof repository.findByIdOrThrow).toBe('function');
    });

    it('should have findMany method', () => {
      // Assert
      expect(typeof repository.findMany).toBe('function');
    });

    it('should have exists method', () => {
      // Assert
      expect(typeof repository.exists).toBe('function');
    });

    it('should have transaction method', () => {
      // Assert
      expect(typeof repository.transaction).toBe('function');
    });
  });
});

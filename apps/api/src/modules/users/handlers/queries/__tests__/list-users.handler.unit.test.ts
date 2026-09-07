/**
 * ListUsersHandler Unit Tests
 *
 * Tests the ListUsersHandler CQRS query handler.
 * Mocks the UserRepository to isolate handler logic.
 */

import { Test } from '@nestjs/testing';

import { ListUsersHandler } from '../../../handlers/queries/list-users.handler';
import { ListUsersQuery } from '../../../queries/list-users.query';
import { UserRepository } from '../../../repositories/user.repository';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';

import { PaginatedResponseDto, type PaginatedResponseMetadata } from '@/common/dtos';

describe('ListUsersHandler', () => {
  let handler: ListUsersHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;

  const mockUsers: User[] = [
    {
      id: 1,
      organizationId: 123,
      emailHash: 'abc123...',
      emailEncrypted: 'encrypted-email-mock-1',
      firstNameEncrypted: 'encrypted-first-name-mock-1',
      lastNameEncrypted: 'encrypted-last-name-mock-1',
      displayName: 'Test User 1',
      phoneNumberEncrypted: null,
      isActive: true,
      isVerified: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastSignInAt: null,
      deletedAt: new Date('2099-12-31T00:00:00.000Z'),
      photoUrl: null,
      avatarFileId: null,
      encryptionKeyVersion: 'primary-encryption-key/1'
    },
    {
      id: 2,
      organizationId: 123,
      emailHash: 'def456...',
      emailEncrypted: 'encrypted-email-mock-2',
      firstNameEncrypted: 'encrypted-first-name-mock-2',
      lastNameEncrypted: 'encrypted-last-name-mock-2',
      displayName: 'Test User 2',
      phoneNumberEncrypted: null,
      isActive: true,
      isVerified: true,
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      lastSignInAt: null,
      deletedAt: new Date('2099-12-31T00:00:00.000Z'),
      photoUrl: null,
      avatarFileId: null,
      encryptionKeyVersion: 'primary-encryption-key/1'
    },
    {
      id: 3,
      organizationId: 123,
      emailHash: 'ghi789...',
      emailEncrypted: 'encrypted-email-mock-3',
      firstNameEncrypted: 'encrypted-first-name-mock-3',
      lastNameEncrypted: 'encrypted-last-name-mock-3',
      displayName: 'Test User 3',
      phoneNumberEncrypted: null,
      isActive: true,
      isVerified: true,
      createdAt: new Date('2024-01-03T00:00:00.000Z'),
      updatedAt: new Date('2024-01-03T00:00:00.000Z'),
      lastSignInAt: null,
      deletedAt: new Date('2099-12-31T00:00:00.000Z'),
      photoUrl: null,
      avatarFileId: null,
      encryptionKeyVersion: 'primary-encryption-key/1'
    }
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListUsersHandler,
        {
          provide: UserRepository,
          useValue: {
            count: jest.fn(),
            findWithPagination: jest.fn()
          }
        }
      ]
    }).compile();

    handler = module.get<ListUsersHandler>(ListUsersHandler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = module.get<UserRepository>(UserRepository) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return paginated response with users', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 1, pageSize: 10 });
      repository.count.mockResolvedValue(3);
      repository.findWithPagination.mockResolvedValue(mockUsers);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(result).toBeInstanceOf(PaginatedResponseDto);
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.id).toBe(1);
      expect(result.data[1]?.id).toBe(2);
      expect(result.data[2]?.id).toBe(3);
      expect(metadata.pagination?.page).toBe(1);
      expect(metadata.pagination?.pageSize).toBe(10);
      expect(metadata.pagination?.total).toBe(3);
      expect(metadata.pagination?.totalPages).toBe(1);
    });

    it('should calculate correct pagination metadata', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 2, pageSize: 10 });
      repository.count.mockResolvedValue(25);
      repository.findWithPagination.mockResolvedValue(mockUsers);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(metadata.pagination?.totalPages).toBe(3);
      expect(metadata.pagination?.hasNext).toBe(true);
      expect(metadata.pagination?.hasPrevious).toBe(true);
    });

    it('should return hasNext=false on last page', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 3, pageSize: 10 });
      repository.count.mockResolvedValue(25);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(metadata.pagination?.hasNext).toBe(false);
      expect(metadata.pagination?.hasPrevious).toBe(true);
    });

    it('should return hasPrevious=false on first page', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 1, pageSize: 10 });
      repository.count.mockResolvedValue(25);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(metadata.pagination?.hasPrevious).toBe(false);
      expect(metadata.pagination?.hasNext).toBe(true);
    });

    it('should call repository with correct parameters', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 456, page: 2, pageSize: 20 });
      repository.count.mockResolvedValue(50);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.count).toHaveBeenCalledWith(456);
      expect(repository.findWithPagination).toHaveBeenCalledWith(456, 2, 20);
    });

    it('should return empty array when no users found', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 1, pageSize: 10 });
      repository.count.mockResolvedValue(0);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(result.data).toEqual([]);
      expect(metadata.pagination?.total).toBe(0);
      expect(metadata.pagination?.totalPages).toBe(0);
      expect(metadata.pagination?.hasNext).toBe(false);
      expect(metadata.pagination?.hasPrevious).toBe(false);
    });

    it('should calculate totalPages correctly for exact page size', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 1, pageSize: 10 });
      repository.count.mockResolvedValue(30);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(metadata.pagination?.totalPages).toBe(3);
    });

    it('should calculate totalPages correctly for partial last page', async () => {
      // Arrange
      const query = new ListUsersQuery({ tenantId: 123, page: 1, pageSize: 10 });
      repository.count.mockResolvedValue(25);
      repository.findWithPagination.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);
      const metadata = result.metadata as PaginatedResponseMetadata;

      // Assert
      expect(metadata.pagination?.totalPages).toBe(3);
    });
  });
});

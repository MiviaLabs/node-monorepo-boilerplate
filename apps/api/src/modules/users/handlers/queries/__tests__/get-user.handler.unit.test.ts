/**
 * GetUserHandler Unit Tests
 *
 * Tests the GetUserHandler CQRS query handler.
 * Mocks the UserRepository to isolate handler logic.
 */

import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { UserResponseDto } from '../../../dto/user-response.dto';
import { GetUserHandler } from '../../../handlers/queries/get-user.handler';
import { GetUserQuery } from '../../../queries/get-user.query';
import { UserRepository } from '../../../repositories/user.repository';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';

describe('GetUserHandler', () => {
  let handler: GetUserHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;

  const mockUser: User = {
    id: 1,
    organizationId: 123,
    emailHash: 'abc123...',
    emailEncrypted: 'encrypted-email-mock',
    firstNameEncrypted: 'encrypted-first-name-mock',
    lastNameEncrypted: 'encrypted-last-name-mock',
    displayName: 'Test User',
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserHandler,
        {
          provide: UserRepository,
          useValue: {
            findByIdOrThrow: jest.fn()
          }
        }
      ]
    }).compile();

    handler = module.get<GetUserHandler>(GetUserHandler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = module.get<UserRepository>(UserRepository) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return UserResponseDto when user is found', async () => {
      // Arrange
      const query = new GetUserQuery({ tenantId: 123, userId: 1 });
      repository.findByIdOrThrow.mockResolvedValue(mockUser);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(mockUser.id);
      expect(result.organizationId).toBe(mockUser.organizationId);
      expect(result.createdAt).toEqual(mockUser.createdAt);
      expect(result.updatedAt).toEqual(mockUser.updatedAt);
      expect(repository.findByIdOrThrow).toHaveBeenCalledWith(123, 1);
    });

    it('should propagate DB_004 error when user not found', async () => {
      // Arrange
      const query = new GetUserQuery({ tenantId: 123, userId: 999 });
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      repository.findByIdOrThrow.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(notFoundError);
      expect(repository.findByIdOrThrow).toHaveBeenCalledWith(123, 999);
    });

    it('should call repository with correct tenant and user ID', async () => {
      // Arrange
      const query = new GetUserQuery({ tenantId: 456, userId: 789 });
      repository.findByIdOrThrow.mockResolvedValue(mockUser);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.findByIdOrThrow).toHaveBeenCalledWith(456, 789);
      expect(repository.findByIdOrThrow).toHaveBeenCalledTimes(1);
    });
  });
});

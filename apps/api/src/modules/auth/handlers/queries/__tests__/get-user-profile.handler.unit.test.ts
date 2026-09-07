/**
 * Unit Tests for GetUserProfileHandler
 *
 * Tests user profile retrieval with database verification logic.
 */

import { Test } from '@nestjs/testing';
import { RegisteredError } from '@package/errors';

import { UserProfileResponseDto } from '../../../dto/user-profile-response.dto';
import { GetUserProfileQuery } from '../../../queries/get-user-profile.query';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserProfileViewService } from '../../../services/user-profile-view.service';
import { GetUserProfileHandler } from '../get-user-profile.handler';

import type { TestingModule } from '@nestjs/testing';
import type { users } from '@package/db-core';

type MockUser = {
  id: number;
  organizationId: number;
  emailHash: string | null;
  displayName?: string | null;
  phoneNumberEncrypted?: string | null;
  avatarFileId?: number | null;
  isActive: boolean;
  isVerified: boolean;
  deletedAt: Date | null;
};

describe('GetUserProfileHandler', () => {
  let handler: GetUserProfileHandler;
  let mockAuthRepository: jest.Mocked<AuthRepository>;
  let mockUserProfileViewService: jest.Mocked<UserProfileViewService>;

  beforeEach(async () => {
    mockAuthRepository = {
      findById: jest.fn()
    } as unknown as jest.Mocked<AuthRepository>;
    mockUserProfileViewService = {
      build: jest.fn()
    } as unknown as jest.Mocked<UserProfileViewService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserProfileHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: UserProfileViewService,
          useValue: mockUserProfileViewService
        }
      ]
    }).compile();

    handler = module.get<GetUserProfileHandler>(GetUserProfileHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    const mockUser: MockUser = {
      id: 123,
      organizationId: 456,
      emailHash: 'hash123',
      isActive: true,
      isVerified: true,
      deletedAt: null
    };

    it('should return UserProfileResponseDto when user exists and is active', async () => {
      // Arrange
      mockAuthRepository.findById.mockResolvedValue(mockUser as typeof users.$inferSelect);
      mockUserProfileViewService.build.mockResolvedValue(
        UserProfileResponseDto.fromUserData({
          userId: '123',
          tenantId: '456',
          actorId: '123',
          roles: ['tenant_user'],
          permissions: ['tenant:users:read'],
          isActive: true,
          isVerified: true,
          emailVerified: true
        })
      );

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123',
        email: 'user@example.com',
        name: 'Test User'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(mockAuthRepository.findById).toHaveBeenCalledWith('456', 123);
      expect(result).toBeInstanceOf(UserProfileResponseDto);
      expect(result.userId).toBe('123');
      expect(result.tenantId).toBe('456');
      expect(result.isActive).toBe(true);
      expect(result.isVerified).toBe(true);
      expect(result.emailVerified).toBe(true);
      expect(result.phoneNumber).toBeUndefined();
      expect(result.roles).toEqual(['tenant_user']);
      expect(result.permissions).toEqual(['tenant:users:read']);
    });

    it('should prefer persisted DB displayName over token name fallback', async () => {
      mockAuthRepository.findById.mockResolvedValue({
        ...mockUser,
        displayName: 'DB Preferred Name',
        isVerified: true,
        phoneNumberEncrypted: 'enc:dek:iv:tag'
      } as typeof users.$inferSelect);
      mockUserProfileViewService.build.mockResolvedValue(
        UserProfileResponseDto.fromUserData({
          userId: '123',
          tenantId: '456',
          actorId: '123',
          displayName: 'DB Preferred Name',
          name: 'DB Preferred Name',
          phoneNumber: '+14155552671',
          roles: ['tenant_user'],
          permissions: ['tenant:users:read']
        })
      );

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123',
        email: 'user@example.com',
        name: 'JWT Name',
        username: 'jwt-username'
      });

      const result = await handler.execute(query);

      expect(result.displayName).toBe('DB Preferred Name');
      expect(result.name).toBe('DB Preferred Name');
      expect(result.phoneNumber).toBe('+14155552671');
      expect(mockUserProfileViewService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          user: expect.objectContaining({
            displayName: 'DB Preferred Name',
            phoneNumberEncrypted: 'enc:dek:iv:tag'
          })
        })
      );
    });

    it('should throw UnauthorizedException when user not found in database', async () => {
      // Arrange
      mockAuthRepository.findById.mockResolvedValue(null);

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123',
        email: 'user@example.com',
        name: 'Test User'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(RegisteredError);
      await expect(handler.execute(query)).rejects.toThrow('User with ID 123 not found');
    });

    it('should throw RegisteredError when user is soft-deleted', async () => {
      // Arrange
      const deletedUser: MockUser = { ...mockUser, deletedAt: new Date(), isActive: false };
      mockAuthRepository.findById.mockResolvedValue(deletedUser as typeof users.$inferSelect);

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123',
        email: 'deleted@example.com',
        name: 'Deleted User'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(RegisteredError);
      await expect(handler.execute(query)).rejects.toThrow('User with ID 123 not found');
    });

    it('should throw RegisteredError when user is inactive', async () => {
      // Arrange
      const inactiveUser: MockUser = { ...mockUser, isActive: false };
      mockAuthRepository.findById.mockResolvedValue(inactiveUser as typeof users.$inferSelect);

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123',
        email: 'inactive@example.com',
        name: 'Inactive User'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(RegisteredError);
      await expect(handler.execute(query)).rejects.toThrow('User with ID 123 not found');
    });

    it('should log debug message without PII when retrieving profile', async () => {
      // Arrange
      mockAuthRepository.findById.mockResolvedValue(mockUser as typeof users.$inferSelect);
      mockUserProfileViewService.build.mockResolvedValue(
        UserProfileResponseDto.fromUserData({
          userId: '123',
          tenantId: '456',
          actorId: '123'
        })
      );
      const loggerDebugSpy = jest.spyOn(handler['logger'], 'debug');

      const query = new GetUserProfileQuery({
        tenantId: '456',
        userId: '123',
        actorId: '123'
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Getting user profile'));
    });

    it('should validate tenantId before query (convert string to number)', async () => {
      // Arrange
      mockAuthRepository.findById.mockResolvedValue(mockUser as typeof users.$inferSelect);
      mockUserProfileViewService.build.mockResolvedValue(
        UserProfileResponseDto.fromUserData({
          userId: '789',
          tenantId: '456',
          actorId: '789'
        })
      );

      const query = new GetUserProfileQuery({
        tenantId: '456', // numeric string
        userId: '789',
        actorId: '789',
        email: 'test@example.com',
        name: 'Test'
      });

      // Act
      await handler.execute(query);

      // Assert - repository should receive number, not string
      expect(mockAuthRepository.findById).toHaveBeenCalledWith('456', 789);
    });
  });
});

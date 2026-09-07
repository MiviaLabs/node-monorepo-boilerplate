/**
 * Unit Tests for ListUserIdentitiesHandler
 *
 * Tests retrieval of user identities with tenant isolation validation.
 */

import { Test } from '@nestjs/testing';
import { IdentityProvider } from '@package/db-core';

import { ListUserIdentitiesQuery } from '../../../queries/list-user-identities.query';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserIdentityRepository } from '../../../repositories/user-identity.repository';
import { ListUserIdentitiesHandler } from '../list-user-identities.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('ListUserIdentitiesHandler', () => {
  let handler: ListUserIdentitiesHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let userIdentityRepository: jest.Mocked<UserIdentityRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  const mockUser = {
    id: 123,
    organizationId: 1,
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

  const mockIdentities = [
    {
      id: 1,
      userId: 123,
      provider: IdentityProvider.GOOGLE,
      providerUid: 'google-uid-123',
      providerEmailHash: 'hash123',
      providerEmailEncrypted: 'encrypted-email',
      phoneNumberEncrypted: null,
      displayName: 'Google User',
      photoUrl: 'https://example.com/photo.jpg',
      emailVerified: true,
      phoneVerified: false,
      isPrimary: true,
      encryptionKeyVersion: 'primary-encryption-key/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastSignInAt: new Date('2024-01-01T00:00:00.000Z')
    },
    {
      id: 2,
      userId: 123,
      provider: IdentityProvider.APPLE,
      providerUid: 'apple-uid-456',
      providerEmailHash: 'hash456',
      providerEmailEncrypted: 'encrypted-email2',
      phoneNumberEncrypted: null,
      displayName: 'Apple User',
      photoUrl: null,
      emailVerified: true,
      phoneVerified: false,
      isPrimary: false,
      encryptionKeyVersion: 'primary-encryption-key/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastSignInAt: null
    }
  ];

  beforeEach(async () => {
    const mockAuthRepository = {
      findById: jest.fn()
    };

    const mockUserIdentityRepository = {
      findByUserId: jest.fn()
    };
    const mockAuditOutbox = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListUserIdentitiesHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: UserIdentityRepository,
          useValue: mockUserIdentityRepository
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get<ListUserIdentitiesHandler>(ListUserIdentitiesHandler);
    authRepository = module.get(AuthRepository);
    userIdentityRepository = module.get(UserIdentityRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('user validation', () => {
    it('should throw USER_001 if user not found', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(null);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 999
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'USER_001'
      });

      expect(authRepository.findById).toHaveBeenCalledWith('1', 999);
    });

    it('should fetch user with tenantId and userId', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(authRepository.findById).toHaveBeenCalledWith('1', 123);
    });
  });

  describe('tenant isolation', () => {
    it('should throw AUTH_004 if user belongs to different tenant', async () => {
      // Arrange
      const userFromDifferentTenant = {
        ...mockUser,
        organizationId: 999 // Different organization
      };

      authRepository.findById.mockResolvedValue(userFromDifferentTenant);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'AUTH_004'
      });
    });

    it('should allow access when user belongs to same tenant', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser); // organizationId: 1
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockIdentities);
    });

    it('should convert tenantId string to number for comparison', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser); // organizationId: 1
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      await handler.execute(query);

      // Assert - Should not throw, comparison should work
      expect(userIdentityRepository.findByUserId).toHaveBeenCalledWith(123);
    });
  });

  describe('identity retrieval', () => {
    it('should return all identities for user', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockIdentities);
      expect(result).toHaveLength(2);
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'auth.identities.viewed.audit',
          correlationId: undefined,
          causationId: undefined,
          payload: expect.objectContaining({
            details: expect.objectContaining({
              identityCount: 2,
              providers: ['apple.com', 'google.com']
            })
          })
        })
      );
    });

    it('should return empty array if user has no identities', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual([]);
    });

    it('should include Google identity', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      const googleIdentity = result.find((i) => i.provider === 'google.com');
      expect(googleIdentity).toBeDefined();
      expect(googleIdentity?.providerUid).toBe('google-uid-123');
    });

    it('should include Apple identity', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      const appleIdentity = result.find((i) => i.provider === 'apple.com');
      expect(appleIdentity).toBeDefined();
      expect(appleIdentity?.providerUid).toBe('apple-uid-456');
    });
  });

  describe('primary identity', () => {
    it('should include primary flag in response', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      const primaryIdentity = result.find((i) => i.isPrimary === true);
      expect(primaryIdentity).toBeDefined();
      expect(primaryIdentity?.provider).toBe('google.com');
    });

    it('should handle multiple identities with correct primary flag', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      const primaryCount = result.filter((i) => i.isPrimary === true).length;
      const secondaryCount = result.filter((i) => i.isPrimary === false).length;

      expect(primaryCount).toBe(1);
      expect(secondaryCount).toBe(1);
    });
  });

  describe('different tenantIds', () => {
    it('should work with numeric tenantId as string', async () => {
      // Arrange
      const userWithMatchingOrg = { ...mockUser, organizationId: 123 };
      authRepository.findById.mockResolvedValue(userWithMatchingOrg);
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '123',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual([]);
    });

    it('should work with numeric tenantId', async () => {
      // Arrange
      const userWithMatchingOrg = {
        ...mockUser,
        organizationId: 123
      };
      authRepository.findById.mockResolvedValue(userWithMatchingOrg);
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '123',
        userId: 123
      });

      // Act
      const result = await handler.execute(query);

      // Assert - Query executes, tenant comparison happens
      expect(authRepository.findById).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should propagate repository errors', async () => {
      // Arrange
      authRepository.findById.mockRejectedValue(new Error('Database connection failed'));

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Database connection failed');
    });

    it('should propagate identity retrieval errors', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockRejectedValue(new Error('Identity query failed'));

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Identity query failed');
    });
  });

  describe('userId handling', () => {
    it('should handle numeric userId', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 123
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(authRepository.findById).toHaveBeenCalledWith('1', 123);
      expect(userIdentityRepository.findByUserId).toHaveBeenCalledWith(123);
    });

    it('should handle different userId values', async () => {
      // Arrange
      const differentUser = { ...mockUser, id: 999 };
      authRepository.findById.mockResolvedValue(differentUser);
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      const query = new ListUserIdentitiesQuery({
        tenantId: '1',
        userId: 999
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(authRepository.findById).toHaveBeenCalledWith('1', 999);
      expect(userIdentityRepository.findByUserId).toHaveBeenCalledWith(999);
    });
  });
});

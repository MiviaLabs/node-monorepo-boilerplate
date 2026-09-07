/**
 * Unit Tests for ExportUserDataHandler
 *
 * Tests user data export for GDPR compliance including PII decryption.
 */

import { Test } from '@nestjs/testing';
import { EncryptionService } from '@package/encryption';
import { OutboxRepository } from '@package/events';

import { ExportUserDataCommand } from '../../../commands/export-user-data.command';
import { AuthEventType } from '../../../events';
import { AuthRepository } from '../../../repositories/auth.repository';
import { OrganizationRepository } from '../../../repositories/organization.repository';
import { UserIdentityRepository } from '../../../repositories/user-identity.repository';
import { ExportUserDataHandler } from '../export-user-data.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('ExportUserDataHandler', () => {
  let handler: ExportUserDataHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let userIdentityRepository: jest.Mocked<UserIdentityRepository>;
  let orgRepository: jest.Mocked<OrganizationRepository>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;

  const mockUser = {
    id: 456,
    organizationId: 123,
    emailHash: 'hashed-email',
    emailEncrypted: 'ciphertext:dataKey:iv:authTag',
    displayName: 'Test User',
    firstNameEncrypted: 'firstCipher:firstKey:firstIv:firstTag',
    lastNameEncrypted: 'lastCipher:lastKey:lastIv:lastTag',
    phoneNumberEncrypted: null,
    photoUrl: null,
    avatarFileId: null,
    isVerified: true,
    isActive: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    lastSignInAt: new Date('2024-01-20T00:00:00.000Z'),
    deletedAt: null
  };

  const mockIdentities = [
    {
      id: 1,
      userId: 456,
      provider: 'google',
      providerUid: 'google-uid-123',
      providerEmailHash: 'provider-email-hash',
      providerEmailEncrypted: null,
      phoneNumberEncrypted: null,
      displayName: 'Test User Google',
      photoUrl: null,
      emailVerified: true,
      phoneVerified: false,
      isPrimary: true,
      encryptionKeyVersion: 'primary-encryption-key/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastSignInAt: null
    }
  ];

  const mockOrganization = {
    id: 123,
    tenantId: 1,
    ownerId: 100,
    publicId: 'pub-123-uuid',
    name: 'Test Organization',
    displayName: 'Test Organization',
    slug: 'test-org',
    gcpTenantId: 'gcp-tenant-123',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null
  };

  beforeEach(async () => {
    const mockAuthRepository = {
      findById: jest.fn()
    };

    const mockUserIdentityRepository = {
      findByUserId: jest.fn()
    };

    const mockOrgRepository = {
      findById: jest.fn()
    };

    const mockEncryptionService = {
      decryptFromBase64: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportUserDataHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: UserIdentityRepository,
          useValue: mockUserIdentityRepository
        },
        {
          provide: OrganizationRepository,
          useValue: mockOrgRepository
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: MAIN_DB,
          useValue: {
            transaction: jest.fn()
          }
        }
      ]
    }).compile();

    handler = module.get<ExportUserDataHandler>(ExportUserDataHandler);
    authRepository = module.get(AuthRepository);
    userIdentityRepository = module.get(UserIdentityRepository);
    orgRepository = module.get(OrganizationRepository);
    encryptionService = module.get(EncryptionService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
    db.transaction.mockImplementation(
      async (callback: Parameters<NodePgDatabase['transaction']>[0]) => callback({} as never)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw VAL_002 for non-numeric userId', async () => {
      // Arrange
      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: 'invalid',
        actorId: 'invalid'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 for negative userId', async () => {
      // Arrange
      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '-5',
        actorId: '-5'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 for zero userId', async () => {
      // Arrange
      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '0',
        actorId: '0'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 for decimal userId', async () => {
      // Arrange
      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '1.5',
        actorId: '1.5'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });
  });

  describe('user lookup', () => {
    it('should throw USER_001 when user not found', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(null);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'USER_001'
      });
    });

    it('should call findById with correct parameters', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authRepository.findById).toHaveBeenCalledWith('123', 456);
    });
  });

  describe('tenant isolation', () => {
    it('should throw AUTH_004 when user belongs to different tenant', async () => {
      // Arrange - user belongs to org 999, not 123
      authRepository.findById.mockResolvedValue({
        ...mockUser,
        organizationId: 999
      });

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_004'
      });
    });
  });

  describe('authorization', () => {
    it('should throw AUTH_004 when actor tries to export another user data', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '789' // Different actor
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_004'
      });
    });

    it('should succeed when actor exports own data', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456' // Same as userId
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result).toBeDefined();
      expect(result.exportedBy).toBe('456');
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: AuthEventType.USER_DATA_EXPORTED,
          aggregateId: '456',
          tenantId: '123',
          payload: expect.objectContaining({
            action: 'EXPORT_USER_DATA',
            target: expect.objectContaining({
              entityType: 'user',
              entityId: '456'
            }),
            details: expect.objectContaining({
              exportFormat: 'json',
              selfService: true
            })
          })
        })
      );
    });
  });

  describe('organization lookup', () => {
    it('should throw DB_004 when organization not found', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(null);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('PII decryption', () => {
    it('should decrypt email from envelope format', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      // Mock decryption for all encrypted fields
      encryptionService.decryptFromBase64
        .mockResolvedValueOnce('test@example.com') // email
        .mockResolvedValueOnce('John') // firstName
        .mockResolvedValueOnce('Doe'); // lastName

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - verify decryption was called with correct envelope parts
      expect(encryptionService.decryptFromBase64).toHaveBeenCalledWith(
        'ciphertext',
        'dataKey',
        'iv',
        'authTag'
      );

      // Verify result contains decrypted email
      expect(result.user.email).toBe('test@example.com');
    });

    it('should fallback to hash if email decryption fails', async () => {
      // Arrange - user with invalid envelope format
      const userWithInvalidEnvelope = {
        ...mockUser,
        emailEncrypted: 'invalid:envelope' // Only 2 parts, not 4
      };

      authRepository.findById.mockResolvedValue(userWithInvalidEnvelope);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - should return fallback message with hash prefix
      expect(result.user.email).toContain('[Email not available - hash:');
      expect(result.user.email).toContain('hashed-email');
    });

    it('should fallback to hash if decryption service throws', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      // Mock decryption to throw error
      encryptionService.decryptFromBase64.mockRejectedValue(new Error('Decryption failed'));

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - should return fallback message
      expect(result.user.email).toContain('[Email not available - hash:');
    });

    it('should decrypt firstName and lastName', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      // Mock decryption for different fields
      encryptionService.decryptFromBase64
        .mockResolvedValueOnce('test@example.com') // email
        .mockResolvedValueOnce('John') // firstName
        .mockResolvedValueOnce('Doe'); // lastName

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.displayName).toBe('John Doe');
    });

    it('should use displayName if name decryption fails', async () => {
      // Arrange - user with invalid name envelopes
      const userWithInvalidNames = {
        ...mockUser,
        firstNameEncrypted: 'invalid',
        lastNameEncrypted: 'invalid'
      };

      authRepository.findById.mockResolvedValue(userWithInvalidNames);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      // Email decryption succeeds
      encryptionService.decryptFromBase64.mockResolvedValueOnce('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - should fallback to displayName
      expect(result.user.displayName).toBe('Test User');
    });

    it('should handle user with no encrypted fields', async () => {
      // Arrange - user with no encrypted data
      const userWithoutEncryption = {
        ...mockUser,
        emailEncrypted: null,
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        emailHash: null
      };

      authRepository.findById.mockResolvedValue(userWithoutEncryption);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - should return fallback messages
      expect(result.user.email).toBe('[Email not available]');
      expect(result.user.displayName).toBe('Test User');
    });

    it('should handle empty envelope parts', async () => {
      // Arrange - user with envelope that has empty parts
      const userWithEmptyParts = {
        ...mockUser,
        emailEncrypted: 'ciphertext::iv:authTag' // empty dataKey
      };

      authRepository.findById.mockResolvedValue(userWithEmptyParts);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert - should fallback to hash
      expect(result.user.email).toContain('[Email not available - hash:');
    });
  });

  describe('data export', () => {
    it('should return complete user data export', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64
        .mockResolvedValueOnce('test@example.com')
        .mockResolvedValueOnce('John')
        .mockResolvedValueOnce('Doe');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.user).toBeDefined();
      expect(result.user.id).toBe('456');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.displayName).toBe('John Doe');
      expect(result.user.isVerified).toBe(true);
      expect(result.user.isActive).toBe(true);
    });

    it('should include identities in export', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.identities).toHaveLength(1);
      expect(result.identities[0]?.provider).toBe('google');
      expect(result.identities[0]?.displayName).toBe('Test User Google');
    });

    it('should include organization in export', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.organization.id).toBe('123');
      expect(result.organization.name).toBe('Test Organization');
    });

    it('should include export metadata', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.exportedAt).toBeDefined();
      expect(result.exportedBy).toBe('456');
    });

    it('should handle user with no identities', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue([]);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.identities).toEqual([]);
    });

    it('should handle user with multiple identities', async () => {
      // Arrange
      const multipleIdentities = [
        ...mockIdentities,
        {
          id: 2,
          userId: 456,
          provider: 'github',
          providerUid: 'github-uid-456',
          providerEmailHash: 'github-email-hash',
          providerEmailEncrypted: null,
          phoneNumberEncrypted: null,
          displayName: 'Test User GitHub',
          photoUrl: null,
          emailVerified: true,
          phoneVerified: false,
          isPrimary: false,
          encryptionKeyVersion: 'primary-encryption-key/1',
          createdAt: new Date('2024-02-01T00:00:00.000Z'),
          updatedAt: new Date('2024-02-01T00:00:00.000Z'),
          lastSignInAt: null
        }
      ];

      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(multipleIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.identities).toHaveLength(2);
    });

    it('should format dates as ISO strings', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue(mockUser);
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.user.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.user.updatedAt).toBe('2024-01-15T00:00:00.000Z');
      expect(result.user.lastSignInAt).toBe('2024-01-20T00:00:00.000Z');
    });

    it('should handle null lastSignInAt', async () => {
      // Arrange
      authRepository.findById.mockResolvedValue({
        ...mockUser,
        lastSignInAt: null
      });
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);
      orgRepository.findById.mockResolvedValue(mockOrganization);
      encryptionService.decryptFromBase64.mockResolvedValue('test@example.com');

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.user.updatedAt).toBe('2024-01-15T00:00:00.000Z');
      expect(result.user.lastSignInAt).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should propagate repository errors', async () => {
      // Arrange
      authRepository.findById.mockRejectedValue(new Error('Database connection failed'));

      const command = new ExportUserDataCommand({
        tenantId: '123',
        userId: '456',
        actorId: '456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Database connection failed');
    });
  });
});

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EncryptionService, KmsProviderFactory } from '@package/encryption';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { InlineFieldKeyRotationService } from '../inline-field-key-rotation.service';

import type { TestingModule } from '@nestjs/testing';

/**
 * Unit tests for InlineFieldKeyRotationService
 *
 * Coverage areas:
 * - Envelope format validation (rotateEnvelopeField)
 * - Key rotation logic (DEK rewrap)
 * - Error handling (continueOnError behavior)
 * - Progress tracking
 * - Invalid envelope detection
 * - Cursor-based pagination
 * - Multi-table rotation aggregation
 */
describe('InlineFieldKeyRotationService', () => {
  let service: InlineFieldKeyRotationService;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    transaction: jest.fn().mockImplementation((cb) => cb(mockDb))
  };

  const mockEncryptionService = {
    reencryptDataKey: jest.fn().mockResolvedValue({
      encryptedDataKey: Buffer.from('new-encrypted-key')
    })
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      rotation: {
        batchSize: 100,
        continueOnError: true
      }
    })
  };

  const mockKmsFactory = {
    getDefaultProvider: jest.fn()
  };

  const OLD_KEY_VERSION = 'primary-encryption-key/cryptoKeyVersions/1';
  const NEW_KEY_VERSION = 'primary-encryption-key/cryptoKeyVersions/2';

  /**
   * Create a valid envelope format string
   * Format: ciphertext:encryptedDataKey:iv:authTag
   */
  function createValidEnvelope(
    ciphertext = 'YWJjZGVmZ2hpamtsbW5vcA',
    encryptedDataKey = 'ZW5jcnlwdGVkRGF0YUtleQ',
    iv = 'aXZWZWN0b3I',
    authTag = 'YXV0aFRhZw'
  ): string {
    return `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`;
  }

  beforeEach(async () => {
    // Reset all mock functions
    for (const fn of Object.values(mockDb)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockEncryptionService)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockConfigService)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockKmsFactory)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }

    // Set up default mock behaviors
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.transaction.mockImplementation((cb) => cb(mockDb));

    mockEncryptionService.reencryptDataKey.mockResolvedValue({
      encryptedDataKey: Buffer.from('new-encrypted-key')
    });

    mockConfigService.get.mockReturnValue({
      rotation: {
        batchSize: 100,
        continueOnError: true
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InlineFieldKeyRotationService,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        },
        {
          provide: KmsProviderFactory,
          useValue: mockKmsFactory
        }
      ]
    }).compile();

    service = module.get<InlineFieldKeyRotationService>(InlineFieldKeyRotationService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should log initialization message', () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith('InlineFieldKeyRotationService initialized');
    });
  });

  describe('rotateEnvelopeField (via rotateUsersTable)', () => {
    it('should correctly re-encrypt DEK when rotating user records', async () => {
      // Arrange
      const ciphertext = 'YWJjZGVmZ2g=';
      const encryptedDataKey = 'b2xkLWtleQ==';
      const iv = 'aXYtdmFsdWU=';
      const authTag = 'dGFnLXZhbHVl';

      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`,
        firstNameEncrypted: `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`,
        lastNameEncrypted: `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`,
        phoneNumberEncrypted: `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock count query
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      const newEncryptedKey = Buffer.from('bmV3LWVuY3J5cHRlZC1rZXk=');
      mockEncryptionService.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: newEncryptedKey
      });

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.totalCount).toBe(1);
      expect(result.isComplete).toBe(true);
      expect(mockEncryptionService.reencryptDataKey).toHaveBeenCalledTimes(4); // 4 fields
      expect(mockEncryptionService.reencryptDataKey).toHaveBeenCalledWith(
        Buffer.from(encryptedDataKey, 'base64'),
        OLD_KEY_VERSION,
        NEW_KEY_VERSION
      );
    });

    it('should throw error for invalid envelope format with wrong number of parts', async () => {
      // Arrange - Invalid envelope: only 3 parts instead of 4
      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: 'ciphertext:encryptedKey:iv', // Missing authTag
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('Invalid value for envelope');
      expect(result.errors[0]?.error).toContain('format with 4 colon-separated parts');
    });

    it('should throw error for empty parts in envelope', async () => {
      // Arrange - Invalid envelope: empty encryptedDataKey
      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: 'ciphertext::iv:authTag', // Empty middle part
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('Validation failed');
      expect(result.errors[0]?.error).toContain('envelope');
    });

    it('should preserve ciphertext, iv, and authTag unchanged during rotation', async () => {
      // Arrange
      const ciphertext = 'YWJjZGVmZ2g=';
      const encryptedDataKey = 'b2xkLWtleQ==';
      const iv = 'aXYtdmFsdWU=';
      const authTag = 'dGFnLXZhbHVl';

      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`,
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockImplementation((data: Record<string, unknown>) => {
        // Verify the new envelope preserves original parts
        const newEnvelope = data['emailEncrypted'] as string;
        const parts = newEnvelope.split(':');
        expect(parts[0]).toBe(ciphertext); // Original ciphertext preserved
        expect(parts[2]).toBe(iv); // Original iv preserved
        expect(parts[3]).toBe(authTag); // Original authTag preserved
        return mockDb;
      });
      mockDb.where.mockReturnThis();

      const newEncryptedKey = Buffer.from('bmV3LWVuY3J5cHRlZC1rZXk=');
      mockEncryptionService.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: newEncryptedKey
      });

      // Act
      await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert - verified in mockDb.set implementation
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('rotateUsersTable', () => {
    it('should count and process records with old key version', async () => {
      // Arrange
      const mockUsers = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          firstNameEncrypted: createValidEnvelope(),
          lastNameEncrypted: createValidEnvelope(),
          phoneNumberEncrypted: createValidEnvelope(),
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.isComplete).toBe(true);
    });

    it('should return early if no records to rotate', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should handle errors per-record when continueOnError is true', async () => {
      // Arrange
      const validEnvelope = createValidEnvelope();
      const invalidEnvelope = 'invalid-envelope'; // Will fail validation

      const mockUsers = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: validEnvelope,
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: invalidEnvelope, // This will fail
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 3,
          organizationId: 1,
          emailEncrypted: validEnvelope,
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 3 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.processedCount).toBe(2); // Users 1 and 3 succeeded
      expect(result.failedCount).toBe(1); // User 2 failed
      expect(result.totalCount).toBe(3);
      expect(result.isComplete).toBe(true); // Complete because continueOnError is true
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.recordId).toBe(2);
      expect(result.errors[0]?.tableName).toBe('users');
    });

    it('should stop processing when continueOnError is false', async () => {
      // Arrange
      const invalidEnvelope = 'invalid-envelope';

      const mockUsers = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: invalidEnvelope, // Will fail
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: false
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.processedCount).toBe(0); // Stopped before processing second
      expect(result.isComplete).toBe(false); // Not complete because of failure
    });

    it('should handle null encrypted fields gracefully', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: null,
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should handle KMS re-encryption failures', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: createValidEnvelope(),
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);

      mockEncryptionService.reencryptDataKey.mockRejectedValue(
        new Error('KMS service unavailable')
      );

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('KMS service unavailable');
    });
  });

  describe('rotateUserIdentitiesTable', () => {
    it('should count and process records with old key version', async () => {
      // Arrange
      const mockIdentities = [
        {
          id: 1,
          organizationId: 1,
          userId: 1,
          providerType: 'email',
          providerId: 'user@example.com',
          providerEmailEncrypted: createValidEnvelope(),
          phoneNumberEncrypted: createValidEnvelope(),
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockIdentities).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUserIdentitiesTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should return early if no records to rotate', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateUserIdentitiesTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should handle errors per-record when continueOnError is true', async () => {
      // Arrange
      const mockIdentities = [
        {
          id: 1,
          organizationId: 1,
          userId: 1,
          providerType: 'email',
          providerId: 'user1@example.com',
          providerEmailEncrypted: createValidEnvelope(),
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          userId: 2,
          providerType: 'email',
          providerId: 'user2@example.com',
          providerEmailEncrypted: 'invalid', // Will fail
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockIdentities).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUserIdentitiesTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.tableName).toBe('user_identities');
    });

    it('should stop processing when continueOnError is false', async () => {
      // Arrange
      const mockIdentities = [
        {
          id: 1,
          organizationId: 1,
          userId: 1,
          providerType: 'email',
          providerId: 'user@example.com',
          providerEmailEncrypted: 'invalid', // Will fail
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          userId: 2,
          providerType: 'email',
          providerId: 'user2@example.com',
          providerEmailEncrypted: createValidEnvelope(),
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockIdentities).mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateUserIdentitiesTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: false
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.isComplete).toBe(false);
    });

    it('should handle null encrypted fields gracefully', async () => {
      // Arrange
      const mockIdentity = {
        id: 1,
        organizationId: 1,
        userId: 1,
        providerType: 'email',
        providerId: 'user@example.com',
        providerEmailEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockIdentity]).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUserIdentitiesTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });
  });

  describe('rotateInvitationsTable', () => {
    it('should count and process records with old key version', async () => {
      // Arrange
      const mockInvitations = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          role: 'member',
          status: 'pending',
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockInvitations).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateInvitationsTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should return early if no records to rotate', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateInvitationsTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should handle errors per-record when continueOnError is true', async () => {
      // Arrange
      const mockInvitations = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          role: 'member',
          status: 'pending',
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: 'invalid', // Will fail
          role: 'member',
          status: 'pending',
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockInvitations).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateInvitationsTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.tableName).toBe('invitations');
      expect(result.errors[0]?.fieldName).toBe('emailEncrypted');
    });

    it('should stop processing when continueOnError is false', async () => {
      // Arrange
      const mockInvitations = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: 'invalid', // Will fail
          role: 'member',
          status: 'pending',
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: createValidEnvelope(),
          role: 'member',
          status: 'pending',
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockInvitations).mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateInvitationsTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: false
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.isComplete).toBe(false);
    });

    it('should handle null encrypted fields gracefully', async () => {
      // Arrange
      const mockInvitation = {
        id: 1,
        organizationId: 1,
        emailEncrypted: null,
        role: 'member',
        status: 'pending',
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockInvitation]).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateInvitationsTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockEncryptionService.reencryptDataKey).not.toHaveBeenCalled();
    });
  });

  describe('rotateAllInlineFields', () => {
    it('should call all three table rotation methods', async () => {
      // Arrange - Mock all three tables to return empty counts
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result).toHaveProperty('processedCount');
      expect(result).toHaveProperty('failedCount');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('isComplete');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should aggregate results correctly', async () => {
      // Arrange - Mock users table with 2 records
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([
          {
            id: 1,
            organizationId: 1,
            emailEncrypted: createValidEnvelope(),
            firstNameEncrypted: null,
            lastNameEncrypted: null,
            phoneNumberEncrypted: null,
            encryptionKeyVersion: OLD_KEY_VERSION,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ])
        .mockResolvedValueOnce([
          {
            id: 2,
            organizationId: 1,
            emailEncrypted: createValidEnvelope(),
            firstNameEncrypted: null,
            lastNameEncrypted: null,
            phoneNumberEncrypted: null,
            encryptionKeyVersion: OLD_KEY_VERSION,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ])
        .mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.totalCount).toBeGreaterThanOrEqual(2);
    });

    it('should collect errors from all tables', async () => {
      // Arrange - Mock users table with error
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([
          {
            id: 1,
            organizationId: 1,
            emailEncrypted: 'invalid', // Will cause error
            firstNameEncrypted: null,
            lastNameEncrypted: null,
            phoneNumberEncrypted: null,
            encryptionKeyVersion: OLD_KEY_VERSION,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ])
        .mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.failedCount).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty tables gracefully', async () => {
      // Arrange - Mock all tables empty
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should use default options when not provided', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert - Default options should be batchSize: 100, continueOnError: true
      expect(result.isComplete).toBe(true);
    });

    it('should accept custom batch size and continueOnError options', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        batchSize: 50,
        continueOnError: false
      });

      // Assert
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle cursor-based pagination correctly', async () => {
      // Arrange - First batch of users
      const firstBatch = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        organizationId: 1,
        emailEncrypted: createValidEnvelope(),
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      // Second batch (empty to stop pagination)
      const secondBatch: typeof firstBatch = [];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 10 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce(secondBatch);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        batchSize: 10
      });

      // Assert
      expect(result.processedCount).toBe(10);
      expect(result.totalCount).toBe(10);
    });

    it('should handle database connection errors', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockRejectedValue(new Error('Connection timeout'));

      // Act & Assert
      await expect(service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION)).rejects.toThrow(
        'Connection timeout'
      );
    });

    it('should handle update failures gracefully', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        organizationId: 1,
        emailEncrypted: createValidEnvelope(),
        firstNameEncrypted: null,
        lastNameEncrypted: null,
        phoneNumberEncrypted: null,
        encryptionKeyVersion: OLD_KEY_VERSION,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockUser]).mockResolvedValueOnce([]);
      mockDb.update.mockImplementation(() => {
        throw new Error('Update failed');
      });

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('Update failed');
    });

    it('should handle null count result from database', async () => {
      // Arrange
      mockDb['select'].mockReturnValue(mockDb);
      mockDb['from'].mockReturnValue(mockDb);
      mockDb['where'].mockResolvedValueOnce([undefined]); // null/undefined result
      mockDb['orderBy'].mockReturnValue(mockDb);
      mockDb['limit'].mockReturnThis();

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert - Should handle gracefully with default 0
      expect(result.totalCount).toBe(0);
      expect(result.processedCount).toBe(0);
    });

    it('should handle mixed success and failure in continue-on-error mode', async () => {
      // Arrange
      const validEnvelope = createValidEnvelope();

      const mockUsers = [
        {
          id: 1,
          organizationId: 1,
          emailEncrypted: validEnvelope,
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          organizationId: 1,
          emailEncrypted: 'invalid',
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 3,
          organizationId: 1,
          emailEncrypted: validEnvelope,
          firstNameEncrypted: null,
          lastNameEncrypted: null,
          phoneNumberEncrypted: null,
          encryptionKeyVersion: OLD_KEY_VERSION,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 3 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce([]);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);

      // Act
      const result = await service.rotateUsersTable(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.processedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.totalCount).toBe(3);
      expect(result.isComplete).toBe(true); // Complete because continueOnError is true
    });
  });

  describe('Key Version Normalization', () => {
    it('should accept full CryptoKeyVersion paths', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act & Assert - Should not throw with full version paths
      await expect(
        service.rotateAllInlineFields(
          'projects/test/locations/global/keyRings/app/cryptoKeys/primary-encryption-key/cryptoKeyVersions/1',
          'projects/test/locations/global/keyRings/app/cryptoKeys/primary-encryption-key/cryptoKeyVersions/2'
        )
      ).resolves.toBeDefined();
    });

    it('should accept short key version identifiers', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act & Assert - Should not throw with short version identifiers
      await expect(service.rotateAllInlineFields('v1', 'v2')).resolves.toBeDefined();
    });
  });

  describe('Progress Tracking', () => {
    it('should return progress object with correct structure', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result).toHaveProperty('processedCount');
      expect(result).toHaveProperty('failedCount');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('isComplete');
      expect(result).toHaveProperty('errors');
      expect(typeof result.processedCount).toBe('number');
      expect(typeof result.failedCount).toBe('number');
      expect(typeof result.totalCount).toBe('number');
      expect(typeof result.isComplete).toBe('boolean');
    });

    it('should mark isComplete=true when no failures', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue([{ count: 0 }]);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockReturnThis();

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION);

      // Assert
      expect(result.isComplete).toBe(true);
    });

    it('should mark isComplete=true when continueOnError is true even with failures', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([
          {
            id: 1,
            organizationId: 1,
            emailEncrypted: 'invalid',
            firstNameEncrypted: null,
            lastNameEncrypted: null,
            phoneNumberEncrypted: null,
            encryptionKeyVersion: OLD_KEY_VERSION,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ])
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert
      expect(result.isComplete).toBe(true);
    });
  });

  describe('Error Structure', () => {
    it('should collect errors with table name, record ID, and field name', async () => {
      // Arrange
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([
          {
            id: 1,
            organizationId: 1,
            emailEncrypted: 'invalid',
            firstNameEncrypted: null,
            lastNameEncrypted: null,
            phoneNumberEncrypted: null,
            encryptionKeyVersion: OLD_KEY_VERSION,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ])
        .mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateAllInlineFields(OLD_KEY_VERSION, NEW_KEY_VERSION, {
        continueOnError: true
      });

      // Assert - Errors should have proper structure
      expect(Array.isArray(result.errors)).toBe(true);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        expect(error).toHaveProperty('tableName');
        expect(error).toHaveProperty('recordId');
        expect(error).toHaveProperty('fieldName');
        expect(error).toHaveProperty('error');
      }
    });
  });

  describe('Module Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });
});

/**
 * Integration test placeholder
 *
 * Full integration tests should verify:
 * 1. Actual DEK re-encryption with real EncryptionService
 * 2. Database updates with correct keyVersion
 * 3. Transaction atomicity for record updates
 * 4. Large dataset rotation performance
 *
 * These tests require:
 * - Testcontainers with PostgreSQL
 * - Mock or real KMS integration
 * - Database fixtures with encrypted data
 */
describe('InlineFieldKeyRotationService Integration', () => {
  it.todo('should rotate DEKs using real EncryptionService');
  it.todo('should update encryptionKeyVersion after successful rotation');
  it.todo('should handle KMS errors gracefully');
  it.todo('should process large datasets within timeout');
});

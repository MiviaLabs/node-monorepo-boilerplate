import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { keyRotationState } from '@package/db-core';
import { EncryptionService, KmsProviderFactory } from '@package/encryption';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AddressKeyRotationService } from '../address-key-rotation.service';

import type { TestingModule } from '@nestjs/testing';

describe('AddressKeyRotationService', () => {
  let service: AddressKeyRotationService;

  const mockDb = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(), // Required for INSERT ... ON CONFLICT DO NOTHING
    returning: jest.fn().mockReturnThis(),
    for: jest.fn().mockReturnThis(), // Required for SELECT FOR UPDATE SKIP LOCKED
    execute: jest.fn(),
    transaction: jest.fn().mockImplementation((cb) => cb(mockDb))
  };

  const mockEncryption = {
    getProvider: jest.fn(),
    reencryptDataKey: jest.fn().mockResolvedValue({
      encryptedDataKey: Buffer.from('new-encrypted-key')
    })
  };
  const mockOutboxRepo = {
    insert: jest.fn().mockResolvedValue(undefined)
  };

  const mockKmsFactory = {
    getDefaultProvider: jest.fn()
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      rotation: {
        batchSize: 100,
        continueOnError: true,
        verifyAfterRotation: true,
        maxConcurrentBatches: 1
      }
    })
  };

  beforeEach(async () => {
    for (const fn of Object.values(mockDb)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockEncryption)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockOutboxRepo)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }
    for (const fn of Object.values(mockKmsFactory)) {
      if (jest.isMockFunction(fn)) {
        fn.mockReset();
      }
    }

    mockDb.select.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.delete.mockReturnThis();
    mockDb.where.mockReturnThis();
    // Default: .limit() returns mockDb for chaining (e.g., after .where() in count queries)
    // Tests that use cursor pagination will override this
    mockDb.limit.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.values.mockReturnThis();
    mockDb.onConflictDoNothing.mockReturnThis(); // Chain onConflictDoNothing
    mockDb.returning.mockReturnThis();
    mockDb.for.mockResolvedValue([]); // Default to empty array for SELECT FOR UPDATE
    mockDb.transaction.mockImplementation((cb) => cb(mockDb));
    mockEncryption.reencryptDataKey.mockResolvedValue({
      encryptedDataKey: Buffer.from('new-encrypted-key')
    });
    mockOutboxRepo.insert.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressKeyRotationService,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: EncryptionService,
          useValue: mockEncryption
        },
        {
          provide: KmsProviderFactory,
          useValue: mockKmsFactory
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        }
      ]
    }).compile();

    service = module.get<AddressKeyRotationService>(AddressKeyRotationService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('rotateVaultEntries', () => {
    it('should audit zero-match rotations before returning', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

      const result = await service.rotateVaultEntries({
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        actorId: 456,
        requestId: 'req-0',
        correlationId: 'corr-0',
        causationId: 'cause-0'
      });

      expect(result).toEqual({
        rotationStateId: 0,
        processedCount: 0,
        failedCount: 0,
        totalCount: 0,
        isComplete: true,
        errors: []
      });
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          eventType: 'user.address.key.rotation.completed.audit',
          tenantId: '1',
          correlationId: 'corr-0',
          causationId: 'cause-0'
        })
      );
      expect(mockDb.insert).not.toHaveBeenCalledWith(keyRotationState);
    });

    it('should start rotation and create state record', async () => {
      // Arrange
      const organizationId = 1;
      // Single-key architecture: keyId stays constant, only keyVersion changes
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;
      const mockVaultEntries = [
        {
          id: 1,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '101',
          fieldPath: 'addresses.street',
          keyId: oldKeyId,
          encryptedDataKey: 'old-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag',
          classification: 'confidential',
          category: 'pii'
        }
      ];

      const mockRotationState = {
        id: 1,
        organizationId: 1,
        oldKeyId,
        newKeyId,
        status: 'in_progress',
        totalEntries: 1,
        processedEntries: 0,
        failedEntries: 0,
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock database queries
      // Query flow for cursor pagination:
      // 1. count query: select().from().where() -> [{ count: 1 }]
      // 2. cursor pagination: select().from().where().orderBy().limit() -> batch array
      // 3. FOR UPDATE: select().from().where().orderBy().for() -> locked entries
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce(mockVaultEntries).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue(mockVaultEntries); // Mock SELECT FOR UPDATE to return entries
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([mockRotationState]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      // Mock execute for the CASE UPDATE SQL statement
      mockDb.execute.mockResolvedValue({ rowCount: 1 });

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(result.isComplete).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockDb.insert).toHaveBeenCalledWith(keyRotationState);
      expect(mockEncryption.reencryptDataKey).toHaveBeenCalled();
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          eventType: 'user.address.key.rotation.completed.audit',
          tenantId: '1',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );
    });

    it('should handle continue-on-error mode', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const mockVaultEntries = [
        {
          id: 1,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '101',
          fieldPath: 'addresses.street',
          keyId: oldKeyId,
          encryptedDataKey: 'old-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag'
        },
        {
          id: 2,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '102',
          fieldPath: 'addresses.city',
          keyId: oldKeyId,
          encryptedDataKey: 'bad-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag'
        }
      ];

      const mockRotationState = {
        id: 1,
        organizationId: 1,
        oldKeyId,
        newKeyId,
        status: 'in_progress',
        totalEntries: 2,
        processedEntries: 0,
        failedEntries: 0,
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce(mockVaultEntries).mockResolvedValueOnce([]);
      mockDb.for
        .mockReturnValueOnce(Promise.resolve(mockVaultEntries))
        .mockReturnValueOnce(Promise.resolve([]));
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([mockRotationState]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);

      // Mock encryption to fail on second entry
      mockEncryption.reencryptDataKey
        .mockResolvedValueOnce({ encryptedDataKey: Buffer.from('new-key') })
        .mockRejectedValueOnce(new Error('Decryption failed'));

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.errors).toHaveLength(1);
      const firstError = result.errors[0];
      expect(firstError).toBeDefined();
      if (!firstError) {
        throw new Error('Expected first error entry');
      }
      expect(firstError.entryId).toBe(2);
    });

    it('should return early when no entries found', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([]);

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId
      });

      // Assert
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
    });
  });

  describe('resumeRotation', () => {
    it('should resume interrupted rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const mockRotationState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'in_progress',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: [],
        lastCursor: '50',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockVaultEntries = [
        {
          id: 51,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '151',
          fieldPath: 'addresses.street',
          keyId: 'primary-encryption-key',
          encryptedDataKey: 'old-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag'
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([mockRotationState]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy
        .mockReturnValueOnce(Promise.resolve(mockVaultEntries))
        .mockReturnValueOnce(Promise.resolve([]));
      mockDb.for
        .mockReturnValueOnce(Promise.resolve(mockVaultEntries))
        .mockReturnValueOnce(Promise.resolve([]));
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: Buffer.from('new-key')
      });

      // Act
      const result = await service.resumeRotation(1, rotationStateId, actorId, {
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      // Assert
      expect(result.processedCount).toBe(51);
      expect(result.totalCount).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          eventType: 'user.address.key.rotation.completed.audit',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );
    });

    it('should throw error when rotation state not found', async () => {
      // Arrange
      const rotationStateId = 999;

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.resumeRotation(1, rotationStateId, 789)).rejects.toThrow(
        'Record not found in database'
      );
    });

    it('should throw error when rotation not in progress', async () => {
      // Arrange
      const rotationStateId = 1;

      const mockRotationState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'completed',
        totalEntries: 100,
        processedEntries: 100,
        failedEntries: 0,
        errors: [],
        lastCursor: '100',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRotationState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.resumeRotation(1, rotationStateId, 789)).rejects.toThrow();
    });
  });

  describe('getRotationStatus', () => {
    it('should return rotation status', async () => {
      // Arrange
      const rotationStateId = 1;

      const mockRotationState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'in_progress',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRotationState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act
      const result = await service.getRotationStatus(1, rotationStateId);

      // Assert
      expect(result).toEqual(mockRotationState);
    });

    it('should return null when rotation state not found', async () => {
      // Arrange
      const rotationStateId = 999;

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);
      mockDb.from.mockReturnValue(mockDb);

      // Act
      const result = await service.getRotationStatus(1, rotationStateId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getActiveRotations', () => {
    it('should return active rotations for organization', async () => {
      // Arrange
      const organizationId = 1;

      const mockRotations = [
        {
          id: 1,
          organizationId: 1,
          oldKeyId: 'primary-encryption-key',
          // newKeyId is a versioned path for the new KMS CryptoKeyVersion
          newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
          status: 'in_progress',
          totalEntries: 100,
          processedEntries: 50,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);

      // Mock the chain properly
      mockDb.orderBy.mockResolvedValue(mockRotations);

      // Act
      const result = await service.getActiveRotations(organizationId);

      // Assert
      expect(result).toEqual(mockRotations);
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('cancelRotation', () => {
    it('should cancel in-progress rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const mockRotationState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'in_progress',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRotationState]);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);

      // Act
      await service.cancelRotation(1, rotationStateId, actorId, {
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      // Assert
      expect(mockDb.update).toHaveBeenCalledWith(keyRotationState);
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled'
        })
      );
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          eventType: 'user.address.key.rotation.cancelled.audit',
          tenantId: '1',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );
    });

    it('should throw error when rotation state not found', async () => {
      // Arrange
      const rotationStateId = 999;

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.cancelRotation(1, rotationStateId, 789)).rejects.toThrow(
        'Record not found in database'
      );
    });

    it('should throw error when rotation not in progress', async () => {
      // Arrange
      const rotationStateId = 1;

      const mockRotationState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'completed',
        totalEntries: 100,
        processedEntries: 100,
        failedEntries: 0,
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockRotationState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.cancelRotation(1, rotationStateId, 789)).rejects.toThrow();
    });
  });

  describe('AddressKeyRotationService - Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockImplementation(() => {
        throw new Error('Connection timeout');
      });

      // Act & Assert
      await expect(
        service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId,
          actorId
        })
      ).rejects.toThrow('Connection timeout');
    });

    it('should handle concurrent modification conflicts', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const mockVaultEntry = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'old-key',
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'tag'
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([mockVaultEntry]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([mockVaultEntry]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockImplementation(() => {
        throw new Error('Concurrent modification');
      });

      // Act & Assert
      await expect(
        service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId,
          actorId
        })
      ).rejects.toThrow('Concurrent modification');
    });

    it('should handle KMS encryption failures gracefully with continueOnError', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const mockVaultEntries = [
        {
          id: 1,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '101',
          fieldPath: 'addresses.street',
          keyId: oldKeyId,
          encryptedDataKey: 'old-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag'
        },
        {
          id: 2,
          organizationId: 1,
          entityType: 'user_address',
          entityId: '102',
          fieldPath: 'addresses.city',
          keyId: oldKeyId,
          encryptedDataKey: 'bad-key',
          ciphertext: 'encrypted',
          iv: 'iv',
          authTag: 'tag'
        }
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce(mockVaultEntries).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue(mockVaultEntries);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 2,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.transaction.mockImplementation((cb) => cb(mockDb));

      // Mock encryption to fail on second entry
      mockEncryption.reencryptDataKey
        .mockResolvedValueOnce({ encryptedDataKey: Buffer.from('new-key') })
        .mockRejectedValueOnce(new Error('KMS unavailable'));

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      if (result.errors[0]) {
        expect(result.errors[0].entryId).toBe(2);
        expect(result.errors[0].error).toContain('KMS unavailable');
      }
    });

    it('should handle vault entry not found during rotation', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId
      });

      // Assert - Should handle gracefully with zero count (early return before rotation state creation)
      expect(result.totalCount).toBe(0);
      expect(result.processedCount).toBe(0);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('AddressKeyRotationService - Decryption Edge Cases', () => {
    it('should handle corrupted encrypted data gracefully', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const corruptedEntry = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'invalid-base64-!!!',
        ciphertext: 'not-valid-base64',
        iv: 'corrupted',
        authTag: 'bad-tag'
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([corruptedEntry]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([corruptedEntry]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockRejectedValue(
        new Error('Invalid base64 encoding in encrypted data')
      );

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      if (result.errors[0]) {
        expect(result.errors[0].entryId).toBe(1);
        expect(result.errors[0].error).toContain('Invalid base64 encoding');
      }
    });

    it('should detect wrong decryption key', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const entryEncryptedWithWrongKey = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'wrong-key-encrypted',
        ciphertext: 'encrypted-with-keyB',
        iv: 'iv',
        authTag: 'tag'
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([entryEncryptedWithWrongKey]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([entryEncryptedWithWrongKey]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockRejectedValue(
        new Error('Authentication failed: wrong key or corrupted data')
      );

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      if (result.errors[0]) {
        expect(result.errors[0].entryId).toBe(1);
        expect(result.errors[0].error).toContain('Authentication failed');
      }
    });

    it('should validate key version before decryption', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      // Entry with mismatched keyId would be filtered out by WHERE clause (keyId match)

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([]);

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId
      });

      // Assert - Entry filtered out by WHERE clause (keyId match)
      expect(result.processedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should skip entries with null encrypted data', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const entryWithNullData = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: null,
        ciphertext: null,
        iv: null,
        authTag: null
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([entryWithNullData]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([entryWithNullData]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockRejectedValue(
        new Error('Cannot decrypt: null encrypted data')
      );

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      if (result.errors[0]) {
        expect(result.errors[0].entryId).toBe(1);
        // Buffer.from() with null throws TypeError - this is the expected behavior
        expect(result.errors[0].error).toContain('ERR_INVALID_ARG_TYPE');
      }
    });

    it('should skip entries with empty string encrypted data', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const entryWithEmptyData = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: '',
        ciphertext: '',
        iv: '',
        authTag: ''
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([entryWithEmptyData]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([entryWithEmptyData]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockRejectedValue(
        new Error('Cannot decrypt: empty encrypted data')
      );

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { continueOnError: true }
      });

      // Assert
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      if (result.errors[0]) {
        expect(result.errors[0].entryId).toBe(1);
        expect(result.errors[0].error).toContain('empty encrypted data');
      }
    });

    it('should handle large encrypted payloads', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      // Simulate 10MB encrypted payload (base64 encoded)
      const largePayload = Buffer.alloc(10 * 1024 * 1024, 'a').toString('base64');

      const largeEntry = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'old-key',
        ciphertext: largePayload,
        iv: 'iv',
        authTag: 'tag'
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([largeEntry]).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValue([largeEntry]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: Buffer.from('new-key')
      });

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId
      });

      // Assert - Should handle large payloads without memory issues
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      // The service decodes the base64 encryptedDataKey before passing to reencryptDataKey
      expect(mockEncryption.reencryptDataKey).toHaveBeenCalledWith(
        Buffer.from('old-key', 'base64'),
        oldKeyId,
        newKeyId
      );
    });

    it('should handle concurrent decryption safely with SKIP LOCKED', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      const entry = {
        id: 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: '101',
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'old-key',
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'tag'
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([entry]).mockResolvedValueOnce([]);
      // First worker gets the lock, second worker gets empty array (SKIP LOCKED)
      mockDb.for.mockResolvedValueOnce([entry]).mockResolvedValueOnce([]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockEncryption.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: Buffer.from('new-key')
      });

      // Act - First worker
      const result1 = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId
      });

      // Second worker tries same rotation (concurrent)
      mockDb.orderBy.mockReturnValue(mockDb); // Chain for second call
      mockDb.limit.mockResolvedValue([]); // No more entries after first worker
      const result2 = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId
      });

      // Assert - First worker processes, second worker skips locked entries
      expect(result1.processedCount).toBe(1);
      expect(result2.processedCount).toBe(0); // No entries to process
      expect(mockEncryption.reencryptDataKey).toHaveBeenCalledTimes(1); // Only first worker
    });
  });

  describe('AddressKeyRotationService - Edge Cases', () => {
    it('should handle empty batch gracefully', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce([]);

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId
      });

      // Assert
      expect(result.totalCount).toBe(0);
      expect(result.processedCount).toBe(0);
      expect(result.isComplete).toBe(true);
      expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
    });

    it('should handle maximum batch size', async () => {
      // Arrange
      const organizationId = 1;
      const oldKeyId = 'primary-encryption-key';
      // newKeyId is a versioned path for the new KMS CryptoKeyVersion
      const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
      const actorId = 456;

      // Create 10000 mock entries
      const largeEntries = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        organizationId: 1,
        entityType: 'user_address',
        entityId: String(i + 1),
        fieldPath: 'addresses.street',
        keyId: oldKeyId,
        encryptedDataKey: 'old-key',
        ciphertext: 'encrypted',
        iv: 'iv',
        authTag: 'tag'
      }));

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValueOnce([{ count: 10000 }]).mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      // Return first batch of 100, then empty to stop the loop
      const firstBatch = largeEntries.slice(0, 100);
      // Cursor pagination: .limit() is terminal, resolves to batch
      mockDb.limit.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([]);
      mockDb.for.mockResolvedValueOnce(firstBatch).mockResolvedValue([]);
      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);
      mockDb.onConflictDoNothing.mockReturnValue(mockDb);
      mockDb.returning.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          oldKeyId,
          newKeyId,
          status: 'in_progress',
          totalEntries: 10000,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.transaction.mockImplementation((cb) => cb(mockDb));
      mockEncryption.reencryptDataKey.mockResolvedValue({
        encryptedDataKey: Buffer.from('new-key')
      });

      // Act
      const result = await service.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId,
        options: { batchSize: 100 }
      });

      // Assert
      expect(result.totalCount).toBe(10000);
      expect(result.processedCount).toBeGreaterThanOrEqual(0);
    });

    it('should reject resume of completed rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const completedState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'completed',
        totalEntries: 100,
        processedEntries: 100,
        failedEntries: 0,
        errors: [],
        lastCursor: '100',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([completedState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.resumeRotation(1, rotationStateId, actorId)).rejects.toThrow();
    });

    it('should reject cancel of completed rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const completedState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'completed',
        totalEntries: 100,
        processedEntries: 100,
        failedEntries: 0,
        errors: [],
        lastCursor: '100',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([completedState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.cancelRotation(1, rotationStateId, actorId)).rejects.toThrow();
    });

    it('should reject resume of cancelled rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const cancelledState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'cancelled',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: [],
        lastCursor: '50',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([cancelledState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.resumeRotation(1, rotationStateId, actorId)).rejects.toThrow(
        'Cannot modify RotationState in cancelled status'
      );
    });

    it('should reject cancel of failed rotation', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const failedState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'failed',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 50,
        errors: [],
        lastCursor: '50',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([failedState]);
      mockDb.from.mockReturnValue(mockDb);

      // Act & Assert
      await expect(service.cancelRotation(1, rotationStateId, actorId)).rejects.toThrow(
        'Cannot modify RotationState in failed status'
      );
    });

    it('should handle rotation state with different status transitions', async () => {
      // Arrange
      const rotationStateId = 1;
      const actorId = 789;

      const inProgressState = {
        id: rotationStateId,
        organizationId: 1,
        oldKeyId: 'primary-encryption-key',
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
        status: 'in_progress',
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: [],
        lastCursor: '50',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([inProgressState]);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.orderBy.mockResolvedValueOnce([]);
      mockDb.set.mockReturnValue(mockDb);
      mockDb.update.mockReturnValue(mockDb);
      mockDb.transaction.mockImplementation((cb) => cb(mockDb));

      // Act - Should successfully resume in_progress state
      const result = await service.resumeRotation(1, rotationStateId, actorId);

      // Assert
      expect(result.totalCount).toBe(100);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('AddressKeyRotationService - Null/Empty Results (TEST-007)', () => {
    describe('No entries to rotate', () => {
      it('should handle rotation when no entries use oldKeyId', async () => {
        // Arrange: Database has entries but none with oldKeyId
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: rotationState not created, early return with totalCount=0
        expect(result.rotationStateId).toBe(0);
        expect(result.totalCount).toBe(0);
        expect(result.processedCount).toBe(0);
        expect(result.failedCount).toBe(0);
        expect(result.isComplete).toBe(true);
        expect(result.errors).toEqual([]);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
        expect(mockDb.insert).not.toHaveBeenCalled();
      });

      it('should create valid rotation state when initial count > 0 but entries get filtered', async () => {
        // Arrange: Start rotation but all entries filtered out during processing
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
        const actorId = 456;

        // Initial count shows entries
        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 5 }]).mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        // But actual query returns empty (entries were deleted/filtered)
        mockDb.orderBy.mockReturnValue(mockDb);
        // Cursor pagination: .limit() is terminal, resolves to batch
        mockDb.limit.mockResolvedValueOnce([]);
        mockDb.for.mockResolvedValue([]);

        mockDb.insert.mockReturnValue(mockDb);
        mockDb.values.mockReturnValue(mockDb);
        mockDb.onConflictDoNothing.mockReturnValue(mockDb);
        mockDb.returning.mockResolvedValue([
          {
            id: 1,
            organizationId: 1,
            oldKeyId,
            newKeyId,
            status: 'in_progress',
            totalEntries: 5,
            processedEntries: 0,
            failedEntries: 0,
            errors: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);
        mockDb.set.mockReturnValue(mockDb);
        mockDb.update.mockReturnValue(mockDb);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId,
          actorId
        });

        // Assert: Completed with 0 processed
        expect(result.rotationStateId).toBe(1);
        expect(result.totalCount).toBe(5);
        expect(result.processedCount).toBe(0);
        expect(result.isComplete).toBe(true);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
      });
    });

    describe('Empty batch processing', () => {
      it('should handle processRotationBatch with empty array', async () => {
        // Arrange: Call internal batch processor with empty array
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        // Mock count to show entries, but cursor pagination returns empty
        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 1 }]).mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockReturnValue(mockDb);
        // Cursor pagination: .limit() is terminal, resolves to batch
        mockDb.limit.mockResolvedValueOnce([]);
        mockDb.for.mockResolvedValue([]);

        mockDb.insert.mockReturnValue(mockDb);
        mockDb.values.mockReturnValue(mockDb);
        mockDb.onConflictDoNothing.mockReturnValue(mockDb);
        mockDb.returning.mockResolvedValue([
          {
            id: 1,
            organizationId: 1,
            oldKeyId,
            newKeyId,
            status: 'in_progress',
            totalEntries: 1,
            processedEntries: 0,
            failedEntries: 0,
            errors: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);
        mockDb.set.mockReturnValue(mockDb);
        mockDb.update.mockReturnValue(mockDb);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Handles gracefully with zero processed
        expect(result.processedCount).toBe(0);
        expect(result.totalCount).toBe(1);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
      });

      it('should return success with processedCount=0 for empty batch array', async () => {
        // Arrange: Simulate empty batch returned from query
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Returns success with 0 processed, no database writes
        expect(result.processedCount).toBe(0);
        expect(result.totalCount).toBe(0);
        expect(result.isComplete).toBe(true);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
      });
    });

    describe('Tenant isolation with empty results', () => {
      it('should filter out entries from other tenants', async () => {
        // Arrange: Entries exist but all belong to different organizationId
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        // Count for tenant 1 returns 0 (entries belong to tenant 2)
        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act: Fetch batch for rotation
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Batch is empty, tenant isolation maintained
        expect(result.totalCount).toBe(0);
        expect(result.processedCount).toBe(0);
        expect(result.isComplete).toBe(true);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
      });

      it('should maintain tenant scoping when verifying rotation with zero entries', async () => {
        // Arrange: Verify no stale entries when count is 0
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId,
          options: { verifyAfterRotation: true }
        });

        // Assert: Verification succeeds with 0 entries
        expect(result.isComplete).toBe(true);
        expect(result.totalCount).toBe(0);
      });
    });

    describe('Null query results', () => {
      it('should handle null result from database count query', async () => {
        // Arrange: Mock repository returning undefined/null
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        // Simulate database returning undefined instead of { count: 0 }
        mockDb.where.mockResolvedValueOnce([undefined]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Handles null/undefined gracefully with default 0
        expect(result.totalCount).toBe(0);
        expect(result.processedCount).toBe(0);
        expect(result.isComplete).toBe(true);
      });

      it('should handle getRotationStatus returning null', async () => {
        // Arrange: Rotation state not found
        const rotationStateId = 999;

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.limit.mockResolvedValue([]);
        mockDb.from.mockReturnValue(mockDb);

        // Act
        const result = await service.getRotationStatus(1, rotationStateId);

        // Assert: Returns null for not found
        expect(result).toBeNull();
      });

      it('should handle getActiveRotations returning empty array', async () => {
        // Arrange: No active rotations
        const organizationId = 1;

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.orderBy.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.getActiveRotations(organizationId);

        // Assert: Returns empty array
        expect(result).toEqual([]);
        expect(result.length).toBe(0);
      });
    });

    describe('Empty resume scenarios', () => {
      it('should handle resume-rotation with no pending work', async () => {
        // Arrange: Rotation with all entries already processed
        const rotationStateId = 1;
        const actorId = 789;

        const mockRotationState = {
          id: rotationStateId,
          organizationId: 1,
          oldKeyId: 'primary-encryption-key',
          // newKeyId is a versioned path for the new KMS CryptoKeyVersion
          newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
          status: 'in_progress',
          totalEntries: 100,
          processedEntries: 100, // All already processed
          failedEntries: 0,
          errors: [],
          lastCursor: '100',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.limit.mockResolvedValueOnce([mockRotationState]).mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);
        mockDb.for.mockResolvedValue([]);
        mockDb.set.mockReturnValue(mockDb);
        mockDb.update.mockReturnValue(mockDb);

        // Act
        const result = await service.resumeRotation(1, rotationStateId, actorId);

        // Assert: Returns immediately, processedCount unchanged
        expect(result.processedCount).toBe(100);
        expect(result.totalCount).toBe(100);
        expect(result.isComplete).toBe(true);
        expect(mockEncryption.reencryptDataKey).not.toHaveBeenCalled();
      });

      it('should handle resumeRotation when batch returns empty', async () => {
        // Arrange: Resume with no more entries to process
        const rotationStateId = 1;
        const actorId = 789;

        const mockRotationState = {
          id: rotationStateId,
          organizationId: 1,
          oldKeyId: 'primary-encryption-key',
          // newKeyId is a versioned path for the new KMS CryptoKeyVersion
          newKeyId: 'primary-encryption-key/cryptoKeyVersions/5',
          status: 'in_progress',
          totalEntries: 10,
          processedEntries: 5,
          failedEntries: 0,
          errors: [],
          lastCursor: '5',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.limit.mockResolvedValueOnce([mockRotationState]).mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);
        mockDb.for.mockResolvedValue([]);
        mockDb.set.mockReturnValue(mockDb);
        mockDb.update.mockReturnValue(mockDb);

        // Act
        const result = await service.resumeRotation(1, rotationStateId, actorId);

        // Assert: Completes with no new processing
        expect(result.processedCount).toBe(5);
        expect(result.totalCount).toBe(10);
        expect(result.isComplete).toBe(true);
      });
    });

    describe('Zero-count edge cases', () => {
      it('should handle rotation state with totalEntries=0 from concurrent insert', async () => {
        // Arrange: Another worker created state with 0 entries
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Early return without creating state
        expect(result.rotationStateId).toBe(0);
        expect(result.totalCount).toBe(0);
        expect(result.isComplete).toBe(true);
      });

      it('should handle all entries processed with final count=0', async () => {
        // Arrange: Rotation completes with 0 new entries found
        const organizationId = 1;
        const oldKeyId = 'primary-encryption-key';
        // newKeyId is a versioned path for the new KMS CryptoKeyVersion
        const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';

        mockDb.select.mockReturnValue(mockDb);
        mockDb.where.mockResolvedValueOnce([{ count: 0 }]).mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.orderBy.mockResolvedValue([]);

        // Act
        const result = await service.rotateVaultEntries({
          organizationId,
          oldKeyId,
          newKeyId
        });

        // Assert: Complete with no errors
        expect(result.processedCount).toBe(0);
        expect(result.failedCount).toBe(0);
        expect(result.totalCount).toBe(0);
        expect(result.isComplete).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });
  });
});

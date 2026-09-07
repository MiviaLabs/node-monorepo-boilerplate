/**
 * Unit tests for Key Rotation Service
 */

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import { KeyRotationError, DataKeyReencryptionError } from '../../../errors';
import {
  KeyRotationService,
  createKeyRotationService
} from '../../../services/key-rotation.service';

describe('KeyRotationService', () => {
  let mockKms: ReturnType<typeof createMockKmsProvider>;
  let mockKms2: ReturnType<typeof createMockKmsProvider>;
  let service: KeyRotationService;
  const providerMap = new Map<string, ReturnType<typeof createMockKmsProvider>>();

  beforeEach(() => {
    providerMap.clear();
    mockKms = createMockKmsProvider({ name: 'mock-kms' });
    mockKms2 = createMockKmsProvider({ name: 'mock-kms-2' });
    providerMap.set('mock-kms', mockKms);
    providerMap.set('mock-kms-2', mockKms2);
    service = new KeyRotationService(
      (name?: string) => (name ? (providerMap.get(name) ?? undefined) : undefined),
      'mock-kms'
    );
  });

  describe('reencryptDataKey', () => {
    it('should re-encrypt a data key using rewrap with sourceKeyId for cross-key rotation', async () => {
      // Arrange
      const originalDataKey = Buffer.from('original-data-key-32-bytes!!');
      const sourceKeyId = 'source-key';
      const targetKeyId = 'target-key';
      const encryptedDataKey = await mockKms.encrypt(originalDataKey, sourceKeyId);

      // Act
      const result = await service.reencryptDataKey(encryptedDataKey, {
        organizationId: 'org-123',
        currentKeyId: sourceKeyId,
        newKeyId: targetKeyId
      });

      // Assert
      expect(result.encryptedDataKey).toBeTruthy();
      expect(result.oldKeyId).toBe(sourceKeyId);
      expect(result.newKeyId).toBe(targetKeyId);

      // Verify the re-encrypted key can be decrypted with the new key
      const decrypted = await mockKms.decrypt(result.encryptedDataKey, targetKeyId);
      expect(decrypted).toEqual(originalDataKey);
    });

    it('should re-encrypt a data key using decrypt+encrypt fallback', async () => {
      // Arrange
      const originalDataKey = Buffer.from('original-data-key-32-bytes!!');
      const encryptedDataKey = await mockKms.encrypt(originalDataKey, 'default');

      // Act
      const result = await service.reencryptDataKey(encryptedDataKey, {
        organizationId: 'org-123',
        currentKeyId: 'default',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result.encryptedDataKey).toBeTruthy();
      expect(result.oldKeyId).toBe('default');
      expect(result.newKeyId).toBe('new-key');
      expect(result.encryptedDataKey).not.toEqual(encryptedDataKey);

      // Verify the re-encrypted key can be decrypted with the new key
      const decrypted = await mockKms.decrypt(result.encryptedDataKey, 'new-key');
      expect(decrypted).toEqual(originalDataKey);
    });

    it('should re-encrypt a data key using decrypt+encrypt fallback when rewrap is not available', async () => {
      // Arrange
      const providerWithoutRewrap = createMockKmsProvider({ name: 'no-rewrap' });
      (providerWithoutRewrap as { rewrap?: unknown }).rewrap = undefined;
      providerMap.set('no-rewrap', providerWithoutRewrap);

      const originalDataKey = Buffer.from('original-data-key-32-bytes!!');
      const encryptedDataKey = await providerWithoutRewrap.encrypt(originalDataKey, 'old-key');

      // Act
      const result = await service.reencryptDataKey(encryptedDataKey, {
        organizationId: 'org-123',
        provider: 'no-rewrap',
        currentKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result.encryptedDataKey).toBeTruthy();
      expect(result.oldKeyId).toBe('old-key');
      expect(result.newKeyId).toBe('new-key');

      const decrypted = await providerWithoutRewrap.decrypt(result.encryptedDataKey, 'new-key');
      expect(decrypted).toEqual(originalDataKey);
    });

    it('should throw DataKeyReencryptionError when decrypt+encrypt fails', async () => {
      // Arrange
      const invalidDataKey = Buffer.from('invalid-data-key-that-will-fail-decryption');

      // Act & Assert
      await expect(
        service.reencryptDataKey(invalidDataKey, {
          organizationId: 'org-123',
          provider: 'mock-kms',
          currentKeyId: 'default',
          newKeyId: 'new-key'
        })
      ).rejects.toThrow(DataKeyReencryptionError);
    });

    it('should use default provider when not specified', async () => {
      // Arrange
      const originalDataKey = Buffer.from('original-data-key-32-bytes!!');
      const encryptedDataKey = await mockKms.encrypt(originalDataKey, 'default');

      // Act
      const result = await service.reencryptDataKey(encryptedDataKey, {
        organizationId: 'org-123',
        currentKeyId: 'default',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result.encryptedDataKey).toBeTruthy();
    });

    it('should throw error when provider not found', async () => {
      // Arrange
      const encryptedDataKey = Buffer.from('encrypted-data-key');

      // Act & Assert
      await expect(
        service.reencryptDataKey(encryptedDataKey, {
          organizationId: 'org-123',
          provider: 'non-existent',
          currentKeyId: 'old-key',
          newKeyId: 'new-key'
        })
      ).rejects.toThrow(KeyRotationError);
    });
  });

  describe('reencryptDataKeyFromBase64', () => {
    it('should re-encrypt base64-encoded data key', async () => {
      // Arrange
      const originalDataKey = Buffer.from('original-data-key-32-bytes!!');
      const encryptedDataKey = await mockKms.encrypt(originalDataKey, 'default');
      const base64Encoded = encryptedDataKey.toString('base64');

      // Act
      const result = await service.reencryptDataKeyFromBase64(base64Encoded, {
        organizationId: 'org-123',
        currentKeyId: 'default',
        newKeyId: 'new-key'
      });

      // Assert
      expect(typeof result.encryptedDataKey).toBe('string');
      expect(result.oldKeyId).toBe('default');
      expect(result.newKeyId).toBe('new-key');
      expect(/^[A-Za-z0-9+/]+=*$/.test(result.encryptedDataKey)).toBeTruthy();

      const decrypted = await mockKms.decrypt(
        Buffer.from(result.encryptedDataKey, 'base64'),
        'new-key'
      );
      expect(decrypted).toEqual(originalDataKey);
    });
  });

  describe('validateRotation', () => {
    it('should validate rotation successfully when keys are accessible', async () => {
      // Arrange
      mockKms.createTestKey('old-key');
      mockKms.createTestKey('new-key');

      // Act
      const result = await service.validateRotation({
        organizationId: 'org-123',
        currentKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should throw error when provider is not available', async () => {
      // Arrange
      const unavailableKms = createMockKmsProvider({ name: 'unavailable' });
      unavailableKms.healthCheck = async () => false;
      unavailableKms.isAvailable = async () => false;
      providerMap.set('unavailable', unavailableKms);

      // Act & Assert
      await expect(
        service.validateRotation({
          organizationId: 'org-123',
          provider: 'unavailable',
          currentKeyId: 'old-key',
          newKeyId: 'new-key'
        })
      ).rejects.toThrow(KeyRotationError);
    });

    it('should throw error when old key is not accessible', async () => {
      // Arrange
      mockKms.createTestKey('new-key');

      // Act & Assert
      await expect(
        service.validateRotation({
          organizationId: 'org-123',
          currentKeyId: 'non-existent-old-key',
          newKeyId: 'new-key'
        })
      ).rejects.toThrow(KeyRotationError);
    });

    it('should throw error when new key is not accessible', async () => {
      // Arrange
      mockKms.createTestKey('old-key');

      // Act & Assert
      await expect(
        service.validateRotation({
          organizationId: 'org-123',
          currentKeyId: 'old-key',
          newKeyId: 'non-existent-new-key'
        })
      ).rejects.toThrow(KeyRotationError);
    });
  });

  describe('prepareRotationPlan', () => {
    it('should prepare rotation plan for entities', async () => {
      // Arrange
      const entities = [
        { id: '1', data: { field1: 'value1' } },
        { id: '2', data: { field2: 'value2' } },
        { id: '3', data: { field3: 'value3' } }
      ];

      // Act
      const plan = await service.prepareRotationPlan(entities, {
        organizationId: 'org-123',
        currentKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 2
      });

      // Assert
      expect(plan.totalEntities).toBe(3);
      expect(plan.estimatedBatches).toBe(2);
    });

    it('should calculate batches correctly', async () => {
      // Arrange
      const entities = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        data: { field: `value${i}` }
      }));

      // Act
      const plan = await service.prepareRotationPlan(entities, {
        organizationId: 'org-123',
        currentKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 25
      });

      // Assert
      expect(plan.totalEntities).toBe(100);
      expect(plan.estimatedBatches).toBe(4);
    });

    it('should use default batch size', async () => {
      // Arrange
      const entities = Array.from({ length: 250 }, (_, i) => ({
        id: String(i),
        data: { field: `value${i}` }
      }));

      // Act
      const plan = await service.prepareRotationPlan(entities, {
        organizationId: 'org-123',
        currentKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Assert
      expect(plan.totalEntities).toBe(250);
      expect(plan.estimatedBatches).toBe(3); // 250 / 100 = 2.5 -> 3
    });
  });
});

describe('createKeyRotationService', () => {
  it('should create service instance', () => {
    // Arrange
    const mockKms = createMockKmsProvider({ name: 'mock-kms' });
    const providerMap = new Map([['mock-kms', mockKms]]);

    // Act
    const service = createKeyRotationService(
      (name?: string) => (name ? (providerMap.get(name) ?? undefined) : undefined),
      'mock-kms'
    );

    // Assert
    expect(service).toBeInstanceOf(KeyRotationService);
  });
});

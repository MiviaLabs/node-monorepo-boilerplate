/**
 * EncryptedStoreKeyService Unit Tests
 *
 * Tests KMS key management operations with mocked providers.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - getTenantKeyId() - key ID generation and validation
 * - validateTenantKey() - key health checks
 * - scheduleKeyDeletion() - key deletion scheduling
 * - Provider-specific behavior
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { KmsProviderFactory } from '@package/encryption';

import { EncryptedStoreKeyService } from '../encrypted-store-key.service';

import type { TestingModule } from '@nestjs/testing';
import type { IKmsProvider } from '@package/encryption';

describe('EncryptedStoreKeyService', () => {
  let service: EncryptedStoreKeyService;
  let kmsFactory: jest.Mocked<KmsProviderFactory>;
  let mockProvider: jest.Mocked<IKmsProvider>;

  // Test data
  const tenantId = '123';

  beforeEach(async () => {
    // Create mock KMS provider
    mockProvider = {
      name: 'env-var',
      isAvailable: jest.fn().mockResolvedValue(true),
      getKeyInfo: jest.fn().mockResolvedValue({ enabled: true }),
      encrypt: jest.fn(),
      decrypt: jest.fn()
    } as unknown as jest.Mocked<IKmsProvider>;

    // Create mock KMS factory
    kmsFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(mockProvider),
      getProvider: jest.fn().mockReturnValue(mockProvider),
      registerProvider: jest.fn()
    } as unknown as jest.Mocked<KmsProviderFactory>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptedStoreKeyService,
        {
          provide: KmsProviderFactory,
          useValue: kmsFactory
        }
      ]
    }).compile();

    service = module.get<EncryptedStoreKeyService>(EncryptedStoreKeyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPrimaryKeyId', () => {
    it('should return primary-encryption-key', async () => {
      // Act
      const result = await service.getPrimaryKeyId();

      // Assert
      expect(result).toBe('primary-encryption-key');
    });

    it('should check provider availability', async () => {
      // Act
      await service.getPrimaryKeyId();

      // Assert
      expect(kmsFactory.getDefaultProvider).toHaveBeenCalled();
    });

    it('should throw error when no provider configured', async () => {
      // Arrange
      kmsFactory.getDefaultProvider.mockReturnValue(null as unknown as IKmsProvider);

      // Act & Assert
      await expect(service.getPrimaryKeyId()).rejects.toThrow('No KMS provider configured');
    });

    it('should check if key is enabled', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true });

      // Act
      await service.getPrimaryKeyId();

      // Assert
      expect(mockProvider.getKeyInfo).toHaveBeenCalledWith('primary-encryption-key');
    });

    it('should throw error when key is disabled', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: false });

      // Act & Assert
      await expect(service.getPrimaryKeyId()).rejects.toThrow(
        'KMS primary key primary-encryption-key is disabled'
      );
    });

    it('should handle missing getKeyInfo method gracefully', async () => {
      // Arrange
      delete (mockProvider as { getKeyInfo?: unknown }).getKeyInfo;

      // Act
      const result = await service.getPrimaryKeyId();

      // Assert - should return key ID without error
      expect(result).toBe('primary-encryption-key');
    });

    it('should handle key not found in development mode', async () => {
      // Arrange
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';
      mockProvider.getKeyInfo = jest.fn().mockRejectedValue(new Error('Key not found'));

      // Act
      const result = await service.getPrimaryKeyId();

      // Assert - should return key ID in dev mode
      expect(result).toBe('primary-encryption-key');

      // Cleanup
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should throw error for missing key in production mode', async () => {
      // Arrange
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      mockProvider.getKeyInfo = jest.fn().mockRejectedValue(new Error('Key not found'));

      // Act & Assert
      await expect(service.getPrimaryKeyId()).rejects.toThrow(
        'KMS primary key primary-encryption-key not found in production'
      );

      // Cleanup
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should return primary-encryption-key regardless of tenant', async () => {
      // Act - Note: getTenantKeyId is deprecated but kept for backward compatibility
      const result1 = await service.getTenantKeyId('org-123');
      const result2 = await service.getTenantKeyId('456');

      // Assert - Single-key architecture: always returns primary-encryption-key
      expect(result1).toBe('primary-encryption-key');
      expect(result2).toBe('primary-encryption-key');
    });
  });

  describe('getPrimaryKeyIdWithVersion', () => {
    it('should return keyId and versioned keyVersion when provider returns version', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true, version: '5' });

      // Act
      const result = await service.getPrimaryKeyIdWithVersion();

      // Assert
      expect(result.keyId).toBe('primary-encryption-key');
      expect(result.keyVersion).toBe('primary-encryption-key/cryptoKeyVersions/5');
      expect(mockProvider.getKeyInfo).toHaveBeenCalledTimes(1); // Single KMS call
    });

    it('should return unversioned keyVersion when provider has no version info', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true });

      // Act
      const result = await service.getPrimaryKeyIdWithVersion();

      // Assert
      expect(result.keyId).toBe('primary-encryption-key');
      expect(result.keyVersion).toBe('primary-encryption-key');
    });

    it('should throw error when no provider configured', async () => {
      // Arrange
      kmsFactory.getDefaultProvider.mockReturnValue(null as unknown as IKmsProvider);

      // Act & Assert
      await expect(service.getPrimaryKeyIdWithVersion()).rejects.toThrow(
        'No KMS provider configured'
      );
    });

    it('should throw error when key is disabled', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: false });

      // Act & Assert
      await expect(service.getPrimaryKeyIdWithVersion()).rejects.toThrow(
        'KMS primary key primary-encryption-key is disabled'
      );
    });

    it('should return unversioned when provider does not support getKeyInfo', async () => {
      // Arrange
      delete (mockProvider as { getKeyInfo?: unknown }).getKeyInfo;

      // Act
      const result = await service.getPrimaryKeyIdWithVersion();

      // Assert
      expect(result.keyId).toBe('primary-encryption-key');
      expect(result.keyVersion).toBe('primary-encryption-key');
    });

    it('should return unversioned in development when key not found', async () => {
      // Arrange
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';
      mockProvider.getKeyInfo = jest.fn().mockRejectedValue(new Error('Key not found'));

      // Act
      const result = await service.getPrimaryKeyIdWithVersion();

      // Assert
      expect(result.keyId).toBe('primary-encryption-key');
      expect(result.keyVersion).toBe('primary-encryption-key');

      // Cleanup
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should throw error for missing key in production mode', async () => {
      // Arrange
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      mockProvider.getKeyInfo = jest.fn().mockRejectedValue(new Error('Key not found'));

      // Act & Assert
      await expect(service.getPrimaryKeyIdWithVersion()).rejects.toThrow(
        'KMS primary key primary-encryption-key not found in production'
      );

      // Cleanup
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should make only ONE KMS API call (performance)', async () => {
      // Arrange
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true, version: '3' });

      // Act
      await service.getPrimaryKeyIdWithVersion();

      // Assert - Critical: Only ONE KMS call should be made
      expect(mockProvider.getKeyInfo).toHaveBeenCalledTimes(1);
      expect(mockProvider.getKeyInfo).toHaveBeenCalledWith('primary-encryption-key');
    });
  });

  describe('isGcpKmsProvider', () => {
    it('returns true when the default provider is GCP', () => {
      kmsFactory.getDefaultProvider.mockReturnValue({
        ...mockProvider,
        name: 'gcp'
      } as IKmsProvider);

      expect(service.isGcpKmsProvider()).toBe(true);
    });

    it('returns false when the default provider is not GCP', () => {
      kmsFactory.getDefaultProvider.mockReturnValue({
        ...mockProvider,
        name: 'env-var'
      } as IKmsProvider);

      expect(service.isGcpKmsProvider()).toBe(false);
    });
  });

  describe('validateTenantKey', () => {
    it('should return true for valid and enabled key', async () => {
      // Arrange
      mockProvider.isAvailable.mockResolvedValue(true);
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true });

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no provider configured', async () => {
      // Arrange
      kmsFactory.getDefaultProvider.mockReturnValue(null as unknown as IKmsProvider);

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when provider is unavailable', async () => {
      // Arrange
      mockProvider.isAvailable.mockResolvedValue(false);

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when key is disabled', async () => {
      // Arrange
      mockProvider.isAvailable.mockResolvedValue(true);
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: false });

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false on validation error', async () => {
      // Arrange
      mockProvider.isAvailable.mockRejectedValue(new Error('Connection failed'));

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when getKeyInfo is not available', async () => {
      // Arrange
      mockProvider.isAvailable.mockResolvedValue(true);
      delete (mockProvider as { getKeyInfo?: unknown }).getKeyInfo;

      // Act
      const result = await service.validateTenantKey(tenantId);

      // Assert - should return true (assume key is valid)
      expect(result).toBe(true);
    });

    it('should delegate to primary key validation', async () => {
      // Arrange
      mockProvider.isAvailable.mockResolvedValue(true);
      mockProvider.getKeyInfo = jest.fn().mockResolvedValue({ enabled: true });

      // Act
      await service.validateTenantKey(tenantId);

      // Assert - Single-key architecture: validates primary-encryption-key
      expect(mockProvider.getKeyInfo).toHaveBeenCalledWith('primary-encryption-key');
    });
  });

  describe('scheduleKeyDeletion', () => {
    it('should delegate to primary key deletion (deprecated method)', () => {
      // Note: scheduleKeyDeletion is deprecated and logs a warning
      // It no longer validates waiting periods for tenant-specific keys
      // Act & Assert - should not throw (deprecated stub)
      expect(() => service.scheduleKeyDeletion(tenantId, 0)).not.toThrow();
    });

    it('should accept any waiting period (deprecated method)', () => {
      // Act & Assert - deprecated stub accepts any value
      expect(() => service.scheduleKeyDeletion(tenantId, 31)).not.toThrow();
    });

    it('should not throw for any valid period (deprecated)', () => {
      // Act & Assert - deprecated stub doesn't validate
      expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      expect(() => service.scheduleKeyDeletion(tenantId, 1)).not.toThrow();
      expect(() => service.scheduleKeyDeletion(tenantId, 30)).not.toThrow();
    });

    it('should not check provider (deprecated method)', () => {
      // Arrange
      kmsFactory.getDefaultProvider.mockReturnValue(null as unknown as IKmsProvider);

      // Act & Assert - deprecated stub doesn't check provider
      expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
    });

    it('should use default waiting period (deprecated)', () => {
      // Act & Assert - deprecated stub accepts default
      expect(() => service.scheduleKeyDeletion(tenantId)).not.toThrow();
    });

    describe('provider-specific behavior', () => {
      it('should handle env-var provider', () => {
        // Arrange - provider already has name 'env-var' from beforeEach

        // Act & Assert - should not throw
        expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      });

      it('should handle aws provider', () => {
        // Arrange - create provider with aws name
        const awsProvider = {
          ...mockProvider,
          name: 'aws'
        } as unknown as jest.Mocked<IKmsProvider>;
        kmsFactory.getDefaultProvider.mockReturnValue(awsProvider);

        // Act & Assert - should not throw
        expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      });

      it('should handle gcp provider', () => {
        // Arrange - create provider with gcp name
        const gcpProvider = {
          ...mockProvider,
          name: 'gcp'
        } as unknown as jest.Mocked<IKmsProvider>;
        kmsFactory.getDefaultProvider.mockReturnValue(gcpProvider);

        // Act & Assert - should not throw
        expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      });

      it('should handle azure provider', () => {
        // Arrange - create provider with azure name
        const azureProvider = {
          ...mockProvider,
          name: 'azure'
        } as unknown as jest.Mocked<IKmsProvider>;
        kmsFactory.getDefaultProvider.mockReturnValue(azureProvider);

        // Act & Assert - should not throw
        expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      });

      it('should handle unknown provider', () => {
        // Arrange - create provider with unknown name
        const unknownProvider = {
          ...mockProvider,
          name: 'unknown-provider'
        } as unknown as jest.Mocked<IKmsProvider>;
        kmsFactory.getDefaultProvider.mockReturnValue(unknownProvider);

        // Act & Assert - should not throw
        expect(() => service.scheduleKeyDeletion(tenantId, 7)).not.toThrow();
      });
    });
  });

  describe('key ID format', () => {
    it('should return primary-encryption-key consistently', async () => {
      // Act - Note: getTenantKeyId is deprecated but kept for backward compatibility
      const result1 = await service.getTenantKeyId(tenantId);
      const result2 = await service.getTenantKeyId(tenantId);

      // Assert - Single-key architecture: always returns primary-encryption-key
      expect(result1).toBe(result2);
      expect(result1).toBe('primary-encryption-key');
    });

    it('should handle numeric tenant IDs', async () => {
      // Act
      const result = await service.getTenantKeyId('12345');

      // Assert
      expect(result).toBe('primary-encryption-key');
    });

    it('should handle string tenant IDs with special characters', async () => {
      // Act
      const result = await service.getTenantKeyId('org-123-abc');

      // Assert
      expect(result).toBe('primary-encryption-key');
    });
  });
});

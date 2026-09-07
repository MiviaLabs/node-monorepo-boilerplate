/**
 * Unit tests for Envelope Encryption Service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import { EncryptionAlgorithm } from '../../../constants';
import {
  EnvelopeEncryptionService,
  createEnvelopeEncryptionService
} from '../../../services/envelope-encryption.service';

describe('EnvelopeEncryptionService', () => {
  let mockKms: ReturnType<typeof createMockKmsProvider>;
  let service: EnvelopeEncryptionService;

  beforeEach(() => {
    mockKms = createMockKmsProvider({ name: 'mock-kms' });
    service = new EnvelopeEncryptionService(mockKms);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('encrypt', () => {
    it('should encrypt a buffer', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const result = await service.encrypt(plaintext);

      expect(result.ciphertext).toBeDefined();
      expect(result.encryptedDataKey).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();

      // Ciphertext should be different from plaintext
      expect(result.ciphertext).not.toEqual(plaintext);
    });

    it('should encrypt a string', async () => {
      const plaintext = 'Hello, World!';
      const result = await service.encrypt(plaintext);

      expect(result.ciphertext).toBeDefined();
      expect(result.encryptedDataKey).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('should generate unique IV for each encryption', async () => {
      const plaintext = 'Hello, World!';
      const result1 = await service.encrypt(plaintext);
      const result2 = await service.encrypt(plaintext);

      // IVs should be different
      expect(result1.iv).not.toEqual(result2.iv);

      // Ciphertexts should be different
      expect(result1.ciphertext).not.toEqual(result2.ciphertext);
    });

    it('should accept keyId option', async () => {
      const plaintext = 'Test data';
      mockKms.createTestKey('test-key');

      const result = await service.encrypt(plaintext, { keyId: 'test-key' });

      expect(result.ciphertext).toBeDefined();
      expect(result.encryptedDataKey).toBeDefined();
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encrypt(plaintext);

      const decrypted = await service.decrypt(
        encrypted.ciphertext,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted.toString('utf8')).toBe(plaintext);
    });

    it('should decrypt empty string', async () => {
      const plaintext = '';
      const encrypted = await service.encrypt(plaintext);

      const decrypted = await service.decrypt(
        encrypted.ciphertext,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted.toString('utf8')).toBe(plaintext);
    });

    it('should decrypt binary data', async () => {
      const plaintext = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
      const encrypted = await service.encrypt(plaintext);

      const decrypted = await service.decrypt(
        encrypted.ciphertext,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toEqual(plaintext);
    });

    it('should fail with wrong auth tag', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encrypt(plaintext);

      const wrongAuthTag = Buffer.from('wrong'.repeat(4), 'utf8');

      await expect(
        service.decrypt(
          encrypted.ciphertext,
          encrypted.encryptedDataKey,
          encrypted.iv,
          wrongAuthTag
        )
      ).rejects.toThrow();
    });

    it('should fail with wrong IV', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encrypt(plaintext);

      const wrongIv = Buffer.alloc(12, 0xff);

      await expect(
        service.decrypt(
          encrypted.ciphertext,
          encrypted.encryptedDataKey,
          wrongIv,
          encrypted.authTag
        )
      ).rejects.toThrow();
    });
  });

  describe('encryptToBase64', () => {
    it('should return base64 encoded values', async () => {
      const plaintext = 'Hello, World!';
      const result = await service.encryptToBase64(plaintext);

      expect(typeof result.ciphertext).toBe('string');
      expect(typeof result.encryptedDataKey).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.authTag).toBe('string');

      // Should be valid base64
      expect(result.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('decryptFromBase64', () => {
    it('should decrypt base64 encoded values', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encryptToBase64(plaintext);

      const decrypted = await service.decryptFromBase64(
        encrypted.ciphertext,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('integration', () => {
    it('should handle multiple encrypt/decrypt cycles', async () => {
      const texts = ['Hello', 'World', 'Test', 'Data'];

      for (const text of texts) {
        const encrypted = await service.encrypt(text);
        const decrypted = await service.decrypt(
          encrypted.ciphertext,
          encrypted.encryptedDataKey,
          encrypted.iv,
          encrypted.authTag
        );
        expect(decrypted.toString('utf8')).toBe(text);
      }
    });

    it('should handle large data', async () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(
        encrypted.ciphertext,
        encrypted.encryptedDataKey,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted.toString('utf8')).toBe(plaintext);
    });
  });
});

describe('createEnvelopeEncryptionService', () => {
  it('should create service instance', () => {
    const mockKms = createMockKmsProvider();
    const service = createEnvelopeEncryptionService(mockKms);

    expect(service).toBeInstanceOf(EnvelopeEncryptionService);
  });

  it('should accept custom algorithm', () => {
    const mockKms = createMockKmsProvider();
    const service = createEnvelopeEncryptionService(mockKms, {
      algorithm: EncryptionAlgorithm.AES_128_GCM
    });

    expect(service).toBeInstanceOf(EnvelopeEncryptionService);
  });

  it('should_encrypt_and_decrypt_when_algorithm_is_AES_128_GCM', async () => {
    // Arrange
    const mockKms = createMockKmsProvider();
    const service = createEnvelopeEncryptionService(mockKms, {
      algorithm: EncryptionAlgorithm.AES_128_GCM
    });
    const plaintext = 'Test data for AES-128-GCM';

    // Act
    const encrypted = await service.encrypt(plaintext);
    const decrypted = await service.decrypt(
      encrypted.ciphertext,
      encrypted.encryptedDataKey,
      encrypted.iv,
      encrypted.authTag
    );

    // Assert
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.encryptedDataKey).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(decrypted.toString('utf8')).toBe(plaintext);
  });

  it('should_encrypt_when_algorithm_overridden_to_AES_128_GCM_per_call', async () => {
    // Arrange
    const mockKms = createMockKmsProvider();
    // Service defaults to AES_256_GCM
    const service = createEnvelopeEncryptionService(mockKms);
    const plaintext = 'Test data for per-call AES-128-GCM';

    // Act
    const encrypted = await service.encrypt(plaintext, {
      algorithm: EncryptionAlgorithm.AES_128_GCM
    });
    const decrypted = await service.decrypt(
      encrypted.ciphertext,
      encrypted.encryptedDataKey,
      encrypted.iv,
      encrypted.authTag,
      { algorithm: EncryptionAlgorithm.AES_128_GCM }
    );

    // Assert
    expect(encrypted.ciphertext).toBeDefined();
    expect(decrypted.toString('utf8')).toBe(plaintext);
  });
});

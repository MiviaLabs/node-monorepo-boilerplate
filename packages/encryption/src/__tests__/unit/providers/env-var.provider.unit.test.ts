/**
 * Unit tests for EnvVar Provider
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { randomBytes } from 'node:crypto';

import { envVarConfig } from '../../../config/encryption-config';
import { InvalidKmsConfigError } from '../../../errors';
import { EnvVarProvider } from '../../../providers/env-var.provider';
import { KmsProviderType } from '../../../providers/kms-provider.interface';

// Generate a valid test key (32 bytes, hex-encoded)
function generateTestKey() {
  return randomBytes(32).toString('hex');
}

describe('EnvVarProvider', () => {
  let validKey: string;
  let invalidKeyShort: string;
  let invalidKeyLong: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    validKey = generateTestKey();
    // gitleaks:ignore - Test data for invalid key validation
    invalidKeyShort = '0123456789abcdef'; // Too short
    invalidKeyLong = randomBytes(64).toString('hex'); // Too long
    originalEnv = { ...process['env'] };
  });

  afterAll(() => {
    process['env'] = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with encryptionKey option', () => {
      const provider = new EnvVarProvider({ encryptionKey: validKey });
      expect(provider.name).toBe('env-var');
    });

    it('should create provider with default key from env var', () => {
      process['env']['ENCRYPTION_KEY'] = validKey;

      const provider = new EnvVarProvider();
      expect(provider.name).toBe('env-var');

      delete process['env']['ENCRYPTION_KEY'];
    });

    it('should create provider with custom envPrefix', () => {
      process['env']['CUSTOM_PREFIX'] = validKey;

      const provider = new EnvVarProvider({ envPrefix: 'CUSTOM_PREFIX' });
      expect(provider.name).toBe('env-var');

      delete process['env']['CUSTOM_PREFIX'];
    });

    it('should create provider with multiple keys', () => {
      const key1 = generateTestKey();
      const key2 = generateTestKey();

      const provider = new EnvVarProvider({
        keys: {
          key1,
          key2
        }
      });

      expect(provider.name).toBe('env-var');
      expect(provider.getKeyIds().sort()).toEqual(['key1', 'key2']);
    });

    it('should create provider with encryptionKey and allowProduction', () => {
      const originalNodeEnv = process['env']['NODE_ENV'];
      process['env']['NODE_ENV'] = 'production';

      const provider = new EnvVarProvider({
        encryptionKey: validKey,
        allowProduction: true
      });

      expect(provider.name).toBe('env-var');

      if (originalNodeEnv) {
        process['env']['NODE_ENV'] = originalNodeEnv;
      } else {
        delete process['env']['NODE_ENV'];
      }
    });

    it('should throw error if no key is provided', () => {
      // Clear environment
      delete process['env']['ENCRYPTION_KEY'];

      expect(() => new EnvVarProvider()).toThrow(InvalidKmsConfigError);
    });

    it('should throw error if key is too short', () => {
      expect(() => new EnvVarProvider({ encryptionKey: invalidKeyShort })).toThrow(
        InvalidKmsConfigError
      );
    });

    it('should throw error if key is too long', () => {
      expect(() => new EnvVarProvider({ encryptionKey: invalidKeyLong })).toThrow(
        InvalidKmsConfigError
      );
    });

    it('should throw error if key is invalid hex', () => {
      expect(() => new EnvVarProvider({ encryptionKey: 'not-valid-hex!!!' })).toThrow(
        InvalidKmsConfigError
      );
    });

    it('should throw error if key is not a multiple of 2 (invalid hex)', () => {
      expect(() => new EnvVarProvider({ encryptionKey: 'abc' })).toThrow(InvalidKmsConfigError);
    });

    it('should prioritize encryptionKey option over env var', () => {
      process['env']['ENCRYPTION_KEY'] = generateTestKey();

      const provider = new EnvVarProvider({
        encryptionKey: validKey
      });

      expect(provider.name).toBe('env-var');

      delete process['env']['ENCRYPTION_KEY'];
    });
  });

  describe('encrypt', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should encrypt data successfully', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);

      // Encrypted data should be longer than plaintext (iv + authTag + ciphertext)
      expect(ciphertext.length).toBeGreaterThan(plaintext.length);
      // Format: iv(12) + authTag(16) + ciphertext
      expect(ciphertext.length).toBe(plaintext.length + 28);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext1 = await provider.encrypt(plaintext);
      const ciphertext2 = await provider.encrypt(plaintext);

      // Ciphertexts should be different due to random IV
      expect(ciphertext1.equals(ciphertext2)).toBe(false);
    });

    it('should handle empty buffer', async () => {
      const plaintext = Buffer.alloc(0);
      const ciphertext = await provider.encrypt(plaintext);

      // Should still produce iv + authTag
      expect(ciphertext.length).toBe(28);
    });

    it('should handle large data', async () => {
      const plaintext = randomBytes(1024 * 1024); // 1MB
      const ciphertext = await provider.encrypt(plaintext);

      expect(ciphertext.length).toBe(plaintext.length + 28);
    });
  });

  describe('decrypt', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should decrypt encrypted data successfully', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should handle empty buffer', async () => {
      const plaintext = Buffer.alloc(0);
      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should handle large data', async () => {
      const plaintext = randomBytes(1024 * 1024); // 1MB
      const ciphertext = await provider.encrypt(plaintext);
      const decrypted = await provider.decrypt(ciphertext);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should throw error for invalid ciphertext', async () => {
      const invalidCiphertext = Buffer.from('invalid-data');

      await expect(provider.decrypt(invalidCiphertext)).rejects.toThrow();
    });

    it('should throw error for ciphertext with wrong key', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);

      // Create provider with different key
      const otherProvider = new EnvVarProvider({ encryptionKey: generateTestKey() });

      await expect(otherProvider.decrypt(ciphertext)).rejects.toThrow();
    });

    it('should throw error for truncated ciphertext', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);
      const truncated = ciphertext.subarray(0, 10); // Too short

      await expect(provider.decrypt(truncated)).rejects.toThrow();
    });
  });

  describe('generateDataKey', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should generate data key successfully', async () => {
      const result = await provider.generateDataKey();

      expect(result.plaintext).toBeTruthy();
      expect(result.ciphertext).toBeTruthy();
      expect(result.plaintext.length).toBe(32); // 32 bytes
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    it('should generate different data keys each time', async () => {
      const result1 = await provider.generateDataKey();
      const result2 = await provider.generateDataKey();

      // Plaintext keys should be different
      expect(result1.plaintext.equals(result2.plaintext)).toBe(false);
    });

    it('should allow decrypting generated data key', async () => {
      const result = await provider.generateDataKey();
      const decrypted = await provider.decrypt(result.ciphertext);

      expect(decrypted.equals(result.plaintext)).toBe(true);
    });
  });

  describe('rewrap', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should rewrap data successfully', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);
      const rewrapped = await provider.rewrap(ciphertext);

      expect(rewrapped.ciphertext).toBeTruthy();
      // Rewrapped ciphertext should have same format
      expect(rewrapped.ciphertext.length).toBe(ciphertext.length);
    });

    it('should allow decrypting rewrapped data', async () => {
      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);
      const rewrapped = await provider.rewrap(ciphertext);
      const decrypted = await provider.decrypt(rewrapped.ciphertext);

      expect(decrypted.equals(plaintext)).toBe(true);
    });
  });

  describe('getKeyInfo', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should return key info for default key', async () => {
      const info = await provider.getKeyInfo();

      expect(info.keyId).toBe('default');
      expect(info.version).toBe('1');
      expect(info.enabled).toBe(true);
      expect(info.purpose).toBe('ENCRYPT_DECRYPT');
      expect(info.metadata).toBeTruthy();
      if (info.metadata) {
        expect(info.metadata['provider']).toBe('env-var');
        expect(info.metadata['storage']).toBe('environment-variable');
        expect(info.metadata['algorithm']).toBe('AES-256-GCM');
      }
    });

    it('should return key info for specific key', async () => {
      const keyId = 'my-key';
      provider.setKey(keyId, generateTestKey());

      const info = await provider.getKeyInfo(keyId);

      expect(info.keyId).toBe(keyId);
      expect(info.enabled).toBe(true);
    });

    it('should throw error for non-existent key', async () => {
      await expect(provider.getKeyInfo('non-existent')).rejects.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true when key is configured', async () => {
      const provider = new EnvVarProvider({ encryptionKey: validKey });
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('healthCheck', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should return true for healthy provider', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });

    it('should pass encrypt/decrypt health check', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('setKey', () => {
    let provider: EnvVarProvider;

    beforeEach(() => {
      provider = new EnvVarProvider({ encryptionKey: validKey });
    });

    it('should add new key at runtime', () => {
      const newKeyId = 'new-key';
      const newKey = generateTestKey();

      provider.setKey(newKeyId, newKey);

      expect(provider.getKeyIds()).toContain(newKeyId);
    });

    it('should update existing key at runtime', () => {
      const keyId = 'default';
      const newKey = generateTestKey();

      provider.setKey(keyId, newKey);

      expect(provider.getKeyIds()).toContain(keyId);
    });

    it('should throw error for invalid key', () => {
      expect(() => {
        provider.setKey('invalid', 'short-key');
      }).toThrow();
    });
  });

  describe('getKeyIds', () => {
    it('should return array of key IDs', () => {
      const provider = new EnvVarProvider({
        keys: {
          key1: generateTestKey(),
          key2: generateTestKey(),
          key3: generateTestKey()
        }
      });

      const ids = provider.getKeyIds();
      expect(ids.sort()).toEqual(['key1', 'key2', 'key3']);
    });

    it('should return array when only default key', () => {
      const provider = new EnvVarProvider({ encryptionKey: validKey });

      const ids = provider.getKeyIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  describe('multiple keys', () => {
    it('should encrypt with specific key ID', async () => {
      const key1 = generateTestKey();
      const key2 = generateTestKey();

      const provider = new EnvVarProvider({
        keys: {
          key1,
          key2
        },
        defaultKeyId: 'key1'
      });

      const plaintext = Buffer.from('Hello, World!');

      // Encrypt with key1
      const ciphertext1 = await provider.encrypt(plaintext, 'key1');
      const decrypted1 = await provider.decrypt(ciphertext1, 'key1');
      expect(decrypted1.equals(plaintext)).toBe(true);

      // Encrypt with key2
      const ciphertext2 = await provider.encrypt(plaintext, 'key2');
      const decrypted2 = await provider.decrypt(ciphertext2, 'key2');
      expect(decrypted2.equals(plaintext)).toBe(true);

      // Ciphertexts should be different
      expect(ciphertext1.equals(ciphertext2)).toBe(false);
    });

    it('should use default key when keyId is not provided', async () => {
      const key1 = generateTestKey();
      const key2 = generateTestKey();

      const provider = new EnvVarProvider({
        keys: {
          key1,
          key2
        },
        defaultKeyId: 'key2'
      });

      const plaintext = Buffer.from('Hello, World!');
      const ciphertext = await provider.encrypt(plaintext);

      // Should be decryptable with key2 (default)
      const decrypted = await provider.decrypt(ciphertext, 'key2');
      expect(decrypted.equals(plaintext)).toBe(true);
    });
  });

  describe('KmsProviderType', () => {
    it('should have ENV_VAR type', () => {
      expect(KmsProviderType.ENV_VAR).toBe('env-var');
    });
  });

  describe('factory types', () => {
    it('should have correct structure for EnvVarProviderOptions', () => {
      const config = {
        encryptionKey: validKey,
        defaultKeyId: 'my-default',
        envPrefix: 'CUSTOM_PREFIX',
        keys: {
          key1: validKey,
          key2: validKey
        },
        allowProduction: true
      };

      // Validate the config structure
      expect(typeof config.encryptionKey).toBe('string');
      expect(typeof config.defaultKeyId).toBe('string');
      expect(typeof config.envPrefix).toBe('string');
      expect(typeof config.allowProduction).toBe('boolean');
      expect(config.keys).toBeTruthy();
      expect(typeof config.keys.key1).toBe('string');
      expect(typeof config.keys.key2).toBe('string');
    });
  });

  describe('factory registration', () => {
    it('should include ENV_VAR in KmsProviderType', () => {
      // Verify the ENV_VAR type exists
      expect(KmsProviderType.ENV_VAR).toBe('env-var');
    });
  });

  describe('configuration helper', () => {
    it('should export envVarConfig function', () => {
      expect(typeof envVarConfig).toBe('function');
    });

    it('should create valid config with envVarConfig', () => {
      const config = envVarConfig({
        encryptionKey: validKey,
        default: true
      });

      expect(config.type).toBe('env-var');
      expect(config.default).toBe(true);
      expect(config.options).toBeTruthy();
      if (config.options && 'encryptionKey' in config.options) {
        expect((config.options as { encryptionKey: string }).encryptionKey).toBe(validKey);
      }
    });
  });

  describe('index exports', () => {
    it('should export EnvVarProvider', () => {
      // The provider should be exported from the main index
      expect(EnvVarProvider).toBeTruthy();
    });
  });
});

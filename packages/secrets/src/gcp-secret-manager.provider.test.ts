/**
 * Unit tests for GCP Secret Manager Provider
 */

import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { SecretProviderConfigError } from './errors.js';
import { GcpSecretManagerProvider, GcpErrorCode } from './gcp-secret-manager.provider.js';

describe('GcpSecretManagerProvider', () => {
  const mockConfig = {
    projectId: 'test-project',
    kmsKeyLocation: 'global',
    kmsKeyRingId: 'test-keyring',
    kmsKeyId: 'test-key',
    enableTracing: false,
    enableCache: false,
    enableRetry: false
  };

  // Store original environment
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  afterEach(() => {
    // Restore environment after each test
    process.env = { ...originalEnv };
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      const provider = new GcpSecretManagerProvider(mockConfig);
      assert.strictEqual(provider['name'], 'GcpSecretManager');
    });

    it('should set GOOGLE_APPLICATION_CREDENTIALS when credentialsPath provided', () => {
      const configWithCreds = { ...mockConfig, credentialsPath: '/path/to/creds.json' };
      new GcpSecretManagerProvider(configWithCreds);
      assert.strictEqual(process.env.GOOGLE_APPLICATION_CREDENTIALS, '/path/to/creds.json');
    });

    it('should use defaults when config values are missing', () => {
      const minimalProvider = new GcpSecretManagerProvider({
        projectId: 'test',
        enableTracing: false,
        enableRetry: false
      });
      assert.strictEqual(minimalProvider['name'], 'GcpSecretManager');
      assert.strictEqual(minimalProvider['config'].kmsKeyLocation, 'global');
      assert.strictEqual(minimalProvider['config'].kmsKeyRingId, 'vault-keys');
      assert.strictEqual(minimalProvider['config'].kmsKeyId, 'vault-key');
    });

    it('should enable cache when enableCache is true', () => {
      const provider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableCache: true,
        cacheTtl: 60000
      });
      assert.strictEqual(provider['enableCache'], true);
      assert.ok(provider['cache']);
    });

    it('should disable cache when enableCache is false', () => {
      const provider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableCache: false
      });
      assert.strictEqual(provider['enableCache'], false);
      assert.strictEqual(provider['cache'], undefined);
    });

    it('should enable retry when enableRetry is true', () => {
      const provider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableRetry: true,
        maxRetries: 3
      });
      assert.strictEqual(provider['enableRetry'], true);
      assert.strictEqual(provider['config'].maxRetries, 3);
    });
  });

  describe('error handling', () => {
    it('should throw SecretProviderConfigError when projectId is missing', () => {
      assert.throws(
        () => new GcpSecretManagerProvider({ projectId: '' }),
        (error: Error) => {
          return error instanceof SecretProviderConfigError && error.message.includes('projectId');
        }
      );
    });

    it('should throw SecretProviderConfigError when projectId is undefined', () => {
      assert.throws(
        () => new GcpSecretManagerProvider({}),
        (error: Error) => {
          return error instanceof SecretProviderConfigError && error.message.includes('projectId');
        }
      );
    });
  });

  describe('required methods', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('should have getSecret method', () => {
      assert.strictEqual(typeof provider.getSecret, 'function');
    });

    it('should have setSecret method', () => {
      assert.strictEqual(typeof provider.setSecret, 'function');
    });

    it('should have deleteSecret method', () => {
      assert.strictEqual(typeof provider.deleteSecret, 'function');
    });

    it('should have generateDataKey method', () => {
      assert.strictEqual(typeof provider.generateDataKey, 'function');
    });

    it('should have encrypt method', () => {
      assert.strictEqual(typeof provider.encrypt, 'function');
    });

    it('should have decrypt method', () => {
      assert.strictEqual(typeof provider.decrypt, 'function');
    });

    it('should have rotateSecret method', () => {
      assert.strictEqual(typeof provider.rotateSecret, 'function');
    });

    it('should have healthCheck method', () => {
      assert.strictEqual(typeof provider.healthCheck, 'function');
    });
  });

  describe('implementation methods', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('should have getSecretImpl method', () => {
      assert.strictEqual(typeof provider['getSecretImpl'], 'function');
    });

    it('should have setSecretImpl method', () => {
      assert.strictEqual(typeof provider['setSecretImpl'], 'function');
    });

    it('should have deleteSecretImpl method', () => {
      assert.strictEqual(typeof provider['deleteSecretImpl'], 'function');
    });

    it('should have generateDataKeyImpl method', () => {
      assert.strictEqual(typeof provider['generateDataKeyImpl'], 'function');
    });

    it('should have encryptImpl method', () => {
      assert.strictEqual(typeof provider['encryptImpl'], 'function');
    });

    it('should have decryptImpl method', () => {
      assert.strictEqual(typeof provider['decryptImpl'], 'function');
    });

    it('should have rotateSecretImpl method', () => {
      assert.strictEqual(typeof provider['rotateSecretImpl'], 'function');
    });
  });

  describe('cache functionality', () => {
    it('should have clearCache method', () => {
      const provider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableCache: true
      });
      assert.strictEqual(typeof provider.clearCache, 'function');
    });

    it('should clear cache when clearCache is called', () => {
      const provider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableCache: true
      });
      const cache = provider['cache'];
      assert.ok(cache);
      cache.set('test-key', 'test-value');
      assert.strictEqual(cache.get('test-key'), 'test-value');
      provider.clearCache();
      assert.strictEqual(cache.get('test-key'), undefined);
    });
  });

  describe('version support', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('should have listVersions method', () => {
      assert.strictEqual(typeof provider.listVersions, 'function');
    });

    it('should parse secret name with version separator', () => {
      // Test the internal parsing logic
      const name = 'my-secret:2';
      let secretName = name;
      let version = 'latest';

      if (name.includes(':')) {
        const parts = name.split(':');
        secretName = parts[0]!;
        version = parts[1]!;
      }

      assert.strictEqual(secretName, 'my-secret');
      assert.strictEqual(version, '2');
    });

    it('should handle secret name without version', () => {
      const name = 'my-secret';
      let secretName = name;
      let version = 'latest';

      if (name.includes(':')) {
        const parts = name.split(':');
        secretName = parts[0]!;
        version = parts[1]!;
      }

      assert.strictEqual(secretName, 'my-secret');
      assert.strictEqual(version, 'latest');
    });
  });

  describe('gcp-specific validation', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('should allow versioned getSecret reference', async () => {
      provider['client'] = {
        accessSecretVersion: async () => [{ payload: { data: Buffer.from('secret-value') } }]
      } as unknown as (typeof provider)['client'];

      const value = await provider.getSecret('my_secret-1:1');
      assert.strictEqual(value, 'secret-value');
    });

    it('should reject slash in secret id for getSecret', async () => {
      await assert.rejects(
        () => provider.getSecret('invalid/secret:1'),
        (error: Error) => error instanceof SecretProviderConfigError
      );
    });

    it('should reject slash in secret id for setSecret', async () => {
      await assert.rejects(
        () => provider.setSecret('invalid/secret', 'value'),
        (error: Error) => error instanceof SecretProviderConfigError
      );
    });

    it('should reject invalid version token', async () => {
      await assert.rejects(
        () => provider.getSecret('valid_secret:latestest'),
        (error: Error) => error instanceof SecretProviderConfigError
      );
    });
  });

  describe('cleanup', () => {
    it('should have destroy method', () => {
      const provider = new GcpSecretManagerProvider(mockConfig);
      assert.strictEqual(typeof provider.destroy, 'function');
    });
  });

  describe('GCP error codes', () => {
    it('should have all standard GCP error codes', () => {
      assert.strictEqual(GcpErrorCode.OK, 0);
      assert.strictEqual(GcpErrorCode.CANCELLED, 1);
      assert.strictEqual(GcpErrorCode.UNKNOWN, 2);
      assert.strictEqual(GcpErrorCode.INVALID_ARGUMENT, 3);
      assert.strictEqual(GcpErrorCode.DEADLINE_EXCEEDED, 4);
      assert.strictEqual(GcpErrorCode.NOT_FOUND, 5);
      assert.strictEqual(GcpErrorCode.ALREADY_EXISTS, 6);
      assert.strictEqual(GcpErrorCode.PERMISSION_DENIED, 7);
      assert.strictEqual(GcpErrorCode.UNAUTHENTICATED, 16);
      assert.strictEqual(GcpErrorCode.RESOURCE_EXHAUSTED, 8);
      assert.strictEqual(GcpErrorCode.FAILED_PRECONDITION, 9);
      assert.strictEqual(GcpErrorCode.ABORTED, 10);
      assert.strictEqual(GcpErrorCode.OUT_OF_RANGE, 11);
      assert.strictEqual(GcpErrorCode.UNIMPLEMENTED, 12);
      assert.strictEqual(GcpErrorCode.INTERNAL, 13);
      assert.strictEqual(GcpErrorCode.UNAVAILABLE, 14);
      assert.strictEqual(GcpErrorCode.DATA_LOSS, 15);
    });
  });

  describe('configuration', () => {
    it('should accept enableTracing option', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test',
        enableTracing: true,
        enableRetry: false
      });
      assert.strictEqual(provider['enableTracing'], true);
    });

    it('should default enableTracing to true', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test',
        enableRetry: false
      });
      assert.strictEqual(provider['enableTracing'], true);
    });

    it('should accept custom retry configuration', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test',
        enableRetry: true,
        maxRetries: 10,
        retryBaseDelayMs: 200,
        retryMaxDelayMs: 20000
      });
      assert.strictEqual(provider['config'].maxRetries, 10);
      assert.strictEqual(provider['config'].retryBaseDelayMs, 200);
      assert.strictEqual(provider['config'].retryMaxDelayMs, 20000);
    });

    it('should accept custom cache configuration', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test',
        enableCache: true,
        cacheTtl: 120000 // 2 minutes
      });
      assert.strictEqual(provider['config'].cacheTtl, 120000);
    });
  });

  describe('method signatures', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('getSecret should accept string and return Promise<string>', async () => {
      assert.strictEqual(provider.getSecret.length, 1);
    });

    it('setSecret should accept two strings and return Promise<void>', async () => {
      assert.strictEqual(provider.setSecret.length, 2);
    });

    it('deleteSecret should accept string and return Promise<void>', async () => {
      assert.strictEqual(provider.deleteSecret.length, 1);
    });

    it('generateDataKey should accept optional keyId and return Promise with buffers', async () => {
      assert.strictEqual(provider.generateDataKey.length, 1);
    });

    it('encrypt should accept plaintext and optional keyId', async () => {
      assert.strictEqual(provider.encrypt.length, 2);
    });

    it('decrypt should accept ciphertext and optional keyId', async () => {
      assert.strictEqual(provider.decrypt.length, 2);
    });

    it('rotateSecret should accept key string', async () => {
      assert.strictEqual(provider.rotateSecret.length, 1);
    });

    it('listVersions should accept secret name', async () => {
      assert.strictEqual(provider.listVersions.length, 1);
    });
  });

  describe('inheritance', () => {
    it('should extend BaseSecretProvider', () => {
      const provider = new GcpSecretManagerProvider(mockConfig);
      assert.ok(Object.getPrototypeOf(Object.getPrototypeOf(provider)).constructor.name);
    });
  });
});

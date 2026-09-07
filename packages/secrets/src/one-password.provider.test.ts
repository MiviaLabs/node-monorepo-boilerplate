/**
 * Tests for OnePasswordProvider
 */

import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { OnePasswordProvider } from './one-password.provider.js';
import { SecretProviderConfigError } from './errors.js';

describe('OnePasswordProvider', () => {
  const mockToken = 'op_test_token_123';
  const mockVaultId = 'test-vault-id';
  const mockItemName = 'Test Secrets';
  const createdProviders: OnePasswordProvider[] = [];

  // Store original environment
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env['OP_SERVICE_ACCOUNT_TOKEN'] = '';
    process.env['OP_VAULT_ID'] = '';
    process.env['OP_ITEM_NAME'] = '';
  });

  afterEach(async () => {
    await Promise.all(createdProviders.splice(0).map((provider) => provider.destroy()));

    // Restore environment after each test
    process.env = { ...originalEnv };
  });

  function createProvider(config: ConstructorParameters<typeof OnePasswordProvider>[0]) {
    const provider = new OnePasswordProvider(config);
    createdProviders.push(provider);
    return provider;
  }

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      const provider = createProvider({
        token: mockToken,
        vaultId: mockVaultId,
        itemName: mockItemName
      });

      assert.strictEqual(provider['token'], mockToken);
      assert.strictEqual(provider['vaultId'], mockVaultId);
      assert.strictEqual(provider['itemName'], mockItemName);
    });

    it('should throw error when token is missing', () => {
      assert.throws(() => new OnePasswordProvider({ token: '' }), {
        message: 'OP_SERVICE_ACCOUNT_TOKEN is required for 1Password provider'
      });
    });

    it('should use default vaultId when not provided', () => {
      const provider = createProvider({
        token: mockToken
      });

      assert.strictEqual(provider['vaultId'], 'runtime-secrets');
    });

    it('should use default itemName when not provided', () => {
      const provider = createProvider({
        token: mockToken
      });

      assert.strictEqual(provider['itemName'], 'Runtime Secrets');
    });

    it('should use environment variables when options not provided', () => {
      process.env['OP_SERVICE_ACCOUNT_TOKEN'] = mockToken;
      process.env['OP_VAULT_ID'] = mockVaultId;
      process.env['OP_ITEM_NAME'] = mockItemName;

      const provider = createProvider({});

      assert.strictEqual(provider['token'], mockToken);
      assert.strictEqual(provider['vaultId'], mockVaultId);
      assert.strictEqual(provider['itemName'], mockItemName);
    });

    it('should prioritize options over environment variables', () => {
      process.env['OP_SERVICE_ACCOUNT_TOKEN'] = 'env_token';
      process.env['OP_VAULT_ID'] = 'env_vault';
      process.env['OP_ITEM_NAME'] = 'env_item';

      const provider = createProvider({
        token: mockToken,
        vaultId: mockVaultId,
        itemName: mockItemName
      });

      assert.strictEqual(provider['token'], mockToken);
      assert.strictEqual(provider['vaultId'], mockVaultId);
      assert.strictEqual(provider['itemName'], mockItemName);
    });

    it('should trim token value before storing config', () => {
      const provider = createProvider({
        token: `  ${mockToken}\n`
      });

      assert.strictEqual(provider['token'], mockToken);
      assert.strictEqual(provider['config'].token, mockToken);
    });
  });

  describe('unsupported operations', () => {
    let provider: OnePasswordProvider;

    beforeEach(() => {
      provider = createProvider({
        token: mockToken,
        vaultId: mockVaultId,
        itemName: mockItemName
      });
    });

    it('should throw error for deleteSecret operation', async () => {
      await assert.rejects(() => provider.deleteSecret('test-key'), {
        message: /Secret deletion not supported via 1Password CLI/
      });
    });

    it('should throw error for generateDataKey operation', async () => {
      await assert.rejects(() => provider.generateDataKey('key-id'), {
        message: /Data key generation not supported/
      });
    });

    it('should throw error for encrypt operation', async () => {
      await assert.rejects(() => provider.encrypt('plaintext'), {
        message: /Encryption not supported/
      });
    });

    it('should throw error for decrypt operation', async () => {
      await assert.rejects(() => provider.decrypt('ciphertext'), {
        message: /Decryption not supported/
      });
    });

    it('should throw error for rotateSecret operation', async () => {
      await assert.rejects(() => provider.rotateSecret('test-key'), {
        message: /Secret rotation not supported via 1Password CLI/
      });
    });
  });

  describe('command injection prevention', () => {
    it('should reject vaultId containing shell metacharacters at construction', () => {
      // vaultId is interpolated unescaped into shell commands. Allowing it
      // to contain `"`, `;`, backticks, etc. enables arbitrary command
      // execution. The provider must reject such values at construction.
      const maliciousVaultId = 'vault"; touch /tmp/secrets-pwn; #';
      assert.throws(
        () =>
          createProvider({
            token: mockToken,
            vaultId: maliciousVaultId,
            itemName: mockItemName
          }),
        SecretProviderConfigError
      );
    });

    it('should reject itemName containing shell metacharacters at construction', () => {
      const maliciousItemName = 'Item"; touch /tmp/secrets-pwn; #';
      assert.throws(
        () =>
          createProvider({
            token: mockToken,
            vaultId: mockVaultId,
            itemName: maliciousItemName
          }),
        SecretProviderConfigError
      );
    });

    it('should reject fieldName containing shell metacharacters at construction', () => {
      const maliciousFieldName = 'notes"; touch /tmp/secrets-pwn; #';
      assert.throws(
        () =>
          createProvider({
            token: mockToken,
            vaultId: mockVaultId,
            itemName: mockItemName,
            fieldName: maliciousFieldName
          }),
        SecretProviderConfigError
      );
    });

    it('should reject malicious vaultId read from OP_VAULT_ID env var at construction', () => {
      process.env['OP_VAULT_ID'] = 'vault"; touch /tmp/secrets-pwn; #';
      assert.throws(() => createProvider({ token: mockToken }), SecretProviderConfigError);
    });
  });

  describe('cache', () => {
    let provider: OnePasswordProvider;

    beforeEach(() => {
      provider = createProvider({
        token: mockToken,
        vaultId: mockVaultId,
        itemName: mockItemName
      });
    });

    it('should have clearCache method', () => {
      assert.strictEqual(typeof provider.clearCache, 'function');
    });

    it('should clear all cached values', () => {
      // Manually set some cache entries
      provider['cache'].set('key1', { value: 'value1', expiry: Date.now() + 10000 });
      provider['cache'].set('key2', { value: 'value2', expiry: Date.now() + 10000 });

      assert.strictEqual(provider['cache'].size, 2);

      provider.clearCache();

      assert.strictEqual(provider['cache'].size, 0);
    });
  });
});

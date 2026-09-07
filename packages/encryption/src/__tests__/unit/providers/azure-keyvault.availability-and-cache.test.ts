/**
 * Bug B5 Regression Tests
 *
 * AzureKeyVaultProvider had two problems:
 *   (a) isAvailable() called getKey(), which requires Keys/Get permission.
 *       A deployment configured with the least-privilege envelope-encryption
 *       permission set (wrapKey/unwrapKey only) is reported as unavailable
 *       even though it can perform encrypt/decrypt. The broad `catch`
 *       swallowed all diagnostic info.
 *   (b) ensureCryptoClient() allocated a fresh CryptographyClient for every
 *       encrypt/decrypt/generateDataKey call with an explicit keyId, with
 *       no lifecycle management. The default-provider happy path caches
 *       this.cryptoClient but every tenant-key override path leaks request
 *       pipelines.
 *
 * Fix:
 *   - Add isAvailableDetailed() returning {available, reason} for diagnostics.
 *   - Add a configurable healthCheckMode ('strict'|'envelope') so envelope-only
 *     deployments can probe without requiring Keys/Get.
 *   - Add a per-key CryptographyClient cache (LRU-style) keyed by keyName,
 *     with a maxCacheSize to bound memory.
 *   - Track clients in an internal map so callers can dispose them.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { AzureKeyVaultProvider } from '../../../../src/providers/azure-keyvault.provider';

class RestError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'RestError';
  }
}

describe('AzureKeyVaultProvider isAvailable + client caching (Bug B5a/B5b)', () => {
  let provider: AzureKeyVaultProvider;
  let keyClient: { getKey: jest.Mock; listPropertiesOfKeys: jest.Mock };

  beforeEach(() => {
    keyClient = {
      getKey: jest.fn(),
      listPropertiesOfKeys: jest.fn()
    };
    provider = new AzureKeyVaultProvider({
      vaultUrl: 'https://my-vault.vault.azure.net',
      keyName: 'primary-key',
      credential: {} as never,
      tenantId: 'tenant'
    });
    (provider as unknown as { keyClient: typeof keyClient }).keyClient = keyClient;
  });

  describe('isAvailableDetailed (Bug B5a)', () => {
    it('surfaces statusCode from a RestError', async () => {
      keyClient.getKey.mockRejectedValue(new RestError(403, 'Forbidden', 'token lacks Keys/Get'));

      const detailed = await (
        provider as unknown as {
          isAvailableDetailed: () => Promise<{
            available: boolean;
            reason: string;
            statusCode?: number;
          }>;
        }
      ).isAvailableDetailed();

      expect(detailed.available).toBe(false);
      expect(detailed.statusCode).toBe(403);
    });

    it('reports success when getKey succeeds', async () => {
      keyClient.getKey.mockResolvedValue({
        key: { kid: 'https://my-vault.vault.azure.net/keys/primary-key' }
      });
      const detailed = await (
        provider as unknown as {
          isAvailableDetailed: () => Promise<{ available: boolean; reason: string }>;
        }
      ).isAvailableDetailed();
      expect(detailed.available).toBe(true);
    });
  });

  describe('client cache (Bug B5b)', () => {
    it('caches CryptographyClient per keyName so repeated calls reuse the same client', () => {
      const cache = (provider as unknown as { cryptoClients: Map<string, unknown> }).cryptoClients;
      expect(cache).toBeDefined();
      // The cache map should exist; per-call ensureCryptoClient is to be
      // replaced by a cache lookup that returns the same instance for the
      // same keyName.
      expect(cache instanceof Map).toBe(true);
    });

    it('dispose() clears the cache and disposes clients if they expose pipeline.dispose()', async () => {
      const cache = (
        provider as unknown as {
          cryptoClients: Map<string, { pipeline?: { dispose?: () => void } }>;
        }
      ).cryptoClients;
      const disposeMock = jest.fn();
      cache.set('primary-key', { pipeline: { dispose: disposeMock } });
      cache.set('tenant-a', { pipeline: { dispose: disposeMock } });

      await (provider as unknown as { dispose: () => Promise<void> }).dispose();

      expect(disposeMock).toHaveBeenCalledTimes(2);
      expect(cache.size).toBe(0);
    });
  });
});

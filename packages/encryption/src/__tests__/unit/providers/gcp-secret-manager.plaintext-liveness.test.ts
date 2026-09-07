/**
 * Bug B6-Regression: GcpSecretManagerProvider.generateDataKey() (SM-only path)
 * returns the SAME plaintext buffer that it just zeroed for secure-cleanup.
 *
 * The provider's SM-only branch calls `plaintext.fill(0)` inside the try/finally
 * that wraps `storeEncryptionKey()`, then returns `plaintext` as part of
 * `IDataKeyResult`. The interface contract says "callers MUST zero after use",
 * meaning the provider should hand back a fresh DEK and let the caller decide
 * when to zero it. Zeroing before return means the caller uses an all-zero DEK
 * for envelope encryption, producing ciphertext encryptable by an attacker who
 * knows the implementation detail (or who simply inspects /proc/<pid>/mem).
 *
 * The contract is:
 *   plaintext = CSPRNG-derived, must be live until caller zeroes.
 *
 * Buggy behavior:
 *   result.plaintext is all zeros (caller-observable)
 *
 * Expected behavior:
 *   result.plaintext is a fresh random buffer (not all zeros)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock GCP clients at the module boundary so the provider constructor works
// without real credentials and storeEncryptionKey() can capture the DEK.
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class MockSecretManagerServiceClient {
    secretPath(project: string, secretId: string) {
      return `projects/${project}/secrets/${secretId}`;
    }
    accessSecretVersion = jest.fn();
    createSecret = jest.fn();
    addSecretVersion = jest.fn();
    getSecret = jest.fn();
  }
}));

jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: class MockKeyManagementServiceClient {
    cryptoKeyPath(project: string, location: string, keyRing: string, key: string) {
      return `projects/${project}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${key}`;
    }
    keyRingPath(project: string, location: string, keyRing: string) {
      return `projects/${project}/locations/${location}/keyRings/${keyRing}`;
    }
    encrypt = jest.fn();
    decrypt = jest.fn();
    getCryptoKey = jest.fn();
    getKeyRing = jest.fn();
  }
}));

import { GcpSecretManagerProvider } from '../../../../src/providers/gcp-secret-manager.provider';

describe('GcpSecretManagerProvider.generateDataKey plaintext liveness (Bug B6 fix)', () => {
  let provider: GcpSecretManagerProvider;

  beforeEach(() => {
    provider = new GcpSecretManagerProvider({
      projectId: 'my-project',
      secretPrefix: 'encryption-keys-',
      credentialsFile: '/dev/null'
    });
    // Make Secret Manager round-trip succeed so generateDataKey's SM branch
    // runs to completion.
    const secretClient = (
      provider as unknown as {
        secretClient: {
          createSecret: jest.Mock;
          getSecret: jest.Mock;
          addSecretVersion: jest.Mock;
        };
      }
    ).secretClient;
    secretClient.createSecret = jest.fn(async () => [{}]);
    secretClient.getSecret = jest.fn(async () => [
      { name: 'projects/my-project/secrets/encryption-keys-tenant-key' }
    ]);
    secretClient.addSecretVersion = jest.fn(async () => [{}]);
  });

  it('returns a live (non-zero) plaintext DEK in the SM-only path', async () => {
    const result = await provider.generateDataKey('tenant-key');

    // Caller expects plaintext to be a fresh random 32-byte DEK. If the provider
    // zeroed it before return, the caller encrypts all subsequent data with an
    // all-zero key — a catastrophic plaintext-equivalent bug.
    expect(result.plaintext).toBeDefined();
    expect(result.plaintext.length).toBe(32);
    expect(result.plaintext.every((b) => b === 0)).toBe(false);
  });

  it('produces different plaintext DEKs across calls (entropy check)', async () => {
    const result1 = await provider.generateDataKey('tenant-key-1');
    const result2 = await provider.generateDataKey('tenant-key-2');

    expect(result1.plaintext.equals(result2.plaintext)).toBe(false);
  });
});

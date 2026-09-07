/**
 * Bug B6 Regression Tests
 *
 * GcpSecretManagerProvider.rotateKey() generated a fresh 32-byte AES key
 * via randomBytes(32) and uploaded it to Secret Manager without zeroing
 * the buffer. The plaintext buffer lingers in Node.js heap until GC.
 *
 * The SM-only path in generateDataKey() has the same bug: randomBytes(32)
 * is uploaded via storeEncryptionKey() and never zeroed.
 *
 * Both routes violate the interface contract that says "Zero plaintext DEK
 * after use" (kms-provider.interface.ts:109-114).
 *
 * Fix: defensively zero the plaintext buffer in a finally block after the
 * upload completes.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock GCP clients at the module boundary so the provider constructor
// and helper methods (secretPath etc.) work without real credentials.
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

describe('GcpSecretManagerProvider zero-plaintext hygiene (Bug B6)', () => {
  let provider: GcpSecretManagerProvider;

  beforeEach(() => {
    // Provide credentialsFile to avoid GoogleAuth attempting real auth.
    provider = new GcpSecretManagerProvider({
      projectId: 'my-project',
      secretPrefix: 'encryption-keys-',
      credentialsFile: '/dev/null'
    });
  });

  it('rotateKey: zeros the generated plaintext buffer after upload', async () => {
    let capturedBuffer: Buffer | undefined;
    const secretClient = (
      provider as unknown as {
        secretClient: {
          addSecretVersion: jest.Mock;
          createSecret: jest.Mock;
          getSecret: jest.Mock;
        };
      }
    ).secretClient;
    secretClient.createSecret = jest.fn(async () => [{}]);
    secretClient.getSecret = jest.fn(async () => [
      { name: 'projects/my-project/secrets/encryption-keys-tenant-key' }
    ]);
    secretClient.addSecretVersion = jest.fn(async (req: { payload?: { data?: Buffer } }) => {
      capturedBuffer = req.payload?.data;
      return [{}];
    });

    await provider.rotateKey('tenant-key');

    expect(capturedBuffer).toBeDefined();
    expect(capturedBuffer!.every((b) => b === 0)).toBe(true);
  });

  it('generateDataKey (SM-only path, no KMS configured): zeros the upload buffer after storeEncryptionKey', async () => {
    // With no kmsConfig, this.kmsClient is undefined and generateDataKey
    // falls into the SM-only branch at L511.
    let capturedBuffer: Buffer | undefined;
    const secretClient = (
      provider as unknown as {
        secretClient: {
          addSecretVersion: jest.Mock;
          createSecret: jest.Mock;
          getSecret: jest.Mock;
        };
      }
    ).secretClient;
    secretClient.createSecret = jest.fn(async () => [{}]);
    secretClient.getSecret = jest.fn(async () => [
      { name: 'projects/my-project/secrets/encryption-keys-tenant-key' }
    ]);
    secretClient.addSecretVersion = jest.fn(async (req: { payload?: { data?: Buffer } }) => {
      capturedBuffer = req.payload?.data;
      return [{}];
    });

    const result = await provider.generateDataKey('tenant-key');

    // The buffer uploaded to Secret Manager (the one we later zero) must be
    // wiped after upload — that's the interface contract for in-memory
    // hygiene. But the buffer we hand back to the caller MUST be the live
    // DEK (not the one we just zeroed); otherwise envelope encryption
    // operates on a fixed all-zero key, a plaintext-equivalent bug.
    expect(capturedBuffer).toBeDefined();
    expect(capturedBuffer!.every((b) => b === 0)).toBe(true);
    // The returned plaintext is a LIVE (non-zero) DEK — the caller uses this
    // to AES-GCM-encrypt the data and is responsible for zeroing it.
    expect(result.plaintext.every((b) => b === 0)).toBe(false);
    // The returned buffer is independent of the upload buffer.
    expect(Buffer.isBuffer(result.plaintext)).toBe(true);
  });
});

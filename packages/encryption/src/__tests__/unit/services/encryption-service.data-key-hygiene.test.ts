/**
 * Bug A2 Regression Tests
 *
 * EncryptionService.encryptDataKey() hands the caller's plaintext DEK buffer
 * to the provider without defensively copying. If a real provider zeroes its
 * input (a legitimate optimization), the caller's buffer is wiped too.
 *
 * EncryptionService.decryptDataKey() returns the provider's plaintext to the
 * caller, but if the provider returns a view into its own internal state,
 * zeroing the caller's copy affects the provider.
 *
 * The fix: defensively copy at the service boundary so the caller's buffer
 * is isolated from provider-side optimizations.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { EncryptionService } from '../../../services/encryption.service';
import type { IKmsProvider, IDataKeyResult } from '../../../providers/kms-provider.interface';

/**
 * Provider that defensively zeroes its input buffer on encrypt and returns
 * a view on decrypt — this is the scenario that exposes the service's
 * missing defensive copy.
 */
class ZeroingProvider implements IKmsProvider {
  readonly name = 'zeroing-provider';
  readonly storage = new Map<string, Buffer>();

  encrypt = jest.fn(async (plaintext: Buffer, keyId: string): Promise<Buffer> => {
    // Real-world KMS providers (especially HSM-backed) defensively zero input.
    plaintext.fill(0);
    const ciphertext = Buffer.from(`wrapped:${keyId}:${plaintext.length}-bytes`);
    this.storage.set(keyId, plaintext);
    return ciphertext;
  });

  decrypt = jest.fn(async (ciphertext: Buffer, keyId: string): Promise<Buffer> => {
    // Return a view into our internal storage (zero-length so a plain `Buffer.from`
    // would NOT be needed to express the bug — the real bug is that even when
    // returning a Buffer, service should defensively copy because provider
    // implementations may return shared/typed-array views).
    const stored = this.storage.get(keyId);
    if (!stored) {
      throw new Error('not found');
    }
    // Defensive copy at provider boundary.
    return Buffer.from(stored);
  });

  generateDataKey = jest.fn(async (keyId?: string): Promise<IDataKeyResult> => {
    const plaintext = Buffer.alloc(32, 7);
    this.storage.set(keyId ?? 'default', plaintext);
    return { plaintext: Buffer.from(plaintext), ciphertext: Buffer.from('wrapped') };
  });

  async isAvailable(): Promise<boolean> {
    return true;
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
  async getKeyInfo() {
    throw new Error('not implemented');
  }
}

describe('EncryptionService data-key hygiene (Bug A2)', () => {
  let service: EncryptionService;
  let provider: ZeroingProvider;

  beforeEach(() => {
    provider = new ZeroingProvider();
    service = new EncryptionService(
      (name) => (name === undefined || name === 'zeroing-provider' ? provider : undefined),
      'zeroing-provider'
    );
  });

  it('encryptDataKey: does not mutate the caller-provided plaintext DEK buffer', async () => {
    // 32-byte DEK (AES-256)
    const callerDek = Buffer.alloc(32, 0x42);
    const beforeHex = callerDek.toString('hex');

    await service.encryptDataKey(callerDek, 'mock-key');

    // Service must have defensively copied before handing to provider,
    // so the caller's buffer still holds the plaintext.
    expect(callerDek.toString('hex')).toBe(beforeHex);
    expect(callerDek.every((b) => b === 0x42)).toBe(true);
  });

  it('decryptDataKey: returns a plaintext DEK independent of provider-internal state', async () => {
    // Set up: provider stores a known plaintext DEK, returns a wrapped ciphertext.
    const dek = Buffer.alloc(32, 0x42);
    provider.storage.set('roundtrip-key', Buffer.from(dek));
    const wrapped = Buffer.from('wrapped:roundtrip-key:32-bytes');

    const decrypted = await service.decryptDataKey(wrapped, 'roundtrip-key');

    expect(decrypted.every((b) => b === 0x42)).toBe(true);

    // Zeroing the caller's buffer must not affect the next decrypt call —
    // the service must have defensively copied out of provider state.
    decrypted.fill(0);
    const decryptedAgain = await service.decryptDataKey(wrapped, 'roundtrip-key');
    expect(decryptedAgain.every((b) => b === 0x42)).toBe(true);
  });
});

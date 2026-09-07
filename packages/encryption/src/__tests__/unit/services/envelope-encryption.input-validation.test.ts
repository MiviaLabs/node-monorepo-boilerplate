/**
 * Bug A1 Regression Tests
 *
 * EnvelopeEncryptionService.encrypt() accepts plaintext typed as Buffer | string,
 * but at runtime Node's Buffer.from() rejects null/number/object with a raw
 * TypeError that bypasses the structured EncryptionError contract. These tests
 * verify the service rejects invalid inputs with a sanitized EncryptionError
 * before any crypto work happens.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import { EncryptionError } from '../../../errors';
import { EnvelopeEncryptionService } from '../../../services/envelope-encryption.service';

describe('EnvelopeEncryptionService.encrypt input validation (Bug A1)', () => {
  let service: EnvelopeEncryptionService;

  beforeEach(() => {
    const mockKms = createMockKmsProvider({ name: 'mock-kms' });
    service = new EnvelopeEncryptionService(mockKms);
  });

  it('rejects null plaintext with a structured EncryptionError', async () => {
    await expect(
      (service as unknown as { encrypt: (x: unknown) => Promise<unknown> }).encrypt(null)
    ).rejects.toThrow(EncryptionError);
  });

  it('rejects number plaintext with a structured EncryptionError', async () => {
    await expect(
      (service as unknown as { encrypt: (x: unknown) => Promise<unknown> }).encrypt(123)
    ).rejects.toThrow(EncryptionError);
  });

  it('rejects object plaintext with a structured EncryptionError', async () => {
    await expect(
      (service as unknown as { encrypt: (x: unknown) => Promise<unknown> }).encrypt({ a: 1 })
    ).rejects.toThrow(EncryptionError);
  });

  it('rejects undefined plaintext with a structured EncryptionError', async () => {
    await expect(
      (service as unknown as { encrypt: (x: unknown) => Promise<unknown> }).encrypt(undefined)
    ).rejects.toThrow(EncryptionError);
  });

  it('does NOT leak raw Node TypeError text in the thrown error message', async () => {
    try {
      await (service as unknown as { encrypt: (x: unknown) => Promise<unknown> }).encrypt(null);
      throw new Error('should not reach here');
    } catch (err) {
      expect(err).toBeInstanceOf(EncryptionError);
      expect((err as Error).message).not.toMatch(
        /Received (null|type number|an instance of Object)/
      );
    }
  });

  it('still accepts valid string and Buffer inputs', async () => {
    const fromString = await service.encrypt('hello');
    expect(fromString.ciphertext).toBeDefined();
    const fromBuffer = await service.encrypt(Buffer.from('hello'));
    expect(fromBuffer.ciphertext).toBeDefined();
  });
});

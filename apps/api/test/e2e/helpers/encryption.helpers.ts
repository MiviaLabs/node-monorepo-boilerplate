/**
 * Encryption helpers for E2E tests
 *
 * Shared utilities for validating and decrypting PII envelope format.
 */

import type { EncryptionService } from '@package/encryption';

/**
 * Number of parts in a valid encryption envelope
 * Format: ciphertext:encryptedDataKey:iv:authTag
 */
const ENVELOPE_PARTS_COUNT = 4;

/**
 * Validates that a value is in the encryption envelope format.
 *
 * The envelope format is: ciphertext:encryptedDataKey:iv:authTag
 * All four parts must be non-empty strings.
 *
 * @param value - The value to validate
 * @returns True if the value is a valid envelope format
 */
export function isEnvelope(value: string | null): value is string {
  if (!value) {
    return false;
  }

  const segments = value.split(':');
  return (
    segments.length === ENVELOPE_PARTS_COUNT && segments.every((segment) => segment.length > 0)
  );
}

/**
 * Decrypts a value in the encryption envelope format.
 *
 * @param encryptionService - The encryption service instance
 * @param envelope - The encrypted envelope string
 * @returns The decrypted plaintext value
 * @throws Error if the envelope format is invalid
 */
export async function decryptEnvelope(
  encryptionService: EncryptionService,
  envelope: string
): Promise<string> {
  const [ciphertext, encryptedDataKey, iv, authTag] = envelope.split(':');
  if (!ciphertext || !encryptedDataKey || !iv || !authTag) {
    throw new Error('Invalid envelope format: expected ciphertext:encryptedDataKey:iv:authTag');
  }

  return encryptionService.decryptFromBase64(ciphertext, encryptedDataKey, iv, authTag);
}

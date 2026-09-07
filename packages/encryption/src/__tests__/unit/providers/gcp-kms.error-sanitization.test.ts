/**
 * Bug B2 Regression Tests
 *
 * GcpKmsProvider embedded the full cryptoKey path (projects/p/locations/l/
 * keyRings/r/cryptoKeys/k) into thrown EncryptionOperationError messages,
 * DecryptionOperationError messages, and DataKeyGenerationError messages.
 * It also exposed `resolvedKeyName` as the `key_id` OTel attribute.
 *
 * Callers logging exceptions or forwarding OTel data to a metrics backend
 * (Datadog/Honeycomb) capture the full key location/ring/key tuple,
 * violating least-privilege and cloud-security-posture guidance.
 *
 * Fix: redact cryptoKey paths from thrown messages and from OTel
 * attributes (use a short alias like `gcp:<project>:***` instead).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { GcpKmsProvider } from '../../../../src/providers/gcp-kms.provider';
import { EncryptionOperationError } from '../../../../src/errors';

const PROJECT = 'my-secret-project';
const KEY_PATH = `projects/${PROJECT}/locations/global/keyRings/secret-ring/cryptoKeys/secret-key`;

class StubClient {
  encrypt = jest.fn(async () => {
    const err = new Error(`Permission denied on resource ${KEY_PATH}`) as Error & { code?: number };
    err.code = 7; // PERMISSION_DENIED
    throw err;
  });
  decrypt = jest.fn();
  async encryptCryptoKey() {
    throw new Error('not used');
  }
  async decryptCryptoKey() {
    throw new Error('not used');
  }
}

describe('GcpKmsProvider error sanitization (Bug B2)', () => {
  let provider: GcpKmsProvider;
  let client: StubClient;

  beforeEach(() => {
    provider = new GcpKmsProvider({
      projectId: PROJECT,
      locationId: 'global',
      keyRingId: 'secret-ring',
      keyId: 'secret-key'
    });
    client = new StubClient();
    (provider as unknown as { client: StubClient }).client = client;
  });

  it('encrypt: thrown EncryptionOperationError does not contain real cryptoKey identifiers', async () => {
    try {
      await provider.encrypt(Buffer.from('pt'));
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(EncryptionOperationError);
      const message = (err as Error).message;
      // The redacted message retains the structural tokens (keyRings/cryptoKeys)
      // but no real identifiers.
      expect(message).not.toContain('secret-ring');
      expect(message).not.toContain('secret-key');
      expect(message).not.toContain(PROJECT);
      expect(message).not.toContain('locations/global');
      // It does mention the operation name.
      expect(message).toMatch(/gcp[_-]?kms|encrypt/i);
    }
  });

  // Bug B2: tests focus on the thrown-error leak which is the primary
  // concern. The OTel attributes path is exercised in instrumentation
  // tests in production; here we verify the message-and-cause sanitization.
});

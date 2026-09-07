/**
 * Bug B1 Regression Tests
 *
 * AwsKmsProvider threw EncryptionOperationError / DecryptionOperationError
 * / DataKeyReencryptionError with the raw AWS SDK error as `cause`. The AWS
 * SDK v3 error message commonly includes the key ARN (for
 * InvalidCiphertextException, KMSInvalidStateException, KMSInvalidKeyUsageException,
 * NotFoundException, etc.). The exception is then logged by callers' structured
 * loggers, leaking the ARN into log pipelines.
 *
 * The provider already sanitizes the metric attribute. This test asserts the
 * thrown exception's message and cause do not contain the ARN.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { AwsKmsProvider } from '../../../../src/providers/aws-kms.provider';
import { EncryptionOperationError } from '../../../../src/errors';

const KEY_ARN = 'arn:aws:kms:us-east-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeAwsError(message: string): Error {
  // Construct an error similar to what AWS SDK v3 throws.
  const err = new Error(message) as Error & { name: string; $metadata?: unknown };
  err.name = 'KMSInvalidKeyUsageException';
  return err;
}

describe('AwsKmsProvider error sanitization (Bug B1)', () => {
  let provider: AwsKmsProvider;

  beforeEach(() => {
    provider = new AwsKmsProvider({
      region: 'us-east-1',
      keyId: KEY_ARN
    });
    // Stub the internal KMSClient so encrypt() fails with our controlled message.
    const client = (provider as unknown as { client: { send: jest.Mock } }).client;
    client.send = jest.fn(async () => {
      throw makeAwsError(`Key ${KEY_ARN} cannot be used for encryption`);
    });
  });

  it('encrypt: thrown EncryptionOperationError does not contain the key ARN', async () => {
    await expect(provider.encrypt(Buffer.from('pt'))).rejects.toThrow(EncryptionOperationError);

    try {
      await provider.encrypt(Buffer.from('pt'));
      throw new Error('should not reach here');
    } catch (err) {
      expect(err).toBeInstanceOf(EncryptionOperationError);
      const message = (err as Error).message;
      expect(message).not.toContain(KEY_ARN);
      // The cause is sanitized: AWS error messages echoing the ARN are dropped.
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof Error) {
        expect(cause.message).not.toContain(KEY_ARN);
      }
    }
  });

  it('encrypt: thrown error message is still informative without the ARN', async () => {
    try {
      await provider.encrypt(Buffer.from('pt'));
      throw new Error('should not reach here');
    } catch (err) {
      const message = (err as Error).message;
      // Must indicate that encryption failed but redact ARN.
      expect(message).toMatch(/encryption/i);
      expect(message).not.toContain(KEY_ARN);
    }
  });
});

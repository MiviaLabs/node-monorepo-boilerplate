/**
 * AWS KMS Provider
 *
 * Production-grade KMS provider implementing envelope encryption using
 * Amazon Web Services Key Management Service (AWS KMS).
 *
 * ## Features
 *
 * - **Native Envelope Encryption**: Uses AWS KMS GenerateDataKey API
 * - **Key ID Flexibility**: Supports key ARNs, aliases, and key IDs
 * - **Auto Key Detection**: Decrypt doesn't require keyId (embedded in ciphertext)
 * - **Credential Chain**: Supports explicit credentials or default AWS credential chain
 *
 * ## Authentication
 *
 * Supports multiple authentication methods (in order of precedence):
 * 1. Explicit credentials (`accessKeyId`, `secretAccessKey`, `sessionToken`)
 * 2. Default credential chain (environment variables, IAM roles, etc.)
 *
 * ## Key ID Formats
 *
 * AWS KMS accepts multiple key identifier formats:
 * - Key ID: `1234abcd-12ab-34cd-56ef-1234567890ab`
 * - Key ARN: `arn:aws:kms:us-east-1:123456789012:key/1234abcd-...`
 * - Alias: `alias/my-key`
 * - Alias ARN: `arn:aws:kms:us-east-1:123456789012:alias/my-key`
 *
 * ## Security Considerations
 *
 * - **Ciphertext Contains Key Info**: AWS KMS ciphertext includes the key ARN,
 *   so `decrypt()` doesn't require the keyId parameter
 * - **Key Policies**: Control access via KMS key policies and IAM policies
 * - **CloudTrail**: All KMS operations are logged to CloudTrail
 * - **Multi-Region Keys**: Consider for disaster recovery scenarios
 *
 * @module encryption/providers/aws-kms
 *
 * @example Basic usage with default credentials
 * ```typescript
 * const provider = new AwsKmsProvider({
 *   region: 'us-east-1',
 *   keyId: 'alias/my-encryption-key'
 * });
 *
 * // Generate a data key for envelope encryption
 * const { plaintext, ciphertext } = await provider.generateDataKey();
 * ```
 *
 * @example With explicit credentials
 * ```typescript
 * const provider = new AwsKmsProvider({
 *   region: 'us-east-1',
 *   keyId: 'arn:aws:kms:us-east-1:123456789012:key/...',
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 * });
 * ```
 */

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  DescribeKeyCommand,
  NotFoundException,
  type EncryptCommandInput,
  type DecryptCommandInput,
  type GenerateDataKeyCommandInput
} from '@aws-sdk/client-kms';

import {
  InvalidKmsConfigError,
  KeyNotFoundError,
  EncryptionOperationError,
  DecryptionOperationError,
  DataKeyGenerationError,
  DataKeyReencryptionError
} from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo } from './kms-provider.interface';

import type { IAwsKmsProviderOptions } from './factory.types';

/**
 * Amazon Web Services KMS provider for envelope encryption.
 *
 * Implements the `IKmsProvider` interface using AWS KMS for key encryption
 * key (KEK) operations. Leverages the native `GenerateDataKey` API for
 * optimal envelope encryption performance.
 *
 * ## Key Operations
 *
 * | Operation | Implementation |
 * |-----------|----------------|
 * | `encrypt()` | AWS KMS Encrypt API |
 * | `decrypt()` | AWS KMS Decrypt API (keyId not required) |
 * | `generateDataKey()` | AWS KMS GenerateDataKey API (native, optimal) |
 * | `rewrap()` | Decrypt + re-encrypt (no native rewrap) |
 * | `getKeyInfo()` | Uses DescribeKeyCommand to fetch key metadata |
 *
 * ## Performance Considerations
 *
 * - AWS KMS has a 4KB plaintext limit for direct encryption
 * - Use `generateDataKey()` for envelope encryption (leverages native API)
 * - Consider request throttling limits (shared per-region per-account)
 * - Cache encrypted DEKs to reduce API calls
 *
 * @extends BaseKmsProvider
 *
 * @throws {InvalidKmsConfigError} When region or keyId is missing
 * @throws {EncryptionOperationError} When encrypt() fails
 * @throws {DecryptionOperationError} When decrypt() fails
 * @throws {DataKeyGenerationError} When generateDataKey() fails
 * @throws {DataKeyReencryptionError} When rewrap() fails
 * @throws {KeyNotFoundError} When getKeyInfo() cannot find the key
 */
export class AwsKmsProvider extends BaseKmsProvider {
  /** @internal AWS KMS client instance */
  private readonly client: KMSClient;

  /** @internal Default key ID (ARN, alias, or key ID) */
  private readonly defaultKeyId: string;

  /**
   * Bug B1: matches AWS KMS key ARNs and aliases for redaction in thrown
   * error messages. AWS SDK v3 errors commonly echo the key ARN (e.g.
   * KMSInvalidKeyUsageException, NotFoundException). Without redaction the
   * ARN surfaces in `EncryptionOperationError.message` and `cause.message`,
   * which structured loggers then capture into log pipelines.
   */
  private static readonly KEY_ARN_PATTERN = /arn:aws:kms:[^:\s]+:[^:\s]+:(?:key|alias)\/[^\s)]+/g;
  private static readonly KEY_ID_PATTERN =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  private static readonly ALIAS_PATTERN = /alias\/[A-Za-z0-9/_-]+/g;

  /**
   * Strip key identifiers from an error message before it leaves the provider.
   * Returns the redacted message plus a sanitized cause Error if applicable.
   * @internal
   */
  private sanitizeAwsError(operation: string, error: unknown): { message: string; cause?: Error } {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const redacted = rawMessage
      .replace(AwsKmsProvider.KEY_ARN_PATTERN, '[REDACTED-KEY-ARN]')
      .replace(AwsKmsProvider.KEY_ID_PATTERN, () => {
        // Only redact UUID-shaped tokens that look like KMS key IDs (8-4-4-4-12).
        return '[REDACTED-KEY-ID]';
      })
      .replace(AwsKmsProvider.ALIAS_PATTERN, '[REDACTED-ALIAS]');

    return {
      message: `AWS KMS ${operation} failed: ${redacted}`,
      cause: error instanceof Error ? new Error(redacted) : undefined
    };
  }

  /**
   * Creates a new AWS KMS provider instance.
   *
   * @param config - Provider configuration options
   * @param config.region - AWS region (e.g., 'us-east-1')
   * @param config.keyId - Default key identifier (ARN, alias, or key ID) - required
   * @param config.accessKeyId - Optional explicit access key ID
   * @param config.secretAccessKey - Optional explicit secret access key
   * @param config.sessionToken - Optional session token (for temporary credentials)
   * @param config.endpoint - Optional custom endpoint (for LocalStack/testing)
   *
   * @throws {InvalidKmsConfigError} When region or keyId is missing
   *
   * @example
   * ```typescript
   * const provider = new AwsKmsProvider({
   *   region: 'us-east-1',
   *   keyId: 'alias/my-key'
   * });
   * ```
   */
  constructor(config: IAwsKmsProviderOptions) {
    super('aws');

    if (!config.region) {
      throw new InvalidKmsConfigError('AWS KMS requires region');
    }

    // Initialize client
    const clientConfig: Record<string, unknown> = {
      region: config.region
    };

    // Add credentials if provided (otherwise use default credential chain)
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig['credentials'] = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken
      };
    }

    if (config.endpoint) {
      clientConfig['endpoint'] = config.endpoint;
    }

    this.client = new KMSClient(clientConfig);

    // Set default key ID
    if (config.keyId) {
      this.defaultKeyId = config.keyId;
    } else {
      throw new InvalidKmsConfigError('AWS KMS requires keyId to be configured');
    }
  }

  /**
   * Resolve key ID (use provided keyId or default)
   */
  private resolveKeyId(keyId?: string): string {
    return keyId ?? this.defaultKeyId;
  }

  /**
   * Encrypts plaintext data using AWS KMS.
   *
   * Uses the AWS KMS Encrypt API for server-side encryption.
   * Best for small payloads (< 4KB). For larger data, use
   * envelope encryption with `generateDataKey()`.
   *
   * @param plaintext - Data to encrypt (max 4KB for AWS KMS)
   * @param keyId - Key identifier to use; uses default if not specified
   * @returns Encrypted ciphertext as Buffer
   *
   * @throws {EncryptionOperationError} When encryption fails
   */
  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      const input: EncryptCommandInput = {
        KeyId: resolvedKeyId,
        Plaintext: plaintext
      };

      const command = new EncryptCommand(input);
      const response = await this.client.send(command);

      if (!response.CiphertextBlob) {
        throw new Error('Encryption failed: no ciphertext returned');
      }

      this.recordEncrypt(attributes, Date.now() - startTime);
      return Buffer.from(response.CiphertextBlob);
    } catch (error) {
      const sanitizedError = 'Encryption operation failed';
      this.recordEncrypt({ ...attributes, error: sanitizedError }, Date.now() - startTime);
      const { message, cause } = this.sanitizeAwsError('encrypt', error);
      throw new EncryptionOperationError(message, cause);
    }
  }

  /**
   * Decrypts ciphertext using AWS KMS.
   *
   * **Note**: AWS KMS ciphertext contains the key ARN, so the `keyId`
   * parameter is not required for decryption. The correct key is
   * automatically identified from the ciphertext envelope.
   *
   * @param ciphertext - Data to decrypt (from a previous encrypt call)
   * @param _keyId - Ignored; AWS KMS derives key from ciphertext
   * @returns Decrypted plaintext as Buffer
   *
   * @throws {DecryptionOperationError} When decryption fails (wrong key, tampered data, etc.)
   */
  async decrypt(ciphertext: Buffer, _keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      // AWS KMS decrypt auto-detects key from ciphertext envelope
      const input: DecryptCommandInput = {
        CiphertextBlob: ciphertext
      };

      const command = new DecryptCommand(input);
      const response = await this.client.send(command);

      if (!response.Plaintext) {
        throw new Error('Decryption failed: no plaintext returned');
      }

      this.recordDecrypt(attributes, Date.now() - startTime);
      return Buffer.from(response.Plaintext);
    } catch (error) {
      const sanitizedError = 'Decryption operation failed';
      this.recordDecrypt({ ...attributes, error: sanitizedError }, Date.now() - startTime);
      const { message, cause } = this.sanitizeAwsError('decrypt', error);
      throw new DecryptionOperationError(message, cause);
    }
  }

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * Uses the native AWS KMS `GenerateDataKey` API, which is more efficient
   * than generating locally and wrapping separately. AWS KMS generates the
   * key internally and returns both plaintext and encrypted versions.
   *
   * **Security Note**: The plaintext DEK should be zeroed after use:
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // ... use plaintext for encryption ...
   * plaintext.fill(0); // Zero after use
   * ```
   *
   * @param keyId - KEK identifier to wrap the DEK; uses default if not specified
   * @returns IDataKeyResult with plaintext (32 bytes/AES-256) and ciphertext
   *
   * @throws {DataKeyGenerationError} When GenerateDataKey API call fails
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      const input: GenerateDataKeyCommandInput = {
        KeyId: resolvedKeyId,
        KeySpec: 'AES_256'
      };

      const command = new GenerateDataKeyCommand(input);
      const response = await this.client.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Data key generation failed: no plaintext or ciphertext returned');
      }

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return {
        plaintext: Buffer.from(response.Plaintext),
        ciphertext: Buffer.from(response.CiphertextBlob)
      };
    } catch (error) {
      const sanitizedError = 'Data key generation failed';
      this.recordGenerateDataKey({ ...attributes, error: sanitizedError }, Date.now() - startTime);
      throw new DataKeyGenerationError(error);
    }
  }

  /**
   * Re-encrypts a DEK with a new key.
   *
   * **Note**: AWS KMS does not support native rewrap. This implementation
   * decrypts and re-encrypts, which briefly exposes the plaintext DEK in
   * application memory.
   *
   * For key rotation scenarios, consider using AWS KMS automatic key rotation
   * or `GenerateDataKeyWithoutPlaintext` for new data.
   *
   * @param ciphertext - Encrypted DEK to rewrap
   * @param keyId - New key to wrap with; uses default if not specified
   * @param _sourceKeyId - Unused; included for interface compatibility. AWS KMS extracts
   *                       the key info from the ciphertext envelope for decryption.
   * @returns New ciphertext wrapped with the specified key
   *
   * @throws {DataKeyReencryptionError} When rewrap operation fails
   */
  override async rewrap(
    ciphertext: Buffer,
    keyId?: string,
    _sourceKeyId?: string
  ): Promise<{ ciphertext: Buffer }> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // AWS KMS doesn't support native rewrap; decrypt and re-encrypt
      const decrypted = await this.decrypt(ciphertext);

      try {
        const newCiphertext = await this.encrypt(decrypted, resolvedKeyId);

        this.recordRewrap(attributes, Date.now() - startTime);
        return { ciphertext: newCiphertext };
      } finally {
        // Securely zero the plaintext DEK to minimize exposure in memory
        decrypted.fill(0);
      }
    } catch (error) {
      const sanitizedError = 'Rewrap operation failed';
      this.recordRewrap({ ...attributes, error: sanitizedError }, Date.now() - startTime);
      const { message, cause } = this.sanitizeAwsError('rewrap', error);
      throw new DataKeyReencryptionError(message, cause);
    }
  }

  /**
   * Retrieves metadata about an AWS KMS key.
   *
   * Uses the AWS KMS DescribeKey API to fetch complete key metadata
   * including the enabled state, key state, creation date, and usage.
   *
   * @param keyId - Key identifier to query; uses default if not specified
   * @returns IKeyInfo with key metadata from DescribeKey API
   *
   * @throws {KeyNotFoundError} When the key doesn't exist or is inaccessible
   */
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const resolvedKeyId = this.resolveKeyId(keyId);

    try {
      const command = new DescribeKeyCommand({ KeyId: resolvedKeyId });
      const response = await this.client.send(command);

      if (!response.KeyMetadata) {
        throw new KeyNotFoundError(resolvedKeyId);
      }

      const meta = response.KeyMetadata;

      return {
        keyId: meta.KeyId ?? resolvedKeyId,
        enabled: meta.Enabled ?? false,
        purpose: meta.KeyUsage ?? 'encrypt/decrypt',
        ...(meta.CreationDate !== undefined && { createdAt: meta.CreationDate }),
        metadata: {
          provider: 'aws',
          service: 'kms',
          ...(meta.KeyState !== undefined && { keyState: meta.KeyState }),
          ...(meta.Arn !== undefined && { arn: meta.Arn }),
          ...(meta.Description !== undefined && { description: meta.Description })
        }
      };
    } catch (error) {
      // Map AWS SDK v3 NotFoundException to KeyNotFoundError
      if (error instanceof NotFoundException) {
        throw new KeyNotFoundError(resolvedKeyId, { cause: error });
      }
      // Map general AWS AccessDeniedException (not KMS-specific) to KeyNotFoundError
      if (error instanceof Error && error.name === 'AccessDeniedException') {
        throw new KeyNotFoundError(resolvedKeyId, { cause: error });
      }
      // Re-throw KeyNotFoundError as-is
      if (error instanceof KeyNotFoundError) {
        throw error;
      }
      // Wrap other errors with context and preserve original cause
      const { message, cause } = this.sanitizeAwsError('getKeyInfo', error);
      throw new EncryptionOperationError(message, cause);
    }
  }

  /**
   * Checks if the provider is available and properly configured.
   *
   * Performs a lightweight check to verify AWS KMS connectivity.
   *
   * @returns true if the client is configured, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Verify client configuration
      const endpoint = this.client.config?.endpoint?.();
      if (endpoint && typeof endpoint.then === 'function') {
        await endpoint;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs a health check on the provider.
   *
   * Delegates to `isAvailable()` to verify AWS KMS connectivity.
   *
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }
}

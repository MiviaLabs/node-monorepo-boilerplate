/**
 * GCP Cloud KMS Provider
 *
 * Production-grade KMS provider implementing envelope encryption using
 * Google Cloud Key Management Service (Cloud KMS).
 *
 * ## Features
 *
 * - **Envelope Encryption**: Generates DEKs locally with CSPRNG, wraps with Cloud KMS
 * - **Key Hierarchy**: Supports project/location/keyring/key organization
 * - **Automatic Credentials**: Uses ADC (Application Default Credentials) or explicit keys
 * - **Regional Keys**: Keys are region-specific for compliance and latency
 *
 * ## Authentication
 *
 * Supports multiple authentication methods (in order of precedence):
 * 1. Explicit service account JSON file (`credentialsFile`)
 * 2. Explicit credentials object (`credentials`)
 * 3. Application Default Credentials (ADC) - automatic in GCP environments
 *
 * ## Key Path Format
 *
 * Cloud KMS keys use the following path structure:
 * ```
 * projects/{projectId}/locations/{locationId}/keyRings/{keyRingId}/cryptoKeys/{keyId}
 * ```
 *
 * ## Security Considerations
 *
 * - **HSM Protection**: Use HSM protection level for highest security
 * - **Key Rotation**: Configure automatic rotation in Cloud KMS console
 * - **IAM Permissions**: Requires `roles/cloudkms.cryptoKeyEncrypterDecrypter`
 * - **Audit Logging**: Enable Cloud Audit Logs for key usage tracking
 *
 * @module encryption/providers/gcp-kms
 *
 * @example Basic usage with ADC
 * ```typescript
 * const provider = new GcpKmsProvider({
 *   projectId: 'my-project',
 *   locationId: 'us-east1',
 *   keyRingId: 'my-keyring',
 *   keyId: 'my-encryption-key'
 * });
 *
 * const dataKey = await provider.generateDataKey();
 * // Use dataKey.plaintext for local encryption
 * // Store dataKey.ciphertext with encrypted data
 * ```
 *
 * @example With explicit service account
 * ```typescript
 * const provider = new GcpKmsProvider({
 *   projectId: 'my-project',
 *   locationId: 'us-east1',
 *   keyRingId: 'my-keyring',
 *   keyId: 'my-key',
 *   credentialsFile: '/path/to/service-account.json'
 * });
 * ```
 */

import { randomBytes } from 'crypto';

import { KeyManagementServiceClient } from '@google-cloud/kms';

import {
  DataKeyGenerationError,
  DataKeyReencryptionError,
  DecryptionOperationError,
  EncryptionOperationError,
  InvalidKmsConfigError,
  KeyNotFoundError
} from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo } from './kms-provider.interface';

import type { IGcpKmsProviderOptions } from './factory.types';

/**
 * GCP API gRPC status codes.
 * @see https://cloud.google.com/kms/docs/reference/rest/v1/Status
 * @internal
 */
const GCP_NOT_FOUND_CODE = 5;

/**
 * Google Cloud KMS provider for envelope encryption.
 *
 * Implements the `IKmsProvider` interface using Google Cloud KMS for
 * key encryption key (KEK) operations. Data encryption keys (DEKs) are
 * generated locally using Node.js CSPRNG and wrapped by Cloud KMS.
 *
 * ## Key Operations
 *
 * | Operation | Implementation |
 * |-----------|----------------|
 * | `encrypt()` | Direct Cloud KMS encryption (for small data) |
 * | `decrypt()` | Direct Cloud KMS decryption |
 * | `generateDataKey()` | Local CSPRNG + Cloud KMS wrap |
 * | `rewrap()` | Decrypt + re-encrypt (no native rewrap in Cloud KMS) |
 * | `getKeyInfo()` | Cloud KMS getCryptoKey API |
 *
 * ## Performance Considerations
 *
 * - Cloud KMS has a 64KB plaintext limit for direct encryption
 * - Use envelope encryption (`generateDataKey()`) for larger payloads
 * - Consider caching encrypted DEKs to reduce API calls
 * - Regional keys minimize latency for specific regions
 *
 * @extends BaseKmsProvider
 *
 * @throws {InvalidKmsConfigError} When required configuration is missing
 * @throws {KeyNotFoundError} When the specified key doesn't exist
 */
export class GcpKmsProvider extends BaseKmsProvider {
  /** @internal Google Cloud KMS client instance */
  private client: KeyManagementServiceClient;

  /** @internal Provider configuration */
  private config: IGcpKmsProviderOptions;

  /** @internal Full resource path to the default encryption key */
  private defaultKeyName: string;

  /**
   * Bug B2: matches GCP cryptoKey resource paths so they can be redacted
   * from thrown error messages. Format:
   *   projects/{projectId}/locations/{locationId}/keyRings/{keyRingId}/cryptoKeys/{keyId}[/cryptoKeyVersions/{version}]
   * Also matches partial paths that appear in GCP error messages (e.g.
   * 'projects/p/locations/l/keyRings/r').
   */
  private static readonly CRYPTO_KEY_PATH_PATTERN =
    /projects\/[^/\s]+(?:\/locations\/[^/\s]+)?(?:\/keyRings\/[^/\s]+)?(?:\/cryptoKeys\/[^/\s]+)?(?:\/cryptoKeyVersions\/\d+)?/g;
  private static readonly KEY_RING_PATTERN = /keyRings\/[^\s/]+/g;
  private static readonly CRYPTO_KEY_PATTERN = /cryptoKeys\/[^\s/]+/g;
  private static readonly LOCATION_PATTERN = /locations\/[^\s/]+/g;
  private static readonly PROJECT_PATTERN = /projects\/[^\s/]+/g;

  /**
   * Replace cryptoKey paths in a message with a stable redacted alias so
   * the error remains informative (operation name + reason) but no longer
   * discloses project/location/keyring/key identifiers.
   * @internal
   */
  private sanitizeGcpMessage(operation: string, message: string): string {
    const redacted = message
      .replace(GcpKmsProvider.PROJECT_PATTERN, 'projects/***')
      .replace(GcpKmsProvider.LOCATION_PATTERN, 'locations/***')
      .replace(GcpKmsProvider.KEY_RING_PATTERN, 'keyRings/***')
      .replace(GcpKmsProvider.CRYPTO_KEY_PATTERN, 'cryptoKeys/***')
      .replace(GcpKmsProvider.CRYPTO_KEY_PATH_PATTERN, (match) => {
        // If the full path matched, replace with a stable alias.
        if (match.includes('cryptoKeys') || match.includes('keyRings')) {
          return 'projects/***/locations/***/keyRings/***/cryptoKeys/***';
        }
        return match;
      });
    return `GCP KMS ${operation}: ${redacted}`;
  }

  /**
   * Sanitize an unknown error into a (message, cause) pair suitable for
   * encryption-package exceptions.
   * @internal
   */
  private sanitizeGcpError(operation: string, error: unknown): { message: string; cause?: Error } {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const redactedMessage = this.sanitizeGcpMessage(operation, rawMessage);
    const cause = error instanceof Error ? new Error(redactedMessage) : undefined;
    return { message: redactedMessage, cause };
  }

  /**
   * Creates a new GCP Cloud KMS provider instance.
   *
   * @param config - Provider configuration options
   * @param config.projectId - GCP project ID containing the key ring
   * @param config.locationId - GCP region (e.g., 'us-east1', 'global')
   * @param config.keyRingId - Key ring name within the project/location
   * @param config.keyId - Optional default key name within the key ring
   * @param config.credentialsFile - Optional path to service account JSON file
   * @param config.credentials - Optional credentials object (alternative to file, can be passed via config resolver)
   * @param config.endpoint - Optional custom API endpoint (for testing/emulators)
   *
   * @throws {InvalidKmsConfigError} When projectId, locationId, or keyRingId is missing
   *
   * @example
   * ```typescript
   * const provider = new GcpKmsProvider({
   *   projectId: 'my-project',
   *   locationId: 'us-east1',
   *   keyRingId: 'my-keyring',
   *   keyId: 'my-key'
   * });
   * ```
   */
  constructor(config: IGcpKmsProviderOptions) {
    super('gcp');

    if (!config.projectId || !config.locationId || !config.keyRingId) {
      throw new InvalidKmsConfigError('GCP KMS requires projectId, locationId, and keyRingId');
    }

    this.config = config;

    // Initialize client with credentials if provided
    const clientOptions: {
      keyFilename?: string;
      credentials?: Record<string, unknown>;
      apiEndpoint?: string;
    } = {};

    if (config.credentialsFile) {
      clientOptions.keyFilename = config.credentialsFile;
    } else if (config.credentials) {
      clientOptions.credentials = config.credentials;
    }

    if (config.endpoint) {
      clientOptions.apiEndpoint = config.endpoint;
    }

    this.client = new KeyManagementServiceClient(clientOptions);

    // Build default key name
    if (config.keyId) {
      this.defaultKeyName = this.buildKeyName(config.keyId);
    } else {
      // No default key - must be specified in each call
      this.defaultKeyName = '';
    }
  }

  /**
   * Build full KMS key name from key ID
   */
  private buildKeyName(keyId: string): string {
    return this.client.cryptoKeyPath(
      this.config.projectId,
      this.config.locationId,
      this.config.keyRingId,
      keyId
    );
  }

  /**
   * Build full KMS key version name from versioned key ID
   *
   * Supports both format styles:
   * - Full versioned path: 'primary-encryption-key/cryptoKeyVersions/5' -> extracts key and version
   * - Just version number: '5' (used with default key) -> uses config.keyId + version
   *
   * @param keyIdOrVersion - Either a versioned path or just a version number
   * @returns Full cryptoKeyVersion path
   */
  private buildKeyVersionName(keyIdOrVersion: string): string {
    // Check if this is a versioned path format (key/cryptoKeyVersions/version)
    if (keyIdOrVersion.includes('/cryptoKeyVersions/')) {
      const parts = keyIdOrVersion.split('/cryptoKeyVersions/');
      const keyId = parts[0];
      const version = parts[1];

      if (!keyId || !version) {
        throw new InvalidKmsConfigError(`Invalid versioned key format: ${keyIdOrVersion}`);
      }

      return this.client.cryptoKeyVersionPath(
        this.config.projectId,
        this.config.locationId,
        this.config.keyRingId,
        keyId,
        version
      );
    }

    // If it's just a version number, use with the default/configured key
    if (/^\d+$/.test(keyIdOrVersion)) {
      if (!this.config.keyId) {
        throw new InvalidKmsConfigError(
          'Cannot build versioned path without default keyId when only version number is provided'
        );
      }

      return this.client.cryptoKeyVersionPath(
        this.config.projectId,
        this.config.locationId,
        this.config.keyRingId,
        this.config.keyId,
        keyIdOrVersion
      );
    }

    // If it looks like a key ID without version, throw error (use buildKeyName instead)
    throw new InvalidKmsConfigError(
      `Expected versioned key format but got: ${keyIdOrVersion}. ` +
        `Use format 'keyId/cryptoKeyVersions/version' or just the version number.`
    );
  }

  /**
   * Check if the key ID represents a versioned key path
   *
   * @param keyId - Key ID to check
   * @returns true if this is a versioned key path (contains /cryptoKeyVersions/)
   */
  private isVersionedKeyPath(keyId: string): boolean {
    return keyId.includes('/cryptoKeyVersions/');
  }

  /**
   * Resolve key name (use provided keyId or default)
   *
   * Supports both unversioned and versioned key paths:
   * - Unversioned: 'primary-encryption-key' -> cryptoKeyPath
   * - Versioned: 'primary-encryption-key/cryptoKeyVersions/5' -> cryptoKeyVersionPath
   */
  private resolveKeyName(keyId?: string): string {
    if (keyId) {
      // Check if this is a versioned key path
      if (this.isVersionedKeyPath(keyId)) {
        return this.buildKeyVersionName(keyId);
      }
      return this.buildKeyName(keyId);
    }
    if (!this.defaultKeyName) {
      throw new InvalidKmsConfigError(
        'No default key configured. Specify keyId in constructor or in each call.'
      );
    }
    return this.defaultKeyName;
  }

  /**
   * Encrypts plaintext data using Cloud KMS.
   *
   * Uses the Cloud KMS Encrypt API for server-side encryption.
   * Best for small payloads (< 64KB). For larger data, use
   * envelope encryption with `generateDataKey()`.
   *
   * @param plaintext - Data to encrypt (max 64KB for Cloud KMS)
   * @param keyId - Key name to use; uses default if not specified
   * @returns Encrypted ciphertext as Buffer
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {EncryptionOperationError} When Cloud KMS API call fails
   */
  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();
    let resolvedKeyName = '<unknown>';

    try {
      resolvedKeyName = this.resolveKeyName(keyId);
      attributes['key_id'] = resolvedKeyName;

      const [result] = await this.client.encrypt({
        name: resolvedKeyName,
        plaintext: plaintext
      });

      if (!result.ciphertext) {
        throw new EncryptionOperationError(
          this.sanitizeGcpMessage('encrypt', 'No ciphertext returned from Cloud KMS')
        );
      }

      this.recordEncrypt(attributes, Date.now() - startTime);
      return result.ciphertext as Buffer;
    } catch (error) {
      this.recordEncrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      // Re-throw if already a typed error
      if (error instanceof EncryptionOperationError || error instanceof InvalidKmsConfigError) {
        throw error;
      }
      const { message, cause } = this.sanitizeGcpError('encrypt', error);
      throw new EncryptionOperationError(message, cause);
    }
  }

  /**
   * Decrypts ciphertext using Cloud KMS.
   *
   * Uses the Cloud KMS Decrypt API for server-side decryption.
   * The ciphertext must have been encrypted with the same key.
   *
   * @param ciphertext - Data to decrypt (from a previous encrypt call)
   * @param keyId - Key name to use; uses default if not specified
   * @returns Decrypted plaintext as Buffer
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {DecryptionOperationError} When decryption fails (wrong key, tampered data, etc.)
   */
  async decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();
    let resolvedKeyName = '<unknown>';

    try {
      // CRITICAL: GCP KMS decrypt API requires base cryptoKey path, NOT versioned path.
      // If keyId contains version suffix (e.g., 'key/cryptoKeyVersions/7'), strip it.
      // GCP KMS can decrypt with any version when using base cryptoKey path.
      let baseKeyId = keyId;
      if (keyId && this.isVersionedKeyPath(keyId)) {
        const versionIndex = keyId.indexOf('/cryptoKeyVersions/');
        if (versionIndex !== -1) {
          baseKeyId = keyId.slice(0, versionIndex);
        }
      }
      resolvedKeyName = this.resolveKeyName(baseKeyId);
      attributes['key_id'] = resolvedKeyName;

      const [result] = await this.client.decrypt({
        name: resolvedKeyName,
        ciphertext: ciphertext
      });

      if (!result.plaintext) {
        throw new DecryptionOperationError(
          `gcp_kms_decrypt (key: ${resolvedKeyName})`,
          new Error('No plaintext returned from Cloud KMS')
        );
      }

      this.recordDecrypt(attributes, Date.now() - startTime);
      return result.plaintext as Buffer;
    } catch (error) {
      this.recordDecrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      // Re-throw if already a typed error
      if (error instanceof DecryptionOperationError || error instanceof InvalidKmsConfigError) {
        throw error;
      }
      const { message, cause } = this.sanitizeGcpError('decrypt', error);
      throw new DecryptionOperationError(message, cause);
    }
  }

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * Creates a 256-bit random key using Node.js CSPRNG, then wraps it
   * with the specified Cloud KMS key. Returns both the plaintext DEK
   * (for immediate use) and the wrapped DEK (for storage).
   *
   * **Security Note**: The plaintext DEK should be zeroed after use:
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // ... use plaintext for encryption ...
   * plaintext.fill(0); // Zero after use
   * ```
   *
   * @param keyId - KEK name to wrap the DEK; uses default if not specified
   * @returns IDataKeyResult with plaintext (32 bytes) and ciphertext
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {DataKeyGenerationError} When Cloud KMS wrap operation fails
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();
    let resolvedKeyName = '<unknown>';
    let plaintext: Buffer | undefined;

    try {
      resolvedKeyName = this.resolveKeyName(keyId);
      attributes['key_id'] = resolvedKeyName;

      // Generate a random data key
      plaintext = randomBytes(32);

      // Encrypt the data key with KMS
      const ciphertext = await this.encrypt(plaintext, keyId);

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return { plaintext, ciphertext };
    } catch (error) {
      // Zero the plaintext DEK on error to prevent key material leakage
      if (plaintext) {
        plaintext.fill(0);
      }

      this.recordGenerateDataKey({ ...attributes, error: String(error) }, Date.now() - startTime);
      // Re-throw if already a typed error from inner encrypt call or config
      if (
        error instanceof DataKeyGenerationError ||
        error instanceof EncryptionOperationError ||
        error instanceof InvalidKmsConfigError
      ) {
        throw error;
      }
      const { message } = this.sanitizeGcpError('generateDataKey', error);
      throw new DataKeyGenerationError(new Error(message));
    }
  }

  /**
   * Re-encrypts a DEK with a new key version.
   *
   * **Note**: Cloud KMS does not support native rewrap. This implementation
   * decrypts and re-encrypts, which briefly exposes the plaintext DEK in
   * application memory. For higher security, consider HashiCorp Vault which
   * supports atomic rewrap.
   *
   * @param ciphertext - Encrypted DEK to rewrap
   * @param targetKeyId - Key to encrypt with (target); uses default if not specified
   * @param sourceKeyId - Key to decrypt with (source); uses default if not specified.
   *                      Required when ciphertext was encrypted with a non-default key.
   * @returns New ciphertext wrapped with the target key
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {DataKeyReencryptionError} When rewrap operation fails
   *
   * @example Rewrap from one key to another
   * ```typescript
   * // Ciphertext encrypted with 'old-key', rewrap to 'new-key'
   * const result = await provider.rewrap(ciphertext, 'new-key', 'old-key');
   * ```
   *
   * @example Rewrap using default key for both source and target
   * ```typescript
   * // Uses default key for both decryption and encryption (key version rotation)
   * const result = await provider.rewrap(ciphertext);
   * ```
   */
  override async rewrap(
    ciphertext: Buffer,
    targetKeyId?: string,
    sourceKeyId?: string
  ): Promise<{ ciphertext: Buffer }> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();
    let resolvedTargetKey = '<unknown>';
    let resolvedSourceKey = '<unknown>';

    try {
      resolvedTargetKey = this.resolveKeyName(targetKeyId);
      attributes['key_id'] = resolvedTargetKey;

      // Track source key in metrics if explicitly provided
      if (sourceKeyId) {
        resolvedSourceKey = this.resolveKeyName(sourceKeyId);
        attributes['source_key_id'] = resolvedSourceKey;
      } else {
        resolvedSourceKey = resolvedTargetKey;
      }

      // Cloud KMS doesn't support native rewrap; decrypt and re-encrypt
      // sourceKeyId: key used for decryption (the key that originally encrypted the ciphertext)
      // targetKeyId: key used for encryption (the new key to wrap with)
      const decrypted = await this.decrypt(ciphertext, sourceKeyId);

      try {
        const newCiphertext = await this.encrypt(decrypted, targetKeyId);
        this.recordRewrap(attributes, Date.now() - startTime);
        return { ciphertext: newCiphertext };
      } finally {
        // Zero the decrypted key material immediately after use
        decrypted.fill(0);
      }
    } catch (error) {
      this.recordRewrap({ ...attributes, error: String(error) }, Date.now() - startTime);
      // Re-throw if already a typed error from inner encrypt/decrypt calls or config
      if (
        error instanceof DataKeyReencryptionError ||
        error instanceof EncryptionOperationError ||
        error instanceof DecryptionOperationError ||
        error instanceof InvalidKmsConfigError
      ) {
        throw error;
      }
      throw new DataKeyReencryptionError(`gcp_kms_rewrap failed`, error);
    }
  }

  /**
   * Retrieves metadata about a Cloud KMS key.
   *
   * Calls the getCryptoKey API to fetch key properties including
   * state, purpose, algorithm, and protection level.
   *
   * @param keyId - Key name to query; uses default if not specified
   * @returns IKeyInfo with key metadata
   *
   * @throws {InvalidKmsConfigError} When no key ID is provided and no default configured
   * @throws {KeyNotFoundError} When the key doesn't exist
   * @throws {Error} When API call fails (permissions, network, etc.)
   */
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const resolvedKeyId = keyId ?? this.config.keyId;

    try {
      if (!resolvedKeyId) {
        throw new InvalidKmsConfigError('No key ID provided and no default configured');
      }

      const keyName = this.buildKeyName(resolvedKeyId);
      const [result] = await this.client.getCryptoKey({ name: keyName });

      const resultWithProperties = result as Record<string, unknown>;
      const primary = resultWithProperties['primary'] as Record<string, unknown> | undefined;
      const primaryName = typeof primary?.['name'] === 'string' ? primary['name'] : undefined;
      const primaryState = primary?.['state'];
      const isEnabledState = (state: unknown): boolean =>
        state === 'ENABLED' || state === 1 || state === '1';
      const version = resultWithProperties['version']
        ? String(resultWithProperties['version'])
        : undefined;
      const createTime = resultWithProperties['createTime'] as Date | undefined;
      const purpose = resultWithProperties['purpose'] as string | undefined;
      const algorithm = resultWithProperties['algorithm'] as string | undefined;
      const protectionLevel = resultWithProperties['protectionLevel'] as string | undefined;
      const primaryVersion = primaryName?.split('/').pop();

      return {
        keyId: resolvedKeyId,
        ...((primaryVersion ?? version) !== undefined && { version: primaryVersion ?? version }),
        ...(createTime !== undefined && { createdAt: createTime }),
        enabled:
          primaryState !== undefined
            ? isEnabledState(primaryState)
            : isEnabledState(resultWithProperties['state']),
        ...(purpose !== undefined && { purpose }),
        metadata: {
          ...(primaryName !== undefined && { primaryName }),
          ...(primaryState !== undefined && { primaryState: String(primaryState) }),
          ...(algorithm !== undefined && { algorithm }),
          ...(protectionLevel !== undefined && { protectionLevel })
        }
      };
    } catch (error) {
      if (error instanceof InvalidKmsConfigError) {
        throw error;
      }
      const errorCode = (error as { code?: number }).code;
      if (errorCode === GCP_NOT_FOUND_CODE) {
        throw new KeyNotFoundError(resolvedKeyId ?? 'unknown');
      }
      throw error;
    }
  }

  /**
   * Checks if the provider is available and properly configured.
   *
   * Verifies connectivity by attempting to access the configured key ring.
   * This validates credentials, network access, and IAM permissions.
   *
   * @returns true if the key ring is accessible, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Verify access to the configured key ring
      const keyRingPath = this.client.keyRingPath(
        this.config.projectId,
        this.config.locationId,
        this.config.keyRingId
      );

      await this.client.getKeyRing({ name: keyRingPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs a health check on the provider.
   *
   * Delegates to `isAvailable()` to verify Cloud KMS connectivity.
   *
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }
}

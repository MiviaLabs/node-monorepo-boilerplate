/**
 * GCP Secret Manager Provider
 *
 * Implements KMS operations using Google Cloud Secret Manager.
 * Can optionally use GCP KMS for actual encryption operations.
 *
 * Architecture:
 * - Primary: Uses Secret Manager for key storage and retrieval
 * - Optional: Uses GCP KMS for actual encryption/decryption operations
 * - Fallback: Performs local encryption/decryption with keys from Secret Manager
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Sentinel prefix for Secret Manager-stored DEKs.
 * Used to identify ciphertexts that contain a Secret Manager path
 * rather than KMS-encrypted data.
 */
const SM_DEK_PREFIX = 'sm://';

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

import { InvalidKmsConfigError, KeyNotFoundError } from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo } from './kms-provider.interface';

import type { IGcpSecretManagerProviderOptions } from './factory.types';
import type { CipherGCM, DecipherGCM } from 'crypto';

/**
 * GCP Secret Manager Provider
 *
 * Provides encryption/decryption operations using Google Cloud Secret Manager
 * with optional GCP KMS backing for actual encryption operations.
 */
export class GcpSecretManagerProvider extends BaseKmsProvider {
  private secretClient: SecretManagerServiceClient;
  private kmsClient?: KeyManagementServiceClient;
  private config: IGcpSecretManagerProviderOptions;
  private defaultKeyId: string;

  constructor(config: IGcpSecretManagerProviderOptions) {
    super('gcp-secret-manager');

    if (!config.projectId) {
      throw new InvalidKmsConfigError('GCP Secret Manager requires projectId');
    }

    this.config = {
      secretPrefix: config.secretPrefix ?? 'encryption-keys/',
      enableVersioning: config.enableVersioning ?? true,
      ...config
    };

    // Initialize Secret Manager client with credentials if provided
    const secretClientOptions: {
      keyFilename?: string;
      credentials?: Record<string, unknown>;
      apiEndpoint?: string;
      projectIds?: string[];
    } = {
      projectIds: [this.config.projectId]
    };

    if (config.credentialsFile) {
      secretClientOptions.keyFilename = config.credentialsFile;
    } else if (config.credentials) {
      secretClientOptions.credentials = config.credentials;
    }

    if (config.endpoint) {
      secretClientOptions.apiEndpoint = config.endpoint;
    }

    this.secretClient = new SecretManagerServiceClient(secretClientOptions);

    // Initialize KMS client if KMS backing is configured
    if (config.kmsConfig) {
      if (!config.kmsConfig.locationId || !config.kmsConfig.keyRingId || !config.kmsConfig.keyId) {
        throw new InvalidKmsConfigError(
          'KMS backing configuration requires locationId, keyRingId, and keyId'
        );
      }

      const kmsClientOptions: {
        keyFilename?: string;
        credentials?: Record<string, unknown>;
        apiEndpoint?: string;
      } = {};

      if (config.credentialsFile) {
        kmsClientOptions.keyFilename = config.credentialsFile;
      } else if (config.credentials) {
        kmsClientOptions.credentials = config.credentials;
      }

      if (config.endpoint) {
        kmsClientOptions.apiEndpoint = config.endpoint;
      }

      this.kmsClient = new KeyManagementServiceClient(kmsClientOptions);
      this.defaultKeyId = config.kmsConfig.keyId;
    } else {
      this.defaultKeyId = 'default';
    }
  }

  /**
   * Build full secret name from key ID
   */
  private buildSecretName(keyId: string): string {
    const prefix = this.config.secretPrefix ?? '';
    const suffix = keyId.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    return this.secretClient.secretPath(this.config.projectId, prefix + suffix);
  }

  /**
   * Build full KMS key name from key ID
   */
  private buildKmsKeyName(keyId: string): string {
    if (!this.kmsClient || !this.config.kmsConfig) {
      throw new InvalidKmsConfigError('KMS backing is not configured');
    }

    return this.kmsClient.cryptoKeyPath(
      this.config.projectId,
      this.config.kmsConfig.locationId,
      this.config.kmsConfig.keyRingId,
      keyId
    );
  }

  /**
   * Resolve key ID (use provided keyId or default)
   */
  private resolveKeyId(keyId?: string): string {
    if (keyId) {
      return keyId;
    }
    if (!this.defaultKeyId) {
      throw new InvalidKmsConfigError(
        'No default key configured. Specify keyId in constructor or in each call.'
      );
    }
    return this.defaultKeyId;
  }

  /**
   * Get encryption key from Secret Manager
   */
  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    const secretName = this.buildSecretName(keyId);

    try {
      const [version] = await this.secretClient.accessSecretVersion({
        name: `${secretName}/versions/latest`
      });

      if (!version.payload?.data) {
        throw new KeyNotFoundError(keyId);
      }

      return version.payload.data as Buffer;
    } catch (error) {
      const gcpError = error as { code?: number; message?: string };
      if (gcpError.code === 5) {
        // NOT_FOUND
        throw new KeyNotFoundError(keyId);
      }
      throw error;
    }
  }

  /**
   * Store encryption key in Secret Manager
   */
  private async storeEncryptionKey(keyId: string, keyData: Buffer): Promise<void> {
    // Build the prefixed secret ID to ensure consistency between createSecret and addSecretVersion
    const prefix = this.config.secretPrefix ?? '';
    const suffix = keyId.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    const prefixedSecretId = prefix + suffix;
    const secretName = this.secretClient.secretPath(this.config.projectId, prefixedSecretId);

    try {
      // Try to create the secret using the prefixed ID
      await this.secretClient.createSecret({
        parent: `projects/${this.config.projectId}`,
        secretId: prefixedSecretId,
        secret: {
          replication: { automatic: {} },
          labels: {
            purpose: 'encryption',
            managed_by: 'encryption'
          }
        }
      });
    } catch (error) {
      // Secret might already exist, which is fine
      const gcpError = error as { code?: number };
      if (gcpError.code !== 6) {
        // ALREADY_EXISTS
        throw error;
      }
    }

    // Add new version with the key data using the same prefixed secret name
    await this.secretClient.addSecretVersion({
      parent: secretName,
      payload: { data: keyData }
    });
  }

  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // If KMS backing is configured, use it for encryption
      if (this.kmsClient && this.config.kmsConfig) {
        return this.encryptWithKms(plaintext, resolvedKeyId, attributes, startTime);
      }

      // Otherwise, encrypt with secret-stored key
      return this.encryptWithSecretKey(plaintext, resolvedKeyId, attributes, startTime);
    } catch (error) {
      this.recordEncrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Encrypt using GCP KMS
   */
  private async encryptWithKms(
    plaintext: Buffer,
    keyId: string,
    attributes: Record<string, unknown>,
    startTime: number
  ): Promise<Buffer> {
    const keyName = this.buildKmsKeyName(keyId);

    if (!this.kmsClient) {
      throw new Error('KMS client is not initialized');
    }

    const [result] = await this.kmsClient.encrypt({
      name: keyName,
      plaintext: plaintext
    });

    if (!result.ciphertext) {
      throw new Error('KMS encryption failed: no ciphertext returned');
    }

    this.recordEncrypt(
      attributes as { [key: string]: string | number | boolean | undefined },
      Date.now() - startTime
    );
    return result.ciphertext as Buffer;
  }

  /**
   * Encrypt using key from Secret Manager (AES-256-GCM)
   */
  private async encryptWithSecretKey(
    plaintext: Buffer,
    keyId: string,
    attributes: Record<string, unknown>,
    startTime: number
  ): Promise<Buffer> {
    const key = await this.getEncryptionKey(keyId);

    // Use AES-256-GCM for encryption
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv) as CipherGCM;

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Return format: iv(12) + authTag(16) + ciphertext
    const result = Buffer.concat([iv, authTag, encrypted]);

    this.recordEncrypt(
      attributes as { [key: string]: string | number | boolean | undefined },
      Date.now() - startTime
    );
    return result;
  }

  async decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      // Check if this is a Secret Manager DEK reference (from generateDataKey SM-only mode)
      const ciphertextStr = ciphertext.toString('utf8');
      if (ciphertextStr.startsWith(SM_DEK_PREFIX)) {
        return this.fetchDekFromSecretManager(ciphertextStr, attributes, startTime);
      }

      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // If KMS backing is configured, use it for decryption
      if (this.kmsClient && this.config.kmsConfig) {
        return this.decryptWithKms(ciphertext, resolvedKeyId, attributes, startTime);
      }

      // Otherwise, decrypt with secret-stored key
      return this.decryptWithSecretKey(ciphertext, resolvedKeyId, attributes, startTime);
    } catch (error) {
      this.recordDecrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Fetches a DEK directly from Secret Manager using the full secret path.
   *
   * Used when decrypting ciphertexts generated by generateDataKey in SM-only mode,
   * which store the DEK in Secret Manager and return the path as ciphertext.
   *
   * Security: Validates that the secret path belongs to both the configured project
   * and secret prefix namespace to prevent tampered ciphertexts from redirecting
   * lookups outside the expected namespace.
   *
   * @param ciphertextStr - The ciphertext string with sm:// prefix
   * @param attributes - Telemetry attributes
   * @param startTime - Operation start time for metrics
   * @returns The plaintext DEK buffer
   * @throws {KeyNotFoundError} If the secret does not exist or path validation fails
   */
  private async fetchDekFromSecretManager(
    ciphertextStr: string,
    attributes: Record<string, unknown>,
    startTime: number
  ): Promise<Buffer> {
    // Strip the sm:// prefix to get the full secret path
    const secretPath = ciphertextStr.slice(SM_DEK_PREFIX.length);

    // Security: Validate that the secret path belongs to the configured project namespace.
    // This prevents tampered ciphertexts from redirecting lookups to arbitrary secrets
    // outside the expected namespace.
    const projectPrefix = `projects/${this.config.projectId}/secrets/`;
    if (!secretPath.startsWith(projectPrefix)) {
      // Do NOT set attributes['secret_path'] for invalid paths to avoid logging attacker-controlled data
      throw new KeyNotFoundError(
        `Invalid secret path: does not belong to project ${this.config.projectId}`
      );
    }

    // Security: Also enforce the configured secret prefix to prevent access
    // to secrets outside the allowed namespace within the project.
    const secretPrefix = this.config.secretPrefix ?? '';
    const secretName = secretPath.slice(projectPrefix.length);
    if (secretPrefix && !secretName.startsWith(secretPrefix)) {
      // Do NOT set attributes['secret_path'] for invalid paths to avoid logging attacker-controlled data
      throw new KeyNotFoundError(
        `Invalid secret path: does not match configured prefix '${secretPrefix}'`
      );
    }

    // Only set attributes for validated paths
    attributes['secret_path'] = secretPath;

    try {
      const [version] = await this.secretClient.accessSecretVersion({
        name: `${secretPath}/versions/latest`
      });

      if (!version.payload?.data) {
        throw new KeyNotFoundError(secretPath);
      }

      this.recordDecrypt(
        attributes as { [key: string]: string | number | boolean | undefined },
        Date.now() - startTime
      );
      return version.payload.data as Buffer;
    } catch (error) {
      const gcpError = error as { code?: number };
      if (gcpError.code === 5) {
        // NOT_FOUND
        throw new KeyNotFoundError(secretPath);
      }
      throw error;
    }
  }

  /**
   * Decrypt using GCP KMS
   */
  private async decryptWithKms(
    ciphertext: Buffer,
    keyId: string,
    attributes: Record<string, unknown>,
    startTime: number
  ): Promise<Buffer> {
    const keyName = this.buildKmsKeyName(keyId);

    if (!this.kmsClient) {
      throw new Error('KMS client is not initialized');
    }

    const [result] = await this.kmsClient.decrypt({
      name: keyName,
      ciphertext: ciphertext
    });

    if (!result.plaintext) {
      throw new Error('KMS decryption failed: no plaintext returned');
    }

    this.recordDecrypt(
      attributes as { [key: string]: string | number | boolean | undefined },
      Date.now() - startTime
    );
    return result.plaintext as Buffer;
  }

  /**
   * Decrypt using key from Secret Manager (AES-256-GCM)
   */
  private async decryptWithSecretKey(
    ciphertext: Buffer,
    keyId: string,
    attributes: Record<string, unknown>,
    startTime: number
  ): Promise<Buffer> {
    const key = await this.getEncryptionKey(keyId);

    // Extract iv, authTag, and encrypted data
    const iv = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(12, 28);
    const encrypted = ciphertext.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', key, iv) as DecipherGCM;
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    this.recordDecrypt(
      attributes as { [key: string]: string | number | boolean | undefined },
      Date.now() - startTime
    );
    return decrypted;
  }

  /**
   * Generates a new data encryption key (DEK) for envelope encryption.
   *
   * When KMS backing is configured, generates a random 32-byte key and encrypts
   * it using GCP KMS. Otherwise, generates a key and stores it in Secret Manager,
   * returning an `sm://` prefixed path as the ciphertext identifier.
   *
   * ## SM-Only Mode Ciphertext Format
   *
   * In SM-only mode (no KMS backing), the ciphertext is a UTF-8 encoded string
   * with format: `sm://projects/{project}/secrets/{prefix}{keyId}`
   *
   * The `sm://` prefix allows `decrypt()` to detect that this is a Secret Manager
   * reference and fetch the DEK directly rather than attempting KMS decryption.
   *
   * @param keyId - Optional KMS key identifier to use for wrapping the DEK.
   *                Falls back to the default key configured in the constructor.
   * @returns IDataKeyResult containing:
   *          - `plaintext`: 32-byte Buffer (256-bit AES key) for local encryption
   *          - `ciphertext`: Buffer containing either KMS-encrypted DEK or
   *                          `sm://` prefixed Secret Manager path (UTF-8 encoded)
   * @throws {InvalidKmsConfigError} If no default key is configured and keyId is not provided
   * @throws {Error} If KMS encryption fails or Secret Manager storage fails
   *
   * @example
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey('my-key');
   *
   * // Use plaintext for encryption
   * const cipher = createCipheriv('aes-256-gcm', plaintext, iv);
   *
   * // Store ciphertext with encrypted data for later decryption
   * await db.save({ encryptedDek: ciphertext.toString('base64'), ... });
   *
   * // Zero plaintext after use
   * plaintext.fill(0);
   * ```
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // If KMS backing is configured, use it
      if (this.kmsClient) {
        // Generate random data key
        const plaintext = randomBytes(32);

        // Encrypt with KMS
        const ciphertext = await this.encrypt(plaintext, resolvedKeyId);

        this.recordGenerateDataKey(attributes, Date.now() - startTime);
        return { plaintext, ciphertext };
      }

      // Otherwise, generate and store key in Secret Manager.
      // Bug B6 fix: hand the caller a LIVE (non-zero) plaintext DEK so they
      // can use it for envelope encryption. The interface contract says
      // "callers MUST zero after use" — zeroing before return would leave
      // the caller encrypting all subsequent data with an all-zero key, a
      // catastrophic plaintext-equivalent bug. Make a defensive copy for
      // the caller, zero the original immediately after the upload, and
      // return the live copy.
      const plaintextForCaller = randomBytes(32);
      const plaintextToZero = Buffer.from(plaintextForCaller);

      try {
        // Store the key in Secret Manager
        await this.storeEncryptionKey(resolvedKeyId, plaintextToZero);
      } finally {
        plaintextToZero.fill(0);
      }

      // Return the secret path with sm:// prefix as ciphertext identifier.
      // The decrypt method detects this prefix and fetches the DEK from Secret Manager.
      const secretName = this.buildSecretName(resolvedKeyId);
      const ciphertext = Buffer.from(SM_DEK_PREFIX + secretName, 'utf8');

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return { plaintext: plaintextForCaller, ciphertext };
    } catch (error) {
      // Bug B6: plaintextForCaller and plaintextToZero are local to the SM
      // branch above. If the SM branch never executed, there's nothing to
      // zero here. If storeEncryptionKey threw after we allocated the
      // buffers but before our finally ran, the finally block has already
      // wiped plaintextToZero; plaintextForCaller lingers in memory until
      // GC. We deliberately do NOT zero plaintextForCaller here because the
      // caller never received it (the function is throwing). The next line
      // records the error in metrics and rethrows.
      this.recordGenerateDataKey({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Re-wraps (re-encrypts) a ciphertext with a different key.
   *
   * Decrypts the ciphertext using the source key, then re-encrypts the plaintext
   * with the target key. This is useful for key rotation scenarios where data
   * needs to be migrated from one key to another.
   *
   * The plaintext is securely zeroed after the operation completes to minimize
   * exposure time in memory.
   *
   * @param ciphertext - The encrypted data to rewrap
   * @param keyId - Optional target key identifier for re-encryption.
   *                Falls back to the default key configured in the constructor.
   * @param sourceKeyId - Optional original key identifier used for decrypting
   *                      the ciphertext. If not provided, falls back to the default key.
   *                      Use this when the ciphertext was encrypted with a different key
   *                      than the current default.
   * @returns Object containing the new ciphertext encrypted with the target key
   *
   * @throws {InvalidKmsConfigError} If no key ID is provided and no default is configured
   * @throws {Error} If decryption or encryption operations fail
   *
   * @example
   * ```typescript
   * // Rewrap using default key for both source and target
   * const result = await provider.rewrap(oldCiphertext);
   *
   * // Rewrap from old key to new key during rotation
   * const result = await provider.rewrap(oldCiphertext, 'new-key-v2', 'old-key-v1');
   * ```
   */
  override async rewrap(
    ciphertext: Buffer,
    keyId?: string,
    sourceKeyId?: string
  ): Promise<{ ciphertext: Buffer }> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();
    let decrypted: Buffer | undefined;

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      const resolvedSourceKeyId = sourceKeyId ? this.resolveKeyId(sourceKeyId) : undefined;

      attributes['key_id'] = resolvedKeyId;
      if (resolvedSourceKeyId) {
        attributes['source_key_id'] = resolvedSourceKeyId;
      }

      // Decrypt with source key (if provided), encrypt with target key
      decrypted = await this.decrypt(ciphertext, resolvedSourceKeyId);
      const newCiphertext = await this.encrypt(decrypted, resolvedKeyId);

      this.recordRewrap(attributes, Date.now() - startTime);
      return { ciphertext: newCiphertext };
    } catch (error) {
      this.recordRewrap({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    } finally {
      // Zero plaintext buffer to minimize exposure time in memory
      if (decrypted) {
        decrypted.fill(0);
      }
    }
  }

  /**
   * Retrieves metadata and status information for an encryption key.
   *
   * Checks KMS first (if configured), then falls back to Secret Manager.
   * Returns key state, creation time, versioning, and provider-specific metadata.
   *
   * NOTE: Complexity is inherent due to dual fallback mechanism (KMS -> Secret Manager)
   * and handling of multiple optional metadata fields. Refactoring would require either:
   * 1. Splitting into smaller functions (would hurt readability due to shared state)
   * 2. Abstracting behind additional layers (would add unnecessary indirection)
   *
   * @param keyId - Optional key identifier. Falls back to the default key
   *                configured in the constructor.
   * @returns IKeyInfo containing:
   *          - `keyId`: The resolved key identifier
   *          - `version`: Key version (e.g., 'latest' for Secret Manager)
   *          - `createdAt`: Date when the key was created
   *          - `enabled`: Whether the key is active for operations
   *          - `purpose`: Key purpose (e.g., 'ENCRYPT_DECRYPT')
   *          - `metadata`: Provider-specific info (algorithm, protection level, rotation)
   * @throws {KeyNotFoundError} If the key does not exist in KMS or Secret Manager
   * @throws {InvalidKmsConfigError} If no key ID is provided and no default is configured
   * @throws {Error} If GCP API calls fail for reasons other than NOT_FOUND
   *
   * @example
   * ```typescript
   * const info = await provider.getKeyInfo('my-encryption-key');
   * console.log(`Key enabled: ${info.enabled}`);
   * console.log(`Provider: ${info.metadata?.provider}`);
   * ```
   */
  // eslint-disable-next-line complexity
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    if (!resolvedKeyId) {
      throw new InvalidKmsConfigError('No key ID provided and no default configured');
    }

    // If KMS backing is configured, get KMS key info
    if (this.kmsClient && this.config.kmsConfig && resolvedKeyId !== 'default') {
      try {
        const keyName = this.buildKmsKeyName(resolvedKeyId);
        const [result] = await this.kmsClient.getCryptoKey({ name: keyName });

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
            provider: 'gcp-secret-manager',
            backing: 'gcp-kms',
            ...(primaryName !== undefined && { primaryName }),
            ...(primaryState !== undefined && { primaryState: String(primaryState) }),
            ...(algorithm !== undefined && { algorithm }),
            ...(protectionLevel !== undefined && { protectionLevel })
          }
        };
      } catch (error) {
        const gcpError = error as { code?: number };
        if (gcpError.code === 5) {
          // NOT_FOUND - fall through to check Secret Manager
        } else {
          throw error;
        }
      }
    }

    // Otherwise, get Secret Manager secret info
    try {
      const secretName = this.buildSecretName(resolvedKeyId);
      const [secret] = await this.secretClient.getSecret({
        name: secretName
      });

      const secretRecord = secret as Record<string, unknown>;
      const versioning = secretRecord['versioning'] as Record<string, unknown> | undefined;
      const version = versioning && versioning['enabled'] ? 'latest' : undefined;
      const createTime = secretRecord['createTime'] as Date | undefined;
      const expiration = secretRecord['expireTime'] as string | undefined;
      const rotation = secretRecord['rotation'] as Record<string, unknown> | undefined;

      return {
        keyId: resolvedKeyId,
        ...(version !== undefined && { version }),
        ...(createTime !== undefined && { createdAt: createTime }),
        enabled: secretRecord['state'] === 'ENABLED',
        purpose: 'ENCRYPT_DECRYPT',
        metadata: {
          provider: 'gcp-secret-manager',
          backing: 'secret-manager',
          ...(expiration !== undefined && { expiration }),
          ...(rotation !== undefined && { rotation }),
          ...(versioning &&
            versioning['enabled'] !== undefined && { versioning: versioning['enabled'] })
        }
      };
    } catch (error) {
      const gcpError = error as { code?: number };
      if (gcpError.code === 5) {
        // NOT_FOUND
        throw new KeyNotFoundError(resolvedKeyId);
      }
      throw error;
    }
  }

  /**
   * Rotates an encryption key by creating a new version in Secret Manager.
   *
   * Generates a new 32-byte (256-bit) random key and adds it as a new version
   * of the secret. The new version automatically becomes the "latest" version
   * used for encryption operations. Old versions remain accessible for
   * decrypting previously encrypted data but are marked for future cleanup
   * based on retention policies.
   *
   * @param keyId - Optional key identifier to rotate. Falls back to the default
   *                key configured in the constructor if not provided.
   * @returns Resolves when the new key version has been successfully created
   * @throws {InvalidKmsConfigError} If no key ID is provided and no default is configured
   * @throws {Error} If Secret Manager client fails to add the new version
   *
   * @example
   * ```typescript
   * // Rotate the default key
   * await provider.rotateKey();
   *
   * // Rotate a specific tenant key
   * await provider.rotateKey('tenant-encryption-key');
   * ```
   */
  async rotateKey(keyId?: string): Promise<void> {
    const resolvedKeyId = this.resolveKeyId(keyId);
    const secretName = this.buildSecretName(resolvedKeyId);

    // Generate new key
    // Bug B6: zero the plaintext buffer after upload to minimize exposure
    // in memory. The interface contract requires this (kms-provider.interface).
    const newKey = randomBytes(32);
    try {
      // Add new version
      await this.secretClient.addSecretVersion({
        parent: secretName,
        payload: { data: newKey }
      });

      // Optionally disable old versions
      // This would be implemented based on retention policies
    } finally {
      newKey.fill(0);
    }
  }

  /**
   * Checks whether the Secret Manager service is accessible.
   *
   * Uses a least-privilege probe by attempting to retrieve a specific secret
   * rather than listing all secrets. This requires only `secretmanager.versions.access`
   * permission on a single resource instead of `secretmanager.secrets.list` on the project.
   *
   * @returns `true` if Secret Manager is accessible, `false` otherwise
   *
   * @example
   * ```typescript
   * const available = await provider.isAvailable();
   * if (!available) {
   *   console.error('Secret Manager is not accessible');
   * }
   * ```
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Use least-privilege probe: attempt to get a specific secret instead of listing all
      const testKeyId = this.defaultKeyId || 'default';
      const secretName = this.buildSecretName(testKeyId);

      await this.secretClient.getSecret({ name: secretName });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs infrastructure health validation for the provider.
   *
   * Verifies connectivity to the underlying GCP services. When KMS backing
   * is configured, validates both the KMS key ring accessibility and Secret
   * Manager availability. Otherwise, only checks Secret Manager via `isAvailable()`.
   *
   * @returns `true` if all required services are accessible:
   *          - Secret Manager is reachable (always checked)
   *          - KMS key ring is accessible (only when `kmsClient` and `config.kmsConfig` are present)
   *          Returns `false` if any service check fails.
   *
   * @example
   * ```typescript
   * const healthy = await provider.healthCheck();
   * if (!healthy) {
   *   // Handle degraded state - retry or failover
   *   logger.error('GCP Secret Manager provider health check failed');
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    try {
      // If KMS backing is configured, check KMS health too
      if (this.kmsClient && this.config.kmsConfig) {
        const keyRingPath = this.kmsClient.keyRingPath(
          this.config.projectId,
          this.config.kmsConfig.locationId,
          this.config.kmsConfig.keyRingId
        );

        await this.kmsClient.getKeyRing({ name: keyRingPath });
      }

      // Check Secret Manager access
      return this.isAvailable();
    } catch {
      return false;
    }
  }
}

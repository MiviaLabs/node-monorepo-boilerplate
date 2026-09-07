/**
 * Main Encryption Service
 *
 * High-level service that provides encryption operations using configured KMS providers
 *
 * @module encryption/services
 */

import { EncryptionAlgorithm } from '../constants';
import { EncryptionError, KmsProviderNotFoundError, KmsProviderUnavailableError } from '../errors';
import { EnvelopeEncryptionService } from './envelope-encryption.service';

import type {
  IEnvelopeEncryptionOptions,
  IEnvelopeEncryptionResult
} from './envelope-encryption.service';
import type { IKmsProvider } from '../providers/kms-provider.interface';

/**
 * Configuration options for the EncryptionService.
 *
 * @interface IEncryptionServiceOptions
 */
export interface IEncryptionServiceOptions {
  /**
   * Default encryption algorithm for envelope encryption operations.
   * Defaults to AES-256-GCM if not specified.
   */
  algorithm?: EncryptionAlgorithm;
}

/**
 * Container for base64-encoded AES-GCM encryption outputs.
 *
 * This interface holds all components needed to decrypt data encrypted using
 * envelope encryption with AES-GCM: the ciphertext, the encrypted data key (DEK),
 * the initialization vector (IV), and the authentication tag.
 *
 * All fields are base64-encoded strings, making them safe to store in text-based
 * database columns (VARCHAR, TEXT) or transmit in JSON payloads without binary
 * encoding issues.
 *
 * @interface IBase64EncryptionResult
 *
 * @example Encrypting and storing sensitive data
 * ```typescript
 * // Encrypt user's SSN
 * const encrypted = await encryptionService.encryptToBase64(user.ssn);
 *
 * // Store in database columns
 * await db.users.update({
 *   where: { id: user.id },
 *   data: {
 *     ssnCiphertext: encrypted.ciphertext,
 *     ssnKey: encrypted.encryptedDataKey,
 *     ssnIv: encrypted.iv,
 *     ssnTag: encrypted.authTag
 *   }
 * });
 *
 * // Or store as a single JSON field
 * await db.users.update({
 *   where: { id: user.id },
 *   data: { encryptedSsn: JSON.stringify(encrypted) }
 * });
 * ```
 */
export interface IBase64EncryptionResult {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded encrypted data encryption key */
  encryptedDataKey: string;
  /** Base64-encoded initialization vector (12 bytes when decoded) */
  iv: string;
  /** Base64-encoded GCM authentication tag (16 bytes when decoded) */
  authTag: string;
}

/**
 * Primary encryption API for the application.
 *
 * This service provides a high-level interface for encryption operations using
 * envelope encryption with configurable KMS providers. It abstracts the complexity
 * of key management, data key generation, and cryptographic operations.
 *
 * ## Architecture
 *
 * The EncryptionService sits at the top of the encryption hierarchy:
 * ```
 * EncryptionService (high-level API)
 *    └── EnvelopeEncryptionService (envelope encryption pattern)
 *        └── IKmsProvider (key management - AWS KMS, GCP KMS, local, etc.)
 * ```
 *
 * ## Envelope Encryption Pattern
 *
 * This service implements envelope encryption where:
 * 1. A unique Data Encryption Key (DEK) is generated for each encryption operation
 * 2. Data is encrypted using the DEK with AES-256-GCM
 * 3. The DEK is encrypted (wrapped) using a Key Encryption Key (KEK) from the KMS provider
 * 4. Both the encrypted data and encrypted DEK are returned together
 *
 * This pattern provides:
 * - **Performance**: Local symmetric encryption is fast; KMS is only called for key operations
 * - **Key Rotation Flexibility**: Only DEKs need re-wrapping during rotation, not all data
 * - **Reduced KMS API Calls**: One KMS call per encryption operation regardless of data size
 *
 * ## Security Properties
 *
 * The default AES-256-GCM algorithm provides:
 * - **NIST-Approved**: Recommended by NIST SP 800-38D for authenticated encryption
 * - **Authenticated Encryption**: Provides both confidentiality and integrity
 * - **Padding Oracle Resistance**: GCM mode is immune to padding oracle attacks
 * - **256-bit Key Strength**: AES-256 provides strong classical security. Under quantum
 *   threat models, Grover's algorithm would at most halve the effective brute-force
 *   resistance, reducing AES-256 to ~128-bit equivalent against a quantum adversary.
 *   While this remains computationally secure, AES is not provably quantum-resistant
 *   as it was not designed for post-quantum security.
 *
 * @example
 * ```typescript
 * // Initialize with a provider getter function
 * const encryptionService = new EncryptionService(
 *   (name) => providers.get(name),
 *   'aws-kms'
 * );
 *
 * // Encrypt data
 * const result = await encryptionService.encrypt(sensitiveData);
 *
 * // Store encrypted components (typically in database)
 * const stored = {
 *   ciphertext: result.ciphertext,
 *   encryptedDataKey: result.encryptedDataKey,
 *   iv: result.iv,
 *   authTag: result.authTag
 * };
 *
 * // Decrypt later
 * const plaintext = await encryptionService.decrypt(
 *   stored.ciphertext,
 *   stored.encryptedDataKey,
 *   stored.iv,
 *   stored.authTag
 * );
 * ```
 *
 * @see {@link EnvelopeEncryptionService} for the underlying envelope encryption implementation
 * @see {@link IKmsProvider} for the KMS provider interface
 */
/**
 * Default TTL for health check cache entries (30 seconds).
 * Balances responsiveness to provider failures with reducing redundant health checks.
 */
const HEALTH_CHECK_TTL_MS = 30_000;

/**
 * Cached health check result with timestamp.
 *
 * Used internally to cache provider health check results for a short duration
 * (30 seconds) to avoid redundant health checks on every encryption operation.
 *
 * @internal
 */
interface IHealthCheckCacheEntry {
  /** Whether the provider passed the health check (true = healthy, false = unhealthy) */
  healthy: boolean;
  /** Unix timestamp in milliseconds when the health check was recorded */
  timestamp: number;
}

export class EncryptionService {
  private readonly envelopeServices = new Map<string, EnvelopeEncryptionService>();
  private readonly healthCheckCache = new Map<string, IHealthCheckCacheEntry>();

  /**
   * Extracts only the error type/name to avoid leaking sensitive data
   * (tokens, key IDs, request payloads) in error messages.
   *
   * @param error - The error to sanitize
   * @returns A safe error identifier (error name only)
   * @internal
   */
  private sanitizeErrorForLogging(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }
    return 'Unknown';
  }

  constructor(
    private readonly providerGetter: (name?: string) => IKmsProvider | undefined,
    private readonly defaultProviderName?: string,
    private readonly options: IEncryptionServiceOptions = {}
  ) {}

  /**
   * Get a KMS provider
   */
  private getKmsProvider(providerName?: string): IKmsProvider {
    const provider = this.providerGetter(providerName ?? this.defaultProviderName);

    if (!provider) {
      throw new KmsProviderNotFoundError(providerName ?? this.defaultProviderName ?? 'default');
    }

    return provider;
  }

  /**
   * Get or create envelope encryption service for a provider
   */
  private getEnvelopeService(provider: IKmsProvider): EnvelopeEncryptionService {
    const name = provider.name;

    if (!this.envelopeServices.has(name)) {
      this.envelopeServices.set(
        name,
        new EnvelopeEncryptionService(provider, {
          algorithm: this.options.algorithm ?? EncryptionAlgorithm.AES_256_GCM
        })
      );
    }

    const service = this.envelopeServices.get(name);
    if (!service) {
      // This should never happen - we just set the service above.
      // If it does, it indicates an internal consistency failure, not a missing provider.
      throw new EncryptionError(
        `Internal consistency failure: EnvelopeEncryptionService for provider "${name}" was not found in cache immediately after being set. This indicates a bug in the service cache mechanism.`
      );
    }
    return service;
  }

  /**
   * Validates that a KMS provider is available and healthy before use.
   *
   * This preflight check ensures the provider can perform operations before
   * attempting encryption/decryption, providing fail-fast behavior and
   * clearer error messages.
   *
   * Uses a short-lived in-memory cache (TTL: 30 seconds) to avoid redundant
   * health checks on every operation. Both successful and failed health checks
   * are cached to provide consistent behavior and reduce KMS API calls.
   *
   * Performs a two-phase availability check:
   * 1. First calls `isAvailable()` as a lightweight connectivity check
   * 2. Then calls `healthCheck()` for canonical health validation
   *
   * For most providers (GCP KMS, AWS KMS, Azure KeyVault, Vault Transit),
   * `healthCheck()` delegates to `isAvailable()`. For specialized providers
   * (EnvVar, GcpSecretManager), `healthCheck()` performs additional validation
   * beyond basic availability.
   *
   * @param provider - The KMS provider to validate
   * @param operation - The operation being attempted (for error context)
   * @throws {KmsProviderUnavailableError} When the provider is unavailable, unhealthy, or health check throws
   */
  private async ensureKmsAvailable(provider: IKmsProvider, operation: string): Promise<void> {
    const cacheKey = provider.name;
    const now = Date.now();

    // Check cache for recent health check result
    const cached = this.healthCheckCache.get(cacheKey);
    if (cached && now - cached.timestamp < HEALTH_CHECK_TTL_MS) {
      if (!cached.healthy) {
        throw new KmsProviderUnavailableError(provider.name, operation);
      }
      return;
    }

    try {
      // Phase 1: Lightweight availability check
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        // Cache the failure
        this.healthCheckCache.set(cacheKey, { healthy: false, timestamp: now });
        throw new KmsProviderUnavailableError(provider.name, operation);
      }

      // Phase 2: Full health check for canonical validation
      const isHealthy = await provider.healthCheck();

      // Cache the result (including failures)
      this.healthCheckCache.set(cacheKey, { healthy: isHealthy, timestamp: now });

      if (!isHealthy) {
        throw new KmsProviderUnavailableError(provider.name, operation);
      }
    } catch (error) {
      // Re-throw if already a KmsProviderUnavailableError (health check returned false)
      if (error instanceof KmsProviderUnavailableError) {
        throw error;
      }

      // Cache the failure
      this.healthCheckCache.set(cacheKey, { healthy: false, timestamp: now });

      // Wrap any other error in KmsProviderUnavailableError
      // Use sanitized error type only - never expose raw error messages that may contain
      // sensitive KMS details (key IDs, paths, credentials, internal state)
      throw new KmsProviderUnavailableError(
        provider.name,
        operation,
        this.sanitizeErrorForLogging(error)
      );
    }
  }

  /**
   * Encrypts data using envelope encryption.
   *
   * This method implements the envelope encryption pattern:
   * 1. Generates a random Data Encryption Key (DEK)
   * 2. Encrypts the plaintext using AES-256-GCM with the DEK
   * 3. Encrypts the DEK using the KMS provider's Key Encryption Key (KEK)
   * 4. Returns all components needed for decryption
   *
   * @param plaintext - The data to encrypt. Accepts Buffer or UTF-8 string.
   * @param options - Encryption options
   * @param options.provider - Name of the KMS provider to use (defaults to configured default)
   * @param options.keyId - Specific key ID to use for wrapping the DEK
   * @param options.algorithm - Encryption algorithm (defaults to AES-256-GCM)
   * @returns Promise resolving to envelope encryption result containing ciphertext,
   *          encrypted data key, IV, and authentication tag
   * @throws {KmsProviderNotFoundError} When the specified or default provider is not registered
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {EncryptionOperationError} When encryption fails due to cryptographic errors
   * @throws {DataKeyGenerationError} When DEK generation fails
   *
   * @example
   * ```typescript
   * const result = await encryptionService.encrypt('sensitive data', {
   *   provider: 'aws-kms',
   *   keyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
   * });
   * ```
   */
  async encrypt(
    plaintext: Buffer | string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<IEnvelopeEncryptionResult> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'encrypt');

    const envelopeService = this.getEnvelopeService(provider);

    const encryptOptions: IEnvelopeEncryptionOptions = {};
    if (options.keyId !== undefined) {
      encryptOptions.keyId = options.keyId;
    }
    encryptOptions.algorithm =
      options.algorithm ?? this.options.algorithm ?? EncryptionAlgorithm.AES_256_GCM;

    return envelopeService.encrypt(plaintext, encryptOptions);
  }

  /**
   * Decrypts data that was encrypted using envelope encryption.
   *
   * This method reverses the envelope encryption process:
   * 1. Decrypts the encrypted DEK using the KMS provider's KEK
   * 2. Uses the plaintext DEK to decrypt the ciphertext with AES-256-GCM
   * 3. Verifies the authentication tag to ensure data integrity
   *
   * @param ciphertext - The encrypted data as a Buffer
   * @param encryptedDataKey - The encrypted Data Encryption Key (wrapped by KMS)
   * @param iv - The initialization vector used during encryption (12 bytes for GCM)
   * @param authTag - The GCM authentication tag for integrity verification (16 bytes)
   * @param options - Decryption options
   * @param options.provider - Name of the KMS provider to use (defaults to configured default)
   * @param options.keyId - Specific key ID that was used to wrap the DEK
   * @param options.algorithm - Encryption algorithm (must match encryption algorithm)
   * @returns Promise resolving to the decrypted plaintext as a Buffer
   * @throws {KmsProviderNotFoundError} When the specified or default provider is not registered
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {DecryptionOperationError} When decryption fails (wrong key, corrupted data, or tampered ciphertext)
   * @throws {DataKeyDecryptionError} When DEK unwrapping fails
   *
   * @example
   * ```typescript
   * const plaintext = await encryptionService.decrypt(
   *   stored.ciphertext,
   *   stored.encryptedDataKey,
   *   stored.iv,
   *   stored.authTag,
   *   { provider: 'aws-kms' }
   * );
   * console.log(plaintext.toString('utf8'));
   * ```
   */
  async decrypt(
    ciphertext: Buffer,
    encryptedDataKey: Buffer,
    iv: Buffer,
    authTag: Buffer,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<Buffer> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'decrypt');

    const envelopeService = this.getEnvelopeService(provider);

    const decryptOptions: IEnvelopeEncryptionOptions = {};
    if (options.keyId !== undefined) {
      decryptOptions.keyId = options.keyId;
    }
    decryptOptions.algorithm =
      options.algorithm ?? this.options.algorithm ?? EncryptionAlgorithm.AES_256_GCM;

    return envelopeService.decrypt(ciphertext, encryptedDataKey, iv, authTag, decryptOptions);
  }

  /**
   * Encrypts a string and returns base64-encoded components.
   *
   * This is a convenience method optimized for database storage scenarios where
   * binary data needs to be stored as text. All encryption components are returned
   * as base64-encoded strings suitable for VARCHAR or TEXT columns.
   *
   * @param plaintext - The UTF-8 string to encrypt
   * @param options - Encryption options
   * @param options.provider - Name of the KMS provider to use
   * @param options.keyId - Specific key ID to use for wrapping the DEK
   * @param options.algorithm - Encryption algorithm (defaults to AES-256-GCM)
   * @returns Promise resolving to an object with base64-encoded encryption components
   * @throws {KmsProviderNotFoundError} When the specified or default provider is not registered
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {EncryptionOperationError} When encryption fails
   *
   * @example Database storage pattern
   * ```typescript
   * // Encrypt sensitive field before storing
   * const encrypted = await encryptionService.encryptToBase64(user.ssn);
   *
   * // Store in database as JSON or separate columns
   * await db.users.update({
   *   where: { id: user.id },
   *   data: {
   *     ssnEncrypted: encrypted.ciphertext,
   *     ssnKey: encrypted.encryptedDataKey,
   *     ssnIv: encrypted.iv,
   *     ssnTag: encrypted.authTag
   *   }
   * });
   * ```
   *
   * @example JSON field storage pattern
   * ```typescript
   * // Store all components as a single JSON field
   * await db.users.update({
   *   where: { id: user.id },
   *   data: {
   *     sensitiveData: JSON.stringify(await encryptionService.encryptToBase64(data))
   *   }
   * });
   * ```
   */
  async encryptToBase64(
    plaintext: string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<IBase64EncryptionResult> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'encryptToBase64');

    const envelopeService = this.getEnvelopeService(provider);

    const encryptOptions: IEnvelopeEncryptionOptions = {};
    if (options.keyId !== undefined) {
      encryptOptions.keyId = options.keyId;
    }
    encryptOptions.algorithm =
      options.algorithm ?? this.options.algorithm ?? EncryptionAlgorithm.AES_256_GCM;

    return envelopeService.encryptToBase64(plaintext, encryptOptions);
  }

  /**
   * Decrypts base64-encoded data back to a UTF-8 string.
   *
   * This is the counterpart to `encryptToBase64()`, designed for retrieving
   * encrypted data stored in database text columns.
   *
   * @param ciphertext - Base64-encoded ciphertext
   * @param encryptedDataKey - Base64-encoded encrypted DEK
   * @param iv - Base64-encoded initialization vector
   * @param authTag - Base64-encoded authentication tag
   * @param options - Decryption options
   * @param options.provider - Name of the KMS provider to use
   * @param options.keyId - Specific key ID used during encryption
   * @param options.algorithm - Encryption algorithm (must match encryption)
   * @returns Promise resolving to the decrypted UTF-8 string
   * @throws {KmsProviderNotFoundError} When the specified or default provider is not registered
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {DecryptionOperationError} When decryption fails
   *
   * @example Database retrieval pattern
   * ```typescript
   * // Retrieve encrypted data from database
   * const user = await db.users.findUnique({ where: { id: userId } });
   *
   * // Decrypt the sensitive field
   * const ssn = await encryptionService.decryptFromBase64(
   *   user.ssnEncrypted,
   *   user.ssnKey,
   *   user.ssnIv,
   *   user.ssnTag
   * );
   * ```
   *
   * @example JSON field retrieval pattern
   * ```typescript
   * const stored = JSON.parse(user.sensitiveData);
   * const plaintext = await encryptionService.decryptFromBase64(
   *   stored.ciphertext,
   *   stored.encryptedDataKey,
   *   stored.iv,
   *   stored.authTag
   * );
   * ```
   */
  async decryptFromBase64(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<string> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'decryptFromBase64');

    const envelopeService = this.getEnvelopeService(provider);

    const decryptOptions: IEnvelopeEncryptionOptions = {};
    if (options.keyId !== undefined) {
      decryptOptions.keyId = options.keyId;
    }
    decryptOptions.algorithm =
      options.algorithm ?? this.options.algorithm ?? EncryptionAlgorithm.AES_256_GCM;

    return envelopeService.decryptFromBase64(
      ciphertext,
      encryptedDataKey,
      iv,
      authTag,
      decryptOptions
    );
  }

  /**
   * Encrypts a plaintext data key with a specified KMS key.
   *
   * This low-level method is primarily used during key rotation operations
   * to wrap an existing plaintext DEK with a new KEK. It enables re-keying
   * data without re-encrypting the underlying ciphertext.
   *
   * @param dataKeyPlaintext - The plaintext DEK to encrypt (typically 32 bytes for AES-256)
   * @param keyId - The KMS key ID to use for encryption (the new KEK)
   * @param options - Operation options
   * @param options.provider - Name of the KMS provider to use
   * @returns Promise resolving to the encrypted DEK
   * @throws {KmsProviderNotFoundError} When the specified provider is not found
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {Error} When KMS encryption operation fails
   *
   * @see {@link reencryptDataKey} for atomic key rotation operations
   */
  async encryptDataKey(
    dataKeyPlaintext: Buffer,
    keyId: string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<Buffer> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'encryptDataKey');

    // Bug A2: defensively copy the caller's plaintext DEK. KMS providers
    // (especially HSM-backed) may defensively zero their input as an
    // optimization; without this copy that zero would wipe the caller's
    // buffer too. The copy is zeroed on return so the original plaintext
    // does not linger in service-internal memory longer than necessary.
    const localCopy = Buffer.from(dataKeyPlaintext);
    try {
      return await provider.encrypt(localCopy, keyId);
    } finally {
      localCopy.fill(0);
    }
  }

  /**
   * Decrypts an encrypted data key to obtain the plaintext DEK.
   *
   * This low-level method is primarily used during key rotation operations
   * to unwrap a DEK before re-wrapping it with a new KEK.
   *
   * @param encryptedDataKey - The encrypted DEK to decrypt
   * @param keyId - The KMS key ID used to encrypt the DEK
   * @param options - Operation options
   * @param options.provider - Name of the KMS provider to use
   * @returns Promise resolving to the plaintext DEK
   * @throws {KmsProviderNotFoundError} When the specified provider is not found
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {Error} When KMS decryption operation fails
   *
   * @see {@link reencryptDataKey} for atomic key rotation operations
   */
  async decryptDataKey(
    encryptedDataKey: Buffer,
    keyId: string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<Buffer> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'decryptDataKey');

    // Bug A2: defensively copy the provider's return value. Provider
    // implementations may return views (typed-array slices) backed by
    // KMS-internal buffers; without this copy, zeroing the caller's buffer
    // could affect the provider's internal state.
    const plaintext = await provider.decrypt(encryptedDataKey, keyId);
    return Buffer.from(plaintext);
  }

  /**
   * Re-encrypts a data key from an old KEK to a new KEK.
   *
   * This method performs key rotation at the DEK level, allowing existing
   * ciphertext to be associated with a new KEK without re-encrypting the data.
   *
   * ## Implementation Strategy
   *
   * The method attempts two approaches in order:
   * 1. **Rewrap** (preferred): Uses the KMS provider's native rewrap operation
   *    if available. This is more efficient and may provide additional security
   *    guarantees (e.g., never exposing plaintext DEK to the application).
   * 2. **Decrypt + Encrypt** (fallback): Decrypts the DEK with the old key and
   *    re-encrypts it with the new key. The plaintext DEK is briefly in memory.
   *
   * @param encryptedDataKey - The DEK encrypted with the old KEK
   * @param oldKeyId - The KMS key ID currently wrapping the DEK
   * @param newKeyId - The KMS key ID to re-wrap the DEK with
   * @param options - Operation options
   * @param options.provider - Name of the KMS provider to use
   * @returns Promise resolving to the re-encrypted DEK with key ID metadata
   * @throws {KmsProviderNotFoundError} When the specified provider is not found
   * @throws {KmsProviderUnavailableError} When the provider is unavailable or fails health check
   * @throws {Error} When re-encryption fails
   *
   * @see {@link KeyRotationService} for orchestrated key rotation workflows
   */
  async reencryptDataKey(
    encryptedDataKey: Buffer,
    oldKeyId: string,
    newKeyId: string,
    options: IEnvelopeEncryptionOptions & { provider?: string } = {}
  ): Promise<{ encryptedDataKey: Buffer; oldKeyId: string; newKeyId: string }> {
    const provider = this.getKmsProvider(options.provider);

    // Validate provider availability before proceeding
    await this.ensureKmsAvailable(provider, 'reencryptDataKey');

    // Try to use provider's rewrap method if available
    if (provider.rewrap) {
      const result = await provider.rewrap(encryptedDataKey, newKeyId, oldKeyId);
      return {
        encryptedDataKey: result.ciphertext,
        oldKeyId,
        newKeyId
      };
    }

    // Fallback: decrypt with old key, encrypt with new key
    const decryptedDataKey = await provider.decrypt(encryptedDataKey, oldKeyId);
    try {
      const reencrypted = await provider.encrypt(decryptedDataKey, newKeyId);

      return {
        encryptedDataKey: reencrypted,
        oldKeyId,
        newKeyId
      };
    } finally {
      // Zero out plaintext to minimize exposure time in memory
      decryptedDataKey.fill(0);
    }
  }

  /**
   * Retrieves a KMS provider by name.
   *
   * @param providerName - Name of the provider to retrieve. If not specified,
   *                       returns the default provider.
   * @returns The KMS provider instance, or undefined if not found
   */
  getProvider(providerName?: string): IKmsProvider | undefined {
    return this.providerGetter(providerName);
  }
}

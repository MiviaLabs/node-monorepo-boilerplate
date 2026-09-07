/**
 * Envelope Encryption Service
 *
 * Implements envelope encryption pattern using data keys from KMS
 *
 * @module encryption/services
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

import { Logger } from '@nestjs/common';

import { EncryptionAlgorithm } from '../constants';
import {
  DataKeyGenerationError,
  DataKeyDecryptionError,
  EncryptionOperationError,
  KmsProviderUnavailableError
} from '../errors';
import { withTracing, EncryptionOperation, type EncryptionTelemetryContext } from '../telemetry';

import type { IKmsProvider, IDataKeyResult } from '../providers/kms-provider.interface';
import type { CipherGCM, DecipherGCM } from 'crypto';

/**
 * Cryptographic constants for AES-GCM encryption.
 *
 * ## IV Length (12 bytes / 96 bits)
 *
 * Per NIST SP 800-38D Section 5.2.1.1, 96-bit IVs are the recommended length
 * for GCM mode because:
 * - They are processed more efficiently than other lengths
 * - The counter portion is maximized for large data encryption
 * - No additional GHASH computation is required for IV derivation
 *
 * ## Authentication Tag (16 bytes / 128 bits)
 *
 * GCM produces authentication tags of configurable length (96-128 bits).
 * We use the maximum 128-bit tag length for:
 * - Maximum forgery resistance (2^-128 probability)
 * - Compliance with NIST recommendations for high-security applications
 *
 * ## Key Length (32 bytes / 256 bits)
 *
 * AES-256 provides:
 * - Quantum-resistant key strength (Grover's algorithm reduces to 128-bit security)
 * - Exceeds all current regulatory requirements (PCI DSS, HIPAA, FedRAMP)
 * - Future-proofing against cryptographic advances
 *
 * @see NIST SP 800-38D - Recommendation for Block Cipher Modes of Operation: GCM
 * @internal
 */
const GCM_IV_LENGTH = 12; // bytes (96 bits) - recommended for GCM

/**
 * Expected key lengths for each supported algorithm.
 *
 * AES key sizes:
 * - AES-128: 16 bytes (128 bits)
 * - AES-256: 32 bytes (256 bits)
 *
 * @internal
 */
const ALGORITHM_KEY_LENGTHS: Record<EncryptionAlgorithm, number> = {
  [EncryptionAlgorithm.AES_128_GCM]: 16, // 128 bits
  [EncryptionAlgorithm.AES_256_GCM]: 32 // 256 bits
};

/**
 * Gets the expected key length for an encryption algorithm.
 *
 * @param algorithm - The encryption algorithm
 * @returns Expected key length in bytes
 * @throws {EncryptionOperationError} If algorithm is not supported
 * @internal
 */
function getKeyLengthForAlgorithm(algorithm: EncryptionAlgorithm): number {
  const length = ALGORITHM_KEY_LENGTHS[algorithm];
  if (length === undefined) {
    throw new EncryptionOperationError(
      'getKeyLength',
      new Error(`Unsupported algorithm: ${algorithm}`)
    );
  }
  return length;
}

/**
 * Derives a DEK of the correct length for the specified algorithm.
 *
 * KMS providers generate 32-byte (AES-256) keys by default. For AES-128-GCM,
 * we truncate to 16 bytes. This is cryptographically safe because:
 * - The source key is CSPRNG-derived (uniform random distribution)
 * - Truncation preserves entropy density (128 bits from 256 bits)
 * - Each truncated key is used with a unique IV
 *
 * The returned buffer is always a copy (not a view) to ensure that zeroing
 * the derived key also zeroes the key material, even when truncating.
 *
 * @param dek - The 32-byte DEK from the KMS provider
 * @param algorithm - The target encryption algorithm
 * @returns DEK copy of the correct length for the algorithm
 * @throws {EncryptionOperationError} If source DEK is shorter than required
 * @internal
 */
function deriveKeyForAlgorithm(dek: Buffer, algorithm: EncryptionAlgorithm): Buffer {
  const requiredLength = getKeyLengthForAlgorithm(algorithm);

  if (dek.length === requiredLength) {
    // Return a copy (not the original) to enable unconditional secure zeroing
    // of both derivedKey and dataKey.plaintext by callers
    return Buffer.from(dek);
  }

  if (dek.length < requiredLength) {
    throw new EncryptionOperationError(
      'deriveKeyForAlgorithm',
      new Error(
        `DEK too short: got ${dek.length} bytes, need at least ${requiredLength} bytes for ${algorithm}`
      )
    );
  }

  // Truncate to required length and return a copy (not a view) to enable secure zeroing
  return Buffer.from(dek.subarray(0, requiredLength));
}

/**
 * Result of an envelope encryption operation.
 *
 * Contains all components necessary to store and later decrypt the data.
 * All components must be stored together; losing any component makes
 * decryption impossible.
 *
 * @interface IEnvelopeEncryptionResult
 */
export interface IEnvelopeEncryptionResult {
  /**
   * The encrypted data. This can be of any size as AES-GCM is a streaming
   * cipher and does not pad the plaintext.
   */
  ciphertext: Buffer;

  /**
   * The Data Encryption Key (DEK) encrypted by the KMS Key Encryption Key (KEK).
   * This enables key rotation without re-encrypting the data.
   */
  encryptedDataKey: Buffer;

  /**
   * The initialization vector used for encryption.
   * Always 12 bytes (96 bits) for optimal GCM performance.
   * Must be unique for each encryption operation with the same key.
   */
  iv: Buffer;

  /**
   * The GCM authentication tag providing integrity and authenticity.
   * Always 16 bytes (128 bits) for maximum security.
   * Verification failure indicates tampering or corruption.
   */
  authTag: Buffer;
}

/**
 * Options for envelope encryption operations.
 *
 * @interface IEnvelopeEncryptionOptions
 */
export interface IEnvelopeEncryptionOptions {
  /**
   * Encryption algorithm to use.
   * Defaults to AES-256-GCM which provides authenticated encryption.
   */
  algorithm?: EncryptionAlgorithm;

  /**
   * KMS key ID to use for data key generation and wrapping.
   * If not specified, the provider's default key is used.
   */
  keyId?: string;
}

/**
 * Configuration options for the EnvelopeEncryptionService.
 *
 * Controls availability checking behavior including caching and circuit breaker
 * patterns to optimize performance for trusted providers.
 *
 * @interface IEnvelopeEncryptionServiceOptions
 */
export interface IEnvelopeEncryptionServiceOptions extends IEnvelopeEncryptionOptions {
  /**
   * Skip preflight availability checks for trusted providers.
   *
   * When true, the service will not call `isAvailable()` before each operation,
   * assuming the provider is always available. Use for providers that have been
   * validated at startup or are known to be highly reliable.
   *
   * @default false
   */
  skipPreflightChecks?: boolean;

  /**
   * Time-to-live for cached availability state in milliseconds.
   *
   * After a successful availability check, subsequent operations will use
   * the cached result until this TTL expires.
   *
   * @default 30000 (30 seconds)
   */
  availabilityCacheTtlMs?: number;

  /**
   * Number of consecutive failures before opening the circuit breaker.
   *
   * When this threshold is reached, the service will stop calling `isAvailable()`
   * and immediately return unavailable until the cooldown period expires.
   *
   * @default 3
   */
  circuitBreakerThreshold?: number;

  /**
   * Cooldown period in milliseconds after circuit breaker trips.
   *
   * During this period, operations will fail fast without calling `isAvailable()`.
   * After cooldown, the next operation will attempt to check availability again.
   *
   * @default 60000 (60 seconds)
   */
  circuitBreakerCooldownMs?: number;
}

/**
 * Implements the envelope encryption pattern for secure data encryption.
 *
 * Envelope encryption encrypts data with a random DEK, then wraps the DEK
 * with a KMS-managed KEK. This enables efficient key rotation (re-wrap DEKs
 * without re-encrypting data) and reduces KMS API calls to one per operation.
 *
 * See docs/ENVELOPE_ENCRYPTION.md for detailed documentation
 * @see {@link EncryptionService} for the high-level API that wraps this service
 * @see {@link IKmsProvider} for the KMS provider interface
 */
export class EnvelopeEncryptionService {
  private readonly logger = new Logger(EnvelopeEncryptionService.name);
  private readonly algorithm: EncryptionAlgorithm;

  // Availability caching configuration
  private readonly skipPreflightChecks: boolean;
  private readonly availabilityCacheTtlMs: number;
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerCooldownMs: number;

  // Availability cache state
  private cachedIsAvailable: boolean | null = null;
  private lastAvailabilityCheckAt: number = 0;
  private consecutiveFailures: number = 0;
  private circuitOpenedAt: number = 0;

  // Bug A3: in-flight probe promise. Concurrent checkAvailability() calls
  // share the same probe instead of each issuing their own. Reset to null
  // when the probe resolves.
  private inflightProbe: Promise<boolean> | null = null;

  constructor(
    private readonly kmsProvider: IKmsProvider,
    options: IEnvelopeEncryptionServiceOptions = {}
  ) {
    this.algorithm = options.algorithm ?? EncryptionAlgorithm.AES_256_GCM;
    this.skipPreflightChecks = options.skipPreflightChecks ?? false;
    this.availabilityCacheTtlMs = options.availabilityCacheTtlMs ?? 30_000;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold ?? 3;
    this.circuitBreakerCooldownMs = options.circuitBreakerCooldownMs ?? 60_000;
  }

  /**
   * Build telemetry context
   *
   * @param algorithm - The algorithm being used for this operation
   * @param keyId - Optional key ID for this operation
   */
  private buildTelemetryContext(
    algorithm: EncryptionAlgorithm,
    keyId?: string
  ): EncryptionTelemetryContext {
    const ctx: EncryptionTelemetryContext = {
      provider: this.kmsProvider.name,
      algorithm
    };
    if (keyId !== undefined) {
      ctx.keyId = keyId;
    }
    return ctx;
  }

  /**
   * Checks if the circuit breaker is currently open.
   *
   * @param now - Current timestamp in milliseconds
   * @returns true if circuit is open and cooldown hasn't expired
   */
  private isCircuitOpen(now: number): boolean {
    if (this.consecutiveFailures < this.circuitBreakerThreshold) {
      return false;
    }
    const timeSinceOpen = now - this.circuitOpenedAt;
    return timeSinceOpen < this.circuitBreakerCooldownMs;
  }

  /**
   * Resets the circuit breaker if the cooldown period has expired.
   *
   * @param now - Current timestamp in milliseconds
   */
  private resetCircuitIfCooldownExpired(now: number): void {
    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      const timeSinceOpen = now - this.circuitOpenedAt;
      if (timeSinceOpen >= this.circuitBreakerCooldownMs) {
        this.consecutiveFailures = 0;
        this.circuitOpenedAt = 0;
      }
    }
  }

  /**
   * Checks if the cached availability result is still valid.
   *
   * @param now - Current timestamp in milliseconds
   * @returns The cached value if valid, or null if cache is stale/empty
   */
  private getCachedAvailability(now: number): boolean | null {
    if (this.cachedIsAvailable === null) {
      return null;
    }
    const timeSinceCheck = now - this.lastAvailabilityCheckAt;
    if (timeSinceCheck < this.availabilityCacheTtlMs) {
      return this.cachedIsAvailable;
    }
    return null;
  }

  /**
   * Performs two-phase availability probing against the KMS provider.
   *
   * Phase 1: Lightweight `isAvailable()` check for connectivity
   * Phase 2: Full `healthCheck()` for canonical validation
   *
   * @param now - Current timestamp in milliseconds
   * @returns true if provider is available and healthy
   */
  private async performAvailabilityProbes(now: number): Promise<boolean> {
    // Phase 1: Lightweight availability check
    const isAvailable = await this.kmsProvider.isAvailable();
    if (!isAvailable) {
      this.handleAvailabilityFailure(now);
      return false;
    }

    // Phase 2: Full health check for canonical validation
    const isHealthy = await this.kmsProvider.healthCheck();
    this.cachedIsAvailable = isHealthy;
    this.lastAvailabilityCheckAt = now;

    if (isHealthy) {
      this.consecutiveFailures = 0;
      this.circuitOpenedAt = 0;
    } else {
      this.handleAvailabilityFailure(now);
    }

    return isHealthy;
  }

  /**
   * Checks KMS provider availability with caching and circuit breaker pattern.
   *
   * This method optimizes availability checking by:
   * - Skipping checks entirely if `skipPreflightChecks` is enabled
   * - Using cached results within the TTL window
   * - Implementing circuit breaker to fail fast after repeated failures
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
   * @returns true if provider is available and healthy, false otherwise
   */
  private async checkAvailability(): Promise<boolean> {
    if (this.skipPreflightChecks) {
      return true;
    }

    const now = Date.now();

    // Reset circuit breaker if cooldown expired, then check if still open
    this.resetCircuitIfCooldownExpired(now);
    if (this.isCircuitOpen(now)) {
      return false;
    }

    // Return cached value if still valid
    const cached = this.getCachedAvailability(now);
    if (cached !== null) {
      return cached;
    }

    // Bug A3: if a probe is already in flight, share its result instead of
    // issuing a redundant network round-trip.
    if (this.inflightProbe) {
      return this.inflightProbe;
    }

    // Perform two-phase availability probes
    this.inflightProbe = (async () => {
      try {
        return await this.performAvailabilityProbes(now);
      } catch (error) {
        this.logger.warn(
          `KMS availability check failed for provider "${this.kmsProvider.name}": ${error instanceof Error ? error.name : 'UnknownError'}`
        );
        this.handleAvailabilityFailure(now);
        return false;
      } finally {
        this.inflightProbe = null;
      }
    })();

    return this.inflightProbe;
  }

  /**
   * Handles availability check failure by incrementing counter and
   * potentially opening the circuit breaker.
   */
  private handleAvailabilityFailure(now: number): void {
    this.cachedIsAvailable = false;
    this.lastAvailabilityCheckAt = now;
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.circuitOpenedAt = now;
    }
  }

  /**
   * Encrypts data using the envelope encryption pattern.
   *
   * ## Encryption Workflow
   *
   * 1. **DEK Generation**: Requests a new Data Encryption Key from the KMS provider.
   *    The KMS returns both the plaintext DEK and the DEK encrypted by the KEK.
   *
   * 2. **IV Generation**: Generates a cryptographically random 12-byte IV using
   *    Node.js crypto.randomBytes (backed by OS entropy).
   *
   * 3. **Data Encryption**: Encrypts the plaintext using AES-256-GCM with the
   *    plaintext DEK and random IV.
   *
   * 4. **Result Assembly**: Returns the ciphertext, encrypted DEK, IV, and auth tag.
   *    The plaintext DEK is discarded after encryption.
   *
   * @param plaintext - Data to encrypt. Accepts Buffer or UTF-8 string.
   * @param options - Encryption options
   * @param options.algorithm - Encryption algorithm (default: AES-256-GCM)
   * @param options.keyId - KMS key ID for DEK generation
   * @returns Promise resolving to the envelope encryption result
   * @throws {DataKeyGenerationError} When the KMS fails to generate a data key
   * @throws {Error} When cryptographic operations fail
   *
   * @example
   * ```typescript
   * const result = await envelopeService.encrypt('sensitive PII data', {
   *   keyId: 'arn:aws:kms:us-east-1:123456789012:key/...'
   * });
   * // result.ciphertext - encrypted data
   * // result.encryptedDataKey - DEK wrapped by KEK
   * // result.iv - unique initialization vector
   * // result.authTag - integrity verification tag
   * ```
   */
  async encrypt(
    plaintext: Buffer | string,
    options: IEnvelopeEncryptionOptions = {}
  ): Promise<IEnvelopeEncryptionResult> {
    // Bug A1: validate plaintext type at entry point. Buffer.from() rejects null,
    // numbers, objects, etc. with a raw Node TypeError that bypasses our structured
    // EncryptionError contract. Reject up-front with a sanitized message.
    if (plaintext === null || plaintext === undefined) {
      throw new EncryptionOperationError(
        'encrypt',
        new TypeError('plaintext must be a non-null string or Buffer')
      );
    }
    if (typeof plaintext !== 'string' && !Buffer.isBuffer(plaintext)) {
      throw new EncryptionOperationError(
        'encrypt',
        new TypeError(`plaintext must be a string or Buffer (got ${typeof plaintext})`)
      );
    }

    // Use per-call algorithm if provided, otherwise fall back to instance default
    const effectiveAlgorithm = options.algorithm ?? this.algorithm;
    const telemetryCtx = this.buildTelemetryContext(effectiveAlgorithm, options.keyId);

    return withTracing(
      EncryptionOperation.ENVELOPE_ENCRYPT,
      async () => {
        // Fail fast if provider is unavailable (uses cached/circuit breaker logic)
        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
          throw new KmsProviderUnavailableError(this.kmsProvider.name, 'encrypt');
        }

        const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');

        // Generate data key
        const dataKey = await this.generateDataKey(options.keyId);

        // Derive key of correct length for the algorithm
        // KMS providers return 32-byte keys; for AES-128 we truncate to 16 bytes
        const derivedKey = deriveKeyForAlgorithm(dataKey.plaintext, effectiveAlgorithm);

        try {
          // Encrypt data with derived key using the effective algorithm
          const iv = randomBytes(GCM_IV_LENGTH);
          const cipher = createCipheriv(effectiveAlgorithm, derivedKey, iv) as CipherGCM;

          const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
          const authTag = cipher.getAuthTag();

          return {
            ciphertext,
            encryptedDataKey: dataKey.ciphertext,
            iv,
            authTag
          };
        } finally {
          // Securely zero both keys to minimize exposure in memory
          // derivedKey is always a separate buffer copy from deriveKeyForAlgorithm
          dataKey.plaintext.fill(0);
          derivedKey.fill(0);
        }
      },
      {
        ...telemetryCtx,
        dataSize: Buffer.isBuffer(plaintext) ? plaintext.length : Buffer.byteLength(plaintext)
      }
    );
  }

  /**
   * Decrypts data that was encrypted using envelope encryption.
   *
   * ## Decryption Workflow
   *
   * 1. **DEK Unwrapping**: Sends the encrypted DEK to the KMS provider for
   *    decryption using the KEK. This is the only KMS call required.
   *
   * 2. **Data Decryption**: Uses the plaintext DEK with AES-256-GCM to decrypt
   *    the ciphertext, using the stored IV.
   *
   * 3. **Integrity Verification**: GCM verifies the authentication tag. If
   *    verification fails, decryption throws an error indicating tampering.
   *
   * 4. **Cleanup**: The plaintext DEK is discarded after decryption.
   *
   * @param ciphertext - The encrypted data
   * @param encryptedDataKey - The DEK encrypted by the KMS (from encryption result)
   * @param iv - The initialization vector used during encryption (12 bytes)
   * @param authTag - The GCM authentication tag (16 bytes)
   * @param options - Decryption options
   * @param options.algorithm - Must match the algorithm used for encryption
   * @param options.keyId - KMS key ID (must match the key used to wrap the DEK)
   * @returns Promise resolving to the decrypted plaintext as a Buffer
   * @throws {DataKeyDecryptionError} When the KMS fails to unwrap the data key
   * @throws {Error} When GCM authentication fails (data tampering detected)
   * @throws {Error} When cryptographic operations fail
   *
   * @example
   * ```typescript
   * const plaintext = await envelopeService.decrypt(
   *   stored.ciphertext,
   *   stored.encryptedDataKey,
   *   stored.iv,
   *   stored.authTag
   * );
   * const sensitiveData = plaintext.toString('utf8');
   * ```
   */
  async decrypt(
    ciphertext: Buffer,
    encryptedDataKey: Buffer,
    iv: Buffer,
    authTag: Buffer,
    options: IEnvelopeEncryptionOptions = {}
  ): Promise<Buffer> {
    // Use per-call algorithm if provided, otherwise fall back to instance default
    const effectiveAlgorithm = options.algorithm ?? this.algorithm;
    const telemetryCtx = this.buildTelemetryContext(effectiveAlgorithm, options.keyId);

    return withTracing(
      EncryptionOperation.ENVELOPE_DECRYPT,
      async () => {
        // Fail fast if provider is unavailable (uses cached/circuit breaker logic)
        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
          throw new KmsProviderUnavailableError(this.kmsProvider.name, 'decrypt');
        }

        // Decrypt data key
        const dataKey = await this.decryptDataKey(encryptedDataKey, options.keyId);

        // Derive key of correct length for the algorithm
        // KMS providers return 32-byte keys; for AES-128 we truncate to 16 bytes
        const derivedKey = deriveKeyForAlgorithm(dataKey, effectiveAlgorithm);

        try {
          // Decrypt data with derived key using the effective algorithm
          const decipher = createDecipheriv(effectiveAlgorithm, derivedKey, iv) as DecipherGCM;
          decipher.setAuthTag(authTag);

          const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
          return plaintext;
        } finally {
          // Securely zero both keys to minimize exposure in memory
          // derivedKey is always a separate buffer copy from deriveKeyForAlgorithm
          dataKey.fill(0);
          derivedKey.fill(0);
        }
      },
      { ...telemetryCtx, dataSize: ciphertext.length }
    );
  }

  /**
   * Generates a new Data Encryption Key (DEK) from the KMS provider.
   *
   * The KMS provider returns both the plaintext DEK and the DEK encrypted
   * by the Key Encryption Key (KEK). The plaintext is used for encryption,
   * while the ciphertext is stored alongside the encrypted data.
   *
   * @param keyId - Optional KMS key identifier. If not provided, the
   *   provider's default key is used.
   * @returns Promise resolving to an IDataKeyResult containing:
   *   - `plaintext`: Buffer with the raw DEK for encryption operations
   *   - `ciphertext`: Buffer with the KEK-encrypted DEK for storage
   * @throws {DataKeyGenerationError} When the KMS provider fails to generate a key
   */
  private async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    try {
      return await this.kmsProvider.generateDataKey(keyId);
    } catch (error) {
      throw new DataKeyGenerationError(error);
    }
  }

  /**
   * Decrypts an encrypted Data Encryption Key (DEK) using the KMS provider.
   *
   * Sends the encrypted DEK to the KMS for unwrapping using the Key Encryption
   * Key (KEK). This is the only KMS call required during decryption.
   *
   * @param encryptedDataKey - Buffer containing the KEK-encrypted DEK
   *   (from a previous envelope encryption operation)
   * @param keyId - Optional KMS key identifier. Must match the key used
   *   to originally encrypt the DEK.
   * @returns Promise resolving to a Buffer containing the plaintext DEK
   * @throws {DataKeyDecryptionError} When the KMS provider fails to decrypt the key
   */
  private async decryptDataKey(encryptedDataKey: Buffer, keyId?: string): Promise<Buffer> {
    try {
      return await this.kmsProvider.decrypt(encryptedDataKey, keyId);
    } catch (error) {
      throw new DataKeyDecryptionError(error);
    }
  }

  /**
   * Encrypts a string and returns base64-encoded components.
   *
   * Convenience method for database storage scenarios where binary data
   * must be stored as text. All encryption components are returned as
   * base64 strings suitable for VARCHAR or TEXT columns.
   *
   * @param plaintext - UTF-8 string to encrypt
   * @param options - Encryption options
   * @returns Promise resolving to base64-encoded encryption components
   * @throws {DataKeyGenerationError} When DEK generation fails
   */
  async encryptToBase64(
    plaintext: string,
    options: IEnvelopeEncryptionOptions = {}
  ): Promise<{
    ciphertext: string;
    encryptedDataKey: string;
    iv: string;
    authTag: string;
  }> {
    const result = await this.encrypt(plaintext, options);
    return {
      ciphertext: result.ciphertext.toString('base64'),
      encryptedDataKey: result.encryptedDataKey.toString('base64'),
      iv: result.iv.toString('base64'),
      authTag: result.authTag.toString('base64')
    };
  }

  /**
   * Decrypts base64-encoded data back to a UTF-8 string.
   *
   * Counterpart to encryptToBase64() for retrieving encrypted data
   * stored in database text columns.
   *
   * @param ciphertext - Base64-encoded ciphertext
   * @param encryptedDataKey - Base64-encoded encrypted DEK
   * @param iv - Base64-encoded initialization vector
   * @param authTag - Base64-encoded authentication tag
   * @param options - Decryption options
   * @returns Promise resolving to the decrypted UTF-8 string
   * @throws {DataKeyDecryptionError} When DEK unwrapping fails
   * @throws {Error} When authentication verification fails
   */
  async decryptFromBase64(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string,
    options: IEnvelopeEncryptionOptions = {}
  ): Promise<string> {
    const result = await this.decrypt(
      Buffer.from(ciphertext, 'base64'),
      Buffer.from(encryptedDataKey, 'base64'),
      Buffer.from(iv, 'base64'),
      Buffer.from(authTag, 'base64'),
      options
    );
    return result.toString('utf8');
  }
}

/**
 * Factory function to create an EnvelopeEncryptionService instance.
 *
 * @param kmsProvider - The KMS provider for key management operations
 * @param options - Optional configuration for the service including availability caching
 * @returns A configured EnvelopeEncryptionService instance
 *
 * @example Basic usage
 * ```typescript
 * const envelopeService = createEnvelopeEncryptionService(awsKmsProvider, {
 *   algorithm: EncryptionAlgorithm.AES_256_GCM
 * });
 * ```
 *
 * @example With availability caching for high-throughput scenarios
 * ```typescript
 * const envelopeService = createEnvelopeEncryptionService(awsKmsProvider, {
 *   skipPreflightChecks: true, // Trust the provider is always available
 *   availabilityCacheTtlMs: 60000, // Cache for 1 minute
 *   circuitBreakerThreshold: 5, // Open circuit after 5 failures
 *   circuitBreakerCooldownMs: 120000 // Cooldown for 2 minutes
 * });
 * ```
 */
export function createEnvelopeEncryptionService(
  kmsProvider: IKmsProvider,
  options?: IEnvelopeEncryptionServiceOptions
): EnvelopeEncryptionService {
  return new EnvelopeEncryptionService(kmsProvider, options);
}

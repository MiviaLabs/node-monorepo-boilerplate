/**
 * Environment Variable Provider
 *
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  WARNING: DEVELOPMENT AND TESTING ONLY - NOT FOR PRODUCTION USE ⚠️  ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 *
 * Implements KMS operations using environment variables for encryption keys.
 * This is the **simplest** provider for development and testing scenarios
 * where external KMS dependencies are not desired.
 *
 * ## Security Risks (Why NOT Production)
 *
 * | Risk | Impact | Mitigation |
 * |------|--------|------------|
 * | Process visibility | All processes can read env vars | Use cloud KMS |
 * | No hardware protection | Keys in software memory | Use HSM-backed KMS |
 * | No audit logging | No key usage tracking | Use cloud KMS audit logs |
 * | No access control | No RBAC for key access | Use IAM/RBAC policies |
 * | Manual key rotation | Error-prone, risky | Use automated rotation |
 * | Container secrets | Visible in orchestrator | Use secrets managers |
 *
 * ## When to Use This Provider
 *
 * ✅ **Appropriate Use Cases:**
 * - Local development environments
 * - Unit and integration testing
 * - CI/CD pipeline testing
 * - Quick prototyping
 * - Educational/learning purposes
 *
 * ❌ **NEVER Use For:**
 * - Production workloads
 * - Multi-tenant applications
 * - Compliance-regulated data (PCI DSS, HIPAA, SOC 2)
 * - Sensitive personal information (GDPR, PDPL)
 * - Financial or healthcare data
 *
 * ## Architecture
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │            Application                        │
 * │                 │                             │
 * │        EnvVarProvider.encrypt()               │
 * │                 │                             │
 * │    ┌───────────┴───────────┐                 │
 * │    │                       │                 │
 * │    ▼                       ▼                 │
 * │  ENCRYPTION_KEY     crypto.randomBytes()     │
 * │  (from env var)     (IV generation)          │
 * │    │                       │                 │
 * │    └───────────┬───────────┘                 │
 * │                │                             │
 * │       AES-256-GCM Encryption                 │
 * │                │                             │
 * │                ▼                             │
 * │    [IV | AuthTag | Ciphertext]               │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * ## Key Format
 *
 * Keys must be 32 bytes (256 bits) hex-encoded (64 characters):
 * ```bash
 * # Generate a valid key:
 * node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * ```
 *
 * @module encryption/providers/env-var
 *
 * @example Development setup
 * ```typescript
 * // Generate a key first:
 * // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * const provider = new EnvVarProvider({
 *   encryptionKey: process.env.DEV_ENCRYPTION_KEY
 * });
 *
 * // Or use environment variable naming convention:
 * // Set ENCRYPTION_KEY=<64-char-hex>
 * const provider = new EnvVarProvider();
 * ```
 *
 * @example Conditional provider selection
 * ```typescript
 * const provider = process.env.NODE_ENV === 'production'
 *   ? new AwsKmsProvider({ region: 'us-east-1', keyId: 'alias/prod-key' })
 *   : new EnvVarProvider({ encryptionKey: process.env.DEV_KEY });
 * ```
 */

import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';

import { InvalidKmsConfigError, KeyNotFoundError } from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo, IRewrapResult } from './kms-provider.interface';

import type { IEnvVarProviderOptions } from './factory.types';
import type { CipherGCM, DecipherGCM } from 'crypto';

/**
 * Cryptographic constants for AES-GCM encryption
 */
const AES_256_KEY_LENGTH = 32; // bytes (256 bits)
const GCM_IV_LENGTH = 12; // bytes (96 bits) - recommended for GCM
const GCM_AUTH_TAG_LENGTH = 16; // bytes (128 bits) - used in encrypted format offset calculation
const ENCRYPTED_FORMAT_IV_OFFSET = 0;
const ENCRYPTED_FORMAT_AUTH_TAG_OFFSET = GCM_IV_LENGTH; // 12
const ENCRYPTED_FORMAT_CIPHERTEXT_OFFSET = GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH; // 28

/**
 * Environment variable naming pattern
 * Format: ENCRYPTION_KEY_<keyId> or ENCRYPTION_KEY for default
 */
const DEFAULT_ENV_PREFIX = 'ENCRYPTION_KEY';
const DEFAULT_KEY_ID = 'default';

/**
 * Environment variable-based KMS provider for development and testing.
 *
 * ⚠️ **SECURITY WARNING**: This provider stores encryption keys in environment
 * variables which are accessible to all processes. **DO NOT USE IN PRODUCTION.**
 *
 * Implements the `IKmsProvider` interface using local AES-256-GCM encryption
 * with keys sourced from environment variables. Zero external dependencies.
 *
 * ## Key Operations
 *
 * | Operation | Implementation |
 * |-----------|----------------|
 * | `encrypt()` | AES-256-GCM with random IV |
 * | `decrypt()` | AES-256-GCM with auth tag verification |
 * | `generateDataKey()` | crypto.randomBytes + local wrap |
 * | `rewrap()` | Decrypt + re-encrypt |
 * | `getKeyInfo()` | Returns local key metadata |
 *
 * ## Ciphertext Format
 *
 * ```
 * [12 bytes IV][16 bytes AuthTag][N bytes Ciphertext]
 * ```
 *
 * ## Production Check
 *
 * The provider includes a runtime check for `NODE_ENV=production`:
 * - With `strictProductionCheck: true`: Throws error (recommended)
 * - Without: Logs warning but continues (not recommended)
 * - With `allowProduction: true`: Bypasses check (dangerous)
 *
 * @extends BaseKmsProvider
 *
 * @throws {InvalidKmsConfigError} When no encryption key is provided
 * @throws {InvalidKmsConfigError} When key is wrong length
 * @throws {InvalidKmsConfigError} When used in production with strictProductionCheck
 */
export class EnvVarProvider extends BaseKmsProvider {
  /** @internal Map of key IDs to encryption keys */
  private keys: Map<string, Buffer>;

  /** @internal Default key ID for operations */
  private defaultKeyId: string;

  /**
   * Creates a new environment variable provider instance.
   *
   * ⚠️ **WARNING**: For development and testing only!
   *
   * @param options - Provider configuration options
   * @param options.encryptionKey - Hex-encoded 32-byte key (64 characters)
   * @param options.keys - Map of key IDs to hex-encoded keys
   * @param options.envPrefix - Environment variable prefix (default: 'ENCRYPTION_KEY')
   * @param options.defaultKeyId - Default key ID (default: 'default')
   * @param options.allowProduction - Bypass production check (dangerous!)
   * @param options.strictProductionCheck - Throw error in production (recommended)
   *
   * @throws {InvalidKmsConfigError} When no encryption key is available
   * @throws {InvalidKmsConfigError} When key length is invalid
   * @throws {InvalidKmsConfigError} When strictProductionCheck fails in production
   *
   * @example
   * ```typescript
   * // With explicit key
   * const provider = new EnvVarProvider({
   *   encryptionKey: '0123456789abcdef...' // 64 hex chars
   * });
   *
   * // With environment variable (ENCRYPTION_KEY)
   * const provider = new EnvVarProvider();
   * ```
   */
  constructor(options: IEnvVarProviderOptions = {}) {
    super('env-var');

    // Validate that we're not in production
    if (process['env']['NODE_ENV'] === 'production' && !options.allowProduction) {
      const message =
        '[EnvVarProvider] WARNING: Using environment variable provider in production is NOT recommended.\n' +
        '[EnvVarProvider] WARNING: Keys stored in environment variables are accessible to all processes.\n' +
        '[EnvVarProvider] WARNING: Use cloud KMS providers (GCP, AWS, Azure, Vault) for production.';

      // Bug B7c: default to strict behavior in production unless the caller
      // explicitly opts in with allowProduction: true. The previous default
      // (console.warn only) silently allowed EnvVarProvider in production.
      // We already narrowed above that allowProduction is falsy when entering
      // this branch, so the explicit !== true check is the runtime guard.
      if (options.allowProduction !== (true as boolean)) {
        throw new InvalidKmsConfigError(
          message +
            '\nTo use EnvVarProvider in production, set allowProduction: true in the provider options (not recommended for production).'
        );
      }

      console.warn(message);
    }

    this.keys = new Map();

    // Set default key ID
    this.defaultKeyId = options.defaultKeyId ?? DEFAULT_KEY_ID;

    // Load keys from environment
    this.loadKeys(options);
  }

  /**
   * Load encryption keys from environment variables.
   *
   * Loads keys from multiple sources in order:
   * 1. Named keys from `options.keys` (e.g., tenant-specific keys)
   * 2. Keys from environment variables matching pattern `${envPrefix}_${keyId}`
   *    (e.g., ENCRYPTION_KEY_primary-encryption-key, ENCRYPTION_KEY_tenant-5)
   * 3. Default key from `options.encryptionKey` (explicit option)
   * 4. Default key from `ENCRYPTION_KEY` env var (fallback)
   *
   * Note: When both `options.keys` and a default key are available,
   * both are loaded. This allows health checks (which use the default key)
   * to succeed while also supporting tenant-specific keys.
   */
  private loadKeys(options: IEnvVarProviderOptions): void {
    const envPrefix = options.envPrefix ?? DEFAULT_ENV_PREFIX;

    // Load named keys if provided (e.g., tenant-specific keys)
    if (options.keys) {
      for (const [keyId, keyString] of Object.entries(options.keys)) {
        const key = this.parseKey(keyString);
        this.keys.set(keyId, key);
      }
      // Don't return - also try to load from env vars below
    }

    // Scan environment variables for keys matching ENCRYPTION_KEY_<keyId> pattern
    // This supports key rotation scenarios where multiple key versions exist
    const prefixPattern = `${envPrefix}_`;
    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (envKey.startsWith(prefixPattern) && envValue) {
        // Extract keyId from environment variable name
        // ENCRYPTION_KEY_primary-encryption-key -> primary-encryption-key
        const keyId = envKey.slice(prefixPattern.length);
        if (keyId) {
          try {
            const key = this.parseKey(envValue);
            this.keys.set(keyId, key);
          } catch (error) {
            // Bug B7b: surface parse failures instead of silently dropping them.
            // The key is unavailable, but operators must see why.
            console.warn(
              `[EnvVarProvider] Failed to load env-var key '${keyId}': ` +
                (error instanceof Error ? error.message : String(error))
            );
          }
        }
      }
    }

    // Load the default key from explicit option
    if (options.encryptionKey) {
      const key = this.parseKey(options.encryptionKey);
      this.keys.set(this.defaultKeyId, key);
      return; // Default key loaded successfully
    }

    // Try to load from default environment variable (ENCRYPTION_KEY)
    const defaultEnvVar = process.env[envPrefix];
    if (defaultEnvVar) {
      const key = this.parseKey(defaultEnvVar);
      this.keys.set(this.defaultKeyId, key);
      return; // Default key loaded successfully
    }

    // If we loaded named keys but no default key, that's OK
    // Health checks will use one of the named keys via getKey() fallback
    if (this.keys.size > 0) {
      return;
    }

    // No keys found at all - throw error
    throw new InvalidKmsConfigError(
      `EnvVarProvider requires encryptionKey option or ${envPrefix} environment variable (hex-encoded, ${AES_256_KEY_LENGTH * 2} characters for AES-256-GCM).\n` +
        `Generate a key with: node -e "console.log(require('crypto').randomBytes(${AES_256_KEY_LENGTH}).toString('hex'))"`
    );
  }

  /**
   * Parse and validate a hex-encoded key
   */
  private parseKey(keyString: string): Buffer {
    // Decode hex key
    const key = Buffer.from(keyString, 'hex');

    // Validate key length (must be 32 bytes for AES-256)
    if (key.length !== AES_256_KEY_LENGTH) {
      throw new InvalidKmsConfigError(
        `Encryption key must be ${AES_256_KEY_LENGTH} bytes (${AES_256_KEY_LENGTH * 2} hex characters) for AES-256-GCM, got ${key.length} bytes. ` +
          `Generate a key with: node -e "console.log(require('crypto').randomBytes(${AES_256_KEY_LENGTH}).toString('hex'))"`
      );
    }

    // Bug B7a: reject all-zero keys. AES-256 with an all-zero key is
    // deterministic and trivially recoverable. parseKey() previously only
    // checked length, so an all-zero buffer passed.
    if (key.every((b) => b === 0)) {
      throw new InvalidKmsConfigError(
        'Encryption key is all zeros. Generate a real key with: ' +
          `node -e "console.log(require('crypto').randomBytes(${AES_256_KEY_LENGTH}).toString('hex'))"`
      );
    }

    return key;
  }

  /**
   * Get encryption key for a given key ID
   *
   * Supports key rotation aliases:
   * - If key ID is "tenant-5-rotated-1234567890", falls back to "tenant-5"
   * - If key ID is "my-key/cryptoKeyVersions/1", falls back to "my-key"
   * - This allows key rotation without requiring new key material
   */
  private getKey(keyId?: string): Buffer {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    let key = this.keys.get(resolvedKeyId);

    // If key not found, try fallback for rotated keys
    // Rotated key format: tenant-{id}-rotated-{timestamp} -> fallback to tenant-{id}
    if (!key && resolvedKeyId && resolvedKeyId.includes('-rotated-')) {
      const parts = resolvedKeyId.split('-rotated-');
      const baseKeyId = parts[0];
      if (baseKeyId) {
        const fallbackKey = this.keys.get(baseKeyId);
        if (fallbackKey) {
          key = fallbackKey;
        }
      }
    }

    // If key not found, try fallback for versioned keys (GCP KMS format)
    // Versioned key format: my-key/cryptoKeyVersions/1 -> fallback to my-key
    if (!key && resolvedKeyId && resolvedKeyId.includes('/cryptoKeyVersions/')) {
      const baseKeyId = resolvedKeyId.split('/cryptoKeyVersions/')[0];
      if (baseKeyId) {
        const fallbackKey = this.keys.get(baseKeyId);
        if (fallbackKey) {
          key = fallbackKey;
        }
      }
    }

    if (!key) {
      throw new KeyNotFoundError(
        resolvedKeyId === this.defaultKeyId
          ? `Default encryption key not found. Set ${this.defaultKeyId} key or provide encryptionKey option.`
          : `Encryption key '${resolvedKeyId}' not found. Set ${DEFAULT_ENV_PREFIX}_${resolvedKeyId} environment variable.`
      );
    }

    return key;
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
   * Encrypts plaintext data using AES-256-GCM.
   *
   * Generates a random 12-byte IV for each encryption operation.
   * Returns IV + AuthTag + Ciphertext as a single Buffer.
   *
   * @param plaintext - Data to encrypt
   * @param keyId - Key ID to use; uses default if not specified
   * @returns Encrypted ciphertext as Buffer [IV|AuthTag|Ciphertext]
   *
   * @throws {KeyNotFoundError} When the specified key doesn't exist
   */
  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      const key = this.getKey(resolvedKeyId);

      // Use AES-256-GCM for encryption
      const iv = randomBytes(GCM_IV_LENGTH);
      const cipher = createCipheriv('aes-256-gcm', key, iv) as CipherGCM;

      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Return format: iv(GCM_IV_LENGTH) + authTag(GCM_AUTH_TAG_LENGTH) + ciphertext
      const result = Buffer.concat([iv, authTag, encrypted]);

      this.recordEncrypt(attributes, Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordEncrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Decrypts ciphertext using AES-256-GCM.
   *
   * Extracts IV and AuthTag from the ciphertext Buffer, then
   * decrypts and verifies the authentication tag.
   *
   * @param ciphertext - Data to decrypt [IV|AuthTag|Ciphertext]
   * @param keyId - Key ID to use; uses default if not specified
   * @returns Decrypted plaintext as Buffer
   *
   * @throws {KeyNotFoundError} When the specified key doesn't exist
   * @throws {Error} When authentication tag verification fails
   */
  async decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      const key = this.getKey(resolvedKeyId);

      // Extract iv, authTag, and encrypted data
      const iv = ciphertext.subarray(ENCRYPTED_FORMAT_IV_OFFSET, ENCRYPTED_FORMAT_AUTH_TAG_OFFSET);
      const authTag = ciphertext.subarray(
        ENCRYPTED_FORMAT_AUTH_TAG_OFFSET,
        ENCRYPTED_FORMAT_CIPHERTEXT_OFFSET
      );
      const encrypted = ciphertext.subarray(ENCRYPTED_FORMAT_CIPHERTEXT_OFFSET);

      const decipher = createDecipheriv('aes-256-gcm', key, iv) as DecipherGCM;
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      this.recordDecrypt(attributes, Date.now() - startTime);
      return decrypted;
    } catch (error) {
      this.recordDecrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * Creates a 256-bit random key using Node.js crypto.randomBytes(),
   * then encrypts it with the specified provider key.
   *
   * **Security Note**: The plaintext DEK should be zeroed after use:
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // ... use plaintext for encryption ...
   * plaintext.fill(0); // Zero after use
   * ```
   *
   * @param keyId - Key ID to wrap the DEK; uses default if not specified
   * @returns IDataKeyResult with plaintext (32 bytes) and ciphertext
   *
   * @throws {KeyNotFoundError} When the specified key doesn't exist
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // Generate 256-bit random data key using CSPRNG
      const plaintext = randomBytes(AES_256_KEY_LENGTH);

      // Encrypt with the provider key
      const ciphertext = await this.encrypt(plaintext, resolvedKeyId);

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return { plaintext, ciphertext };
    } catch (error) {
      this.recordGenerateDataKey({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Re-encrypts a DEK with a new key (or same key with new IV).
   *
   * Since this provider doesn't support key versioning, rewrap
   * decrypts and re-encrypts with a fresh IV. This is useful for
   * testing key rotation workflows.
   *
   * @param ciphertext - Encrypted DEK to rewrap
   * @param keyId - Target key ID to re-encrypt with; uses default if not specified
   * @param _sourceKeyId - Unused; included for interface compatibility. EnvVarProvider
   *                       always decrypts with the default key.
   * @returns IRewrapResult with new ciphertext re-encrypted with the target key and a fresh IV
   *
   * @throws {KeyNotFoundError} When the default or target key doesn't exist
   *
   * @example
   * ```typescript
   * // Rewrap from default key to a new key
   * const result = await provider.rewrap(oldCiphertext, 'new-key-id');
   *
   * // Rewrap using default key for both decrypt and encrypt
   * const result = await provider.rewrap(oldCiphertext);
   * ```
   */
  override async rewrap(
    ciphertext: Buffer,
    keyId?: string,
    sourceKeyId?: string
  ): Promise<IRewrapResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    // Declare outside try block so we can zero it in finally
    let decrypted: Buffer | undefined;

    try {
      const resolvedKeyId = this.resolveKeyId(keyId);
      attributes['key_id'] = resolvedKeyId;

      // Decrypt with source key, encrypt with target key
      // sourceKeyId is critical for key rotation - must use the key that originally encrypted the data
      decrypted = await this.decrypt(ciphertext, sourceKeyId);
      const newCiphertext = await this.encrypt(decrypted, resolvedKeyId);

      this.recordRewrap(attributes, Date.now() - startTime);
      return { ciphertext: newCiphertext };
    } catch (error) {
      this.recordRewrap({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    } finally {
      // Zero plaintext DEK to minimize memory exposure
      if (decrypted) {
        decrypted.fill(0);
      }
    }
  }

  /**
   * Retrieves metadata about a provider key.
   *
   * Returns basic key information. The metadata includes a warning
   * that this provider is for development/testing only.
   *
   * @param keyId - Key ID to query; uses default if not specified
   * @returns IKeyInfo with key metadata and security warning
   *
   * @throws {KeyNotFoundError} When the specified key doesn't exist
   */
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const resolvedKeyId = this.resolveKeyId(keyId);

    if (!this.keys.has(resolvedKeyId)) {
      throw new KeyNotFoundError(resolvedKeyId);
    }

    return {
      keyId: resolvedKeyId,
      version: '1',
      enabled: true,
      purpose: 'ENCRYPT_DECRYPT',
      metadata: {
        provider: 'env-var',
        storage: 'environment-variable',
        algorithm: 'AES-256-GCM',
        warning: '⚠️ Development/testing only - NOT for production use'
      }
    };
  }

  /**
   * Checks if the provider is available.
   *
   * Returns true if at least one key is configured.
   *
   * @returns true if keys are available, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    return this.keys.size > 0;
  }

  /**
   * Performs a health check by encrypting and decrypting test data.
   *
   * Uses constant-time comparison to prevent timing attacks
   * (even in a test provider, good habits matter).
   *
   * If no default key is configured, uses the first available key.
   *
   * @returns true if encrypt/decrypt roundtrip succeeds, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use the default key if available, otherwise use the first available key
      let keyId: string | undefined = undefined;
      if (!this.keys.has(this.defaultKeyId) && this.keys.size > 0) {
        const keyIds = Array.from(this.keys.keys());
        keyId = keyIds[0];
      }

      // Perform encrypt/decrypt roundtrip
      const test = Buffer.from('health-check-test');
      const encrypted = await this.encrypt(test, keyId);
      const decrypted = await this.decrypt(encrypted, keyId);
      // Use constant-time comparison to prevent timing attacks
      return timingSafeEqual(test, decrypted);
    } catch {
      return false;
    }
  }

  /**
   * Adds or updates a key at runtime.
   *
   * ⚠️ **WARNING**: For testing only! Do not use in production.
   *
   * @param keyId - Identifier for the key
   * @param keyString - Hex-encoded 32-byte key (64 characters)
   *
   * @throws {InvalidKmsConfigError} When key length is invalid
   *
   * @example
   * ```typescript
   * provider.setKey('tenant-123', 'abcd1234...');
   * ```
   */
  setKey(keyId: string, keyString: string): void {
    const key = this.parseKey(keyString);
    this.keys.set(keyId, key);
  }

  /**
   * Returns all registered key IDs.
   *
   * Useful for debugging and testing key management.
   *
   * @returns Array of key IDs
   */
  getKeyIds(): string[] {
    return Array.from(this.keys.keys());
  }
}

/**
 * KMS Provider Interface
 *
 * Defines the contract for all KMS provider implementations enabling multi-cloud
 * key management abstraction. This interface allows applications to switch between
 * cloud providers (GCP, AWS, Azure) or on-premises solutions (HashiCorp Vault)
 * without code changes.
 *
 * ## Provider Abstraction Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    Application Layer                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │              EncryptionService / KeyRotationService         │
 * │                           │                                  │
 * │                    IKmsProvider                              │
 * │                    (abstraction)                             │
 * │         ┌─────────────┼─────────────┐                       │
 * │         ▼             ▼             ▼                       │
 * │   ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
 * │   │  GCP KMS │  │ AWS KMS  │  │  Azure   │  ...more        │
 * │   │ Provider │  │ Provider │  │ KeyVault │                  │
 * │   └──────────┘  └──────────┘  └──────────┘                 │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Security Requirements for Implementations
 *
 * All providers MUST:
 * - Use authenticated encryption (AES-GCM) for data protection
 * - Use CSPRNG (cryptographically secure PRNG) for key generation
 * - Never log or expose plaintext key material
 * - Zero plaintext keys from memory after use when possible
 * - Implement proper error handling without leaking sensitive details
 *
 * @module encryption/providers
 */

import { metrics, Attributes, Counter, Histogram } from '@opentelemetry/api';

import { UnsupportedOperationError } from '../errors';

/**
 * Result of a data key generation operation.
 *
 * Contains both the plaintext DEK for immediate encryption use and the
 * encrypted DEK for persistent storage.
 *
 * @security **CRITICAL: Plaintext Key Material Handling**
 *
 * The `plaintext` property contains sensitive CSPRNG-derived key material.
 * Callers MUST:
 * - Zero the buffer immediately after use via `result.plaintext.fill(0)`
 * - Never log, serialize, or transmit plaintext key material
 * - Minimize the time plaintext remains in memory
 *
 * Failure to zero plaintext keys increases the risk of key exposure through
 * memory dumps, core dumps, or swap files.
 *
 * @interface IDataKeyResult
 *
 * @example
 * ```typescript
 * const result = await provider.generateDataKey('my-key');
 *
 * try {
 *   // Use plaintext DEK for encryption
 *   const cipher = createCipheriv('aes-256-gcm', result.plaintext, iv);
 *
 *   // Store encrypted DEK with the ciphertext
 *   await db.save({ encryptedDek: result.ciphertext.toString('base64'), ... });
 * } finally {
 *   // CRITICAL: Always zero plaintext after use
 *   result.plaintext.fill(0);
 * }
 * ```
 */
export interface IDataKeyResult {
  /**
   * Plaintext data key for encryption operations.
   *
   * @security This is sensitive CSPRNG-derived key material. Callers MUST
   * zero this buffer via `plaintext.fill(0)` immediately after use to prevent
   * key exposure through memory analysis.
   *
   * - Always 32 bytes (256 bits) for AES-256
   * - Generated using CSPRNG (crypto.randomBytes or KMS-native)
   * - MUST be zeroed after use - do not retain in memory or logs
   */
  plaintext: Buffer;

  /**
   * Encrypted data key for persistent storage.
   * Format is provider-specific (GCP/AWS/Azure have different envelope formats).
   * Safe to store in databases, logs, or transmit over networks.
   */
  ciphertext: Buffer;
}

/**
 * Result of a key rewrapping operation.
 *
 * Rewrapping re-encrypts a DEK with a new KEK without exposing
 * the underlying data. This is the core operation for key rotation.
 *
 * @interface IRewrapResult
 */
export interface IRewrapResult {
  /**
   * The DEK re-encrypted with the new KEK.
   * Same underlying key material, new envelope.
   */
  ciphertext: Buffer;
}

/**
 * Core interface for Key Management Service providers.
 *
 * All KMS providers (GCP Cloud KMS, AWS KMS, Azure Key Vault, HashiCorp Vault)
 * must implement this interface to enable multi-cloud key management.
 *
 * ## Security Contract
 *
 * Implementations MUST adhere to these security requirements:
 *
 * | Method | Security Requirement |
 * |--------|---------------------|
 * | `encrypt()` | Use authenticated encryption (AES-GCM). Never reuse IVs. |
 * | `decrypt()` | Verify authentication tags. Fail securely on tampering. |
 * | `generateDataKey()` | Use CSPRNG (crypto.randomBytes or equivalent). |
 * | `rewrap()` | Atomic operation preferred; never expose plaintext if possible. |
 *
 * ## Key Material Handling
 *
 * **CRITICAL**: Plaintext key material should be zeroed after use:
 * ```typescript
 * const result = await provider.generateDataKey();
 * // ... use result.plaintext ...
 * result.plaintext.fill(0); // Zero after use
 * ```
 *
 * @interface IKmsProvider
 *
 * @example Basic provider usage
 * ```typescript
 * const provider = new GcpKmsProvider({
 *   projectId: 'my-project',
 *   locationId: 'us-east1',
 *   keyRingId: 'my-keyring',
 *   keyId: 'my-key'
 * });
 *
 * // Generate a data key for envelope encryption
 * const dataKey = await provider.generateDataKey();
 *
 * // Encrypt data with the DEK
 * const encrypted = await encryptWithDek(data, dataKey.plaintext);
 *
 * // Store the encrypted DEK alongside the ciphertext
 * await store({ ciphertext: encrypted, dek: dataKey.ciphertext });
 *
 * // Zero the plaintext DEK
 * dataKey.plaintext.fill(0);
 * ```
 */
export interface IKmsProvider {
  /**
   * Unique provider name identifier.
   * Used for logging, metrics, and provider selection.
   * Examples: 'gcp', 'aws', 'azure', 'vault', 'env-var'
   */
  readonly name: string;

  /**
   * Encrypts plaintext data using the KMS.
   *
   * Implementations MUST use authenticated encryption (AES-GCM or equivalent)
   * to provide both confidentiality and integrity protection.
   *
   * @param plaintext - Data to encrypt (any size supported by the KMS)
   * @param keyId - Key identifier; uses provider's default key if not specified
   * @returns Promise resolving to encrypted ciphertext as Buffer
   * @throws {KeyNotFoundError} When the specified key doesn't exist
   * @throws {Error} When encryption fails (permissions, network, etc.)
   *
   * @example
   * ```typescript
   * const ciphertext = await provider.encrypt(
   *   Buffer.from('sensitive data'),
   *   'alias/my-encryption-key'
   * );
   * ```
   */
  encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer>;

  /**
   * Decrypts ciphertext back to plaintext.
   *
   * Implementations MUST verify authentication tags and fail securely
   * if tampering is detected (do not return partial plaintext).
   *
   * **Note**: Some providers (e.g., AWS KMS) embed the key ID in the
   * ciphertext envelope and don't require keyId for decryption.
   *
   * @param ciphertext - Encrypted data from a previous encrypt() call
   * @param keyId - Key identifier; may be optional for some providers
   * @returns Promise resolving to decrypted plaintext as Buffer
   * @throws {KeyNotFoundError} When the key doesn't exist or is inaccessible
   * @throws {Error} When decryption fails (tampering, wrong key, etc.)
   *
   * @example
   * ```typescript
   * const plaintext = await provider.decrypt(storedCiphertext);
   * console.log(plaintext.toString('utf8')); // 'sensitive data'
   * ```
   */
  decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer>;

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * This is the primary method for envelope encryption workflows.
   * Returns both plaintext (for immediate use) and encrypted (for storage)
   * versions of the DEK.
   *
   * Implementations MUST use CSPRNG (crypto.randomBytes or KMS-native generation).
   * The plaintext DEK should be 32 bytes (256 bits) for AES-256-GCM.
   *
   * @param keyId - KEK (Key Encryption Key) to wrap the DEK; uses default if not specified
   * @returns Promise resolving to IDataKeyResult with plaintext and ciphertext
   * @throws {KeyNotFoundError} When the KEK doesn't exist
   * @throws {Error} When key generation fails
   *
   * @example
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey('alias/kek');
   *
   * // plaintext: 32-byte Buffer for AES-256-GCM encryption
   * // ciphertext: Encrypted DEK for storage with the encrypted data
   * ```
   */
  generateDataKey(keyId?: string): Promise<IDataKeyResult>;

  /**
   * Re-encrypts a DEK with a new KEK without exposing the underlying data key.
   *
   * This is an **optional** method that enables efficient key rotation.
   * When implemented natively by the KMS (e.g., Vault Transit), the plaintext
   * DEK never leaves the KMS boundary, providing maximum security.
   *
   * If not implemented, callers should fall back to decrypt + encrypt,
   * which briefly exposes the plaintext DEK in application memory.
   *
   * **When to implement**: Providers SHOULD implement this method if the
   * underlying KMS supports atomic rewrap operations (Vault Transit does,
   * GCP/AWS/Azure do not).
   *
   * @param ciphertext - Encrypted DEK to rewrap
   * @param keyId - New KEK to wrap the DEK; uses default if not specified
   * @param sourceKeyId - Optional source KEK for decryption (for providers like GCP KMS
   *                      that don't embed key info in ciphertext). If not specified,
   *                      the provider uses the default key or extracts from ciphertext metadata.
   * @returns Promise resolving to IRewrapResult with new ciphertext
   * @throws {Error} When rewrap fails or is not supported
   */
  rewrap?(ciphertext: Buffer, keyId?: string, sourceKeyId?: string): Promise<IRewrapResult>;

  /**
   * Retrieves metadata about a cryptographic key.
   *
   * This is an **optional** method useful for:
   * - Validating keys exist before rotation
   * - Checking key state (enabled/disabled)
   * - Auditing key creation dates
   * - Key inventory management
   *
   * **When to implement**: Providers SHOULD implement this method if the
   * underlying KMS exposes key metadata APIs.
   *
   * @param keyId - Key identifier to query
   * @returns Promise resolving to IKeyInfo with key metadata
   * @throws {KeyNotFoundError} When the key doesn't exist
   */
  getKeyInfo?(keyId?: string): Promise<IKeyInfo>;

  /**
   * Checks if the provider is available and properly configured.
   *
   * Used for startup validation and health checks. Should verify:
   * - Credentials are valid
   * - Network connectivity exists
   * - Required permissions are granted
   *
   * @returns Promise resolving to true if available, false otherwise
   */
  isAvailable(): Promise<boolean>;

  /**
   * Performs a health check on the provider.
   *
   * May perform a lightweight operation (e.g., list keys, describe key)
   * to verify the provider is functioning correctly.
   *
   * @returns Promise resolving to true if healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Metadata about a cryptographic key.
 *
 * Returned by `getKeyInfo()` for key inventory, rotation validation,
 * and audit purposes. Fields are optional as availability varies by provider.
 *
 * @interface IKeyInfo
 */
export interface IKeyInfo {
  /** Key identifier (alias, ARN, resource name, etc.) */
  keyId: string;

  /** Key version identifier (for versioned keys) */
  version?: string;

  /** Timestamp when the key was created */
  createdAt?: Date;

  /**
   * Whether the key is enabled for cryptographic operations.
   * Disabled keys cannot encrypt/decrypt but may still exist for audit.
   */
  enabled?: boolean;

  /**
   * Key purpose (e.g., 'ENCRYPT_DECRYPT', 'SIGN_VERIFY').
   * Provider-specific naming conventions apply.
   */
  purpose?: string;

  /**
   * Additional provider-specific metadata.
   * May include: algorithm, protection level, rotation schedule, etc.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Supported KMS provider types.
 *
 * Used by KmsProviderFactory for dynamic provider instantiation
 * and configuration validation.
 *
 * @enum {string}
 */
export enum KmsProviderType {
  /** Google Cloud KMS */
  GCP = 'gcp',
  /** Amazon Web Services KMS */
  AWS = 'aws',
  /** Microsoft Azure Key Vault */
  AZURE = 'azure',
  /** HashiCorp Vault Transit Engine */
  VAULT = 'vault',
  /** GCP Secret Manager (for secret storage, not encryption) */
  GCP_SECRET_MANAGER = 'gcp-secret-manager',
  /** Environment Variable Provider (development/testing only) */
  ENV_VAR = 'env-var'
}

/**
 * Tenant encryption context for multi-tenant key resolution.
 *
 * Provides tenant-specific information needed to resolve encryption keys
 * and providers. This context is passed to the IEncryptionAdapter to
 * enable per-tenant key isolation.
 *
 * @interface ITenantEncryptionContext
 *
 * @example
 * ```typescript
 * const context: ITenantEncryptionContext = {
 *   organizationId: 'org-123',
 *   keyId: 'alias/tenant-org-123' // Optional override
 * };
 * ```
 */
export interface ITenantEncryptionContext {
  /**
   * The organization/tenant ID for multi-tenancy isolation.
   *
   * All encryption operations will use keys scoped to this tenant.
   * This ensures cryptographic isolation between tenants.
   */
  organizationId: string;

  /**
   * Optional key ID override.
   *
   * If provided, this key ID will be used instead of the adapter
   * resolving a key based on the organizationId. Useful for
   * explicit key selection during key rotation.
   */
  keyId?: string;

  /**
   * Optional provider name override.
   *
   * If provided, this provider will be used instead of the adapter
   * resolving a provider based on the organizationId.
   */
  provider?: string;
}

/**
 * Encryption Adapter Interface for Multi-Tenant Key Resolution
 *
 * Enables tenant-specific key and provider resolution for multi-tenant
 * applications. The adapter is called during encryption/decryption to
 * resolve the appropriate key material for each tenant.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    EntityTransformer                         │
 * │                           │                                  │
 * │                    ┌──────┴──────┐                           │
 * │                    │  Adapter    │                           │
 * │                    │  (resolve)  │                           │
 * │                    └──────┬──────┘                           │
 * │         ┌─────────────────┼─────────────────┐               │
 * │         ▼                 ▼                 ▼               │
 * │   ┌──────────┐      ┌──────────┐      ┌──────────┐         │
 * │   │ Tenant A │      │ Tenant B │      │ Tenant C │         │
 * │   │  Key     │      │  Key     │      │  Key     │         │
 * │   └──────────┘      └──────────┘      └──────────┘         │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Security Requirements
 *
 * Implementations MUST:
 * - Never return keys from one tenant for another tenant's context
 * - Validate organizationId before resolving keys
 * - Log all key resolution events for audit purposes
 * - Return consistent results for the same tenant context
 *
 * ## Key Isolation Strategies
 *
 * | Strategy | Use Case | Complexity |
 * |----------|----------|------------|
 * | Key per tenant | Maximum isolation | High |
 * | Key alias per tenant | Good isolation | Medium |
 * | Derived keys | Shared master key | Low |
 *
 * @interface IEncryptionAdapter
 *
 * @example Implementation with per-tenant keys
 * ```typescript
 * class TenantKeyAdapter implements IEncryptionAdapter {
 *   constructor(
 *     private readonly tenantKeyStore: TenantKeyStore,
 *     private readonly providerFactory: KmsProviderFactory
 *   ) {}
 *
 *   async resolveKeyId(context: ITenantEncryptionContext): Promise<string> {
 *     // Use explicit keyId if provided (e.g., during rotation)
 *     if (context.keyId) {
 *       return context.keyId;
 *     }
 *
 *     // Resolve tenant-specific key from store
 *     const tenantKey = await this.tenantKeyStore.getActiveKey(
 *       context.organizationId
 *     );
 *     return tenantKey.keyId;
 *   }
 *
 *   async resolveProvider(context: ITenantEncryptionContext): Promise<IKmsProvider> {
 *     // Use explicit provider if specified
 *     const providerName = context.provider ?? 'aws';
 *     return this.providerFactory.getProvider(providerName);
 *   }
 * }
 * ```
 *
 * @example Usage with EntityTransformer
 * ```typescript
 * const transformer = createEntityTransformer({
 *   adapter: new TenantKeyAdapter(tenantKeyStore, providerFactory),
 *   getProvider: (name) => providerFactory.getProvider(name),
 *   defaultProvider: 'aws'
 * });
 *
 * // Encrypt with tenant context
 * const encrypted = await transformer.encryptEntity(user, {
 *   organizationId: 'org-123'
 * });
 * ```
 */
export interface IEncryptionAdapter {
  /**
   * Resolves the key ID for a given tenant context.
   *
   * Called during encryption to determine which key to use for
   * wrapping the DEK. The returned key ID should be unique per
   * tenant to ensure cryptographic isolation.
   *
   * @param context - Tenant encryption context with organizationId
   * @returns Promise resolving to the tenant's encryption key ID
   * @throws {Error} If the tenant is not found or key resolution fails
   *
   * @example
   * ```typescript
   * const keyId = await adapter.resolveKeyId({
   *   organizationId: 'org-123'
   * });
   * // Returns: 'alias/tenant-org-123-encryption-key'
   * ```
   */
  resolveKeyId(context: ITenantEncryptionContext): Promise<string>;

  /**
   * Resolves the KMS provider for a given tenant context.
   *
   * Enables per-tenant provider selection for scenarios where
   * tenants use different cloud providers or regions.
   *
   * @param context - Tenant encryption context with organizationId
   * @returns Promise resolving to the tenant's KMS provider
   * @throws {Error} If the provider cannot be resolved
   *
   * @example
   * ```typescript
   * const provider = await adapter.resolveProvider({
   *   organizationId: 'org-123'
   * });
   * // Returns configured IKmsProvider for the tenant
   * ```
   */
  resolveProvider(context: ITenantEncryptionContext): Promise<IKmsProvider>;
}

/**
 * Abstract base class for KMS providers with OpenTelemetry metrics.
 *
 * All concrete providers should extend this class to get:
 * - Automatic operation counting (encrypt, decrypt, generateDataKey, rewrap)
 * - Latency histograms for performance monitoring
 * - Consistent metric attributes (provider name, key ID, errors)
 *
 * ## Metrics Emitted
 *
 * | Metric | Type | Description |
 * |--------|------|-------------|
 * | `encryption.kms.encrypt.total` | Counter | Total encrypt operations |
 * | `encryption.kms.decrypt.total` | Counter | Total decrypt operations |
 * | `encryption.kms.generate_data_key.total` | Counter | Total DEK generations |
 * | `encryption.kms.rewrap.total` | Counter | Total rewrap (key re-encryption) operations |
 * | `encryption.kms.encrypt.duration` | Histogram | Encrypt latency (ms) |
 * | `encryption.kms.decrypt.duration` | Histogram | Decrypt latency (ms) |
 * | `encryption.kms.generate_data_key.duration` | Histogram | DEK generation latency (ms) |
 * | `encryption.kms.rewrap.duration` | Histogram | Rewrap latency (ms) |
 *
 * @abstract
 * @implements {IKmsProvider}
 */
export abstract class BaseKmsProvider implements IKmsProvider {
  protected encryptCounter: Counter;
  protected decryptCounter: Counter;
  protected generateDataKeyCounter: Counter;
  protected rewrapCounter: Counter;
  protected encryptHistogram: Histogram;
  protected decryptHistogram: Histogram;
  protected generateDataKeyHistogram: Histogram;
  protected rewrapHistogram: Histogram;

  constructor(
    public readonly name: string,
    protected readonly meter = metrics.getMeter('encryption')
  ) {
    this.encryptCounter = this.meter.createCounter('encryption.kms.encrypt.total', {
      description: 'Total number of KMS encrypt operations'
    });
    this.decryptCounter = this.meter.createCounter('encryption.kms.decrypt.total', {
      description: 'Total number of KMS decrypt operations'
    });
    this.generateDataKeyCounter = this.meter.createCounter(
      'encryption.kms.generate_data_key.total',
      {
        description: 'Total number of KMS data key generations'
      }
    );
    this.rewrapCounter = this.meter.createCounter('encryption.kms.rewrap.total', {
      description: 'Total number of KMS rewrap (key re-encryption) operations'
    });
    this.encryptHistogram = this.meter.createHistogram('encryption.kms.encrypt.duration', {
      description: 'Duration of KMS encrypt operations',
      unit: 'ms'
    });
    this.decryptHistogram = this.meter.createHistogram('encryption.kms.decrypt.duration', {
      description: 'Duration of KMS decrypt operations',
      unit: 'ms'
    });
    this.generateDataKeyHistogram = this.meter.createHistogram(
      'encryption.kms.generate_data_key.duration',
      {
        description: 'Duration of KMS data key generation',
        unit: 'ms'
      }
    );
    this.rewrapHistogram = this.meter.createHistogram('encryption.kms.rewrap.duration', {
      description: 'Duration of KMS rewrap (key re-encryption) operations',
      unit: 'ms'
    });
  }

  /**
   * Record metrics for encrypt operation
   */
  protected recordEncrypt(attributes: Attributes, duration: number): void {
    this.encryptCounter.add(1, attributes);
    this.encryptHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for decrypt operation
   */
  protected recordDecrypt(attributes: Attributes, duration: number): void {
    this.decryptCounter.add(1, attributes);
    this.decryptHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for generateDataKey operation
   */
  protected recordGenerateDataKey(attributes: Attributes, duration: number): void {
    this.generateDataKeyCounter.add(1, attributes);
    this.generateDataKeyHistogram.record(duration, attributes);
  }

  /**
   * Record metrics for rewrap (key re-encryption) operation.
   *
   * This tracks rewrap operations separately from encrypt operations,
   * enabling better observability of key rotation activities.
   *
   * @param attributes - OpenTelemetry attributes (provider, key_id, error)
   * @param duration - Operation duration in milliseconds
   */
  protected recordRewrap(attributes: Attributes, duration: number): void {
    this.rewrapCounter.add(1, attributes);
    this.rewrapHistogram.record(duration, attributes);
  }

  /**
   * Build common attributes for metrics
   */
  protected buildAttributes(error?: string): Attributes {
    const attrs: Attributes = {
      provider: this.name
    };
    if (error) {
      (attrs as Record<string, unknown>)['error'] = error;
    }
    return attrs;
  }

  // Abstract methods that must be implemented by providers
  abstract encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer>;
  abstract decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer>;
  abstract generateDataKey(keyId?: string): Promise<IDataKeyResult>;
  abstract isAvailable(): Promise<boolean>;
  abstract healthCheck(): Promise<boolean>;

  // Optional methods with default implementations

  /**
   * Re-encrypts a DEK with a new KEK without exposing the underlying data key.
   *
   * Default implementation throws UnsupportedOperationError. Providers that support
   * atomic rewrap operations (e.g., Vault Transit) should override this method.
   *
   * @param _ciphertext - Encrypted DEK to rewrap (unused in base implementation)
   * @param keyId - New KEK to wrap the DEK; uses default if not specified
   * @param _sourceKeyId - Optional source KEK for decryption (unused in base implementation)
   * @returns Promise resolving to IRewrapResult with new ciphertext
   * @throws {UnsupportedOperationError} Always thrown in base implementation
   */
  async rewrap(_ciphertext: Buffer, keyId?: string, _sourceKeyId?: string): Promise<IRewrapResult> {
    throw new UnsupportedOperationError('rewrap', this.name, keyId);
  }

  /**
   * Retrieves metadata about a cryptographic key.
   *
   * Default implementation throws UnsupportedOperationError. Providers that expose
   * key metadata APIs (e.g., GCP KMS, AWS KMS) should override this method.
   *
   * @param keyId - Key identifier to query
   * @returns Promise resolving to IKeyInfo with key metadata
   * @throws {UnsupportedOperationError} Always thrown in base implementation
   */
  async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    throw new UnsupportedOperationError('getKeyInfo', this.name, keyId);
  }
}

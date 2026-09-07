/**
 * Entity Transformer
 *
 * Core service for automatic encryption/decryption of entity fields marked
 * with the `@Encrypted()` decorator. Handles envelope encryption lifecycle
 * including key rotation and re-encryption.
 *
 * ## Overview
 *
 * EntityTransformer bridges the gap between TypeScript decorators and the
 * envelope encryption service. It:
 *
 * 1. Discovers which fields need encryption via decorator metadata
 * 2. Encrypts field values before database persistence
 * 3. Decrypts field values after database retrieval
 * 4. Supports key rotation via re-encryption
 *
 * ## Security Architecture
 *
 * ```
 * Entity Field Value
 *        │
 *        ▼
 * ┌──────────────────┐
 * │ EntityTransformer │ ◄── Decorator metadata
 * └────────┬─────────┘
 *          │
 *          ▼
 * ┌──────────────────┐
 * │ EnvelopeEncrypt  │ ◄── KMS Provider
 * └────────┬─────────┘
 *          │
 *          ▼
 * ┌──────────────────┐
 * │ Encrypted Format │ ◄── Ready for storage
 * └──────────────────┘
 * ```
 *
 * ## Key Rotation Support
 *
 * The transformer stores key version metadata with each encrypted field,
 * enabling seamless key rotation:
 *
 * 1. **Encrypt**: Stores current key version in `version` field
 * 2. **Decrypt**: Uses stored version to find the correct key
 * 3. **Re-encrypt**: Decrypts with old key, re-encrypts with new key
 *
 * ## Performance Considerations
 *
 * - EnvelopeEncryptionService instances are cached per provider
 * - Batch operations (`encryptEntities`, `decryptEntities`) use Promise.all
 * - Fields with null values are skipped (unless `allowNull: false`)
 *
 * @module encryption/decorators
 *
 * @example Basic entity encryption
 * ```typescript
 * const transformer = createEntityTransformer({
 *   getProvider: (name) => providerFactory.getProvider(name),
 *   defaultProvider: 'aws'
 * });
 *
 * // Encrypt before save
 * const encrypted = await transformer.encryptEntity(user);
 * await repository.save(encrypted);
 *
 * // Decrypt after read
 * const raw = await repository.findById(id);
 * const decrypted = await transformer.decryptEntity(raw);
 * ```
 *
 * @example Key rotation
 * ```typescript
 * // Re-encrypt all user entities with new key
 * const users = await repository.findAll();
 * const reencrypted = await transformer.reencryptEntities(users, {
 *   oldKeyId: 'alias/user-key-2024',
 *   newKeyId: 'alias/user-key-2025'
 * });
 * await repository.bulkUpdate(reencrypted);
 * ```
 */

import { EntityTransformError, TenantAdapterRequiredError } from '../errors';
import {
  getFieldMetadata,
  getEncryptedFieldNames,
  type IEncryptedFieldMetadata
} from './encrypted-metadata';
import { getEntityOptions } from './encrypted.decorator';
import { EnvelopeEncryptionService as EnvelopeSvc } from '../services/envelope-encryption.service';
import { addSpanEvent } from '../telemetry';

import type {
  IKmsProvider,
  IEncryptionAdapter,
  ITenantEncryptionContext
} from '../providers/kms-provider.interface';
import type {
  EnvelopeEncryptionService,
  IEnvelopeEncryptionOptions
} from '../services/envelope-encryption.service';

/**
 * Encrypted field storage format.
 *
 * This structure contains all components needed to decrypt a field value.
 * It is stored as JSON in the database and includes metadata for key rotation.
 *
 * ## Structure
 *
 * ```json
 * {
 *   "data": "base64-encoded-ciphertext",
 *   "key": "base64-encoded-encrypted-dek",
 *   "iv": "base64-encoded-initialization-vector",
 *   "tag": "base64-encoded-auth-tag",
 *   "version": "alias/key-2024",
 *   "encryptedAt": "2024-01-15T10:30:00.000Z"
 * }
 * ```
 *
 * ## Security Notes
 *
 * - All binary data is base64-encoded for JSON storage
 * - The `key` field contains the DEK encrypted by KMS (never plaintext)
 * - The `iv` is unique per encryption (never reuse with same key)
 * - The `tag` provides authenticated encryption integrity
 * - The `version` field enables key rotation tracking
 *
 * @interface IEncryptedFieldFormat
 *
 * @example Parsing encrypted field
 * ```typescript
 * const encrypted = user.ssn as IEncryptedFieldFormat;
 * if (encrypted.version !== currentKeyId) {
 *   // Field was encrypted with old key, needs re-encryption
 *   await transformer.reencryptEntity(user, {
 *     oldKeyId: encrypted.version,
 *     newKeyId: currentKeyId
 *   });
 * }
 * ```
 */
export interface IEncryptedFieldFormat {
  /**
   * Encrypted data (base64-encoded ciphertext).
   *
   * The actual field value encrypted with the Data Encryption Key (DEK)
   * using AES-GCM authenticated encryption.
   */
  data: string;

  /**
   * Encrypted Data Encryption Key (base64-encoded).
   *
   * The DEK wrapped (encrypted) by the KMS provider's Key Encryption Key (KEK).
   * To decrypt the data, first decrypt this key using KMS, then use the
   * resulting plaintext DEK to decrypt the `data` field.
   */
  key: string;

  /**
   * Initialization Vector (base64-encoded, 12 bytes).
   *
   * Random IV generated for each encryption operation. Combined with the
   * DEK to encrypt the data. Must never be reused with the same key.
   *
   * @see NIST SP 800-38D Section 8.2 for IV requirements
   */
  iv: string;

  /**
   * GCM Authentication Tag (base64-encoded, 16 bytes).
   *
   * Provides integrity and authenticity verification. If the ciphertext
   * or associated data is tampered with, decryption will fail.
   */
  tag: string;

  /**
   * Key version used for encryption.
   *
   * Stores the key ID or alias used to encrypt this field. Essential for
   * key rotation - allows the system to know which key version to use
   * for decryption even after the default key has changed.
   *
   * @example 'alias/user-data-2024' or 'arn:aws:kms:...'
   */
  version?: string;

  /**
   * ISO 8601 timestamp when the field was encrypted.
   *
   * Useful for audit trails and determining when fields need re-encryption
   * based on key rotation policies.
   *
   * @example '2024-01-15T10:30:00.000Z'
   */
  encryptedAt?: string;
}

/**
 * Configuration options for EntityTransformer.
 *
 * Provides the transformer with access to KMS providers for encryption
 * and decryption operations. Supports multi-tenant key isolation via
 * the optional adapter.
 *
 * @interface IEntityTransformerOptions
 *
 * @example Using with KmsProviderFactory (single-tenant)
 * ```typescript
 * const factory = new KmsProviderFactory();
 * factory.register('aws', awsProvider);
 *
 * const options: IEntityTransformerOptions = {
 *   getProvider: (name) => factory.getProvider(name),
 *   defaultProvider: 'aws'
 * };
 * ```
 *
 * @example Using with IEncryptionAdapter (multi-tenant)
 * ```typescript
 * const options: IEntityTransformerOptions = {
 *   getProvider: (name) => factory.getProvider(name),
 *   defaultProvider: 'aws',
 *   adapter: new TenantKeyAdapter(tenantKeyStore, factory)
 * };
 *
 * // Encrypt with tenant isolation
 * const encrypted = await transformer.encryptEntity(user, {
 *   organizationId: 'org-123'
 * });
 * ```
 */
export interface IEntityTransformerOptions {
  /**
   * Provider lookup function.
   *
   * Called to retrieve a KMS provider by name. Should return undefined
   * if the provider is not found (the transformer will throw an error).
   *
   * @param name - Provider name to look up, or undefined for default
   * @returns The KMS provider instance, or undefined if not found
   */
  getProvider: (name?: string) => IKmsProvider | undefined;

  /**
   * Default provider name.
   *
   * Used when no provider is specified in field or entity options.
   * Should match a provider name registered in your provider factory.
   *
   * @example 'aws' | 'gcp' | 'azure' | 'vault'
   */
  defaultProvider?: string;

  /**
   * Optional encryption adapter for multi-tenant key resolution.
   *
   * When provided, the adapter is used to resolve tenant-specific
   * keys and providers based on the organizationId passed to
   * encrypt/decrypt methods. This enables per-tenant key isolation.
   *
   * If not provided, the transformer uses static keyId from decorator
   * metadata (suitable for single-tenant applications).
   *
   * @see IEncryptionAdapter for implementation requirements
   */
  adapter?: IEncryptionAdapter;
}

/**
 * Entity Transformer Class
 *
 * Handles automatic encryption and decryption of entity fields based on
 * `@Encrypted()` decorator metadata. Supports single entity operations,
 * batch operations, and key rotation via re-encryption.
 *
 * ## Thread Safety
 *
 * EntityTransformer is stateless except for the envelope service cache,
 * which is read-heavy and safe for concurrent access. Multiple entities
 * can be encrypted/decrypted concurrently.
 *
 * ## Error Handling
 *
 * - Throws `EntityTransformError` when encryption/decryption fails
 * - When `allowNull: true` (default), decryption failures set field to null
 * - When `allowNull: false`, decryption failures throw errors
 *
 * ## Telemetry
 *
 * Operations emit OpenTelemetry span events for observability:
 * - `decryption_failure_set_to_null` - When decryption fails with allowNull
 *
 * @class EntityTransformer
 *
 * @example Repository integration
 * ```typescript
 * @Injectable()
 * class UserRepository {
 *   constructor(
 *     private readonly db: DrizzleDatabase,
 *     private readonly transformer: EntityTransformer
 *   ) {}
 *
 *   async create(user: User): Promise<User> {
 *     const encrypted = await this.transformer.encryptEntity(user);
 *     const [saved] = await this.db.insert(users).values(encrypted).returning();
 *     return this.transformer.decryptEntity(saved);
 *   }
 *
 *   async findById(id: string): Promise<User | null> {
 *     const user = await this.db.query.users.findFirst({ where: eq(users.id, id) });
 *     return user ? this.transformer.decryptEntity(user) : null;
 *   }
 * }
 * ```
 */
export class EntityTransformer {
  /**
   * Cache of EnvelopeEncryptionService instances per provider.
   * Avoids creating new service instances for each operation.
   * @internal
   */
  private readonly envelopeServices = new Map<string, EnvelopeEncryptionService>();

  /**
   * Creates a new EntityTransformer instance.
   *
   * @param options - Configuration options including provider lookup
   */
  constructor(private readonly options: IEntityTransformerOptions) {}

  /**
   * Gets or creates an EnvelopeEncryptionService for a provider.
   *
   * Services are cached to avoid creating new instances for each operation.
   * The cache key is the provider name.
   *
   * @param provider - The KMS provider to create a service for
   * @returns EnvelopeEncryptionService instance for the provider
   * @throws {Error} If service creation fails (should not happen)
   * @internal
   */
  private getEnvelopeService(provider: IKmsProvider): EnvelopeEncryptionService {
    const name = provider.name;

    if (!this.envelopeServices.has(name)) {
      this.envelopeServices.set(name, new EnvelopeSvc(provider));
    }

    const service = this.envelopeServices.get(name);
    if (!service) {
      throw new Error(`Failed to get envelope service for provider: ${name}`);
    }
    return service;
  }

  /**
   * Retrieves a KMS provider by name.
   *
   * @param providerName - Provider name, or undefined to use default
   * @returns The requested KMS provider
   * @throws {Error} If the provider is not found
   * @internal
   */
  private getProvider(providerName?: string): IKmsProvider {
    const provider = this.options.getProvider(providerName ?? this.options.defaultProvider);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName ?? this.options.defaultProvider}`);
    }

    return provider;
  }

  /**
   * Sanitizes error for telemetry recording.
   *
   * Extracts only the error type/name to avoid leaking sensitive data
   * (tokens, headers, request payloads) in telemetry events.
   *
   * @param error - The error to sanitize
   * @returns A safe error identifier (error name only)
   * @internal
   */
  private sanitizeErrorForTelemetry(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }
    return 'UnknownError';
  }

  /**
   * Encrypts all `@Encrypted()` fields in an entity.
   *
   * Discovers encrypted fields via decorator metadata, encrypts each field
   * using envelope encryption, and returns a new entity with encrypted values.
   *
   * ## Process
   *
   * 1. Get list of encrypted fields from entity metadata
   * 2. For each field:
   *    - Skip if null/undefined (unless `allowNull: false`)
   *    - Get provider and key from adapter (if tenant context) or field/entity options
   *    - Encrypt value using envelope encryption
   *    - Store as IEncryptedFieldFormat with metadata
   * 3. Return new entity with encrypted fields
   *
   * ## Multi-Tenant Key Isolation
   *
   * When a tenant context is provided and an adapter is configured:
   * 1. The adapter's `resolveKeyId()` returns the tenant-specific key
   * 2. The adapter's `resolveProvider()` returns the tenant's provider
   * 3. Each tenant's data is encrypted with their own key
   *
   * ## Security Notes
   *
   * - Original entity is not modified (returns a copy)
   * - Each field gets a unique IV (never reused)
   * - Key version is stored for rotation support
   * - Tenant isolation requires adapter + tenant context
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Entity instance with `@Encrypted()` decorated fields
   * @param tenantContext - Optional tenant context for multi-tenant key isolation
   * @returns New entity with encrypted field values
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If encryption fails for any field
   *
   * @example Single-tenant encryption
   * ```typescript
   * const user = new User();
   * user.email = 'user@example.com';
   *
   * const encrypted = await transformer.encryptEntity(user);
   * ```
   *
   * @example Multi-tenant encryption with key isolation
   * ```typescript
   * const encrypted = await transformer.encryptEntity(user, {
   *   organizationId: 'org-123'
   * });
   * // Uses tenant-specific key resolved by adapter
   * ```
   */
  async encryptEntity<T extends Record<string, unknown>>(
    entity: T,
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    const constructor = entity.constructor as new () => unknown;
    const fieldNames = getEncryptedFieldNames(constructor);

    if (fieldNames.length === 0) {
      return entity;
    }

    const result = { ...entity };
    const entityOptions = getEntityOptions(constructor);

    for (const fieldName of fieldNames) {
      const metadata = getFieldMetadata(constructor, fieldName);
      if (!metadata) {
        continue;
      }

      const value = entity[fieldName];
      if (value === null || value === undefined) {
        if (metadata.allowNull !== false) {
          continue;
        }
      }

      try {
        // Resolve provider and keyId: use adapter if tenant context provided, else static
        let provider: IKmsProvider;
        let keyId: string | undefined;

        // Fail fast: tenant context requires adapter configuration
        if (tenantContext && !this.options.adapter) {
          throw new TenantAdapterRequiredError('encrypt', tenantContext.organizationId);
        }

        if (tenantContext && this.options.adapter) {
          // Multi-tenant: use adapter to resolve tenant-specific key/provider
          provider = await this.options.adapter.resolveProvider(tenantContext);
          keyId = tenantContext.keyId ?? (await this.options.adapter.resolveKeyId(tenantContext));
        } else {
          // Single-tenant: use static provider/key from decorator metadata
          provider = this.getProvider(metadata.provider ?? entityOptions.provider);
          keyId = metadata.keyId ?? entityOptions.keyId;
        }

        const envelopeService = this.getEnvelopeService(provider);

        const options: IEnvelopeEncryptionOptions = {};
        if (keyId !== undefined) {
          options.keyId = keyId;
        }
        if (metadata.algorithm !== undefined) {
          options.algorithm = metadata.algorithm;
        }
        const encrypted = await envelopeService.encryptToBase64(String(value), options);

        // Add version metadata for key rotation tracking
        const encryptedWithMetadata: IEncryptedFieldFormat = {
          data: encrypted.ciphertext,
          key: encrypted.encryptedDataKey,
          iv: encrypted.iv,
          tag: encrypted.authTag,
          ...(keyId !== undefined && { version: keyId }),
          encryptedAt: new Date().toISOString()
        };

        (result as Record<string, unknown>)[fieldName] = encryptedWithMetadata;
      } catch (error) {
        // Re-throw configuration errors that should not be swallowed
        if (error instanceof TenantAdapterRequiredError) {
          throw error;
        }
        throw new EntityTransformError(constructor.name, error);
      }
    }

    return result;
  }

  /**
   * Decrypts all `@Encrypted()` fields in an entity.
   *
   * Discovers encrypted fields via decorator metadata, decrypts each field
   * using envelope decryption, and returns a new entity with plaintext values.
   *
   * ## Process
   *
   * 1. Get list of encrypted fields from entity metadata
   * 2. For each field:
   *    - Skip if null/undefined (unless `allowNull: false`)
   *    - Validate field is in IEncryptedFieldFormat
   *    - Use version metadata for key selection (rotation support)
   *    - Decrypt value using envelope decryption
   * 3. Return new entity with decrypted fields
   *
   * ## Multi-Tenant Key Resolution
   *
   * When a tenant context is provided and an adapter is configured:
   * 1. The adapter's `resolveProvider()` returns the tenant's provider
   * 2. The stored `version` field in IEncryptedFieldFormat determines the key
   * 3. This ensures proper decryption even after key rotation
   *
   * ## Error Handling
   *
   * - `allowNull: true` (default): Decryption failures set field to null
   * - `allowNull: false`: Decryption failures throw EntityTransformError
   * - Logs telemetry event on decryption failure with allowNull
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Entity with encrypted IEncryptedFieldFormat fields
   * @param tenantContext - Optional tenant context for multi-tenant provider resolution
   * @returns New entity with decrypted plaintext values
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If decryption fails with allowNull: false
   *
   * @example Single-tenant decryption
   * ```typescript
   * const encrypted = await repository.findById(id);
   * const user = await transformer.decryptEntity(encrypted);
   * console.log(user.email); // 'user@example.com' (plaintext)
   * ```
   *
   * @example Multi-tenant decryption
   * ```typescript
   * const user = await transformer.decryptEntity(encrypted, {
   *   organizationId: 'org-123'
   * });
   * // Uses tenant-specific provider resolved by adapter
   * ```
   */
  async decryptEntity<T extends Record<string, unknown>>(
    entity: T,
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    const constructor = entity.constructor as new () => unknown;
    const fieldNames = getEncryptedFieldNames(constructor);

    if (fieldNames.length === 0) {
      return entity;
    }

    const result = { ...entity };
    const entityOptions = getEntityOptions(constructor);

    for (const fieldName of fieldNames) {
      const metadata = getFieldMetadata(constructor, fieldName);
      if (!metadata) {
        continue;
      }

      const value = entity[fieldName];
      if (value === null || value === undefined) {
        if (metadata.allowNull !== false) {
          continue;
        }
      }

      // Check if value is in encrypted format
      await this.decryptField(
        result,
        fieldName,
        value,
        metadata,
        constructor,
        entityOptions,
        tenantContext
      );
    }

    return result;
  }

  /**
   * Decrypts a single encrypted field.
   *
   * Validates the field value is in IEncryptedFieldFormat, then decrypts
   * using the appropriate provider and key. Handles errors based on
   * allowNull configuration.
   *
   * @typeParam T - Entity type
   * @param result - Result entity to update (mutated in place)
   * @param fieldName - Name of the field to decrypt
   * @param value - Encrypted field value (IEncryptedFieldFormat)
   * @param metadata - Field encryption metadata from decorator
   * @param constructor - Entity class constructor (for error messages)
   * @param entityOptions - Entity-level encryption options
   * @param tenantContext - Optional tenant context for multi-tenant provider resolution
   * @throws {EntityTransformError} If decryption fails with allowNull: false
   * @internal
   */
  private async decryptField<T extends Record<string, unknown>>(
    result: T,
    fieldName: string,
    value: unknown,
    metadata: IEncryptedFieldMetadata,
    constructor: new () => unknown,
    entityOptions: { provider?: string; keyId?: string },
    tenantContext?: ITenantEncryptionContext
  ): Promise<void> {
    const encrypted = value as IEncryptedFieldFormat;
    if (
      typeof encrypted === 'object' &&
      encrypted !== null &&
      'data' in encrypted &&
      'key' in encrypted &&
      'iv' in encrypted &&
      'tag' in encrypted
    ) {
      try {
        // Resolve provider: use adapter if tenant context provided, else static
        let provider: IKmsProvider;

        // Fail fast: tenant context requires adapter configuration
        if (tenantContext && !this.options.adapter) {
          throw new TenantAdapterRequiredError('decrypt', tenantContext.organizationId);
        }

        if (tenantContext && this.options.adapter) {
          // Multi-tenant: use adapter to resolve tenant-specific provider
          provider = await this.options.adapter.resolveProvider(tenantContext);
        } else {
          // Single-tenant: use static provider from decorator metadata
          provider = this.getProvider(metadata.provider ?? entityOptions.provider);
        }

        const envelopeService = this.getEnvelopeService(provider);

        // Use version field if available for keyId (key stored at encryption time),
        // otherwise fall back to metadata. For decryption, the stored version
        // takes precedence to ensure we use the correct key.
        const keyId = encrypted.version ?? metadata.keyId ?? entityOptions.keyId;

        const decrypted = await envelopeService.decryptFromBase64(
          encrypted.data,
          encrypted.key,
          encrypted.iv,
          encrypted.tag,
          {
            ...(keyId !== undefined && { keyId }),
            ...(metadata.algorithm !== undefined && { algorithm: metadata.algorithm })
          }
        );

        (result as Record<string, unknown>)[fieldName] = decrypted;
      } catch (error) {
        // Re-throw configuration errors that should not be swallowed
        if (error instanceof TenantAdapterRequiredError) {
          throw error;
        }

        if (metadata.allowNull !== false) {
          // Set to null on decryption failure if allowNull is true
          // Log warning for debugging - decryption failures should be investigated
          // Use sanitized error to avoid leaking sensitive data in telemetry
          const sanitizedError = this.sanitizeErrorForTelemetry(error);
          addSpanEvent('decryption_failure_set_to_null', {
            'entity.name': constructor.name,
            'field.name': fieldName,
            'error.type': sanitizedError
          });
          (result as Record<string, unknown>)[fieldName] = null;
        } else {
          throw new EntityTransformError(constructor.name, error);
        }
      }
    }
  }

  /**
   * Encrypts an array of entities concurrently.
   *
   * Uses Promise.all for parallel encryption with fail-fast semantics.
   * If any entity fails to encrypt, the entire batch operation fails.
   * This ensures atomicity - either all entities are encrypted or none are.
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entities - Array of entities to encrypt
   * @param tenantContext - Optional tenant context for multi-tenant key isolation
   * @returns Array of encrypted entities (same order as input)
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If any entity encryption fails (fail-fast)
   *
   * @example Single-tenant batch encryption
   * ```typescript
   * const users = [user1, user2, user3];
   * const encrypted = await transformer.encryptEntities(users);
   * await repository.bulkInsert(encrypted);
   * ```
   *
   * @example Multi-tenant batch encryption
   * ```typescript
   * const encrypted = await transformer.encryptEntities(users, {
   *   organizationId: 'org-123'
   * });
   * ```
   */
  async encryptEntities<T extends Record<string, unknown>>(
    entities: T[],
    tenantContext?: ITenantEncryptionContext
  ): Promise<T[]> {
    return Promise.all(entities.map((e) => this.encryptEntity(e, tenantContext)));
  }

  /**
   * Decrypts an array of entities concurrently.
   *
   * Uses Promise.all for parallel decryption with fail-fast semantics.
   * If any entity fails to decrypt (and has allowNull: false), the entire
   * batch operation fails. For fields with allowNull: true (default),
   * decryption failures set the field to null instead of throwing.
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entities - Array of encrypted entities
   * @param tenantContext - Optional tenant context for multi-tenant provider resolution
   * @returns Array of decrypted entities (same order as input)
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If any entity decryption fails with allowNull: false (fail-fast)
   *
   * @example Single-tenant batch decryption
   * ```typescript
   * const encrypted = await repository.findAll();
   * const users = await transformer.decryptEntities(encrypted);
   * ```
   *
   * @example Multi-tenant batch decryption
   * ```typescript
   * const users = await transformer.decryptEntities(encrypted, {
   *   organizationId: 'org-123'
   * });
   * ```
   */
  async decryptEntities<T extends Record<string, unknown>>(
    entities: T[],
    tenantContext?: ITenantEncryptionContext
  ): Promise<T[]> {
    return Promise.all(entities.map((e) => this.decryptEntity(e, tenantContext)));
  }

  /**
   * Re-encrypts an entity's fields with a new key.
   *
   * Essential for key rotation workflows. Decrypts each field with the old
   * key, then re-encrypts with the new key. Updates the version metadata
   * to reflect the new key.
   *
   * ## Key Rotation Process
   *
   * 1. Decrypt field using old key (from `version` metadata or `oldKeyId`)
   * 2. Re-encrypt plaintext using new key
   * 3. Update `version` field to new key ID
   * 4. Update `encryptedAt` timestamp
   *
   * ## Multi-Tenant Key Rotation
   *
   * When a tenant context is provided with an adapter:
   * 1. The adapter resolves tenant-specific providers for old/new keys
   * 2. Key IDs from options override adapter-resolved keys
   * 3. This enables tenant-scoped key rotation
   *
   * ## Security Considerations
   *
   * - Plaintext is only in memory briefly during re-encryption
   * - Old and new keys must both be accessible during rotation
   * - Consider batching large re-encryption jobs off-peak
   *
   * ## Provider Migration
   *
   * The `oldProvider` and `newProvider` options enable cross-provider
   * key rotation (e.g., migrating from AWS KMS to HashiCorp Vault).
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Entity with encrypted fields to re-encrypt
   * @param options - Re-encryption options
   * @param options.oldKeyId - Key ID used for original encryption
   * @param options.newKeyId - Key ID to use for re-encryption
   * @param options.oldProvider - Provider name for old key (optional)
   * @param options.newProvider - Provider name for new key (optional)
   * @param tenantContext - Optional tenant context for multi-tenant key resolution
   * @returns Entity with fields re-encrypted using new key
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If re-encryption fails
   *
   * @example Annual key rotation
   * ```typescript
   * // Rotate from 2024 key to 2025 key
   * const users = await repository.findAll();
   * for (const user of users) {
   *   const rotated = await transformer.reencryptEntity(user, {
   *     oldKeyId: 'alias/user-key-2024',
   *     newKeyId: 'alias/user-key-2025'
   *   });
   *   await repository.update(rotated.id, rotated);
   * }
   * ```
   *
   * @example Multi-tenant key rotation
   * ```typescript
   * const rotated = await transformer.reencryptEntity(user, {
   *   oldKeyId: 'alias/tenant-org-123-v1',
   *   newKeyId: 'alias/tenant-org-123-v2'
   * }, {
   *   organizationId: 'org-123'
   * });
   * ```
   *
   * @example Cross-provider migration
   * ```typescript
   * // Migrate from AWS KMS to HashiCorp Vault
   * const reencrypted = await transformer.reencryptEntity(entity, {
   *   oldKeyId: 'alias/aws-key',
   *   newKeyId: 'vault-key',
   *   oldProvider: 'aws',
   *   newProvider: 'vault'
   * });
   * ```
   */
  // eslint-disable-next-line complexity
  async reencryptEntity<T extends Record<string, unknown>>(
    entity: T,
    options: {
      oldKeyId: string;
      newKeyId: string;
      oldProvider?: string;
      newProvider?: string;
    },
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    const constructor = entity.constructor as new () => unknown;
    const fieldNames = getEncryptedFieldNames(constructor);

    if (fieldNames.length === 0) {
      return entity;
    }

    const result = { ...entity };
    const entityOptions = getEntityOptions(constructor);

    for (const fieldName of fieldNames) {
      const metadata = getFieldMetadata(constructor, fieldName);
      if (!metadata) {
        continue;
      }

      const value = entity[fieldName];
      if (value === null || value === undefined) {
        if (metadata.allowNull !== false) {
          continue;
        }
      }

      try {
        const encrypted = value as IEncryptedFieldFormat;

        // Check if value is in encrypted format
        if (
          typeof encrypted === 'object' &&
          encrypted !== null &&
          'data' in encrypted &&
          'key' in encrypted &&
          'iv' in encrypted &&
          'tag' in encrypted
        ) {
          // Resolve old provider: use adapter if tenant context provided, else static
          let oldProvider: IKmsProvider;

          // Fail fast: tenant context requires adapter configuration
          if (tenantContext && !this.options.adapter) {
            throw new TenantAdapterRequiredError('reencrypt', tenantContext.organizationId);
          }

          if (tenantContext && this.options.adapter) {
            // Multi-tenant: use adapter to resolve tenant-specific provider
            oldProvider = await this.options.adapter.resolveProvider({
              ...tenantContext,
              provider: options.oldProvider ?? metadata.provider ?? entityOptions.provider
            });
          } else {
            // Single-tenant: use static provider
            oldProvider = this.getProvider(
              options.oldProvider ?? metadata.provider ?? entityOptions.provider
            );
          }
          const oldEnvelopeService = this.getEnvelopeService(oldProvider);

          // Use version field if available for old keyId
          const oldKeyId =
            encrypted.version ?? options.oldKeyId ?? metadata.keyId ?? entityOptions.keyId;

          const decrypted = await oldEnvelopeService.decryptFromBase64(
            encrypted.data,
            encrypted.key,
            encrypted.iv,
            encrypted.tag,
            {
              ...(oldKeyId !== undefined && { keyId: oldKeyId }),
              ...(metadata.algorithm !== undefined && { algorithm: metadata.algorithm })
            }
          );

          // Resolve new provider: use adapter if tenant context provided, else static
          let newProvider: IKmsProvider;

          // NOTE: tenant adapter check already performed above for old provider resolution
          // No need to duplicate - both old and new provider resolution share same context

          if (tenantContext && this.options.adapter) {
            // Multi-tenant: use adapter to resolve tenant-specific provider
            newProvider = await this.options.adapter.resolveProvider({
              ...tenantContext,
              provider: options.newProvider ?? metadata.provider ?? entityOptions.provider
            });
          } else {
            // Single-tenant: use static provider
            newProvider = this.getProvider(
              options.newProvider ?? metadata.provider ?? entityOptions.provider
            );
          }
          const newEnvelopeService = this.getEnvelopeService(newProvider);

          const newKeyId = options.newKeyId ?? metadata.keyId ?? entityOptions.keyId;
          const reencrypted = await newEnvelopeService.encryptToBase64(decrypted, {
            ...(newKeyId !== undefined && { keyId: newKeyId }),
            ...(metadata.algorithm !== undefined && { algorithm: metadata.algorithm })
          });

          // Add version metadata for key rotation tracking
          const reencryptedWithMetadata: IEncryptedFieldFormat = {
            data: reencrypted.ciphertext,
            key: reencrypted.encryptedDataKey,
            iv: reencrypted.iv,
            tag: reencrypted.authTag,
            version: newKeyId,
            encryptedAt: new Date().toISOString()
          };

          (result as Record<string, unknown>)[fieldName] = reencryptedWithMetadata;
        }
      } catch (error) {
        // Re-throw configuration errors that should not be swallowed
        if (error instanceof TenantAdapterRequiredError) {
          throw error;
        }
        throw new EntityTransformError(`${constructor.name} (re-encrypt)`, error);
      }
    }

    return result;
  }

  /**
   * Re-encrypts an array of entities concurrently.
   *
   * Uses Promise.all for parallel re-encryption with fail-fast semantics.
   * If any entity fails to re-encrypt, the entire batch operation fails.
   * Useful for batch key rotation jobs.
   *
   * ## Performance Tip
   *
   * For large datasets, consider processing in chunks to manage memory:
   * ```typescript
   * const chunks = chunk(entities, 100);
   * for (const batch of chunks) {
   *   await transformer.reencryptEntities(batch, options, tenantContext);
   *   await repository.bulkUpdate(batch);
   * }
   * ```
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entities - Array of entities to re-encrypt
   * @param options - Re-encryption options (same as reencryptEntity)
   * @param tenantContext - Optional tenant context for multi-tenant key resolution
   * @returns Array of re-encrypted entities
   * @throws {EntityTransformError} If any entity re-encryption fails (fail-fast)
   *
   * @example Single-tenant batch re-encryption
   * ```typescript
   * const users = await repository.findByOrganization(orgId);
   * const rotated = await transformer.reencryptEntities(users, {
   *   oldKeyId: 'alias/org-key-v1',
   *   newKeyId: 'alias/org-key-v2'
   * });
   * await repository.bulkUpdate(rotated);
   * ```
   *
   * @example Multi-tenant batch re-encryption
   * ```typescript
   * const rotated = await transformer.reencryptEntities(users, {
   *   oldKeyId: 'alias/tenant-org-123-v1',
   *   newKeyId: 'alias/tenant-org-123-v2'
   * }, {
   *   organizationId: 'org-123'
   * });
   * ```
   */
  async reencryptEntities<T extends Record<string, unknown>>(
    entities: T[],
    options: {
      oldKeyId: string;
      newKeyId: string;
      oldProvider?: string;
      newProvider?: string;
    },
    tenantContext?: ITenantEncryptionContext
  ): Promise<T[]> {
    return Promise.all(entities.map((e) => this.reencryptEntity(e, options, tenantContext)));
  }
}

/**
 * Factory function to create an EntityTransformer instance.
 *
 * Provides a convenient way to create a transformer with the required
 * configuration options.
 *
 * @param options - Configuration options for the transformer
 * @returns Configured EntityTransformer instance
 *
 * @example With provider factory
 * ```typescript
 * const factory = new KmsProviderFactory();
 * factory.register('aws', awsKmsProvider);
 * factory.register('gcp', gcpKmsProvider);
 *
 * const transformer = createEntityTransformer({
 *   getProvider: (name) => factory.getProvider(name),
 *   defaultProvider: 'aws'
 * });
 * ```
 *
 * @example With NestJS dependency injection
 * ```typescript
 * @Injectable()
 * class EncryptionService {
 *   private readonly transformer: EntityTransformer;
 *
 *   constructor(private readonly providerFactory: KmsProviderFactory) {
 *     this.transformer = createEntityTransformer({
 *       getProvider: (name) => this.providerFactory.getProvider(name),
 *       defaultProvider: 'aws'
 *     });
 *   }
 * }
 * ```
 */
export function createEntityTransformer(options: IEntityTransformerOptions): EntityTransformer {
  return new EntityTransformer(options);
}

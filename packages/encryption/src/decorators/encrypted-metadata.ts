/**
 * @Encrypted Decorator Metadata Storage
 *
 * Internal module for storing and retrieving encryption metadata from
 * decorated classes. Supports both TypeScript 4.x legacy decorators
 * (using reflect-metadata) and TypeScript 5+ standard decorators
 * (using Symbol.metadata).
 *
 * ## Overview
 *
 * When you apply `@Encrypted()` to a class property, the decorator stores
 * metadata about how that field should be encrypted. This module provides
 * the storage and retrieval mechanisms for that metadata.
 *
 * ## Metadata Storage Strategy
 *
 * ```
 * @Encrypted() decorator
 *        │
 *        ▼
 * ┌──────────────────────┐
 * │ setFieldMetadata()   │
 * └──────────┬───────────┘
 *            │
 *            ▼
 * ┌──────────────────────┐     ┌──────────────────────┐
 * │ entityMetadataStore  │ OR  │ Symbol.metadata      │
 * │ (Map for legacy)     │     │ (TS 5+ standard)     │
 * └──────────────────────┘     └──────────────────────┘
 * ```
 *
 * ## TypeScript 5+ Decorator Support
 *
 * Standard decorators store metadata in `Symbol.metadata` on the class.
 * This module reads from both storage locations for compatibility.
 *
 * ## Testing Utilities
 *
 * The `clearEntityMetadata()` function allows clearing metadata between
 * tests. This is essential for isolated test cases.
 *
 * ## Security Notes
 *
 * - Metadata is stored in memory only (not persisted)
 * - Clearing metadata in production would break encryption
 * - Use `clearEntityMetadata()` only in test environments
 *
 * @module encryption/decorators
 * @internal This module is primarily for internal use by decorators
 */

import 'reflect-metadata';

import { EncryptionAlgorithm } from '../constants';
import { EncryptionOperationError } from '../errors';

/**
 * Metadata for a single encrypted field.
 *
 * Stores the encryption configuration for a field decorated with
 * `@Encrypted()`. Values may be undefined if using entity-level defaults.
 *
 * @interface IEncryptedFieldMetadata
 *
 * @example Field with custom options
 * ```typescript
 * const metadata: IEncryptedFieldMetadata = {
 *   propertyName: 'ssn',
 *   keyId: 'alias/pci-key',
 *   provider: 'aws',
 *   algorithm: EncryptionAlgorithm.AES_256_GCM,
 *   allowNull: false
 * };
 * ```
 */
export interface IEncryptedFieldMetadata {
  /**
   * Name of the decorated property.
   *
   * Used to identify which field this metadata belongs to.
   */
  propertyName: string;

  /**
   * KMS key identifier for this field.
   *
   * Overrides entity-level and system default keys. Use for fields
   * requiring different security levels or compliance separation.
   *
   * @example 'alias/pci-key' | 'arn:aws:kms:...' | 'projects/.../cryptoKeys/...'
   */
  keyId?: string;

  /**
   * KMS provider name for this field.
   *
   * Overrides entity-level default. Enables multi-provider setups
   * where different fields use different KMS systems.
   *
   * @example 'aws' | 'gcp' | 'azure' | 'vault'
   */
  provider?: string;

  /**
   * Encryption algorithm for this field.
   *
   * Defaults to AES-256-GCM if not specified. Only use AES-128-GCM
   * when performance testing shows unacceptable overhead.
   */
  algorithm?: EncryptionAlgorithm;

  /**
   * Behavior when field value is null/undefined.
   *
   * - `true` (default): Null values skip encryption, decryption failures return null
   * - `false`: Null values throw error, decryption failures throw error
   *
   * Set to `false` for required sensitive fields that must never be null.
   */
  allowNull?: boolean;
}

/**
 * Metadata for an entire encrypted entity.
 *
 * Aggregates field-level metadata and entity-level defaults for a class
 * decorated with `@EncryptedEntity()`.
 *
 * @interface IEntityEncryptionMetadata
 *
 * @example
 * ```typescript
 * const metadata: IEntityEncryptionMetadata = {
 *   entityName: 'User',
 *   provider: 'aws',
 *   keyId: 'alias/user-key',
 *   encryptedFields: new Map([
 *     ['email', { propertyName: 'email' }],
 *     ['ssn', { propertyName: 'ssn', keyId: 'alias/pci-key' }]
 *   ])
 * };
 * ```
 */
export interface IEntityEncryptionMetadata {
  /**
   * Entity class name.
   *
   * Used for error messages and debugging.
   */
  entityName: string;

  /**
   * Map of field names to their encryption metadata.
   *
   * Key is the property name, value is the field metadata.
   */
  encryptedFields: Map<string, IEncryptedFieldMetadata>;

  /**
   * Default KMS provider for all fields in this entity.
   *
   * Set via `@EncryptedEntity({ provider: 'aws' })`.
   */
  provider?: string;

  /**
   * Default KMS key ID for all fields in this entity.
   *
   * Set via `@EncryptedEntity({ keyId: 'alias/...' })`.
   */
  keyId?: string;
}

/**
 * Global metadata storage for legacy decorators.
 *
 * Maps class constructors to their encryption metadata. Used when
 * TypeScript is configured with `experimentalDecorators: true`.
 *
 * @internal
 */
const entityMetadataStore = new Map<new () => unknown, IEntityEncryptionMetadata>();

/**
 * Tracks entities using Symbol.metadata for proper cleanup.
 *
 * TypeScript 5+ standard decorators store metadata in Symbol.metadata.
 * We track these classes to enable clearing metadata in tests.
 *
 * @internal
 */
const entitiesWithSymbolMetadata = new Set<new () => unknown>();

/**
 * Retrieves or creates encryption metadata for an entity class.
 *
 * Checks multiple storage locations in order:
 * 1. entityMetadataStore (legacy decorator storage)
 * 2. Symbol.metadata on the class (TS 5+ standard decorators)
 * 3. Creates empty metadata if none found
 *
 * @param target - Entity class constructor
 * @returns IEntityEncryptionMetadata for the class
 *
 * @example
 * ```typescript
 * const metadata = getEntityMetadata(User);
 * console.log(metadata.encryptedFields.size); // Number of @Encrypted fields
 * ```
 */
export function getEntityMetadata(target: new () => unknown): IEntityEncryptionMetadata {
  // Check if we already have metadata in our store (not from Symbol.metadata)
  if (entityMetadataStore.has(target)) {
    return entityMetadataStore.get(target) || { entityName: '', encryptedFields: new Map() };
  }

  // Check for TypeScript 5+ decorator metadata
  // The metadata is stored under a symbol with description "Symbol.metadata"
  const symbols = Object.getOwnPropertySymbols(target);
  const metadataSymbol = symbols.find((sym) => sym.description === 'Symbol.metadata');

  if (metadataSymbol) {
    const targetRecord = target as unknown as Record<PropertyKey, unknown>;
    const classMetadata = targetRecord[metadataSymbol] as Record<PropertyKey, unknown> | undefined;
    if (classMetadata) {
      const fieldsSymbolKey = Symbol.for('encrypted:fields');
      const encryptedFieldsMetadata = classMetadata[fieldsSymbolKey];
      if (encryptedFieldsMetadata) {
        // Track this entity for later clearing
        entitiesWithSymbolMetadata.add(target);

        const metadata: IEntityEncryptionMetadata = {
          entityName: target.name,
          encryptedFields: new Map()
        };

        // Convert the plain object metadata to Map format
        for (const [fieldName, fieldMetadata] of Object.entries(
          encryptedFieldsMetadata as Record<string, unknown>
        )) {
          metadata.encryptedFields.set(fieldName, fieldMetadata as IEncryptedFieldMetadata);
        }

        // Don't cache - always read fresh from Symbol.metadata
        // This allows clearEntityMetadata to work properly
        return metadata;
      }
    }
  }

  // Create new empty metadata and cache it for future calls
  // This is critical: setFieldMetadata and other consumers call getEntityMetadata
  // and mutate the returned object. Without caching, each call returns a new
  // object and mutations are lost.
  const metadata: IEntityEncryptionMetadata = {
    entityName: target.name,
    encryptedFields: new Map()
  };
  entityMetadataStore.set(target, metadata);
  return metadata;
}

/**
 * Returns all stored entity metadata.
 *
 * Provides access to the internal metadata store. Primarily useful
 * for debugging or building admin tooling.
 *
 * **Note**: Only returns metadata from the legacy decorator store,
 * not Symbol.metadata entries.
 *
 * @returns Map of all registered entity classes to their metadata
 *
 * @example
 * ```typescript
 * const allMetadata = getAllEntityMetadata();
 * for (const [EntityClass, metadata] of allMetadata) {
 *   console.log(`${metadata.entityName}: ${metadata.encryptedFields.size} fields`);
 * }
 * ```
 */
export function getAllEntityMetadata(): Map<new () => unknown, IEntityEncryptionMetadata> {
  return entityMetadataStore;
}

/**
 * Stores field metadata for an encrypted property.
 *
 * Called by the `@Encrypted()` decorator to register field metadata.
 * Also called by initializers in TypeScript 5+ standard decorators.
 *
 * @param target - Entity class constructor
 * @param propertyName - Name of the decorated property
 * @param metadata - Encryption configuration for the field
 *
 * @example Called by @Encrypted decorator
 * ```typescript
 * // Inside @Encrypted() decorator implementation
 * setFieldMetadata(User, 'email', {
 *   propertyName: 'email',
 *   keyId: 'alias/user-key'
 * });
 * ```
 */
export function setFieldMetadata(
  target: new () => unknown,
  propertyName: string,
  metadata: IEncryptedFieldMetadata
): void {
  const entityMetadata = getEntityMetadata(target);
  entityMetadata.encryptedFields.set(propertyName, metadata);
}

/**
 * Retrieves merged field metadata with entity-level defaults.
 *
 * Returns field metadata with entity-level options (provider, keyId)
 * merged in where field-level options are not specified. Field-level
 * options always take precedence.
 *
 * ## Precedence Order
 *
 * 1. Field-level options (from `@Encrypted({ ... })`)
 * 2. Entity-level options (from `@EncryptedEntity({ ... })`)
 * 3. System defaults
 *
 * @param target - Entity class constructor
 * @param propertyName - Name of the property to get metadata for
 * @returns Merged field metadata, or undefined if field is not encrypted
 *
 * @example
 * ```typescript
 * const fieldMeta = getFieldMetadata(User, 'email');
 * if (fieldMeta) {
 *   console.log(`Provider: ${fieldMeta.provider}`);
 *   console.log(`Key: ${fieldMeta.keyId}`);
 * }
 * ```
 */
export function getFieldMetadata(
  target: new () => unknown,
  propertyName: string
): IEncryptedFieldMetadata | undefined {
  const entityMetadata = getEntityMetadata(target);
  const fieldMetadata = entityMetadata.encryptedFields.get(propertyName);

  if (!fieldMetadata) {
    return undefined;
  }

  // Get entity-level options
  const targetRecord = target as unknown as Record<PropertyKey, unknown>;
  const entitySymbolKey = Symbol.for('encrypted:entity');
  const entityOptions =
    (targetRecord[entitySymbolKey] as { keyId?: string; provider?: string }) || {};

  // Merge entity-level options with field-level options (field takes precedence)
  // Create a new object to avoid mutating the stored metadata
  const mergedMetadata: IEncryptedFieldMetadata = {
    propertyName: fieldMetadata.propertyName,
    ...(fieldMetadata.keyId !== undefined && { keyId: fieldMetadata.keyId }),
    ...(fieldMetadata.provider !== undefined && { provider: fieldMetadata.provider }),
    ...(fieldMetadata.algorithm !== undefined && { algorithm: fieldMetadata.algorithm }),
    ...(fieldMetadata.allowNull !== undefined && { allowNull: fieldMetadata.allowNull }),
    // Apply entity-level defaults only if field-level not set
    ...(fieldMetadata.keyId === undefined &&
      entityOptions.keyId !== undefined && {
        keyId: entityOptions.keyId
      }),
    ...(fieldMetadata.provider === undefined &&
      entityOptions.provider !== undefined && {
        provider: entityOptions.provider
      })
  };

  return mergedMetadata;
}

/**
 * Checks if a property is marked for encryption.
 *
 * Useful for conditional logic based on whether a field should be
 * encrypted or not.
 *
 * @param target - Entity class constructor
 * @param propertyName - Property name to check
 * @returns `true` if the property has `@Encrypted()` decorator
 *
 * @example
 * ```typescript
 * if (isEncryptedProperty(User, 'ssn')) {
 *   // Handle encrypted field specially
 * }
 * ```
 */
export function isEncryptedProperty(target: new () => unknown, propertyName: string): boolean {
  const entityMetadata = getEntityMetadata(target);
  return entityMetadata.encryptedFields.has(propertyName);
}

/**
 * Returns all encrypted field names for an entity class.
 *
 * Used by EntityTransformer to discover which fields need encryption
 * or decryption.
 *
 * @param target - Entity class constructor
 * @returns Array of property names with `@Encrypted()` decorator
 *
 * @example
 * ```typescript
 * const fields = getEncryptedFieldNames(User);
 * // ['email', 'ssn', 'creditCard']
 * ```
 */
export function getEncryptedFieldNames(target: new () => unknown): string[] {
  const entityMetadata = getEntityMetadata(target);
  return Array.from(entityMetadata.encryptedFields.keys());
}

/**
 * Clears encryption metadata for testing purposes.
 *
 * **WARNING**: Do not use in production code. Clearing metadata will
 * break encryption for affected entities.
 *
 * ## Use Cases
 *
 * - Isolating test cases that define temporary entity classes
 * - Cleaning up between test suites
 * - Resetting state in integration tests
 *
 * ## Behavior
 *
 * - If `target` provided: Clears metadata only for that class
 * - If `target` undefined: Clears ALL metadata (both stores)
 *
 * Clears both:
 * 1. Legacy decorator store (entityMetadataStore)
 * 2. Symbol.metadata on tracked classes
 *
 * ## Runtime Protection
 *
 * This function refuses to run in production environments unless explicitly
 * allowed via the `ALLOW_CLEAR_ENTITY_METADATA` environment variable.
 *
 * @param target - Optional entity class to clear metadata for
 * @throws {Error} When called in production without explicit allow flag
 *
 * @example Clear all metadata
 * ```typescript
 * afterEach(() => {
 *   clearEntityMetadata();
 * });
 * ```
 *
 * @example Clear specific class
 * ```typescript
 * afterEach(() => {
 *   clearEntityMetadata(TestUser);
 * });
 * ```
 */
export function clearEntityMetadata(target?: new () => unknown): void {
  // Runtime guard: refuse to run in production unless explicitly allowed
  const nodeEnv = process.env['NODE_ENV'];
  const allowFlag = process.env['ALLOW_CLEAR_ENTITY_METADATA'];

  if (nodeEnv === 'production' && allowFlag !== 'true') {
    throw new EncryptionOperationError(
      'clear_entity_metadata',
      new Error(
        `clearEntityMetadata() is not allowed in production. ` +
          `This function is intended for testing only and would break encryption for affected entities. ` +
          `Environment: NODE_ENV='${nodeEnv}', ALLOW_CLEAR_ENTITY_METADATA='${allowFlag ?? 'undefined'}'. ` +
          `If you must clear metadata in production, set ALLOW_CLEAR_ENTITY_METADATA=true.`
      )
    );
  }

  if (target) {
    entityMetadataStore.delete(target);
    entitiesWithSymbolMetadata.delete(target);
    // Also clear Symbol.metadata if it exists
    const symbols = Object.getOwnPropertySymbols(target);
    const metadataSymbol = symbols.find((sym) => sym.description === 'Symbol.metadata');
    if (metadataSymbol) {
      const targetRecord = target as unknown as Record<PropertyKey, unknown>;
      const classMetadata = targetRecord[metadataSymbol] as
        | Record<PropertyKey, unknown>
        | undefined;
      if (classMetadata) {
        const fieldsSymbolKey = Symbol.for('encrypted:fields');
        if (fieldsSymbolKey in classMetadata) {
          // Delete the property from the metadata object
          delete classMetadata[fieldsSymbolKey];
        }
      }
    }
  } else {
    entityMetadataStore.clear();
    // Clear all Symbol.metadata
    for (const entity of entitiesWithSymbolMetadata) {
      const symbols = Object.getOwnPropertySymbols(entity);
      const metadataSymbol = symbols.find((sym) => sym.description === 'Symbol.metadata');
      if (metadataSymbol) {
        const entityRecord = entity as unknown as Record<PropertyKey, unknown>;
        const classMetadata = entityRecord[metadataSymbol] as
          | Record<PropertyKey, unknown>
          | undefined;
        if (classMetadata) {
          const fieldsSymbolKey = Symbol.for('encrypted:fields');
          if (fieldsSymbolKey in classMetadata) {
            delete classMetadata[fieldsSymbolKey];
          }
        }
      }
    }
    entitiesWithSymbolMetadata.clear();
  }
}

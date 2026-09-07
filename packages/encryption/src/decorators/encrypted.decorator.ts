/**
 * @Encrypted() Decorator
 *
 * Property decorator for automatic field-level encryption in entity classes.
 * Supports both TypeScript 4.x legacy decorators and TypeScript 5+ standard decorators.
 *
 * ## Overview
 *
 * The `@Encrypted()` decorator marks entity fields that contain sensitive data
 * and should be automatically encrypted before storage and decrypted after retrieval.
 *
 * ## Security Best Practices
 *
 * ### Fields That SHOULD Be Encrypted
 *
 * Always encrypt Personally Identifiable Information (PII):
 * - Social Security Numbers (SSN)
 * - Credit card numbers (PAN)
 * - Bank account numbers
 * - Email addresses (in some contexts)
 * - Phone numbers
 * - Medical records (PHI under HIPAA)
 * - Passwords and API keys
 * - Biometric data
 *
 * ### Fields That Should NOT Be Encrypted
 *
 * Avoid encrypting fields used for:
 * - Database indexes (encryption prevents indexing)
 * - Foreign keys and relationships
 * - Aggregate queries (SUM, COUNT, etc.)
 * - Full-text search
 *
 * ## Compliance Notes
 *
 * | Standard | Requirement |
 * |----------|-------------|
 * | PCI DSS 4.0 | Encrypt PAN, track cardholder data |
 * | HIPAA | Encrypt PHI at rest and in transit |
 * | GDPR | Encryption as technical safeguard |
 * | PDPL (KSA/Qatar/UAE) | Protect personal data |
 *
 * @module encryption/decorators
 *
 * @example Complete entity with encrypted fields
 * ```typescript
 * import { Encrypted, EncryptedEntity } from '@package/encryption';
 *
 * @EncryptedEntity({ provider: 'aws', keyId: 'alias/default' })
 * class User {
 *   id: string;
 *   username: string; // Not encrypted - used for lookups
 *
 *   @Encrypted()
 *   email: string; // PII - encrypted
 *
 *   @Encrypted({ keyId: 'alias/high-security' })
 *   ssn: string; // Sensitive - uses dedicated key
 *
 *   @Encrypted({ allowNull: false })
 *   creditCard: string; // Must not be null
 * }
 * ```
 */

import 'reflect-metadata';

import { EncryptionAlgorithm } from '../constants';
import { setFieldMetadata, type IEncryptedFieldMetadata } from './encrypted-metadata';

/**
 * Configuration options for the @Encrypted() decorator.
 *
 * All options are optional. When not specified, entity-level defaults
 * from @EncryptedEntity() are used, falling back to system defaults.
 *
 * @interface IEncryptedOptions
 */
export interface IEncryptedOptions {
  /**
   * KMS key identifier to use for this field.
   *
   * Overrides entity-level and system defaults. Useful for fields
   * requiring different security levels (e.g., PCI data).
   *
   * @example 'alias/high-security-key'
   */
  keyId?: string;

  /**
   * KMS provider name to use for this field.
   *
   * Overrides entity-level default. Use when different fields
   * require different providers (e.g., multi-cloud setup).
   *
   * @example 'aws' | 'gcp' | 'azure' | 'vault'
   */
  provider?: string;

  /**
   * Encryption algorithm for this field.
   *
   * Default: AES_256_GCM (recommended for all sensitive data)
   */
  algorithm?: EncryptionAlgorithm;

  /**
   * Whether to allow null/undefined values.
   *
   * When true: Null values are not encrypted, returned as-is
   * When false (default): Throws error if field is null during encryption
   *
   * @default false
   */
  allowNull?: boolean;
}

/**
 * Entity-level encryption options type
 */
interface EntityOptions {
  keyId?: string;
  provider?: string;
}

/**
 * Property decorator for automatic field-level encryption.
 *
 * Marks a class property for automatic encryption before storage and
 * decryption after retrieval. Works with EntityTransformer and
 * EncryptedEntityHooks for seamless ORM integration.
 *
 * ## Decorator Compatibility
 *
 * Supports both TypeScript decorator variants:
 * - **Legacy decorators** (TypeScript 4.x with `experimentalDecorators`)
 * - **Standard decorators** (TypeScript 5+ native decorators)
 *
 * ## Option Precedence
 *
 * Options are resolved in this order (first wins):
 * 1. Field-level options (this decorator)
 * 2. Entity-level options (@EncryptedEntity)
 * 3. System defaults (AES-256-GCM, default provider)
 *
 * @param fieldOptions - Optional configuration for this field
 * @returns Property decorator function
 *
 * @example Basic usage
 * ```typescript
 * class User {
 *   @Encrypted()
 *   email: string;
 * }
 * ```
 *
 * @example With custom options
 * ```typescript
 * class PaymentInfo {
 *   @Encrypted({
 *     keyId: 'alias/pci-key',
 *     provider: 'aws',
 *     algorithm: EncryptionAlgorithm.AES_256_GCM,
 *     allowNull: false
 *   })
 *   cardNumber: string;
 * }
 * ```
 *
 * @example Multi-tenant with per-tenant keys
 * ```typescript
 * class TenantData {
 *   @Encrypted({ keyId: `tenant-${tenantId}` })
 *   sensitiveData: string;
 * }
 * ```
 */
export function Encrypted(
  fieldOptions: IEncryptedOptions = {}
): (target: unknown, propertyKeyOrContext: string | symbol | ClassFieldDecoratorContext) => void {
  return function decorator(
    target: unknown,
    propertyKeyOrContext: string | symbol | ClassFieldDecoratorContext
  ): void {
    // TypeScript 5+ standard decorators: target is undefined, second arg is context
    if (target === undefined && propertyKeyOrContext && typeof propertyKeyOrContext === 'object') {
      handleStandardDecorator(propertyKeyOrContext as ClassFieldDecoratorContext, fieldOptions);
      return;
    }

    // Legacy decorators (TypeScript 4 and earlier with experimentalDecorators)
    handleLegacyDecorator(target, propertyKeyOrContext, fieldOptions);
  };
}

/**
 * Handle TypeScript 5+ standard decorators
 */
function handleStandardDecorator(
  context: ClassFieldDecoratorContext,
  fieldOptions: IEncryptedOptions
): void {
  if (context.kind === 'field') {
    const propertyName = String(context.name);
    const metadataRecord = context.metadata as Record<PropertyKey, unknown>;
    const entitySymbolKey = Symbol.for('encrypted:entity');
    const entityOptions = (metadataRecord[entitySymbolKey] as EntityOptions) || {};

    const metadata: IEncryptedFieldMetadata = {
      propertyName: propertyName,
      ...(fieldOptions.keyId !== undefined && { keyId: fieldOptions.keyId }),
      ...(fieldOptions.provider !== undefined && { provider: fieldOptions.provider }),
      ...(fieldOptions.algorithm !== undefined && { algorithm: fieldOptions.algorithm }),
      ...(fieldOptions.allowNull !== undefined && { allowNull: fieldOptions.allowNull }),
      // Apply entity-level defaults only if field-level not set
      ...(fieldOptions.keyId === undefined &&
        entityOptions.keyId !== undefined && {
          keyId: entityOptions.keyId
        }),
      ...(fieldOptions.provider === undefined &&
        entityOptions.provider !== undefined && {
          provider: entityOptions.provider
        }),
      allowNull: fieldOptions.allowNull ?? false
    };

    // Store in context metadata for later retrieval
    const fieldsSymbolKey = Symbol.for('encrypted:fields');
    if (!metadataRecord[fieldsSymbolKey]) {
      metadataRecord[fieldsSymbolKey] = {};
    }
    const fieldsRecord = metadataRecord[fieldsSymbolKey] as Record<string, IEncryptedFieldMetadata>;
    fieldsRecord[propertyName] = metadata;

    // Also use addInitializer to register in our metadata store when class is available
    context.addInitializer(function (this: unknown) {
      const constructor = (this as { constructor: new () => unknown }).constructor;
      setFieldMetadata(constructor, propertyName, metadata);
    });
  }
}

/**
 * Handle legacy TypeScript decorators
 */
function handleLegacyDecorator(
  target: unknown,
  propertyKeyOrContext: string | symbol | ClassFieldDecoratorContext,
  fieldOptions: IEncryptedOptions
): void {
  const propertyName = getPropertyName(propertyKeyOrContext);
  const constructor = getConstructor(target);

  if (!constructor) {
    return;
  }

  const constructorRecord = constructor as unknown as Record<PropertyKey, unknown>;
  const entitySymbolKey = Symbol.for('encrypted:entity');
  const entityOptions = (constructorRecord[entitySymbolKey] as EntityOptions) || {};

  const metadata: IEncryptedFieldMetadata = {
    propertyName: propertyName,
    ...(fieldOptions.keyId !== undefined && { keyId: fieldOptions.keyId }),
    ...(fieldOptions.provider !== undefined && { provider: fieldOptions.provider }),
    ...(fieldOptions.algorithm !== undefined && { algorithm: fieldOptions.algorithm }),
    ...(fieldOptions.allowNull !== undefined && { allowNull: fieldOptions.allowNull }),
    // Apply entity-level defaults only if field-level not set
    ...(fieldOptions.keyId === undefined &&
      entityOptions.keyId !== undefined && {
        keyId: entityOptions.keyId
      }),
    ...(fieldOptions.provider === undefined &&
      entityOptions.provider !== undefined && {
        provider: entityOptions.provider
      }),
    allowNull: fieldOptions.allowNull ?? false
  };

  // Store in our metadata map for easy access (this is what the tests use)
  setFieldMetadata(constructor, propertyName, metadata);
}

/**
 * Get property name from various formats
 */
function getPropertyName(
  propertyKeyOrContext: string | symbol | ClassFieldDecoratorContext
): string {
  if (typeof propertyKeyOrContext === 'string') {
    return propertyKeyOrContext;
  }
  if (typeof propertyKeyOrContext === 'symbol') {
    return propertyKeyOrContext.toString();
  }
  return String(propertyKeyOrContext.name);
}

/**
 * Get constructor from target
 */
function getConstructor(target: unknown): (new () => unknown) | null {
  if (typeof target === 'function') {
    return target as new () => unknown;
  }
  if (target && typeof target === 'object' && 'constructor' in target) {
    return target.constructor as new () => unknown;
  }
  return null;
}

/**
 * Class decorator for entity-level encryption configuration.
 *
 * Sets default provider and key for all @Encrypted() fields in the class.
 * Individual fields can still override these defaults with their own options.
 *
 * ## Use Cases
 *
 * - **Multi-tenant isolation**: Set per-tenant keys at entity level
 * - **Provider selection**: Route entities to specific KMS providers
 * - **Key organization**: Group related entities under the same key
 *
 * @param options - Entity-level encryption options
 * @param options.provider - Default KMS provider for all fields
 * @param options.keyId - Default key ID for all fields
 * @returns Class decorator function
 *
 * @example Basic usage
 * ```typescript
 * @EncryptedEntity({ provider: 'aws', keyId: 'alias/user-data' })
 * class User {
 *   @Encrypted() // Uses entity defaults: aws + alias/user-data
 *   email: string;
 *
 *   @Encrypted({ keyId: 'alias/pci' }) // Overrides key only
 *   cardNumber: string;
 * }
 * ```
 *
 * @example Multi-tenant configuration
 * ```typescript
 * function createTenantUserClass(tenantId: string) {
 *   @EncryptedEntity({
 *     provider: 'aws',
 *     keyId: `alias/tenant-${tenantId}`
 *   })
 *   class TenantUser {
 *     @Encrypted()
 *     email: string;
 *   }
 *   return TenantUser;
 * }
 * ```
 */
export function EncryptedEntity(
  options: EntityOptions
): (target: new () => unknown | undefined, context?: ClassDecoratorContext) => void {
  return function decorator(
    target: new () => unknown | undefined,
    context?: ClassDecoratorContext
  ): void {
    // TypeScript 5+ standard decorators
    if (target === undefined && context?.metadata) {
      // Store in context metadata for field decorators to access
      const metadataRecord = context.metadata as Record<PropertyKey, unknown>;
      const entitySymbolKey = Symbol.for('encrypted:entity');
      metadataRecord[entitySymbolKey] = options;
      return;
    }

    // Legacy decorators
    const constructor = target as new () => unknown;
    const constructorRecord = constructor as unknown as Record<PropertyKey, unknown>;
    const entitySymbolKey = Symbol.for('encrypted:entity');
    const existingMetadata = (constructorRecord[entitySymbolKey] as EntityOptions) ?? {};
    constructorRecord[entitySymbolKey] = {
      ...existingMetadata,
      ...options
    };
  };
}

/**
 * Helper function to get entity-level options
 *
 * @param target - Entity class constructor
 * @returns Entity options or empty object if none set
 */
export function getEntityOptions(target: new () => unknown): EntityOptions {
  const constructorRecord = target as unknown as Record<PropertyKey, unknown>;
  const entitySymbolKey = Symbol.for('encrypted:entity');
  return (constructorRecord[entitySymbolKey] as EntityOptions) ?? {};
}

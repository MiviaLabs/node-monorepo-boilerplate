/**
 * Encryption Error Classes
 *
 * Custom error types for the encryption infrastructure, organized by category:
 *
 * ## Error Categories
 *
 * ### Operation Errors
 * Errors during cryptographic operations:
 * - {@link EncryptionOperationError} - Encryption failed
 * - {@link DecryptionOperationError} - Decryption failed
 * - {@link EnvelopeEncryptionError} - Envelope encryption workflow failed
 *
 * ### Provider Errors
 * Errors related to KMS provider configuration and access:
 * - {@link KmsProviderNotFoundError} - Provider not registered
 * - {@link InvalidKmsConfigError} - Invalid provider configuration
 * - {@link TenantAdapterRequiredError} - Tenant context without adapter
 * - {@link UnsupportedOperationError} - Operation not supported by provider
 *
 * ### Key Management Errors
 * Errors related to encryption keys:
 * - {@link KeyNotFoundError} - Key doesn't exist or is inaccessible
 * - {@link DataKeyGenerationError} - DEK generation failed
 * - {@link DataKeyDecryptionError} - DEK decryption failed
 * - {@link DataKeyReencryptionError} - DEK re-encryption failed
 * - {@link KeyRotationError} - Key rotation operation failed
 *
 * ### Entity/Migration Errors
 * Errors during entity transformation and data migration:
 * - {@link EntityTransformError} - Entity encryption/decryption failed
 * - {@link EncryptedMetadataNotFoundError} - Missing @Encrypted decorator
 * - {@link DataMigrationError} - Data migration operation failed
 * - {@link MigrationValidationError} - Migration validation failed
 *
 * ## Error Handling Best Practices
 *
 * ```typescript
 * import {
 *   EncryptionError,
 *   KeyNotFoundError,
 *   DecryptionOperationError
 * } from '@package/encryption';
 *
 * try {
 *   await encryptionService.decrypt(ciphertext);
 * } catch (error) {
 *   if (error instanceof KeyNotFoundError) {
 *     // Key doesn't exist - may need key rotation
 *     logger.warn('Encryption key not found', { keyId: error.message });
 *   } else if (error instanceof DecryptionOperationError) {
 *     // Decryption failed - data may be corrupted or tampered
 *     logger.error('Decryption failed', { cause: error.cause });
 *   } else if (error instanceof EncryptionError) {
 *     // Generic encryption error
 *     logger.error('Encryption error', { message: error.message });
 *   }
 * }
 * ```
 *
 * ## Security Note
 *
 * Error messages are designed to be safe for logging without exposing
 * sensitive information like key material or plaintext data.
 *
 * @module encryption/errors
 */

// ============================================================================
// BASE ERROR
// ============================================================================

/**
 * Base error class for all encryption-related errors.
 *
 * All encryption errors extend this class, enabling catch-all error handling
 * while still allowing specific error type checks.
 *
 * @extends Error
 *
 * @example Catch all encryption errors
 * ```typescript
 * try {
 *   await provider.encrypt(data);
 * } catch (error) {
 *   if (error instanceof EncryptionError) {
 *     // Handle any encryption-related error
 *     logger.error('Encryption failed', { error: error.message });
 *   }
 * }
 * ```
 */
export class EncryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EncryptionError';
  }
}

// ============================================================================
// OPERATION ERRORS
// ============================================================================

/**
 * Error thrown when an encryption operation fails.
 *
 * This error indicates that the cryptographic encryption process could not
 * complete. Common causes include:
 * - Invalid plaintext data format
 * - KMS provider communication failure
 * - Insufficient permissions on the encryption key
 * - Key is disabled or scheduled for deletion
 *
 * @extends EncryptionError
 *
 * @property {string} operation - The operation that failed (e.g., 'encrypt', 'wrap')
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await provider.encrypt(plaintext);
 * } catch (error) {
 *   if (error instanceof EncryptionOperationError) {
 *     logger.error('Encryption failed', {
 *       operation: 'encrypt',
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class EncryptionOperationError extends EncryptionError {
  constructor(operation: string, cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Encryption operation '${operation}' failed: ${cause.message}`
        : `Encryption operation '${operation}' failed`;

    super(message);
    this.name = 'EncryptionOperationError';
    this.cause = cause;
  }
}

/**
 * Error thrown when a decryption operation fails.
 *
 * This error indicates that the cryptographic decryption process could not
 * complete. Common causes include:
 * - Ciphertext was tampered with (authentication tag verification failed)
 * - Wrong encryption key used
 * - Ciphertext is corrupted or truncated
 * - Key version used for encryption no longer exists
 *
 * **Security Note**: Decryption failures may indicate tampering. Consider
 * logging these events for security monitoring.
 *
 * @extends EncryptionError
 *
 * @property {string} operation - The operation that failed (e.g., 'decrypt', 'unwrap')
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await provider.decrypt(ciphertext);
 * } catch (error) {
 *   if (error instanceof DecryptionOperationError) {
 *     // Log for security monitoring - may indicate tampering
 *     securityLogger.warn('Decryption failed - possible tampering', {
 *       operation: 'decrypt',
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class DecryptionOperationError extends EncryptionError {
  constructor(operation: string, cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Decryption operation '${operation}' failed: ${cause.message}`
        : `Decryption operation '${operation}' failed`;

    super(message);
    this.name = 'DecryptionOperationError';
    this.cause = cause;
  }
}

// ============================================================================
// PROVIDER ERRORS
// ============================================================================

/**
 * Error thrown when a requested KMS provider is not found.
 *
 * This error indicates that the specified provider has not been registered
 * with the KmsProviderFactory. Common causes include:
 * - Provider name is misspelled
 * - Provider was not registered during application startup
 * - Provider was cleared from the factory
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * try {
 *   const provider = factory.getProvider('nonexistent');
 * } catch (error) {
 *   if (error instanceof KmsProviderNotFoundError) {
 *     logger.error('Provider not registered', {
 *       provider: 'nonexistent',
 *       availableProviders: factory.getProviderNames()
 *     });
 *   }
 * }
 * ```
 */
export class KmsProviderNotFoundError extends EncryptionError {
  constructor(providerName: string) {
    super(`KMS provider '${providerName}' not found or not configured.`);
    this.name = 'KmsProviderNotFoundError';
  }
}

/**
 * Error thrown when a KMS provider is unavailable or fails health check.
 *
 * This error indicates that the provider exists but cannot perform operations
 * due to connectivity issues, authentication failures, or service unavailability.
 * Using this error for fail-fast behavior prevents cryptographic operations from
 * attempting to use an unreachable KMS, reducing latency and improving error clarity.
 *
 * Common causes include:
 * - Network connectivity issues to the KMS service
 * - Invalid or expired credentials
 * - KMS service maintenance or outage
 * - Firewall or VPC configuration blocking access
 * - Rate limiting or quota exceeded
 *
 * @extends EncryptionError
 *
 * @property {string} providerName - Name of the unavailable provider
 * @property {string} [operation] - The operation that was attempted
 * @property {string} [reason] - Additional context about the failure
 *
 * @example
 * ```typescript
 * try {
 *   await envelopeService.encrypt(plaintext);
 * } catch (error) {
 *   if (error instanceof KmsProviderUnavailableError) {
 *     // Provider is unreachable - retry later or use fallback
 *     logger.error('KMS provider unavailable', {
 *       provider: error.providerName,
 *       operation: 'encrypt',
 *       reason: error.reason
 *     });
 *     // Consider circuit breaker pattern for resilience
 *   }
 * }
 * ```
 */
export class KmsProviderUnavailableError extends EncryptionError {
  readonly providerName: string;
  readonly operation?: string;
  readonly reason?: string;

  constructor(providerName: string, operation?: string, reason?: string) {
    const opInfo = operation ? ` for operation '${operation}'` : '';
    const reasonInfo = reason ? ` Reason: ${reason}` : '';
    super(
      `KMS provider '${providerName}' is unavailable${opInfo}.${reasonInfo}` +
        ` Check network connectivity, credentials, and service status.`
    );
    this.name = 'KmsProviderUnavailableError';
    this.providerName = providerName;
    this.operation = operation;
    this.reason = reason;
  }
}

/**
 * Error thrown when tenant context is provided but no encryption adapter is configured.
 *
 * This error indicates a misconfiguration where code attempts multi-tenant
 * encryption operations but the EntityTransformer was not configured with
 * an IEncryptionAdapter. This is a fail-fast check to prevent silent fallback
 * to single-tenant behavior, which could cause security issues.
 *
 * **Security Note**: Silent fallback to single-tenant mode when multi-tenant
 * is expected could result in data being encrypted with the wrong key or
 * accessible to the wrong tenant.
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * // This will throw TenantAdapterRequiredError
 * const transformer = createEntityTransformer({
 *   getProvider: () => myProvider,
 *   defaultProvider: 'aws'
 *   // Missing: adapter: myEncryptionAdapter
 * });
 *
 * // Calling with tenant context without adapter configured
 * await transformer.encryptEntity(user, {
 *   tenantId: 'tenant-123',
 *   organizationId: 'org-456'
 * });
 * ```
 */
export class TenantAdapterRequiredError extends EncryptionError {
  /**
   * The tenant/organization ID that was provided in the operation context.
   * Useful for audit logging and debugging multi-tenancy issues.
   */
  readonly tenantId?: string;

  constructor(operation: string, tenantId?: string) {
    const tenantInfo = tenantId ? ` for tenant '${tenantId}'` : '';
    super(
      `Tenant context provided${tenantInfo} but no IEncryptionAdapter is configured. ` +
        `Configure an adapter in EntityTransformerOptions to use multi-tenant encryption ` +
        `or remove tenant context for single-tenant mode. Operation: '${operation}'`
    );
    this.name = 'TenantAdapterRequiredError';
    this.tenantId = tenantId;
  }
}

/**
 * Error thrown when KMS provider configuration is invalid.
 *
 * This error indicates that the provider configuration is missing required
 * fields or contains invalid values. Common causes include:
 * - Missing required fields (projectId, region, vaultUrl, etc.)
 * - Invalid credential format
 * - Malformed key identifiers
 * - Using EnvVarProvider in production without allowProduction flag
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * try {
 *   const provider = new GcpKmsProvider({
 *     projectId: '', // Invalid - empty string
 *     locationId: 'us-east1',
 *     keyRingId: 'my-ring'
 *   });
 * } catch (error) {
 *   if (error instanceof InvalidKmsConfigError) {
 *     logger.error('Invalid provider config', { error: error.message });
 *   }
 * }
 * ```
 */
export class InvalidKmsConfigError extends EncryptionError {
  constructor(message: string) {
    super(`Invalid KMS configuration: ${message}`);
    this.name = 'InvalidKmsConfigError';
  }
}

/**
 * Error thrown when an operation is not supported by a KMS provider.
 *
 * This error indicates that the requested operation (e.g., rewrap, getKeyInfo)
 * is not implemented by the specific KMS provider being used. Common scenarios:
 * - Calling `rewrap()` on a provider that doesn't support atomic rewrap
 * - Calling `getKeyInfo()` on a provider without key metadata access
 *
 * **Provider Capabilities:**
 *
 * | Provider | rewrap | getKeyInfo |
 * |----------|--------|------------|
 * | Vault Transit | ✓ Native | ✓ |
 * | AWS KMS | ✗ (manual) | ✓ |
 * | GCP KMS | ✗ (manual) | ✓ |
 * | Azure Key Vault | ✗ (manual) | ✓ |
 *
 * @extends EncryptionError
 *
 * @property {string} operation - The unsupported operation name
 * @property {string} providerType - The provider type that doesn't support the operation
 * @property {string} [keyId] - The key ID involved in the operation, if applicable
 *
 * @example
 * ```typescript
 * try {
 *   await provider.rewrap(ciphertext, keyId);
 * } catch (error) {
 *   if (error instanceof UnsupportedOperationError) {
 *     // Fall back to manual decrypt/re-encrypt
 *     const plaintext = await provider.decrypt(ciphertext);
 *     const reencrypted = await provider.encrypt(plaintext, newKeyId);
 *   }
 * }
 * ```
 */
export class UnsupportedOperationError extends EncryptionError {
  readonly operation: string;
  readonly providerType: string;
  readonly keyId?: string;

  constructor(operation: string, providerType: string, keyId?: string) {
    const keyInfo = keyId ? ` (keyId: '${keyId}')` : '';
    super(
      `Operation '${operation}' is not supported by provider '${providerType}'${keyInfo}. ` +
        `Consider using a provider that supports this operation or implement a manual fallback.`
    );
    this.name = 'UnsupportedOperationError';
    this.operation = operation;
    this.providerType = providerType;
    this.keyId = keyId;
  }
}

// ============================================================================
// KEY MANAGEMENT ERRORS
// ============================================================================

/**
 * Error thrown when a specified encryption key is not found.
 *
 * This error indicates that the key identifier (ARN, alias, resource name)
 * does not exist or the caller lacks permission to access it.
 *
 * **Compliance Note**: For PCI DSS and HIPAA compliance, ensure key access
 * failures are logged for audit purposes.
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * try {
 *   await provider.encrypt(data, 'nonexistent-key');
 * } catch (error) {
 *   if (error instanceof KeyNotFoundError) {
 *     // Log for compliance audit trail
 *     auditLogger.warn('Key access failed', {
 *       keyId: 'nonexistent-key',
 *       action: 'encrypt'
 *     });
 *   }
 * }
 * ```
 */
export class KeyNotFoundError extends EncryptionError {
  constructor(keyId: string, options?: ErrorOptions) {
    super(`Key '${keyId}' not found or inaccessible.`, options);
    this.name = 'KeyNotFoundError';
  }
}

/**
 * Error thrown when data encryption key (DEK) generation fails.
 *
 * This error occurs during envelope encryption when the system cannot
 * generate a new data key. Common causes include:
 * - KMS provider unavailable
 * - Key encryption key (KEK) is disabled
 * - Insufficient permissions for GenerateDataKey operation
 * - CSPRNG failure (extremely rare)
 *
 * @extends EncryptionError
 *
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   const dataKey = await provider.generateDataKey();
 * } catch (error) {
 *   if (error instanceof DataKeyGenerationError) {
 *     // Cannot generate new keys - critical for new data encryption
 *     logger.error('DEK generation failed', { cause: error.cause });
 *     throw new ServiceUnavailableError('Encryption service unavailable');
 *   }
 * }
 * ```
 */
export class DataKeyGenerationError extends EncryptionError {
  constructor(cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Data key generation failed: ${cause.message}`
        : `Data key generation failed`;

    super(message);
    this.name = 'DataKeyGenerationError';
    this.cause = cause;
  }
}

/**
 * Error thrown when data encryption key (DEK) decryption fails.
 *
 * This error occurs when the system cannot unwrap an encrypted DEK using
 * the key encryption key (KEK). This prevents decryption of the associated
 * data. Common causes include:
 * - KEK has been rotated and old version deleted
 * - Encrypted DEK is corrupted
 * - Insufficient permissions for Decrypt operation
 *
 * **Key Rotation Note**: If this error occurs after key rotation, ensure
 * the old key version is still available for decrypting existing DEKs.
 *
 * @extends EncryptionError
 *
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   const plaintext = await envelopeService.decrypt(encryptedData);
 * } catch (error) {
 *   if (error instanceof DataKeyDecryptionError) {
 *     // Cannot unwrap DEK - data may be inaccessible
 *     logger.error('DEK unwrap failed - possible key rotation issue', {
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class DataKeyDecryptionError extends EncryptionError {
  constructor(cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Data key decryption failed: ${cause.message}`
        : `Data key decryption failed`;

    super(message);
    this.name = 'DataKeyDecryptionError';
    this.cause = cause;
  }
}

/**
 * Error thrown when an envelope encryption workflow fails.
 *
 * Envelope encryption involves multiple steps (DEK generation, data encryption,
 * DEK wrapping). This error indicates failure in one of these steps.
 *
 * ## Envelope Encryption Flow
 * ```
 * 1. Generate DEK → DataKeyGenerationError
 * 2. Encrypt data with DEK → EncryptionOperationError
 * 3. Wrap DEK with KEK → EnvelopeEncryptionError
 * ```
 *
 * @extends EncryptionError
 *
 * @property {string} operation - The envelope operation that failed
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await envelopeService.encrypt(sensitiveData);
 * } catch (error) {
 *   if (error instanceof EnvelopeEncryptionError) {
 *     logger.error('Envelope encryption failed', {
 *       operation: 'encrypt',
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class EnvelopeEncryptionError extends EncryptionError {
  constructor(operation: string, cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Envelope encryption '${operation}' failed: ${cause.message}`
        : `Envelope encryption '${operation}' failed`;

    super(message);
    this.name = 'EnvelopeEncryptionError';
    this.cause = cause;
  }
}

// ============================================================================
// ENTITY/MIGRATION ERRORS
// ============================================================================

/**
 * Error thrown when entity encryption/decryption transformation fails.
 *
 * This error occurs when the EntityTransformer cannot process an entity's
 * @Encrypted() fields. Common causes include:
 * - Provider unavailable for the entity
 * - Key specified in metadata doesn't exist
 * - Encrypted field data is corrupted
 *
 * @extends EncryptionError
 *
 * @property {string} entityName - Name of the entity class that failed
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   const decrypted = await transformer.decryptEntity(user);
 * } catch (error) {
 *   if (error instanceof EntityTransformError) {
 *     logger.error('Entity decryption failed', {
 *       entity: 'User',
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class EntityTransformError extends EncryptionError {
  constructor(entityName: string, cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Entity transformation failed for '${entityName}': ${cause.message}`
        : `Entity transformation failed for '${entityName}'`;

    super(message);
    this.name = 'EntityTransformError';
    this.cause = cause;
  }
}

/**
 * Error thrown when @Encrypted() decorator metadata is not found.
 *
 * This error indicates that code attempted to encrypt/decrypt a field
 * that doesn't have the @Encrypted() decorator applied.
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * // This will throw EncryptedMetadataNotFoundError
 * class User {
 *   email: string; // Missing @Encrypted() decorator
 * }
 *
 * // Correct usage:
 * class User {
 *   @Encrypted()
 *   email: string;
 * }
 * ```
 */
export class EncryptedMetadataNotFoundError extends EncryptionError {
  constructor(targetName: string, propertyKey: string) {
    super(
      `Encrypted metadata not found for ${targetName}.${propertyKey}. Did you apply @Encrypted() decorator?`
    );
    this.name = 'EncryptedMetadataNotFoundError';
  }
}

/**
 * Error thrown when a key rotation operation fails.
 *
 * Key rotation involves re-encrypting data encryption keys (DEKs) with a
 * new key encryption key (KEK). This error indicates the rotation process
 * could not complete.
 *
 * **Compliance Note**: PCI DSS requires cryptographic key rotation at least
 * annually. HIPAA requires documented key management procedures.
 *
 * @extends EncryptionError
 *
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await keyRotationService.rotateKeyForTenant(tenantId, {
 *     oldKeyId: 'key-v1',
 *     newKeyId: 'key-v2'
 *   });
 * } catch (error) {
 *   if (error instanceof KeyRotationError) {
 *     // Key rotation failed - may need manual intervention
 *     logger.error('Key rotation failed', {
 *       tenantId,
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class KeyRotationError extends EncryptionError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KeyRotationError';
  }
}

/**
 * Error thrown when data encryption key (DEK) re-encryption fails.
 *
 * Re-encryption (rewrap) updates the envelope around a DEK without changing
 * the underlying key material. This is used during key rotation to update
 * DEKs to use a new KEK version.
 *
 * **Vault Advantage**: HashiCorp Vault Transit supports atomic rewrap where
 * the plaintext DEK never leaves the Vault boundary.
 *
 * @extends EncryptionError
 *
 * @property {string} operation - The re-encryption operation that failed
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await provider.rewrap(encryptedDek, newKeyId);
 * } catch (error) {
 *   if (error instanceof DataKeyReencryptionError) {
 *     logger.error('DEK rewrap failed', { cause: error.cause });
 *   }
 * }
 * ```
 */
export class DataKeyReencryptionError extends EncryptionError {
  constructor(operation: string, cause?: unknown) {
    const message =
      cause instanceof Error
        ? `Data key re-encryption '${operation}' failed: ${cause.message}`
        : `Data key re-encryption '${operation}' failed`;

    super(message);
    this.name = 'DataKeyReencryptionError';
    this.cause = cause;
  }
}

/**
 * Error thrown when a data migration operation fails.
 *
 * Data migration involves re-encrypting data from one key/provider to
 * another. This is used for:
 * - Migrating between cloud providers (AWS → GCP)
 * - Upgrading encryption algorithms
 * - Tenant data isolation changes
 *
 * @extends EncryptionError
 *
 * @property {unknown} [cause] - The underlying error that caused the failure
 *
 * @example
 * ```typescript
 * try {
 *   await migrationService.migrateToProvider(records, {
 *     sourceProvider: 'aws',
 *     targetProvider: 'gcp'
 *   });
 * } catch (error) {
 *   if (error instanceof DataMigrationError) {
 *     logger.error('Migration failed', {
 *       recordsProcessed: error.message,
 *       cause: error.cause
 *     });
 *   }
 * }
 * ```
 */
export class DataMigrationError extends EncryptionError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataMigrationError';
  }
}

/**
 * Error thrown when migration validation fails.
 *
 * Migration validation ensures data integrity after migration by verifying:
 * - All records were successfully migrated
 * - Decrypted data matches original
 * - No data corruption occurred
 *
 * @extends EncryptionError
 *
 * @example
 * ```typescript
 * try {
 *   await migrationService.validateMigration(migrationId);
 * } catch (error) {
 *   if (error instanceof MigrationValidationError) {
 *     // Validation failed - investigate before proceeding
 *     logger.error('Migration validation failed', {
 *       migrationId,
 *       error: error.message
 *     });
 *   }
 * }
 * ```
 */
export class MigrationValidationError extends EncryptionError {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationValidationError';
  }
}

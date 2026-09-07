/**
 * Key Rotation Service
 *
 * Orchestrates encryption key rotation operations across the infrastructure.
 * Coordinates between KMS providers and entity transformers to handle
 * rotation workflows with proper state management and telemetry.
 *
 * @module encryption/services
 */

import { KeyRotationError, DataKeyReencryptionError } from '../errors';
import { withTracing, EncryptionOperation, type EncryptionTelemetryContext } from '../telemetry';

import type { IKmsProvider } from '../providers/kms-provider.interface';

/**
 * Configuration options for key rotation operations.
 *
 * @interface IKeyRotationOptions
 */
export interface IKeyRotationOptions {
  /**
   * The organization/tenant ID for multi-tenancy isolation.
   * All rotation operations will be scoped to this tenant.
   * Required for compliance with data isolation requirements.
   *
   * This field ensures:
   * - Rotation operations are scoped to a single tenant
   * - Audit logs include tenant context for compliance
   * - Cross-tenant key rotation is prevented
   */
  organizationId: string;

  /**
   * Name of the KMS provider to use for rotation operations.
   * If not specified, uses the default provider.
   */
  provider?: string;

  /**
   * The current key ID being rotated from.
   * This key must still be accessible for decryption of existing DEKs.
   */
  currentKeyId: string;

  /**
   * The new key ID to rotate to.
   * This key will be used to re-encrypt all DEKs.
   */
  newKeyId: string;

  /**
   * Number of entities to process in each batch.
   * Larger batches improve throughput but use more memory.
   * @default 100
   */
  batchSize?: number;

  /**
   * Whether to continue processing if individual entities fail.
   * When true, errors are collected but don't stop the rotation.
   * When false, the first error aborts the entire operation.
   * @default false
   */
  continueOnError?: boolean;
}

/**
 * Result of a batch key rotation operation containing success/failure metrics.
 *
 * @beta This interface is not yet stable and may change in future releases.
 *
 * **Note**: This interface is exported for future batch rotation API methods.
 * Currently, individual key re-encryption is handled by {@link KeyRotationService.reencryptDataKey}
 * which returns {@link IDataKeyReencryptionResult}. A future `rotateEntities()` method
 * will return this interface to provide aggregate metrics for bulk operations.
 *
 * @interface IKeyRotationResult
 * @see {@link IDataKeyReencryptionResult} for single-key re-encryption results
 * @see {@link DataMigrationService} for current batch migration capabilities
 */
export interface IKeyRotationResult {
  /** Total number of entities processed */
  processed: number;

  /** Number of entities successfully rotated */
  succeeded: number;

  /** Number of entities that failed rotation */
  failed: number;

  /**
   * Detailed error information for each failed entity.
   * Only populated when continueOnError is true.
   */
  errors: Array<{ entityId: string; error: KeyRotationError | DataKeyReencryptionError }>;
}

/**
 * Result of re-encrypting a single data key.
 *
 * @interface IDataKeyReencryptionResult
 */
export interface IDataKeyReencryptionResult {
  /** The DEK re-encrypted with the new KEK */
  encryptedDataKey: Buffer;

  /** The old KEK ID (for audit/verification) */
  oldKeyId: string;

  /** The new KEK ID now protecting the DEK */
  newKeyId: string;
}

/**
 * Callback for progress updates during batch rotation operations.
 *
 * @callback RotationProgressCallback
 * @param progress - Current progress information
 * @param progress.processed - Number of entities processed so far
 * @param progress.total - Total number of entities to process
 * @param progress.currentEntity - ID of the entity currently being processed
 */
export type RotationProgressCallback = (progress: {
  processed: number;
  total: number;
  currentEntity?: string;
}) => void | Promise<void>;

/**
 * Orchestrates encryption key rotation operations.
 *
 * Re-wraps DEKs with a new KEK without decrypting the actual data. Key rotation
 * is tenant-scoped (requires `organizationId`), efficient (O(n) in records),
 * and safe (plaintext data never exposed during rotation).
 *
 * See docs/KEY_ROTATION_GUIDE.md for rotation schedules, compliance, and examples
 * @see {@link DataMigrationService} for bulk migration with progress tracking
 * @see {@link EncryptionService} for re-encryption utilities
 */
export class KeyRotationService {
  constructor(
    private readonly providerGetter: (name?: string) => IKmsProvider | undefined,
    private readonly defaultProviderName?: string
  ) {}

  /**
   * Get a KMS provider
   */
  private getKmsProvider(providerName?: string): IKmsProvider {
    const provider = this.providerGetter(providerName ?? this.defaultProviderName);

    if (!provider) {
      throw new KeyRotationError(
        `KMS provider '${providerName ?? this.defaultProviderName ?? 'default'}' not found`
      );
    }

    return provider;
  }

  /**
   * Build telemetry context for rotation operations.
   * Includes organizationId for tenant-scoped audit logging.
   */
  private buildTelemetryContext(
    provider: IKmsProvider,
    organizationId: string,
    oldKeyId: string,
    newKeyId: string
  ): EncryptionTelemetryContext {
    const ctx: EncryptionTelemetryContext = {
      provider: provider.name,
      keyId: newKeyId,
      metadata: {
        operation: 'key_rotation',
        organizationId,
        oldKeyId,
        newKeyId
      }
    };
    return ctx;
  }

  /**
   * Re-encrypts a data key from an old KEK to a new KEK.
   *
   * This is the core operation of key rotation. It takes a DEK that was
   * encrypted with the old KEK and produces a new encrypted DEK using the
   * new KEK, without ever exposing the underlying data.
   *
   * ## Implementation Strategy
   *
   * The method attempts two approaches in order of preference:
   *
   * 1. **Rewrap** (preferred): Uses the KMS provider's native rewrap operation
   *    if available. Benefits:
   *    - Atomic operation in the KMS
   *    - Plaintext DEK never leaves the KMS boundary
   *    - More efficient (single API call)
   *
   * 2. **Decrypt + Encrypt** (fallback): Decrypts with old key, encrypts with
   *    new key. The plaintext DEK briefly exists in application memory.
   *
   * @param encryptedDataKey - The DEK currently encrypted with the old KEK
   * @param options - Rotation options specifying tenant and key IDs
   * @param options.organizationId - The tenant/organization ID for isolation and audit
   * @param options.currentKeyId - The KEK ID currently wrapping the DEK
   * @param options.newKeyId - The new KEK ID to re-wrap the DEK with
   * @param options.provider - KMS provider to use (optional)
   * @returns Promise resolving to the re-encrypted DEK with metadata
   * @throws {KeyRotationError} When the KMS provider is not found
   * @throws {DataKeyReencryptionError} When rewrap or decrypt+encrypt fails
   *
   * @example
   * ```typescript
   * const result = await rotationService.reencryptDataKey(
   *   Buffer.from(entity.encryptedDataKey, 'base64'),
   *   {
   *     organizationId: 'org-123', // Required for tenant isolation
   *     currentKeyId: 'alias/production-key-2024',
   *     newKeyId: 'alias/production-key-2025'
   *   }
   * );
   *
   * // Update the stored encrypted data key
   * entity.encryptedDataKey = result.encryptedDataKey.toString('base64');
   * ```
   */
  async reencryptDataKey(
    encryptedDataKey: Buffer,
    options: IKeyRotationOptions
  ): Promise<IDataKeyReencryptionResult> {
    const provider = this.getKmsProvider(options.provider);

    // Verify provider availability and health before operations (two-phase check)
    try {
      // Phase 1: Lightweight availability check
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        throw new KeyRotationError(
          `Provider '${provider.name}' is not available for key rotation`,
          {
            cause: new Error('Provider availability check failed')
          }
        );
      }

      // Phase 2: Full health check for canonical validation
      const isHealthy = await provider.healthCheck();
      if (!isHealthy) {
        throw new KeyRotationError(
          `Provider '${provider.name}' is not available for key rotation`,
          {
            cause: new Error('Provider health check failed')
          }
        );
      }
    } catch (error) {
      if (error instanceof KeyRotationError) {
        throw error;
      }
      throw new KeyRotationError(`Provider '${provider.name}' is not available for key rotation`, {
        cause: error
      });
    }

    const telemetryCtx = this.buildTelemetryContext(
      provider,
      options.organizationId,
      options.currentKeyId,
      options.newKeyId
    );

    return withTracing(
      EncryptionOperation.KEY_ROTATION,
      async () => {
        // Try to use provider's rewrap method if available
        if (provider.rewrap) {
          try {
            const result = await provider.rewrap(
              encryptedDataKey,
              options.newKeyId,
              options.currentKeyId
            );
            return {
              encryptedDataKey: result.ciphertext,
              oldKeyId: options.currentKeyId,
              newKeyId: options.newKeyId
            };
          } catch (error) {
            throw new DataKeyReencryptionError('rewrap', error);
          }
        }

        // Fallback: decrypt with old key, encrypt with new key
        // Declare outside try block so we can zero it in finally
        let decryptedDataKey: Buffer | undefined;
        try {
          decryptedDataKey = await provider.decrypt(encryptedDataKey, options.currentKeyId);
          const reencrypted = await provider.encrypt(decryptedDataKey, options.newKeyId);

          return {
            encryptedDataKey: reencrypted,
            oldKeyId: options.currentKeyId,
            newKeyId: options.newKeyId
          };
        } catch (error) {
          throw new DataKeyReencryptionError('decrypt+encrypt', error);
        } finally {
          // Zero plaintext DEK to minimize memory exposure
          if (decryptedDataKey) {
            decryptedDataKey.fill(0);
          }
        }
      },
      telemetryCtx
    );
  }

  /**
   * Re-encrypts a base64-encoded data key.
   *
   * Convenience method for database storage scenarios where DEKs
   * are stored as base64 strings.
   *
   * @param encryptedDataKey - Base64-encoded encrypted DEK
   * @param options - Rotation options
   * @returns Promise resolving to base64-encoded result
   * @throws {KeyRotationError} When provider is not found
   * @throws {DataKeyReencryptionError} When re-encryption fails
   */
  async reencryptDataKeyFromBase64(
    encryptedDataKey: string,
    options: IKeyRotationOptions
  ): Promise<{ encryptedDataKey: string; oldKeyId: string; newKeyId: string }> {
    const result = await this.reencryptDataKey(Buffer.from(encryptedDataKey, 'base64'), options);

    return {
      encryptedDataKey: result.encryptedDataKey.toString('base64'),
      oldKeyId: result.oldKeyId,
      newKeyId: result.newKeyId
    };
  }

  /**
   * Validates that a key rotation operation can proceed.
   *
   * This pre-flight check verifies that all prerequisites are met before
   * starting a potentially long-running rotation operation. Always call
   * this before beginning batch rotation operations.
   *
   * ## Validation Checks
   *
   * 1. **Provider Availability**: KMS provider is reachable and authenticated
   * 2. **Old Key Accessible**: Current key exists and has decrypt permissions
   * 3. **New Key Accessible**: Target key exists and has encrypt permissions
   * 4. **Keys Enabled**: Both keys are in an enabled state (not pending deletion)
   *
   * @param options - Rotation options to validate
   * @param options.organizationId - The tenant/organization ID for isolation
   * @param options.currentKeyId - The old key ID to validate
   * @param options.newKeyId - The new key ID to validate
   * @param options.provider - KMS provider to use
   * @returns Promise resolving to true if rotation can proceed
   * @throws {KeyRotationError} When provider is not found
   * @throws {KeyRotationError} When provider is not available
   * @throws {KeyRotationError} When old key is not accessible or not enabled
   * @throws {KeyRotationError} When new key is not accessible or not enabled
   * @throws {KeyRotationError} When any validation check fails
   *
   * @example
   * ```typescript
   * try {
   *   await rotationService.validateRotation({
   *     organizationId: 'org-123',
   *     currentKeyId: 'alias/old-key',
   *     newKeyId: 'alias/new-key'
   *   });
   *   console.log('Rotation validation passed, proceeding...');
   * } catch (error) {
   *   if (error instanceof KeyRotationError) {
   *     console.error('Cannot proceed with rotation:', error.message);
   *   }
   * }
   * ```
   */
  async validateRotation(options: IKeyRotationOptions): Promise<boolean> {
    const provider = this.getKmsProvider(options.provider);

    try {
      // Two-phase provider availability and health check
      try {
        // Phase 1: Lightweight availability check
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          throw new KeyRotationError(
            `Provider '${provider.name}' is not available for rotation validation`
          );
        }

        // Phase 2: Full health check (includes additional validation for specialized providers
        // like EnvVar and GcpSecretManager)
        const isHealthy = await provider.healthCheck();
        if (!isHealthy) {
          throw new KeyRotationError(
            `Provider '${provider.name}' is not available or failed health check`
          );
        }
      } catch (error) {
        if (error instanceof KeyRotationError) {
          throw error;
        }
        throw new KeyRotationError(`Provider '${provider.name}' availability/health check failed`, {
          cause: error
        });
      }

      // Check if old key is accessible
      if (provider.getKeyInfo) {
        try {
          const oldKeyInfo = await provider.getKeyInfo(options.currentKeyId);
          if (!oldKeyInfo.enabled) {
            throw new KeyRotationError(`Old key '${options.currentKeyId}' is not enabled`);
          }
        } catch (error) {
          throw new KeyRotationError(`Old key '${options.currentKeyId}' is not accessible`, {
            cause: error
          });
        }

        // Check if new key is accessible
        try {
          const newKeyInfo = await provider.getKeyInfo(options.newKeyId);
          if (!newKeyInfo.enabled) {
            throw new KeyRotationError(`New key '${options.newKeyId}' is not enabled`);
          }
        } catch (error) {
          throw new KeyRotationError(`New key '${options.newKeyId}' is not accessible`, {
            cause: error
          });
        }
      }

      return true;
    } catch (error) {
      if (error instanceof KeyRotationError) {
        throw error;
      }
      throw new KeyRotationError('Validation failed', { cause: error });
    }
  }

  /**
   * Prepares a rotation plan for batch operations.
   *
   * Analyzes the entities to rotate and returns metadata useful for:
   * - Progress bar initialization
   * - Time estimation
   * - Resource planning
   *
   * @param entities - Array of entities to include in the rotation plan
   * @param options - Rotation options including batch size
   * @param options.organizationId - The tenant/organization ID for isolation
   * @param options.batchSize - Number of entities per batch (default: 100)
   * @returns Promise resolving to rotation plan metadata
   *
   * @example
   * ```typescript
   * const organizationId = 'org-123';
   * const entities = await db.users.findAll({ where: { organizationId } });
   * const plan = await rotationService.prepareRotationPlan(entities, {
   *   organizationId,
   *   currentKeyId: 'alias/old-key',
   *   newKeyId: 'alias/new-key',
   *   batchSize: 50
   * });
   *
   * console.log(`Will process ${plan.totalEntities} entities`);
   * console.log(`Estimated ${plan.estimatedBatches} batches`);
   * ```
   */
  async prepareRotationPlan(
    entities: Array<{ id: string; data: Record<string, unknown> }>,
    options: IKeyRotationOptions
  ): Promise<{ totalEntities: number; estimatedBatches: number }> {
    const batchSize = options.batchSize ?? 100;

    if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize) || batchSize < 1) {
      throw new KeyRotationError('batchSize must be a positive integer');
    }

    return {
      totalEntities: entities.length,
      estimatedBatches: Math.ceil(entities.length / batchSize)
    };
  }
}

/**
 * Factory function to create a KeyRotationService instance.
 *
 * @param providerGetter - Function to retrieve KMS providers by name
 * @param defaultProviderName - Name of the default provider to use
 * @returns A configured KeyRotationService instance
 *
 * @example
 * ```typescript
 * const rotationService = createKeyRotationService(
 *   (name) => kmsProviders.get(name ?? 'default'),
 *   'aws-kms'
 * );
 * ```
 */
export function createKeyRotationService(
  providerGetter: (name?: string) => IKmsProvider | undefined,
  defaultProviderName?: string
): KeyRotationService {
  return new KeyRotationService(providerGetter, defaultProviderName);
}

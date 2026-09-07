import { Injectable, Logger } from '@nestjs/common';
import { KmsProviderFactory } from '@package/encryption';

/**
 * Vault Key Service
 *
 * Manages encryption key lifecycle for PII vault entries using @package/encryption's
 * multi-cloud KMS provider support.
 *
 * ## Purpose
 *
 * This service provides a unified interface for managing the primary encryption key
 * shared across all tenants. Tenant isolation is achieved through unique DEKs
 * (Data Encryption Keys) per vault entry, not through separate KEKs.
 *
 * ## Key Architecture
 *
 * **Single Primary Key**: All tenants share `primary-encryption-key`
 * - **KEK (Key Encryption Key)**: GCP KMS `primary-encryption-key` (shared across tenants)
 * - **DEK (Data Encryption Key)**: Unique per vault entry (tenant-isolated)
 * - **Multi-tenancy**: Preserved via unique DEKs and database `organizationId` scoping
 *
 * ## Why Single Key?
 *
 * - **Cost**: $1/month vs $1M+/month for 1M tenant-specific keys
 * - **Simplicity**: One key to manage, rotate, and monitor
 * - **Security**: Tenant isolation via unique DEKs (not KEKs)
 *
 * ## Key ID Format
 *
 * Primary key uses constant ID: `primary-encryption-key`
 *
 * ## Key Rotation
 *
 * During key rotation, KMS creates a new version:
 * - Old key: `primary-encryption-key` (version 1)
 * - New key: `primary-encryption-key` (version 2)
 *
 * Vault entries are re-encrypted to new version in batches.
 *
 * @example
 * ```typescript
 * // Get primary key ID (constant for all tenants)
 * const keyId = await encryptedStoreKeyService.getPrimaryKeyId();
 *
 * // Validate primary key is accessible
 * const isValid = await encryptedStoreKeyService.validatePrimaryKey();
 * ```
 *
 * @see EncryptedStoreService - Uses this service to get primary key ID for encryption
 * @see EncryptionService - Uses the key ID for envelope encryption
 */
@Injectable()
export class EncryptedStoreKeyService {
  private readonly logger = new Logger(EncryptedStoreKeyService.name);

  constructor(private readonly kmsFactory: KmsProviderFactory) {}

  isGcpKmsProvider(): boolean {
    return this.kmsFactory.getDefaultProvider()?.name === 'gcp';
  }

  /**
   * Get the primary encryption key ID shared across all tenants
   *
   * Returns the constant primary key ID used for all vault entries.
   * Tenant isolation is maintained through unique DEKs per entry, not separate KEKs.
   *
   * ## Key ID Format
   *
   * Returns constant: `primary-encryption-key`
   *
   * ## Provider Behavior
   *
   * ### Development (EnvVarProvider)
   * - Key is created on-demand from ENCRYPTION_KEY environment variable
   * - Single key shared across all tenants
   *
   * ### Production (GcpKmsProvider, AwsKmsProvider)
   * - Key must exist in KMS before first use
   * - Provider checks if key is enabled and accessible
   * - Throws error if key doesn't exist or is disabled
   *
   * ## Usage
   *
   * ```typescript
   * const keyId = await encryptedStoreKeyService.getPrimaryKeyId();
   * // Returns: 'primary-encryption-key'
   *
   * // Use with EncryptionService
   * const encrypted = await encryption.encryptToBase64(plaintext, {
   *   keyId, // 'primary-encryption-key'
   * });
   * ```
   *
   * @returns KMS key ID for the primary encryption key
   * @throws Error if provider is not configured
   * @throws Error if key doesn't exist in production KMS
   *
   * @example
   * ```typescript
   * // Get key for encryption
   * const keyId = await encryptedStoreKeyService.getPrimaryKeyId();
   *
   * // Encrypt with primary key
   * const encrypted = await this.encryption.encryptToBase64(data, {
   *   keyId,
   * });
   * ```
   */
  async getPrimaryKeyId(): Promise<string> {
    this.logger.debug('Getting primary encryption key ID');

    const keyId = 'primary-encryption-key';
    const provider = this.kmsFactory.getDefaultProvider();

    if (!provider) {
      this.logger.error('No KMS provider configured');
      throw new Error(
        'No KMS provider configured. Please configure a provider in EncryptionModule.'
      );
    }

    // Check if key exists in KMS (for production providers)
    if (provider.getKeyInfo) {
      try {
        const keyInfo = await provider.getKeyInfo(keyId);

        // Check if key is disabled - throw error outside catch block
        if (keyInfo.enabled === false) {
          this.logger.warn(`Primary key ${keyId} is disabled`);
          throw new Error(`KMS primary key ${keyId} is disabled`);
        }

        this.logger.debug(`Primary key ${keyId} found and enabled`);
        return keyId;
      } catch (error) {
        // Re-throw if it's a "key disabled" error (don't treat it as "key not found")
        if (error instanceof Error && error.message.includes('is disabled')) {
          throw error;
        }

        // Key doesn't exist or provider doesn't support getKeyInfo
        this.logger.debug(`Primary key ${keyId} not found in KMS, will use on-demand creation`);

        // For development: key is created on-demand by EnvVarProvider
        // For production: you would create the KMS key here or throw an error
        if (process.env['NODE_ENV'] === 'production') {
          this.logger.error(
            `KMS primary key ${keyId} not found in production. Please create the key before use.`
          );
          throw new Error(
            `KMS primary key ${keyId} not found in production. Create the key in your cloud KMS (GCP KMS, AWS KMS) before use.`
          );
        }

        // Development: allow on-demand key creation
        this.logger.warn(
          `Primary key ${keyId} doesn't exist in KMS (development mode). Key will be created on-demand by EnvVarProvider.`
        );
      }
    }

    this.logger.debug(`Returning primary key ID ${keyId}`);
    return keyId;
  }

  /**
   * Get the primary encryption key ID with its current version
   *
   * Returns the key ID with the current primary version suffix.
   * This is used when storing vault entries to track which version encrypted the DEK.
   *
   * ## Key ID Format
   *
   * Returns versioned key ID: `primary-encryption-key/cryptoKeyVersions/{version}`
   *
   * ## Provider Behavior
   *
   * ### Development (EnvVarProvider)
   * - Returns unversioned key ID (no version tracking)
   *
   * ### Production (GcpKmsProvider)
   * - Queries KMS for the current primary version
   * - Returns versioned key ID for precise decryption tracking
   *
   * ## Usage
   *
   * ```typescript
   * const { keyId, keyVersion } = await encryptedStoreKeyService.getPrimaryKeyIdWithVersion();
   * // keyId: 'primary-encryption-key'
   * // keyVersion: 'primary-encryption-key/cryptoKeyVersions/5'
   *
   * // Store with vault entry
   * await encryptedStoreService.store({
   *   keyId,
   *   keyVersion,
   *   // ...
   * });
   * ```
   *
   * @returns Object with keyId (unversioned) and keyVersion (versioned)
   * @throws Error if provider is not configured
   * @throws Error if key doesn't exist in production KMS
   */
  async getPrimaryKeyIdWithVersion(): Promise<{ keyId: string; keyVersion: string }> {
    const provider = this.kmsFactory.getDefaultProvider();
    const keyId = 'primary-encryption-key';

    if (!provider) {
      throw new Error(
        'No KMS provider configured. Please configure a provider in EncryptionModule.'
      );
    }

    // For providers that don't support version tracking (EnvVarProvider, etc.)
    // return unversioned key ID for both fields
    if (!provider.getKeyInfo) {
      this.logger.debug('Provider does not support version tracking, returning unversioned keyId');
      return { keyId, keyVersion: keyId };
    }

    try {
      // Single KMS call that validates key AND gets version
      const keyInfo = await provider.getKeyInfo(keyId);

      // Check if key is disabled
      if (keyInfo.enabled === false) {
        this.logger.warn(`Primary key ${keyId} is disabled`);
        throw new Error(`KMS primary key ${keyId} is disabled`);
      }

      // If provider returns a version, use it
      if (keyInfo.version) {
        const keyVersion = `${keyId}/cryptoKeyVersions/${keyInfo.version}`;
        this.logger.debug(`Primary key ${keyId} version: ${keyInfo.version}`);
        return { keyId, keyVersion };
      }

      // Fallback: no version info available
      this.logger.debug(`Primary key ${keyId} has no version info, returning unversioned`);
      return { keyId, keyVersion: keyId };
    } catch (error) {
      // Re-throw if it's a "key disabled" error (don't treat it as "key not found")
      if (error instanceof Error && error.message.includes('is disabled')) {
        throw error;
      }

      // Key doesn't exist or provider doesn't support getKeyInfo
      this.logger.debug(`Primary key ${keyId} not found in KMS, will use on-demand creation`);

      // For production: you would create the KMS key here or throw an error
      if (process.env['NODE_ENV'] === 'production') {
        this.logger.error(
          `KMS primary key ${keyId} not found in production. Please create the key before use.`
        );
        throw new Error(
          `KMS primary key ${keyId} not found in production. Create the key in your cloud KMS (GCP KMS, AWS KMS) before use.`
        );
      }

      // Development: allow on-demand key creation, return unversioned
      this.logger.warn(
        `Primary key ${keyId} doesn't exist in KMS (development mode). Key will be created on-demand by EnvVarProvider.`
      );
      return { keyId, keyVersion: keyId };
    }
  }

  /**
   * Get tenant key ID (backward compatibility wrapper)
   *
   * @deprecated Use getPrimaryKeyId() instead. This method is maintained for backward compatibility
   * during migration but now returns the same primary key for all tenants.
   *
   * @param _tenantId - Tenant ID (ignored, all tenants use primary key)
   * @returns Primary encryption key ID
   */
  async getTenantKeyId(_tenantId: string): Promise<string> {
    this.logger.debug('getTenantKeyId() called (deprecated), returning primary key');
    return this.getPrimaryKeyId();
  }

  /**
   * Validate primary key is accessible and functional
   *
   * Performs a health check on the primary KMS key to ensure:
   * - Provider is available and accessible
   * - Key exists in the KMS
   * - Key is enabled and can be used for encryption/decryption
   *
   * ## Validation Steps
   *
   * 1. Check if provider is configured
   * 2. Check if provider is available (health check)
   * 3. Check if key exists in KMS (if provider supports getKeyInfo)
   * 4. Check if key is enabled
   *
   * ## Provider Behavior
   *
   * ### Development (EnvVarProvider)
   * - Always returns true (key created on-demand)
   * - No actual KMS validation performed
   *
   * ### Production (GcpKmsProvider, AwsKmsProvider)
   * - Validates key exists in cloud KMS
   * - Checks key status (enabled, disabled, scheduled for deletion)
   * - Verifies provider connectivity
   *
   * ## Usage
   *
   * Use this method during application startup or health checks:
   *
   * ```typescript
   * // During application startup
   * const isValid = await encryptedStoreKeyService.validatePrimaryKey();
   * if (!isValid) {
   *   throw new Error('Primary encryption key is not accessible');
   * }
   *
   * // Health check endpoint
   * @Get('health')
   * async healthCheck() {
   *   const keyValid = await encryptedStoreKeyService.validatePrimaryKey();
   *   return { keyValid };
   * }
   * ```
   *
   * @returns true if key is accessible and functional, false otherwise
   *
   * @example
   * ```typescript
   * // Validate before sensitive operations
   * const isValid = await encryptedStoreKeyService.validatePrimaryKey();
   * if (!isValid) {
   *   throw new Error('Cannot proceed: primary key is not accessible');
   * }
   *
   * // Proceed with encryption
   * const keyId = await encryptedStoreKeyService.getPrimaryKeyId();
   * ```
   */
  async validatePrimaryKey(): Promise<boolean> {
    this.logger.debug('Validating primary encryption key');

    const keyId = 'primary-encryption-key';
    const provider = this.kmsFactory.getDefaultProvider();

    if (!provider) {
      this.logger.error('No KMS provider configured');
      return false;
    }

    try {
      // Check if provider is available
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        this.logger.warn('KMS provider is not available');
        return false;
      }

      // Check if key exists and is enabled (if provider supports it)
      if (provider.getKeyInfo) {
        const keyInfo = await provider.getKeyInfo(keyId);
        const isEnabled = keyInfo.enabled ?? true;

        if (!isEnabled) {
          this.logger.warn(`Primary key ${keyId} is disabled`);
          return false;
        }

        this.logger.debug(`Primary key ${keyId} is enabled`);
      }

      this.logger.debug('Primary key validation successful');
      return true;
    } catch (error) {
      this.logger.error(`Primary key validation failed: ${String(error)}`);
      return false;
    }
  }

  /**
   * Validate tenant key (backward compatibility wrapper)
   *
   * @deprecated Use validatePrimaryKey() instead. This method is maintained for backward compatibility
   * during migration but now validates the primary key regardless of tenant.
   *
   * @param _tenantId - Tenant ID (ignored, all tenants use primary key)
   * @returns true if primary key is accessible, false otherwise
   */
  async validateTenantKey(_tenantId: string): Promise<boolean> {
    this.logger.debug('validateTenantKey() called (deprecated), validating primary key');
    return this.validatePrimaryKey();
  }

  /**
   * Schedule primary key deletion (administrative operation)
   *
   * @deprecated Primary key deletion is a system-wide operation that should only be performed
   * during full system decommissioning. This is NOT used for tenant offboarding.
   *
   * Schedules the deletion of the primary KMS key with a waiting period.
   * This is a critical operation that affects ALL tenants and should only be used
   * during full system migration or decommissioning.
   *
   * ## Deletion Process
   *
   * Cloud KMS providers enforce a waiting period before permanent deletion:
   *
   * ### AWS KMS
   * - Supports scheduled deletion with 7-30 day waiting period
   * - Key can be recovered during waiting period
   * - After waiting period, key is permanently deleted
   *
   * ### GCP KMS
   * - Key is destroyed immediately (no waiting period)
   * - Cannot recover destroyed keys
   * - Use with caution!
   *
   * ### Azure Key Vault
   * - Supports soft-delete with recovery
   * - Key can be recovered within retention period
   * - Purge operation permanently deletes
   *
   * ### Development (EnvVarProvider)
   * - Logs the action only (no actual KMS deletion)
   * - No key lifecycle management
   *
   * ## Before Calling This Method
   *
   * Ensure you have:
   * - Migrated all vault data across ALL tenants to new key or decrypted it
   * - Backed up all critical data
   * - Documented the reason for deletion
   * - Obtained approval for key destruction from all stakeholders
   * - Communicated system-wide impact to all tenants
   *
   * @param waitingPeriodDays - Waiting period in days (default: 30, range: 7-30)
   * @returns Promise that resolves when deletion is scheduled
   * @throws Error if provider is not configured
   * @throws Error if waiting period is out of range
   *
   * @warning This operation affects ALL tenants and is irreversible after the waiting period!
   */
  schedulePrimaryKeyDeletion(waitingPeriodDays: number = 30): void {
    this.logger.warn('schedulePrimaryKeyDeletion() called - this affects ALL tenants!');

    // Validate waiting period (minimum 7 days for safety)
    if (waitingPeriodDays < 7 || waitingPeriodDays > 30) {
      throw new Error('Waiting period must be between 7 and 30 days for primary key deletion');
    }

    const keyId = 'primary-encryption-key';
    const provider = this.kmsFactory.getDefaultProvider();

    if (!provider) {
      this.logger.error('No KMS provider configured');
      throw new Error('No KMS provider configured');
    }

    // Log the scheduled deletion with strong warning
    this.logger.error(
      `⚠️ CRITICAL: Scheduled primary key deletion for ${keyId} in ${waitingPeriodDays} days. ` +
        `This will affect ALL tenants and is irreversible after the waiting period.`
    );

    // Implementation depends on provider type
    // Note: This is a placeholder for provider-specific implementation

    switch (provider.name) {
      case 'aws': {
        // AWS KMS: scheduleKeyDeletion()
        // TODO: Implement AWS KMS scheduled deletion
        this.logger.warn(
          `AWS KMS key deletion not implemented. Use AWS CLI or Console to schedule deletion: ` +
            `aws kms schedule-key-deletion --key-id ${keyId} --pending-window-in-days ${waitingPeriodDays}`
        );
        break;
      }

      case 'gcp': {
        // GCP KMS: destroy() (note: GCP doesn't have waiting period)
        // TODO: Implement GCP KMS key destruction
        this.logger.warn(
          `GCP KMS key deletion not implemented. Use gcloud CLI to destroy key: ` +
            `gcloud kms keys destroy ${keyId} --location global --keyring encrypted-store`
        );
        break;
      }

      case 'azure': {
        // Azure Key Vault: deleteKey() with recovery
        // TODO: Implement Azure Key Vault deletion
        this.logger.warn(
          `Azure Key Vault key deletion not implemented. Use Azure CLI to delete key: ` +
            `az keyvault key delete --vault-name my-vault --name ${keyId}`
        );
        break;
      }

      case 'env-var': {
        // Development: log the action only
        this.logger.warn(
          `[Development Mode] Primary key deletion scheduled for ${keyId} in ${waitingPeriodDays} days. ` +
            `No actual key deletion in development mode.`
        );
        break;
      }

      default: {
        this.logger.warn(
          `Key deletion not implemented for provider: ${provider.name}. ` +
            `Use your cloud provider's CLI or console to delete the key.`
        );
      }
    }
  }

  /**
   * Schedule tenant key deletion (backward compatibility - no-op)
   *
   * @deprecated In single-key architecture, tenant offboarding does NOT involve key deletion.
   * Tenant data is deleted via soft-delete on vault entries. This method is a no-op.
   *
   * @param tenantId - Tenant ID (ignored)
   * @param _waitingPeriodDays - Waiting period (ignored)
   */
  scheduleKeyDeletion(tenantId: string, _waitingPeriodDays: number = 7): void {
    this.logger.warn(
      `scheduleKeyDeletion() called for tenant ${tenantId} - this is a no-op in single-key architecture. ` +
        `Tenant offboarding is handled by soft-deleting vault entries, not key deletion.`
    );
  }
}

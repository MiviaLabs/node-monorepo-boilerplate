/**
 * Encryption Module Configuration
 *
 * Configuration helpers for setting up encryption providers with secure defaults.
 * All helpers follow the "secure by default" principle:
 *
 * ## Secure Defaults
 *
 * | Setting | Default | Rationale |
 * |---------|---------|-----------|
 * | Algorithm | AES-256-GCM | NIST recommended, FIPS approved |
 * | Key Size | 256 bits | Strong classical security; Grover reduces to ~128-bit effective strength |
 * | Metrics | Enabled | Security monitoring and alerting |
 * | Decorators | Enabled | Automatic PII protection |
 *
 * ## Provider Configuration Helpers
 *
 * Each provider has a dedicated helper function:
 * - {@link gcpKmsConfig} - Google Cloud KMS
 * - {@link awsKmsConfig} - Amazon Web Services KMS
 * - {@link azureKeyVaultConfig} - Microsoft Azure Key Vault
 * - {@link vaultTransitConfig} - HashiCorp Vault Transit
 * - {@link gcpSecretManagerConfig} - GCP Secret Manager
 * - {@link envVarConfig} - Environment variables (dev/test only)
 *
 * ## Validation
 *
 * Use {@link validateEncryptionConfig} to validate configuration at startup.
 * This catches common misconfigurations like missing default provider.
 *
 * @module encryption/config
 *
 * @example Complete configuration
 * ```typescript
 * import {
 *   awsKmsConfig,
 *   envVarConfig,
 *   validateEncryptionConfig
 * } from '@package/encryption';
 *
 * const config: IEncryptionModuleConfig = {
 *   providers: [
 *     awsKmsConfig({
 *       region: 'us-east-1',
 *       keyId: 'alias/my-key',
 *       default: true
 *     })
 *   ],
 *   encryption: {
 *     algorithm: EncryptionAlgorithm.AES_256_GCM,
 *     enableMetrics: true
 *   }
 * };
 *
 * validateEncryptionConfig(config);
 * ```
 */

import { EncryptionAlgorithm } from '../constants';
import { InvalidKmsConfigError } from '../errors';
import {
  IGcpKmsProviderOptions,
  IAwsKmsProviderOptions,
  IAzureKeyVaultProviderOptions,
  IVaultTransitProviderOptions,
  IGcpSecretManagerProviderOptions,
  IEnvVarProviderOptions
} from '../providers/factory.types';
import { KmsProviderType } from '../providers/kms-provider.interface';

import type { IKmsProviderConfig } from '../providers/factory';

/**
 * Encryption module configuration.
 *
 * Root configuration interface for the encryption module. Requires at least
 * one provider to be configured and marked as default.
 *
 * @interface IEncryptionModuleConfig
 *
 * @example
 * ```typescript
 * const config: IEncryptionModuleConfig = {
 *   providers: [
 *     gcpKmsConfig({
 *       projectId: 'my-project',
 *       locationId: 'us-east1',
 *       keyRingId: 'my-ring',
 *       keyId: 'my-key',
 *       default: true
 *     })
 *   ],
 *   encryption: {
 *     algorithm: EncryptionAlgorithm.AES_256_GCM,
 *     enableMetrics: true,
 *     enableDecorators: true
 *   }
 * };
 * ```
 */
export interface IEncryptionModuleConfig {
  /**
   * Array of KMS provider configurations
   * At least one provider must be marked as default
   */
  providers: IKmsProviderConfig[];

  /**
   * Default encryption options
   */
  encryption?: {
    /**
     * Default algorithm for envelope encryption
     * @default 'aes-256-gcm'
     */
    algorithm?: EncryptionAlgorithm;

    /**
     * Enable automatic encryption/decryption via @Encrypted decorator
     * @default true
     */
    enableDecorators?: boolean;

    /**
     * Enable OpenTelemetry metrics collection
     * @default true
     */
    enableMetrics?: boolean;
  };
}

// ============================================================================
// PROVIDER CONFIGURATION HELPERS
// ============================================================================

/**
 * Creates a GCP Cloud KMS provider configuration.
 *
 * Google Cloud KMS provides hardware-backed key storage with automatic
 * key rotation and comprehensive audit logging via Cloud Audit Logs.
 *
 * @param options - GCP KMS configuration options
 * @param options.projectId - GCP project ID (required)
 * @param options.locationId - Key location, e.g., 'us-east1', 'global' (required)
 * @param options.keyRingId - Key ring name (required)
 * @param options.keyId - Default key name (optional, can specify per-operation)
 * @param options.credentialsFile - Path to service account JSON (optional)
 * @param options.credentials - Inline credentials object (optional)
 * @param options.endpoint - Custom API endpoint for testing (optional)
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example
 * ```typescript
 * const config = gcpKmsConfig({
 *   projectId: 'my-project',
 *   locationId: 'us-east1',
 *   keyRingId: 'my-keyring',
 *   keyId: 'my-encryption-key',
 *   default: true
 * });
 * ```
 */
export function gcpKmsConfig(
  options: IGcpKmsProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.GCP,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

/**
 * Creates an AWS KMS provider configuration.
 *
 * AWS KMS provides FIPS 140-2 validated hardware security modules with
 * native support for envelope encryption via GenerateDataKey.
 *
 * @param options - AWS KMS configuration options
 * @param options.region - AWS region, e.g., 'us-east-1' (required)
 * @param options.keyId - Key ARN, alias, or ID (optional but recommended)
 * @param options.accessKeyId - Explicit access key (optional, uses default chain)
 * @param options.secretAccessKey - Explicit secret key (optional)
 * @param options.sessionToken - Session token for temporary creds (optional)
 * @param options.endpoint - Custom endpoint for LocalStack (optional)
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example
 * ```typescript
 * const config = awsKmsConfig({
 *   region: 'us-east-1',
 *   keyId: 'alias/my-encryption-key',
 *   default: true
 * });
 * ```
 */
export function awsKmsConfig(
  options: IAwsKmsProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.AWS,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

/**
 * Creates an Azure Key Vault provider configuration.
 *
 * Azure Key Vault supports multiple authentication methods including
 * managed identity for passwordless authentication in Azure environments.
 *
 * @param options - Azure Key Vault configuration options
 * @param options.vaultUrl - Key Vault URL, e.g., 'https://my-vault.vault.azure.net' (required)
 * @param options.keyName - Default key name (optional)
 * @param options.keyVersion - Specific key version (optional, uses latest)
 * @param options.credentialType - Authentication method (optional, uses DEFAULT)
 * @param options.tenantId - Azure AD tenant ID (required for CLIENT_SECRET)
 * @param options.clientId - Application/managed identity client ID (optional)
 * @param options.clientSecret - Application secret (required for CLIENT_SECRET)
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example With managed identity
 * ```typescript
 * const config = azureKeyVaultConfig({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-key',
 *   credentialType: AzureCredentialType.MANAGED_IDENTITY,
 *   default: true
 * });
 * ```
 */
export function azureKeyVaultConfig(
  options: IAzureKeyVaultProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.AZURE,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

/**
 * Creates a HashiCorp Vault Transit provider configuration.
 *
 * Vault Transit is the only provider with native atomic rewrap support,
 * meaning plaintext DEKs never leave the Vault boundary during key rotation.
 *
 * @param options - Vault Transit configuration options
 * @param options.address - Vault server URL, e.g., 'https://vault.example.com:8200' (required)
 * @param options.token - Vault authentication token (required)
 * @param options.keyName - Default Transit key name (optional)
 * @param options.enginePath - Transit engine mount path (optional, default: 'transit')
 * @param options.namespace - Vault namespace (optional, Enterprise feature)
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example
 * ```typescript
 * const config = vaultTransitConfig({
 *   address: 'https://vault.example.com:8200',
 *   token: process.env.VAULT_TOKEN,
 *   keyName: 'my-transit-key',
 *   default: true
 * });
 * ```
 */
export function vaultTransitConfig(
  options: IVaultTransitProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.VAULT,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

/**
 * Creates a GCP Secret Manager provider configuration.
 *
 * Secret Manager is primarily for storing secrets, not encryption keys.
 * For encryption, prefer GCP Cloud KMS. Use this for secret storage
 * with optional KMS backing for actual encryption operations.
 *
 * @param options - GCP Secret Manager configuration options
 * @param options.projectId - GCP project ID (required)
 * @param options.credentialsFile - Path to service account JSON (optional)
 * @param options.credentials - Inline credentials object (optional)
 * @param options.endpoint - Custom endpoint for emulator (optional)
 * @param options.secretPrefix - Prefix for encryption key secrets (optional)
 * @param options.enableVersioning - Enable automatic versioning (optional)
 * @param options.kmsConfig - KMS backing for encryption (optional)
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example
 * ```typescript
 * const config = gcpSecretManagerConfig({
 *   projectId: 'my-project',
 *   secretPrefix: 'encryption-keys/',
 *   kmsConfig: {
 *     locationId: 'us-east1',
 *     keyRingId: 'my-ring',
 *     keyId: 'secret-encryption-key'
 *   }
 * });
 * ```
 */
export function gcpSecretManagerConfig(
  options: IGcpSecretManagerProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.GCP_SECRET_MANAGER,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

/**
 * Creates an environment variable provider configuration.
 *
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  WARNING: DEVELOPMENT AND TESTING ONLY - NOT FOR PRODUCTION USE ⚠️  ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 *
 * This provider stores encryption keys in environment variables, which is
 * insecure for production. Use only for:
 * - Local development
 * - Unit testing
 * - CI/CD pipeline testing
 *
 * @param options - Environment variable provider configuration
 * @param options.encryptionKey - Hex-encoded 32-byte key (64 chars)
 * @param options.keys - Multiple keys mapping (keyId → hex key)
 * @param options.envPrefix - Environment variable prefix (default: 'ENCRYPTION_KEY')
 * @param options.defaultKeyId - Default key ID (default: 'default')
 * @param options.allowProduction - Bypass production check (DANGEROUS)
 * @param options.strictProductionCheck - Throw error in production
 * @param options.default - Mark as default provider (optional)
 * @returns IKmsProviderConfig for use in IEncryptionModuleConfig
 *
 * @example Development configuration
 * ```typescript
 * const config = envVarConfig({
 *   encryptionKey: process.env.DEV_ENCRYPTION_KEY,
 *   default: true,
 *   strictProductionCheck: true // Fail if accidentally used in prod
 * });
 * ```
 */
export function envVarConfig(
  options: IEnvVarProviderOptions & { default?: boolean }
): IKmsProviderConfig {
  const { default: isDefault, ...providerOptions } = options;
  return {
    type: KmsProviderType.ENV_VAR,
    ...(isDefault !== undefined && { default: isDefault }),
    options: providerOptions
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates encryption configuration at startup.
 *
 * Call this function during application initialization to catch
 * configuration errors early. Validates:
 *
 * 1. **Provider presence**: At least one provider must be configured
 * 2. **Default provider**: Exactly one provider must be marked as default
 * 3. **Provider structure**: Each provider must have type and options
 *
 * @param config - The encryption module configuration to validate
 *
 * @throws {InvalidKmsConfigError} When no providers are configured (empty or missing providers array)
 * @throws {InvalidKmsConfigError} When no provider is marked as default
 * @throws {InvalidKmsConfigError} When multiple providers are marked as default
 * @throws {InvalidKmsConfigError} When a provider is missing required type or options properties
 *
 * @example
 * ```typescript
 * import { validateEncryptionConfig, InvalidKmsConfigError } from '@package/encryption';
 *
 * // In your application bootstrap
 * const config = loadEncryptionConfig();
 *
 * try {
 *   validateEncryptionConfig(config);
 * } catch (error) {
 *   if (error instanceof InvalidKmsConfigError) {
 *     logger.error('Invalid encryption config', { error: error.message });
 *     process.exit(1);
 *   }
 *   throw error;
 * }
 * ```
 */
export function validateEncryptionConfig(config: IEncryptionModuleConfig): void {
  if (!config.providers || config.providers.length === 0) {
    throw new InvalidKmsConfigError('At least one KMS provider must be configured');
  }

  const defaultProviders = config.providers.filter((p) => p.default);
  if (defaultProviders.length === 0) {
    throw new InvalidKmsConfigError('At least one provider must be marked as default');
  }
  if (defaultProviders.length > 1) {
    throw new InvalidKmsConfigError('Only one provider can be marked as default');
  }

  // Validate each provider config
  for (const provider of config.providers) {
    if (!provider.type || !provider.options) {
      throw new InvalidKmsConfigError(
        'Invalid provider configuration: type and options are required'
      );
    }
  }
}

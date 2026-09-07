/**
 * KMS Provider Factory Types
 *
 * Configuration types for each KMS provider
 */

import { AzureCredentialType } from '../constants';
import { KmsProviderType } from './kms-provider.interface';

// Re-export KmsProviderType for convenience
export { KmsProviderType };

/**
 * GCP KMS provider options
 */
export interface IGcpKmsProviderOptions {
  /** GCP project ID */
  projectId: string;
  /** KMS location (e.g., 'global', 'us-east1') */
  locationId: string;
  /** Key ring ID */
  keyRingId: string;
  /** Crypto key ID */
  keyId?: string;
  /** Path to service account credentials JSON file */
  credentialsFile?: string;
  /** Credentials object (alternative to credentialsFile) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint (for testing) */
  endpoint?: string;
}

/**
 * AWS KMS provider options
 */
export interface IAwsKmsProviderOptions {
  /** AWS region */
  region: string;
  /** KMS key ID or ARN */
  keyId?: string;
  /** AWS access key ID (optional, uses default credential chain) */
  accessKeyId?: string;
  /** AWS secret access key (optional, uses default credential chain) */
  secretAccessKey?: string;
  /** AWS session token (optional, for temporary credentials) */
  sessionToken?: string;
  /** Custom endpoint (for testing) */
  endpoint?: string;
}

/**
 * Azure Key Vault provider options
 */
export interface IAzureKeyVaultProviderOptions {
  /** Key Vault URL (e.g., 'https://my-vault.vault.azure.net') */
  vaultUrl: string;
  /** Key name in Key Vault */
  keyName?: string;
  /** Key version (uses latest if not specified) */
  keyVersion?: string;
  /** Azure credential type (default, managedIdentity, clientSecret) */
  credentialType?: AzureCredentialType;
  /** Client ID for clientSecret credential type */
  clientId?: string;
  /** Client secret for clientSecret credential type */
  clientSecret?: string;
  /** Tenant ID for clientSecret credential type */
  tenantId?: string;
}

/**
 * Vault Transit provider options
 */
export interface IVaultTransitProviderOptions {
  /** Vault address (e.g., 'http://localhost:8200') */
  address: string;
  /** Vault token */
  token: string;
  /** Transit engine path (default: 'transit') */
  enginePath?: string;
  /** Key name in Transit engine */
  keyName?: string;
  /** Vault namespace (Enterprise) */
  namespace?: string;
  /**
   * Enable strict permission validation on provider initialization.
   *
   * When enabled, the provider will perform an encrypt/decrypt round-trip
   * during `validatePermissions()` to verify the token has full operational
   * permissions, not just list permissions.
   *
   * Can also be enabled via `ENABLE_STRICT_KMS_VALIDATION=true` environment variable.
   *
   * @default false
   */
  enableStrictValidation?: boolean;
  /**
   * Test key name for strict validation.
   *
   * When `enableStrictValidation` is true, this key is used for the
   * encrypt/decrypt round-trip test. If not specified, uses the default
   * keyName.
   *
   * @default keyName
   */
  validationKeyName?: string;
}

/**
 * GCP Secret Manager provider options
 */
export interface IGcpSecretManagerProviderOptions {
  /** GCP project ID */
  projectId: string;
  /** Path to service account credentials JSON file */
  credentialsFile?: string;
  /** Credentials object (alternative to credentialsFile) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint (for testing/emulator) */
  endpoint?: string;
  /** Secret name prefix for storing encryption keys */
  secretPrefix?: string;
  /** Enable automatic secret versioning */
  enableVersioning?: boolean;
  /** Optional KMS backing configuration for actual encryption operations */
  kmsConfig?: {
    /** KMS location (e.g., 'global', 'us-east1') */
    locationId: string;
    /** Key ring ID */
    keyRingId: string;
    /** Crypto key ID */
    keyId: string;
  };
}

/**
 * Environment Variable provider options
 *
 * WARNING: Development and testing only - NOT for production use
 */
export interface IEnvVarProviderOptions {
  /** Environment variable prefix (default: 'ENCRYPTION_KEY') */
  envPrefix?: string;
  /** Direct encryption key (hex-encoded, 64 characters for AES-256-GCM) */
  encryptionKey?: string;
  /** Default key ID (default: 'default') */
  defaultKeyId?: string;
  /** Multiple keys mapping (keyId -> hex-encoded key) */
  keys?: Record<string, string>;
  /** Allow use in production (default: false) */
  allowProduction?: boolean;
  /** Throw error in production instead of just warning (default: false) */
  strictProductionCheck?: boolean;
}

/**
 * Provider-specific configuration mapping
 */
export interface IProviderConfigMapping {
  [KmsProviderType.GCP]: IGcpKmsProviderOptions;
  [KmsProviderType.AWS]: IAwsKmsProviderOptions;
  [KmsProviderType.AZURE]: IAzureKeyVaultProviderOptions;
  [KmsProviderType.VAULT]: IVaultTransitProviderOptions;
  [KmsProviderType.GCP_SECRET_MANAGER]: IGcpSecretManagerProviderOptions;
  [KmsProviderType.ENV_VAR]: IEnvVarProviderOptions;
}

/**
 * Infrastructure Secrets Configuration Interfaces
 * ====================================================
 * This file defines all configuration interfaces for the secrets package.
 * It follows the same pattern as events for consistency across the codebase.
 */

/**
 * Secret provider type enumeration
 */
export enum SecretProviderType {
  GCP = 'gcp',
  HASHICORP = 'hashicorp',
  ONEPASSWORD = 'onepassword'
}

/**
 * GCP Secret Manager configuration options
 */
export interface GcpSecretManagerConfig {
  /**
   * GCP Project ID for Secret Manager
   * Environment variable: GOOGLE_CLOUD_PROJECT
   */
  projectId?: string;

  /**
   * Path to service account credentials JSON file
   * Environment variable: GOOGLE_APPLICATION_CREDENTIALS
   */
  credentialsPath?: string;

  /**
   * Location of the KMS key ring (e.g., 'global', 'us-central1')
   * Environment variable: KMS_KEY_LOCATION
   * Default: 'global'
   */
  kmsKeyLocation?: string;

  /**
   * KMS Key Ring ID where encryption keys are stored
   * Environment variable: KMS_KEY_RING_ID
   * Default: 'vault-keys'
   */
  kmsKeyRingId?: string;

  /**
   * KMS Key ID for encryption/decryption operations
   * Environment variable: KMS_KEY_ID
   * Default: 'vault-key'
   */
  kmsKeyId?: string;

  /**
   * Enable OpenTelemetry tracing for this provider
   * Default: true
   */
  enableTracing?: boolean;

  /**
   * Enable secret caching (default: false)
   * When enabled, frequently accessed secrets are cached in memory
   */
  enableCache?: boolean;

  /**
   * Cache TTL in milliseconds (default: 300000 = 5 minutes)
   * Only used if enableCache is true
   */
  cacheTtl?: number;

  /**
   * Enable retry logic with exponential backoff (default: true)
   */
  enableRetry?: boolean;

  /**
   * Maximum number of retry attempts (default: 5)
   * Only used if enableRetry is true
   */
  maxRetries?: number;

  /**
   * Base delay for retry in milliseconds (default: 100ms)
   * Only used if enableRetry is true
   */
  retryBaseDelayMs?: number;

  /**
   * Maximum delay for retry in milliseconds (default: 10000ms)
   * Only used if enableRetry is true
   */
  retryMaxDelayMs?: number;
}

/**
 * HashiCorp Vault configuration options
 */
export interface HashiCorpVaultConfig {
  /**
   * Vault server address
   * Environment variable: VAULT_ADDR
   * Default: 'http://localhost:8200'
   */
  addr?: string;

  /**
   * Vault authentication token (for development/testing only)
   * Environment variable: VAULT_TOKEN
   */
  token?: string;

  /**
   * AppRole authentication - Role ID
   * Alternative to VAULT_TOKEN for production deployments
   * Environment variable: VAULT_ROLE_ID
   */
  roleId?: string;

  /**
   * AppRole authentication - Secret ID
   * Used with VAULT_ROLE_ID for AppRole authentication
   * Environment variable: VAULT_SECRET_ID
   */
  secretId?: string;

  /**
   * Vault namespace (for Vault Enterprise)
   * Environment variable: VAULT_NAMESPACE
   */
  namespace?: string;
}

/**
 * 1Password configuration options
 */
export interface OnePasswordConfig {
  /**
   * 1Password Service Account Token
   * Required for authenticating with 1Password Secrets Automation
   * Environment variable: OP_SERVICE_ACCOUNT_TOKEN
   */
  token?: string;

  /**
   * 1Password Connect API endpoint
   * Required for 1Password Secrets Automation
   * Environment variable: OP_CONNECT_HOST
   * Default: 'http://localhost:8080'
   */
  connectHost?: string;

  /**
   * 1Password Vault ID containing runtime secrets
   * Environment variable: OP_VAULT_ID
   * Default: 'runtime-secrets'
   */
  vaultId?: string;

  /**
   * 1Password Item name in the vault containing secret values
   * Environment variable: OP_ITEM_NAME
   * Default: 'Runtime Secrets'
   */
  itemName?: string;

  /**
   * 1Password Field name for text-based format (KEY=VALUE pairs)
   * Environment variable: OP_FIELD_NAME
   * Default: 'notes'
   */
  fieldName?: string;

  /**
   * Cache TTL for secret values in milliseconds
   * Default: 300000 (5 minutes)
   */
  cacheTtl?: number;
}

/**
 * Custom environment variable name mappings
 * Allows users to override default environment variable names
 */
export interface EnvironmentVariableNames {
  // Provider selection
  SECRET_PROVIDER?: string;

  // GCP variables
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  KMS_KEY_LOCATION?: string;
  KMS_KEY_RING_ID?: string;
  KMS_KEY_ID?: string;

  // HashiCorp variables
  VAULT_ADDR?: string;
  VAULT_TOKEN?: string;
  VAULT_NAMESPACE?: string;
  VAULT_ROLE_ID?: string;
  VAULT_SECRET_ID?: string;

  // 1Password variables
  OP_CONNECT_HOST?: string;
  OP_SERVICE_ACCOUNT_TOKEN?: string;
  OP_VAULT_ID?: string;
  OP_ITEM_NAME?: string;
  OP_FIELD_NAME?: string;
}

/**
 * Main configuration interface for infrastructure secrets
 */
export interface InfrastructureSecretsConfig {
  /**
   * Which secret provider to use
   * Environment variable: SECRET_PROVIDER
   * Default: 'gcp'
   */
  provider?: SecretProviderType | keyof typeof SecretProviderType;

  /**
   * GCP Secret Manager configuration
   */
  gcp?: Partial<GcpSecretManagerConfig>;

  /**
   * HashiCorp Vault configuration
   */
  hashicorp?: Partial<HashiCorpVaultConfig>;

  /**
   * 1Password configuration
   */
  onepassword?: Partial<OnePasswordConfig>;

  /**
   * Custom environment variable name mappings
   */
  envVarNames?: Partial<EnvironmentVariableNames>;

  /**
   * Enable tracing for debugging
   * Default: false
   */
  enableTracing?: boolean;
}

/**
 * Resolved configuration with all defaults applied
 * This is the output of the ConfigResolver.resolve() method
 */
export interface ResolvedInfrastructureSecretsConfig {
  /**
   * The selected secret provider type
   */
  provider: SecretProviderType;

  /**
   * Resolved GCP configuration with defaults applied
   */
  gcp: GcpSecretManagerConfig;

  /**
   * Resolved HashiCorp configuration with defaults applied
   */
  hashicorp: HashiCorpVaultConfig;

  /**
   * Resolved 1Password configuration with defaults applied
   */
  onepassword: OnePasswordConfig;

  /**
   * Whether tracing is enabled
   */
  enableTracing: boolean;
}

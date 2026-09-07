/**
 * Encryption Configuration Interfaces
 *
 * Type definitions for configuring KMS providers and encryption settings.
 * Configuration follows a layered approach with secure defaults.
 *
 * ## Configuration Hierarchy
 *
 * Values are resolved in this order (first wins):
 * 1. **Explicit options** - Values passed directly to config functions
 * 2. **Environment variables** - Loaded from process.env
 * 3. **Secure defaults** - Safe fallback values
 *
 * ## Security Best Practices
 *
 * ### Secrets Management
 *
 * **NEVER** store credentials in:
 * - Source code or configuration files
 * - Environment variables in production (use secret managers)
 * - Version control (git)
 *
 * **DO** use:
 * - Cloud IAM roles and service accounts
 * - Managed identity (Azure, GCP, AWS)
 * - Secret managers (Vault, AWS Secrets Manager, GCP Secret Manager)
 *
 * ### Key Selection
 *
 * | Data Type | Key Recommendation |
 * |-----------|-------------------|
 * | PCI data (PAN, CVV) | Dedicated PCI-compliant key |
 * | PHI (HIPAA) | Dedicated HIPAA-compliant key |
 * | General PII | Standard encryption key |
 * | Non-sensitive | Consider if encryption needed |
 *
 * ### Credential Rotation
 *
 * - **AWS**: Use IAM roles, rotate access keys every 90 days
 * - **GCP**: Use service accounts, rotate keys annually
 * - **Azure**: Use managed identity, rotate secrets every 90 days
 * - **Vault**: Use short-lived tokens with renewability
 *
 * ## Compliance Notes
 *
 * | Standard | Requirement | Configuration Impact |
 * |----------|-------------|---------------------|
 * | PCI DSS 4.0 | Separate keys for cardholder data | Use dedicated keyId |
 * | HIPAA | Encryption of PHI at rest | Enable AES-256-GCM |
 * | SOC 2 | Access logging | Enable metrics |
 * | GDPR | Technical safeguards | Enable decorators |
 *
 * @module encryption/config
 *
 * @example Secure production configuration
 * ```typescript
 * // Use managed identity (no explicit credentials)
 * const config: IInfrastructureEncryptionConfig = {
 *   aws: {
 *     region: 'us-east-1',
 *     keyId: 'alias/production-key'
 *     // No accessKeyId/secretAccessKey - uses IAM role
 *   },
 *   encryption: {
 *     algorithm: EncryptionAlgorithm.AES_256_GCM,
 *     enableMetrics: true,
 *     enableDecorators: true
 *   }
 * };
 * ```
 */

import type { EncryptionAlgorithm, AzureCredentialType } from '../constants';

/**
 * Google Cloud KMS configuration options.
 *
 * Configure access to GCP Cloud KMS for key management operations.
 * Supports both explicit credentials and default application credentials.
 *
 * ## Authentication Methods
 *
 * 1. **Application Default Credentials** (Recommended for GCP)
 *    - Automatically uses compute instance service account
 *    - Works with GKE workload identity
 *
 * 2. **Service Account Key File**
 *    - Set `credentialsFile` to JSON key path
 *    - Not recommended for production (use workload identity)
 *
 * 3. **Base64-Encoded Credentials** (Recommended for CI/CD)
 *    - Set `credentialsBase64` to base64-encoded service account JSON
 *    - Ideal for Railway, Render, AWS, Azure deployments
 *    - Set via GCP_CREDENTIALS_BASE64 environment variable
 *
 * 4. **Inline Credentials**
 *    - Pass credentials object directly
 *    - Only for testing or containerized environments
 *
 * ## Security Recommendations
 *
 * - Use workload identity when running in GKE
 * - Prefer `global` location for multi-region access
 * - Create separate key rings for different compliance domains
 *
 * @interface IGcpKmsConfig
 *
 * @example GKE with workload identity
 * ```typescript
 * const config: IGcpKmsConfig = {
 *   projectId: 'my-project',
 *   locationId: 'global',
 *   keyRingId: 'my-ring',
 *   keyId: 'my-key'
 *   // No credentials - uses workload identity
 * };
 * ```
 *
 * @example CI/CD with base64 credentials
 * ```bash
 * # Encode service account key
 * base64 -w 0 service-account.json
 *
 * # Set as environment variable
 * export GCP_CREDENTIALS_BASE64=<base64-string>
 * ```
 *
 * @example Local development with file
 * ```typescript
 * const config: IGcpKmsConfig = {
 *   projectId: 'my-project',
 *   locationId: 'global',
 *   keyRingId: 'my-ring',
 *   keyId: 'my-key',
 *   credentialsFile: '/path/to/service-account.json'
 * };
 * ```
 */
export interface IGcpKmsConfig {
  /**
   * GCP project ID containing the key ring.
   *
   * @example 'my-gcp-project-123'
   */
  projectId?: string;

  /**
   * Geographic location of the key ring.
   *
   * Use 'global' for multi-region availability, or a specific region
   * for data residency requirements.
   *
   * @example 'global' | 'us-east1' | 'europe-west1'
   */
  locationId?: string;

  /**
   * Key ring identifier.
   *
   * Key rings group related keys. Consider organizing by:
   * - Application: 'my-app-keys'
   * - Compliance: 'pci-keys', 'hipaa-keys'
   * - Environment: 'prod-keys', 'dev-keys'
   *
   * @example 'my-application-keyring'
   */
  keyRingId?: string;

  /**
   * Crypto key identifier within the key ring.
   *
   * @example 'my-encryption-key'
   */
  keyId?: string;

  /**
   * Path to service account JSON credentials file.
   *
   * **Security Warning**: Avoid using key files in production.
   * Prefer workload identity or metadata-based credentials.
   *
   * @example '/path/to/service-account.json'
   */
  credentialsFile?: string;

  /**
   * Base64-encoded service account credentials JSON.
   *
   * **Use Case**: Ideal for CI/CD platforms (Railway, Render, AWS, Azure)
   * where file storage is problematic.
   *
   * **How to encode**:
   * ```bash
   * base64 -w 0 service-account.json
   * ```
   *
   * **Environment variable**: `GCP_CREDENTIALS_BASE64`
   *
   * @example 'eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Ii...=='
   */
  credentialsBase64?: string;

  /**
   * Custom KMS API endpoint.
   *
   * Only used for testing with emulators. Leave undefined for production.
   *
   * @example 'http://localhost:8085' // For local emulator
   */
  endpoint?: string;
}

/**
 * AWS KMS configuration options.
 *
 * Configure access to AWS Key Management Service for cryptographic operations.
 * AWS KMS provides FIPS 140-2 validated hardware security modules.
 *
 * ## Authentication Methods
 *
 * 1. **IAM Role** (Recommended for EC2/Lambda/ECS)
 *    - Automatically uses instance/task role
 *    - No explicit credentials needed
 *
 * 2. **Environment Variables**
 *    - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *    - Used by SDK credential chain
 *
 * 3. **Explicit Credentials**
 *    - Set accessKeyId/secretAccessKey directly
 *    - Only for development or cross-account access
 *
 * ## Security Recommendations
 *
 * - **Always use IAM roles** in AWS environments
 * - **Use key aliases** (alias/my-key) instead of key IDs
 * - **Enable key rotation** in KMS console
 * - **Use VPC endpoints** for private network access
 *
 * ## Key Types
 *
 * | Type | Use Case |
 * |------|----------|
 * | Symmetric | General encryption (recommended) |
 * | Asymmetric RSA | External decryption needs |
 * | Asymmetric ECC | Digital signatures |
 *
 * @interface IAwsKmsConfig
 *
 * @example With IAM role (EC2/Lambda)
 * ```typescript
 * const config: IAwsKmsConfig = {
 *   region: 'us-east-1',
 *   keyId: 'alias/my-encryption-key'
 *   // No credentials - uses IAM role
 * };
 * ```
 *
 * @example Cross-account access
 * ```typescript
 * const config: IAwsKmsConfig = {
 *   region: 'us-east-1',
 *   keyId: 'arn:aws:kms:us-east-1:123456789:key/...',
 *   // Credentials for account with cross-account permissions
 * };
 * ```
 */
export interface IAwsKmsConfig {
  /**
   * AWS region for KMS operations.
   *
   * Must match the region where your KMS key is created.
   *
   * @example 'us-east-1' | 'eu-west-1' | 'ap-southeast-1'
   */
  region?: string;

  /**
   * KMS key identifier.
   *
   * Accepts multiple formats:
   * - **Alias**: `alias/my-key` (recommended for readability)
   * - **Key ID**: `1234abcd-12ab-34cd-56ef-1234567890ab`
   * - **ARN**: `arn:aws:kms:us-east-1:123456789012:key/...`
   *
   * @example 'alias/production-encryption-key'
   */
  keyId?: string;

  /**
   * AWS access key ID.
   *
   * **Security Warning**: Avoid in production. Use IAM roles instead.
   * If needed, rotate keys every 90 days per AWS best practices.
   *
   * @example 'AKIAIOSFODNN7EXAMPLE'
   */
  accessKeyId?: string;

  /**
   * AWS secret access key.
   *
   * **Security Warning**: Never commit to version control.
   * Use environment variables or secret managers.
   */
  secretAccessKey?: string;

  /**
   * AWS session token for temporary credentials.
   *
   * Required when using STS AssumeRole or federation.
   * Typically short-lived (1-12 hours).
   */
  sessionToken?: string;

  /**
   * Custom KMS endpoint URL.
   *
   * Used for:
   * - LocalStack testing: 'http://localhost:4566'
   * - VPC endpoints: 'https://vpce-xxx.kms.us-east-1.vpce.amazonaws.com'
   *
   * @example 'http://localhost:4566' // LocalStack
   */
  endpoint?: string;
}

/**
 * Azure Key Vault configuration options.
 *
 * Configure access to Azure Key Vault for key management operations.
 * Supports multiple authentication methods for different deployment scenarios.
 *
 * ## Authentication Methods
 *
 * 1. **Managed Identity** (Recommended for Azure)
 *    - System-assigned: No configuration needed
 *    - User-assigned: Set `clientId` only
 *
 * 2. **Default Azure Credential**
 *    - Tries multiple methods automatically
 *    - Best for development environments
 *
 * 3. **Service Principal (Client Secret)**
 *    - Requires tenantId, clientId, clientSecret
 *    - Use for CI/CD or external systems
 *
 * ## Security Recommendations
 *
 * - **Always use managed identity** when running in Azure
 * - **Enable soft-delete** and **purge protection** on vaults
 * - **Use separate vaults** for dev/staging/production
 * - **Rotate client secrets** every 90 days
 * - **Enable diagnostic logging** to Azure Monitor
 *
 * ## Access Policies
 *
 * Configure Key Vault access policy with minimum permissions:
 * - **Encrypt/Decrypt**: For encryption operations
 * - **Wrap/Unwrap**: For envelope encryption
 * - **Get**: To retrieve key metadata
 *
 * @interface IAzureKeyVaultConfig
 *
 * @example With managed identity
 * ```typescript
 * const config: IAzureKeyVaultConfig = {
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-key',
 *   credentialType: AzureCredentialType.MANAGED_IDENTITY
 * };
 * ```
 */
export interface IAzureKeyVaultConfig {
  /**
   * Key Vault URL.
   *
   * Format: `https://{vault-name}.vault.azure.net`
   *
   * @example 'https://my-production-vault.vault.azure.net'
   */
  vaultUrl?: string;

  /**
   * Key name in the vault.
   *
   * @example 'my-encryption-key'
   */
  keyName?: string;

  /**
   * Specific key version to use.
   *
   * If not specified, uses the latest enabled version.
   * Pin to a version for deterministic behavior.
   *
   * @example 'abc123def456...'
   */
  keyVersion?: string;

  /**
   * Authentication method to use.
   *
   * @see AzureCredentialType for available options
   * @default AzureCredentialType.DEFAULT
   */
  credentialType?: AzureCredentialType;

  /**
   * Azure AD application/managed identity client ID.
   *
   * - For MANAGED_IDENTITY: Optional (user-assigned MI only)
   * - For CLIENT_SECRET: Required
   *
   * @example '12345678-1234-1234-1234-123456789012'
   */
  clientId?: string;

  /**
   * Client secret for service principal authentication.
   *
   * **Security Warning**: Never commit to version control.
   * Rotate every 90 days. Consider using certificate auth instead.
   */
  clientSecret?: string;

  /**
   * Azure AD tenant ID.
   *
   * Required for CLIENT_SECRET authentication.
   *
   * @example '12345678-1234-1234-1234-123456789012'
   */
  tenantId?: string;
}

/**
 * HashiCorp Vault Transit configuration options.
 *
 * Configure access to Vault's Transit secrets engine for encryption-as-a-service.
 * Transit is the only provider with native atomic rewrap support.
 *
 * ## Authentication Methods
 *
 * 1. **Token Authentication**
 *    - Direct token (configured here)
 *    - Renewable tokens with periodic refresh
 *
 * 2. **Kubernetes Auth** (not configured here)
 *    - Use Vault Agent or sidecar
 *    - Automatic token refresh
 *
 * ## Security Recommendations
 *
 * - **Use short-lived tokens** (1 hour max TTL)
 * - **Enable token renewal** for long-running services
 * - **Use namespaces** for multi-tenant isolation (Enterprise)
 * - **Enable audit logging** for compliance
 * - **Configure key rotation** policies
 *
 * ## Transit Key Features
 *
 * | Feature | Benefit |
 * |---------|---------|
 * | Convergent encryption | Searchable ciphertext |
 * | Key versioning | Seamless rotation |
 * | Rewrap API | Atomic key migration |
 * | Derived keys | Per-tenant isolation |
 *
 * @interface IVaultTransitConfig
 *
 * @example With namespaces (Enterprise)
 * ```typescript
 * const config: IVaultTransitConfig = {
 *   address: 'https://vault.example.com:8200',
 *   token: process.env.VAULT_TOKEN,
 *   namespace: 'app-team',
 *   keyName: 'encryption-key'
 * };
 * ```
 */
export interface IVaultTransitConfig {
  /**
   * Vault server address.
   *
   * Include port if not default (8200).
   *
   * @example 'https://vault.example.com:8200'
   */
  address?: string;

  /**
   * Vault authentication token.
   *
   * **Security Warning**: Use short-lived tokens. Never commit.
   * Consider Vault Agent for automatic token management.
   *
   * @example 'hvs.CAESIF...'
   */
  token?: string;

  /**
   * Transit secrets engine mount path.
   *
   * Change if you've mounted Transit at a custom path.
   *
   * @default 'transit'
   * @example 'encryption' | 'app-transit'
   */
  enginePath?: string;

  /**
   * Key name in the Transit engine.
   *
   * @example 'my-encryption-key'
   */
  keyName?: string;

  /**
   * Vault Enterprise namespace.
   *
   * Enables multi-tenant isolation with separate secret spaces.
   * Only available in Vault Enterprise.
   *
   * @example 'admin' | 'team-a'
   */
  namespace?: string;
}

/**
 * Encryption behavior configuration options.
 *
 * Controls the encryption algorithm, decorator behavior, and observability.
 * All options have secure defaults.
 *
 * ## Secure Defaults
 *
 * | Option | Default | Security Rationale |
 * |--------|---------|-------------------|
 * | algorithm | AES-256-GCM | NIST-recommended, widely deployed; not quantum-resistant |
 * | enableDecorators | true | Automatic PII protection |
 * | enableMetrics | true | Security monitoring and alerting |
 *
 * ## When to Override
 *
 * - **algorithm**: Only change to AES-128-GCM after performance testing
 * - **enableDecorators**: Disable only if using manual encryption
 * - **enableMetrics**: Disable only for performance-critical batch jobs
 *
 * @interface IEncryptionOptionsConfig
 *
 * @example Production configuration
 * ```typescript
 * const options: IEncryptionOptionsConfig = {
 *   algorithm: EncryptionAlgorithm.AES_256_GCM,
 *   enableDecorators: true,
 *   enableMetrics: true
 * };
 * ```
 */
export interface IEncryptionOptionsConfig {
  /**
   * Default encryption algorithm.
   *
   * Used for all envelope encryption unless overridden per-field.
   *
   * @default EncryptionAlgorithm.AES_256_GCM
   * @see EncryptionAlgorithm for available options
   */
  algorithm?: EncryptionAlgorithm;

  /**
   * Enable @Encrypted() decorator functionality.
   *
   * When enabled, EntityTransformer automatically encrypts/decrypts
   * fields marked with @Encrypted().
   *
   * @default true
   */
  enableDecorators?: boolean;

  /**
   * Enable OpenTelemetry metrics collection.
   *
   * Emits metrics for:
   * - Encryption/decryption operations
   * - KMS provider latency
   * - Error rates
   *
   * Recommended for security monitoring and alerting.
   *
   * @default true
   */
  enableMetrics?: boolean;
}

/**
 * Environment variable name mappings.
 *
 * Customize environment variable names for different deployment scenarios.
 * Useful for:
 * - Following organization naming conventions
 * - Avoiding conflicts with other applications
 * - Supporting multiple configurations per environment
 *
 * ## Security Considerations
 *
 * **Environment Variable Risks:**
 * - Visible in process listings (`ps aux`)
 * - Logged by some deployment tools
 * - Inherited by child processes
 *
 * **Recommendations:**
 * - Use secrets managers in production
 * - Limit env vars to non-sensitive config (regions, endpoints)
 * - Use IAM roles/managed identity for credentials
 *
 * @interface IEnvironmentVariableNames
 *
 * @example Custom naming convention
 * ```typescript
 * const envNames: IEnvironmentVariableNames = {
 *   awsRegion: 'MYAPP_AWS_REGION',
 *   awsKmsKeyId: 'MYAPP_KMS_KEY_ID'
 * };
 * ```
 */
export interface IEnvironmentVariableNames {
  // GCP KMS (6 vars)
  /** GCP project ID (default: GCP_PROJECT_ID) */
  gcpProjectId?: string;
  /** GCP location ID (default: GCP_LOCATION_ID) */
  gcpLocationId?: string;
  /** GCP key ring ID (default: GCP_KEY_RING_ID) */
  gcpKeyRingId?: string;
  /** GCP key ID (default: GCP_KEY_ID) */
  gcpKeyId?: string;
  /** GCP credentials file (default: GCP_CREDENTIALS_FILE) */
  gcpCredentialsFile?: string;
  /** GCP base64-encoded credentials (default: GCP_CREDENTIALS_BASE64) */
  gcpCredentialsBase64?: string;
  /** GCP KMS endpoint (default: GCP_KMS_ENDPOINT) */
  gcpKmsEndpoint?: string;

  // AWS KMS (6 vars)
  /** AWS region (default: AWS_REGION) */
  awsRegion?: string;
  /** AWS KMS key ID (default: AWS_KMS_KEY_ID) */
  awsKmsKeyId?: string;
  /** AWS access key ID (default: AWS_ACCESS_KEY_ID) */
  awsAccessKeyId?: string;
  /** AWS secret access key (default: AWS_SECRET_ACCESS_KEY) */
  awsSecretAccessKey?: string;
  /** AWS session token (default: AWS_SESSION_TOKEN) */
  awsSessionToken?: string;
  /** AWS KMS endpoint (default: AWS_KMS_ENDPOINT) */
  awsKmsEndpoint?: string;

  // Azure Key Vault (8 vars)
  /** Azure Vault URL (default: AZURE_VAULT_URL) */
  azureVaultUrl?: string;
  /** Azure key name (default: AZURE_KEY_NAME) */
  azureKeyName?: string;
  /** Azure key version (default: AZURE_KEY_VERSION) */
  azureKeyVersion?: string;
  /** Azure credential type (default: AZURE_CREDENTIAL_TYPE) */
  azureCredentialType?: string;
  /** Azure client ID (default: AZURE_CLIENT_ID) */
  azureClientId?: string;
  /** Azure client secret (default: AZURE_CLIENT_SECRET) */
  azureClientSecret?: string;
  /** Azure tenant ID (default: AZURE_TENANT_ID) */
  azureTenantId?: string;

  // Vault Transit (5 vars)
  /** Vault address (default: VAULT_ADDR) */
  vaultAddr?: string;
  /** Vault token (default: VAULT_TOKEN) */
  vaultToken?: string;
  /** Vault transit engine path (default: VAULT_TRANSIT_ENGINE_PATH) */
  vaultTransitEnginePath?: string;
  /** Vault transit key name (default: VAULT_TRANSIT_KEY_NAME) */
  vaultTransitKeyName?: string;
  /** Vault namespace (default: VAULT_NAMESPACE) */
  vaultNamespace?: string;

  // Encryption Options (3 vars)
  /** Encryption algorithm (default: ENCRYPTION_ALGORITHM) */
  encryptionAlgorithm?: string;
  /** Enable decorators (default: ENCRYPTION_ENABLE_DECORATORS) */
  encryptionEnableDecorators?: string;
  /** Enable metrics (default: ENCRYPTION_ENABLE_METRICS) */
  encryptionEnableMetrics?: string;
}

/**
 * Main configuration interface for encryption infrastructure.
 *
 * Root configuration interface for initializing the encryption package.
 * Configure one or more KMS providers and encryption settings.
 *
 * ## Configuration Resolution
 *
 * ```
 * IInfrastructureEncryptionConfig (your config)
 *               │
 *               ▼
 *      Environment Variables
 *               │
 *               ▼
 *        Secure Defaults
 *               │
 *               ▼
 * IResolvedInfrastructureEncryptionConfig
 * ```
 *
 * ## Multi-Provider Setup
 *
 * You can configure multiple providers and select per-field:
 *
 * ```typescript
 * @EncryptedEntity({ provider: 'aws' }) // Default
 * class User {
 *   @Encrypted()
 *   email: string; // Uses AWS
 *
 *   @Encrypted({ provider: 'vault' })
 *   ssn: string; // Uses Vault for extra security
 * }
 * ```
 *
 * ## Environment-Specific Configuration
 *
 * | Environment | Recommendation |
 * |-------------|----------------|
 * | Development | envVarConfig with test keys |
 * | Staging | Cloud KMS with staging keys |
 * | Production | Cloud KMS with IAM/managed identity |
 *
 * @interface IInfrastructureEncryptionConfig
 *
 * @example Multi-cloud configuration
 * ```typescript
 * const config: IInfrastructureEncryptionConfig = {
 *   aws: { region: 'us-east-1', keyId: 'alias/primary' },
 *   gcp: { projectId: 'my-project', ... }, // Backup provider
 *   encryption: { algorithm: EncryptionAlgorithm.AES_256_GCM }
 * };
 * ```
 */
export interface IInfrastructureEncryptionConfig {
  /**
   * Google Cloud KMS configuration.
   *
   * Configure GCP Cloud KMS provider for encryption operations.
   */
  gcp?: IGcpKmsConfig;

  /**
   * Amazon Web Services KMS configuration.
   *
   * Configure AWS KMS provider for encryption operations.
   */
  aws?: IAwsKmsConfig;

  /**
   * Microsoft Azure Key Vault configuration.
   *
   * Configure Azure Key Vault provider for encryption operations.
   */
  azure?: IAzureKeyVaultConfig;

  /**
   * HashiCorp Vault Transit configuration.
   *
   * Configure Vault Transit secrets engine for encryption operations.
   */
  vault?: IVaultTransitConfig;

  /**
   * Encryption behavior options.
   *
   * Configure algorithm, decorator behavior, and observability.
   */
  encryption?: IEncryptionOptionsConfig;

  /**
   * Custom environment variable name mappings.
   *
   * Override default environment variable names for your deployment.
   */
  envVarNames?: IEnvironmentVariableNames;
}

/**
 * Resolved GCP KMS configuration with all required fields.
 *
 * Represents validated GCP configuration after merging options,
 * environment variables, and defaults. All required fields are guaranteed
 * to have values.
 *
 * @interface IResolvedGcpKmsConfig
 */
export interface IResolvedGcpKmsConfig {
  /** GCP project ID (required) */
  projectId: string;
  /** KMS location (required) */
  locationId: string;
  /** Key ring ID (required) */
  keyRingId: string;
  /** Crypto key ID (required) */
  keyId: string;
  /** Service account credentials file (optional) */
  credentialsFile?: string;
  /** Base64-encoded service account credentials (optional) */
  credentialsBase64?: string;
  /** Decoded credentials object (internal use) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint for testing (optional) */
  endpoint?: string;
}

/**
 * Resolved AWS KMS configuration with all required fields.
 *
 * Represents validated AWS configuration. Region is always required,
 * but credentials may come from IAM roles rather than explicit values.
 *
 * @interface IResolvedAwsKmsConfig
 */
export interface IResolvedAwsKmsConfig {
  /** AWS region (required) */
  region: string;
  /** KMS key ID or alias (may be set per-operation) */
  keyId?: string;
  /** AWS access key ID (optional if using IAM role) */
  accessKeyId?: string;
  /** AWS secret access key (optional if using IAM role) */
  secretAccessKey?: string;
  /** Session token for temporary credentials */
  sessionToken?: string;
  /** Custom endpoint for testing */
  endpoint?: string;
}

/**
 * Resolved Azure Key Vault configuration with all required fields.
 *
 * Represents validated Azure configuration. Credential type is always
 * resolved to a specific authentication method.
 *
 * @interface IResolvedAzureKeyVaultConfig
 */
export interface IResolvedAzureKeyVaultConfig {
  /** Key Vault URL (required) */
  vaultUrl: string;
  /** Key name (may be set per-operation) */
  keyName?: string;
  /** Key version (uses latest if not specified) */
  keyVersion?: string;
  /** Credential type (required, defaults to DEFAULT) */
  credentialType: AzureCredentialType;
  /** Client ID (required for certain credential types) */
  clientId?: string;
  /** Client secret (required for CLIENT_SECRET type) */
  clientSecret?: string;
  /** Tenant ID (required for CLIENT_SECRET type) */
  tenantId?: string;
}

/**
 * Resolved Vault Transit configuration with all required fields.
 *
 * Represents validated Vault configuration. Address and token are
 * always required for Vault access.
 *
 * @interface IResolvedVaultTransitConfig
 */
export interface IResolvedVaultTransitConfig {
  /** Vault server address (required) */
  address: string;
  /** Authentication token (required) */
  token: string;
  /** Transit engine mount path (required, defaults to 'transit') */
  enginePath: string;
  /** Key name (may be set per-operation) */
  keyName?: string;
  /** Vault Enterprise namespace (optional) */
  namespace?: string;
}

/**
 * Resolved encryption options with all required fields.
 *
 * All options have secure defaults applied.
 *
 * @interface IResolvedEncryptionOptionsConfig
 */
export interface IResolvedEncryptionOptionsConfig {
  /** Encryption algorithm (required, defaults to AES-256-GCM) */
  algorithm: EncryptionAlgorithm;
  /** Decorator functionality enabled (required, defaults to true) */
  enableDecorators: boolean;
  /** Metrics collection enabled (required, defaults to true) */
  enableMetrics: boolean;
}

/**
 * Fully resolved infrastructure configuration.
 *
 * This interface represents the final configuration after all resolution
 * steps have been applied:
 *
 * 1. User-provided options merged
 * 2. Environment variables applied for missing values
 * 3. Secure defaults applied for remaining gaps
 * 4. Validation passed
 *
 * Use this type when you need guaranteed access to configuration values.
 *
 * @interface IResolvedInfrastructureEncryptionConfig
 *
 * @example Type-safe access to resolved config
 * ```typescript
 * function initializeEncryption(config: IResolvedInfrastructureEncryptionConfig) {
 *   // Encryption options are guaranteed to exist
 *   console.log(`Algorithm: ${config.encryption.algorithm}`);
 *
 *   // Provider configs are optional (only configured ones exist)
 *   if (config.aws) {
 *     console.log(`AWS region: ${config.aws.region}`);
 *   }
 * }
 * ```
 */
export interface IResolvedInfrastructureEncryptionConfig {
  /**
   * Resolved GCP KMS configuration.
   *
   * Present only if GCP was configured.
   */
  gcp?: IResolvedGcpKmsConfig;

  /**
   * Resolved AWS KMS configuration.
   *
   * Present only if AWS was configured.
   */
  aws?: IResolvedAwsKmsConfig;

  /**
   * Resolved Azure Key Vault configuration.
   *
   * Present only if Azure was configured.
   */
  azure?: IResolvedAzureKeyVaultConfig;

  /**
   * Resolved Vault Transit configuration.
   *
   * Present only if Vault was configured.
   */
  vault?: IResolvedVaultTransitConfig;

  /**
   * Resolved encryption options.
   *
   * Always present with secure defaults.
   */
  encryption: IResolvedEncryptionOptionsConfig;
}

/**
 * Configuration resolver for encryption package
 *
 * Merges user configuration, environment variables, and defaults
 * to produce the final resolved configuration.
 *
 * Priority order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import { EncryptionAlgorithm, AzureCredentialType } from '../constants';
import { InvalidKmsConfigError } from '../errors';
import {
  DEFAULT_GCP_KMS_CONFIG,
  DEFAULT_AWS_KMS_CONFIG,
  DEFAULT_AZURE_KEY_VAULT_CONFIG,
  DEFAULT_VAULT_TRANSIT_CONFIG,
  DEFAULT_ENCRYPTION_CONFIG
} from './defaults';
import { KmsProviderType } from '../providers/kms-provider.interface';

import type {
  IAwsKmsProviderOptions,
  IAzureKeyVaultProviderOptions,
  IGcpKmsProviderOptions,
  IVaultTransitProviderOptions
} from '../providers';
import type {
  IEnvironmentVariableNames,
  IInfrastructureEncryptionConfig,
  IResolvedAzureKeyVaultConfig,
  IResolvedAwsKmsConfig,
  IResolvedEncryptionOptionsConfig,
  IResolvedGcpKmsConfig,
  IResolvedInfrastructureEncryptionConfig,
  IResolvedVaultTransitConfig
} from './interfaces';
import type { IKmsProviderConfig } from '../providers/factory';

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<IEnvironmentVariableNames> = {
  // GCP KMS
  gcpProjectId: 'GCP_PROJECT_ID',
  gcpLocationId: 'GCP_LOCATION_ID',
  gcpKeyRingId: 'GCP_KEY_RING_ID',
  gcpKeyId: 'GCP_KEY_ID',
  gcpCredentialsFile: 'GCP_CREDENTIALS_FILE',
  gcpCredentialsBase64: 'GCP_CREDENTIALS_BASE64',
  gcpKmsEndpoint: 'GCP_KMS_ENDPOINT',

  // AWS KMS
  awsRegion: 'AWS_REGION',
  awsKmsKeyId: 'AWS_KMS_KEY_ID',
  awsAccessKeyId: 'AWS_ACCESS_KEY_ID',
  awsSecretAccessKey: 'AWS_SECRET_ACCESS_KEY',
  awsSessionToken: 'AWS_SESSION_TOKEN',
  awsKmsEndpoint: 'AWS_KMS_ENDPOINT',

  // Azure Key Vault
  azureVaultUrl: 'AZURE_VAULT_URL',
  azureKeyName: 'AZURE_KEY_NAME',
  azureKeyVersion: 'AZURE_KEY_VERSION',
  azureCredentialType: 'AZURE_CREDENTIAL_TYPE',
  azureClientId: 'AZURE_CLIENT_ID',
  azureClientSecret: 'AZURE_CLIENT_SECRET',
  azureTenantId: 'AZURE_TENANT_ID',

  // Vault Transit
  vaultAddr: 'VAULT_ADDR',
  vaultToken: 'VAULT_TOKEN',
  vaultTransitEnginePath: 'VAULT_TRANSIT_ENGINE_PATH',
  vaultTransitKeyName: 'VAULT_TRANSIT_KEY_NAME',
  vaultNamespace: 'VAULT_NAMESPACE',

  // Encryption Options
  encryptionAlgorithm: 'ENCRYPTION_ALGORITHM',
  encryptionEnableDecorators: 'ENCRYPTION_ENABLE_DECORATORS',
  encryptionEnableMetrics: 'ENCRYPTION_ENABLE_METRICS'
};

/**
 * Configuration resolver for infrastructure encryption settings.
 *
 * Resolves encryption configuration by merging values from multiple sources
 * with the following priority order (highest to lowest):
 * 1. User-provided configuration
 * 2. Environment variables
 * 3. Default values
 *
 * Supports configuration for multiple KMS providers (GCP, AWS, Azure, Vault)
 * and encryption options (algorithm, decorators, metrics).
 *
 * @example
 * ```typescript
 * const resolver = new ConfigResolver({
 *   gcp: { projectId: 'my-project' },
 *   encryption: { algorithm: 'aes-256-gcm' }
 * });
 * const config = resolver.resolve();
 * ```
 */
export class ConfigResolver {
  /**
   * Creates a new ConfigResolver instance.
   *
   * @param userConfig - User-provided configuration options (highest priority).
   *                     Any values specified here override environment variables and defaults.
   * @param env - Environment variables to read from. Defaults to `process.env`.
   *              Useful for testing with custom environment configurations.
   */
  constructor(
    private userConfig: IInfrastructureEncryptionConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolve a configuration value with priority: user > env > default
   *
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional parser function for environment values
   * @returns Resolved value
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) return userValue;
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName];
      // Unsafe cast: When no parser is provided, we assume the env string is directly
      // assignable to T. Callers must ensure T is string-compatible or provide a parser.
      return parser ? parser(envValue) : (envValue as unknown as T);
    }
    return defaultValue;
  }

  /**
   * Parse string to boolean
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<IEnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Resolves GCP KMS configuration from user config and environment variables.
   *
   * Returns `undefined` if no GCP configuration is detected (none of the required
   * fields are set). Throws an error if configuration is partially set.
   *
   * @returns Resolved GCP KMS configuration with all required fields populated,
   *          or `undefined` if GCP KMS is not configured.
   * @throws {InvalidKmsConfigError} When configuration is incomplete (some but not
   *         all required fields are provided: projectId, locationId, keyRingId, keyId).
   */
  getGcpConfig(): IResolvedGcpKmsConfig | undefined {
    const envNames = this.getEnvVarNames();
    const userGcp = this.userConfig.gcp || {};

    const projectId = this.resolveValue<string | undefined>(
      userGcp.projectId,
      envNames.gcpProjectId,
      DEFAULT_GCP_KMS_CONFIG.projectId
    );

    const locationId = this.resolveValue<string | undefined>(
      userGcp.locationId,
      envNames.gcpLocationId,
      DEFAULT_GCP_KMS_CONFIG.locationId
    );

    const keyRingId = this.resolveValue<string | undefined>(
      userGcp.keyRingId,
      envNames.gcpKeyRingId,
      DEFAULT_GCP_KMS_CONFIG.keyRingId
    );

    const keyId = this.resolveValue<string | undefined>(
      userGcp.keyId,
      envNames.gcpKeyId,
      DEFAULT_GCP_KMS_CONFIG.keyId
    );

    const credentialsFile = this.resolveValue<string | undefined>(
      userGcp.credentialsFile,
      envNames.gcpCredentialsFile,
      DEFAULT_GCP_KMS_CONFIG.credentialsFile
    );

    const credentialsBase64 = this.resolveValue<string | undefined>(
      userGcp.credentialsBase64,
      envNames.gcpCredentialsBase64,
      DEFAULT_GCP_KMS_CONFIG.credentialsBase64
    );

    const endpoint = this.resolveValue<string | undefined>(
      userGcp.endpoint,
      envNames.gcpKmsEndpoint,
      DEFAULT_GCP_KMS_CONFIG.endpoint
    );

    // If no required fields are set, return undefined (provider not configured)
    if (!projectId && !locationId && !keyRingId && !keyId) {
      return undefined;
    }

    // Validate that all required fields are present
    if (!projectId || !locationId || !keyRingId || !keyId) {
      throw new InvalidKmsConfigError(
        'GCP KMS configuration incomplete. Required: projectId, locationId, keyRingId, keyId'
      );
    }

    const result: IResolvedGcpKmsConfig = {
      projectId,
      locationId,
      keyRingId,
      keyId
    };

    if (credentialsFile !== undefined) {
      result.credentialsFile = credentialsFile;
    }

    if (credentialsBase64 !== undefined) {
      result.credentialsBase64 = credentialsBase64;
      // Decode base64 and parse as JSON for the credentials object
      try {
        const decoded = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
        result.credentials = JSON.parse(decoded) as Record<string, unknown>;
      } catch {
        throw new InvalidKmsConfigError('GCP_CREDENTIALS_BASE64 contains invalid base64 or JSON');
      }
    }

    if (endpoint !== undefined) {
      result.endpoint = endpoint;
    }

    return result;
  }

  /**
   * Resolves AWS KMS configuration from user config and environment variables.
   *
   * Returns `undefined` if no AWS configuration is detected (region is not set).
   * Unlike `getGcpConfig()`, this method does **not** throw for partial configurations;
   * it gracefully returns `undefined` when the minimum required field (region) is missing.
   *
   * **Why AWS differs from other providers:**
   * The AWS SDK supports a default credential provider chain that automatically
   * discovers credentials from multiple sources (environment variables, shared
   * credentials file, EC2/ECS/Lambda instance metadata, task roles, etc.).
   * This means we can safely tolerate missing explicit credentials in the config
   * and only require the region. When explicit credentials are provided in config,
   * they take precedence over the SDK's default chain.
   *
   * Callers should check for `undefined` rather than catching exceptions:
   * ```typescript
   * const awsConfig = resolver.getAwsConfig();
   * if (awsConfig) {
   *   // AWS KMS is configured - credentials will be resolved by SDK if not explicit
   * }
   * ```
   *
   * @returns Resolved AWS KMS configuration with region and optional credentials,
   *          or `undefined` if AWS KMS is not configured (no region specified).
   */
  getAwsConfig(): IResolvedAwsKmsConfig | undefined {
    const envNames = this.getEnvVarNames();
    const userAws = this.userConfig.aws || {};

    const region = this.resolveValue<string | undefined>(
      userAws.region,
      envNames.awsRegion,
      DEFAULT_AWS_KMS_CONFIG.region
    );

    const keyId = this.resolveValue<string | undefined>(
      userAws.keyId,
      envNames.awsKmsKeyId,
      DEFAULT_AWS_KMS_CONFIG.keyId
    );

    const accessKeyId = this.resolveValue<string | undefined>(
      userAws.accessKeyId,
      envNames.awsAccessKeyId,
      DEFAULT_AWS_KMS_CONFIG.accessKeyId
    );

    const secretAccessKey = this.resolveValue<string | undefined>(
      userAws.secretAccessKey,
      envNames.awsSecretAccessKey,
      DEFAULT_AWS_KMS_CONFIG.secretAccessKey
    );

    const sessionToken = this.resolveValue<string | undefined>(
      userAws.sessionToken,
      envNames.awsSessionToken,
      DEFAULT_AWS_KMS_CONFIG.sessionToken
    );

    const endpoint = this.resolveValue<string | undefined>(
      userAws.endpoint,
      envNames.awsKmsEndpoint,
      DEFAULT_AWS_KMS_CONFIG.endpoint
    );

    // If no region is set, return undefined (provider not configured)
    if (!region) {
      return undefined;
    }

    const result: IResolvedAwsKmsConfig = {
      region
    };

    if (keyId !== undefined) {
      result.keyId = keyId;
    }
    if (accessKeyId !== undefined) {
      result.accessKeyId = accessKeyId;
    }
    if (secretAccessKey !== undefined) {
      result.secretAccessKey = secretAccessKey;
    }
    if (sessionToken !== undefined) {
      result.sessionToken = sessionToken;
    }
    if (endpoint !== undefined) {
      result.endpoint = endpoint;
    }

    return result;
  }

  /**
   * Resolves Azure Key Vault configuration from user config and environment variables.
   *
   * Returns `undefined` if no Azure configuration is detected (vaultUrl is not set).
   * Throws an error if configuration is partially set (e.g., CLIENT_SECRET credential
   * type without required credentials).
   *
   * **Environment Variables:**
   * - `AZURE_VAULT_URL`: The Key Vault URL (e.g., `https://my-vault.vault.azure.net`)
   * - `AZURE_KEY_NAME`: The key name within the vault
   * - `AZURE_KEY_VERSION`: Optional specific key version
   * - `AZURE_CREDENTIAL_TYPE`: Credential type (`CLIENT_SECRET`, `DEFAULT`, `MANAGED_IDENTITY`)
   * - `AZURE_CLIENT_ID`: Client/Application ID (required for CLIENT_SECRET)
   * - `AZURE_CLIENT_SECRET`: Client secret (required for CLIENT_SECRET)
   * - `AZURE_TENANT_ID`: Azure AD tenant ID (required for CLIENT_SECRET)
   *
   * **Credential Types:**
   * - `CLIENT_SECRET`: Requires clientId, clientSecret, and tenantId
   * - `DEFAULT`: Uses Azure SDK's DefaultAzureCredential (auto-discovers credentials)
   * - `MANAGED_IDENTITY`: Uses Azure Managed Identity (for Azure-hosted workloads)
   *
   * @returns Resolved Azure Key Vault configuration with all required fields populated,
   *          or `undefined` if Azure Key Vault is not configured (no vaultUrl specified).
   *          Expected properties include: `vaultUrl`, `credentialType`, and optionally
   *          `keyName`, `keyVersion`, `clientId`, `clientSecret`, `tenantId`.
   * @throws {InvalidKmsConfigError} When CLIENT_SECRET credential type is used but
   *         clientId, clientSecret, or tenantId is missing.
   *
   * @example
   * ```typescript
   * const azureConfig = resolver.getAzureConfig();
   * if (azureConfig) {
   *   // Azure Key Vault is configured
   *   console.log(azureConfig.vaultUrl); // 'https://my-vault.vault.azure.net'
   *   console.log(azureConfig.credentialType); // 'CLIENT_SECRET' | 'DEFAULT' | 'MANAGED_IDENTITY'
   * }
   * ```
   */
  getAzureConfig(): IResolvedAzureKeyVaultConfig | undefined {
    const envNames = this.getEnvVarNames();
    const userAzure = this.userConfig.azure || {};

    const vaultUrl = this.resolveValue<string | undefined>(
      userAzure.vaultUrl,
      envNames.azureVaultUrl,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.vaultUrl
    );

    const keyName = this.resolveValue<string | undefined>(
      userAzure.keyName,
      envNames.azureKeyName,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.keyName
    );

    const keyVersion = this.resolveValue<string | undefined>(
      userAzure.keyVersion,
      envNames.azureKeyVersion,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.keyVersion
    );

    const credentialType = this.resolveValue<AzureCredentialType>(
      userAzure.credentialType,
      envNames.azureCredentialType,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.credentialType,
      (v) => v as AzureCredentialType
    );

    const clientId = this.resolveValue<string | undefined>(
      userAzure.clientId,
      envNames.azureClientId,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.clientId
    );

    const clientSecret = this.resolveValue<string | undefined>(
      userAzure.clientSecret,
      envNames.azureClientSecret,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.clientSecret
    );

    const tenantId = this.resolveValue<string | undefined>(
      userAzure.tenantId,
      envNames.azureTenantId,
      DEFAULT_AZURE_KEY_VAULT_CONFIG.tenantId
    );

    // If no vaultUrl is set, return undefined (provider not configured)
    if (!vaultUrl) {
      return undefined;
    }

    // Validate CLIENT_SECRET credential type requires all credential fields
    if (credentialType === AzureCredentialType.CLIENT_SECRET) {
      if (!clientId || !clientSecret || !tenantId) {
        throw new InvalidKmsConfigError(
          'Azure Key Vault CLIENT_SECRET credential type requires clientId, clientSecret, and tenantId'
        );
      }
    }

    const result: IResolvedAzureKeyVaultConfig = {
      vaultUrl,
      credentialType
    };

    if (keyName !== undefined) {
      result.keyName = keyName;
    }
    if (keyVersion !== undefined) {
      result.keyVersion = keyVersion;
    }
    if (clientId !== undefined) {
      result.clientId = clientId;
    }
    if (clientSecret !== undefined) {
      result.clientSecret = clientSecret;
    }
    if (tenantId !== undefined) {
      result.tenantId = tenantId;
    }

    return result;
  }

  /**
   * Resolves HashiCorp Vault Transit configuration from user config and environment variables.
   *
   * Returns `undefined` if no Vault configuration is detected (neither address nor token
   * are set). Throws an error if configuration is partially set.
   *
   * @returns Resolved Vault Transit configuration with required fields populated,
   *          or `undefined` if Vault Transit is not configured.
   * @throws {InvalidKmsConfigError} When configuration is incomplete (address provided
   *         without token, or token provided without address).
   */
  getVaultConfig(): IResolvedVaultTransitConfig | undefined {
    const envNames = this.getEnvVarNames();
    const userVault = this.userConfig.vault || {};

    const address = this.resolveValue<string | undefined>(
      userVault.address,
      envNames.vaultAddr,
      DEFAULT_VAULT_TRANSIT_CONFIG.address
    );

    const token = this.resolveValue<string | undefined>(
      userVault.token,
      envNames.vaultToken,
      DEFAULT_VAULT_TRANSIT_CONFIG.token
    );

    const enginePath = this.resolveValue<string>(
      userVault.enginePath,
      envNames.vaultTransitEnginePath,
      DEFAULT_VAULT_TRANSIT_CONFIG.enginePath || 'transit'
    );

    const keyName = this.resolveValue<string | undefined>(
      userVault.keyName,
      envNames.vaultTransitKeyName,
      DEFAULT_VAULT_TRANSIT_CONFIG.keyName
    );

    const namespace = this.resolveValue<string | undefined>(
      userVault.namespace,
      envNames.vaultNamespace,
      DEFAULT_VAULT_TRANSIT_CONFIG.namespace
    );

    // If no address or token is set, return undefined (provider not configured)
    if (!address && !token) {
      return undefined;
    }

    // Validate that required fields are present
    if (!address || !token) {
      throw new InvalidKmsConfigError(
        'Vault Transit configuration incomplete. Required: address, token'
      );
    }

    const result: IResolvedVaultTransitConfig = {
      address,
      token,
      enginePath
    };

    if (keyName !== undefined) {
      result.keyName = keyName;
    }
    if (namespace !== undefined) {
      result.namespace = namespace;
    }

    return result;
  }

  /**
   * Resolves encryption options configuration from user config and environment variables.
   *
   * Unlike provider-specific methods, this always returns a configuration object
   * with all fields populated (using defaults where values are not specified).
   *
   * Resolved fields include:
   * - `algorithm`: Encryption algorithm (defaults to 'aes-256-gcm')
   * - `enableDecorators`: Whether to enable encryption decorators (defaults to false)
   * - `enableMetrics`: Whether to enable metrics collection (defaults to false)
   *
   * @returns Resolved encryption options configuration. Always returns a complete
   *          configuration object with defaults applied for unspecified values.
   */
  getEncryptionConfig(): IResolvedEncryptionOptionsConfig {
    const envNames = this.getEnvVarNames();
    const userEncryption = this.userConfig.encryption || {};

    const algorithm = this.resolveValue<EncryptionAlgorithm>(
      userEncryption.algorithm,
      envNames.encryptionAlgorithm,
      DEFAULT_ENCRYPTION_CONFIG.algorithm,
      (v) => v as EncryptionAlgorithm
    );

    const enableDecorators = this.resolveValue<boolean>(
      userEncryption.enableDecorators,
      envNames.encryptionEnableDecorators,
      DEFAULT_ENCRYPTION_CONFIG.enableDecorators,
      this.parseBoolean
    );

    const enableMetrics = this.resolveValue<boolean>(
      userEncryption.enableMetrics,
      envNames.encryptionEnableMetrics,
      DEFAULT_ENCRYPTION_CONFIG.enableMetrics,
      this.parseBoolean
    );

    return {
      algorithm,
      enableDecorators,
      enableMetrics
    };
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): IResolvedInfrastructureEncryptionConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    const result: IResolvedInfrastructureEncryptionConfig = {
      encryption: this.getEncryptionConfig()
    };

    const gcp = this.getGcpConfig();
    if (gcp !== undefined) {
      result.gcp = gcp;
    }

    const aws = this.getAwsConfig();
    if (aws !== undefined) {
      result.aws = aws;
    }

    const azure = this.getAzureConfig();
    if (azure !== undefined) {
      result.azure = azure;
    }

    const vault = this.getVaultConfig();
    if (vault !== undefined) {
      result.vault = vault;
    }

    return result;
  }

  /**
   * Get provider configurations as IKmsProviderConfig array
   * This is useful for integrating with the existing EncryptionModule
   *
   * NOTE: Complexity is inherent due to handling multiple providers (GCP, AWS, Azure, Vault).
   * Each provider has its own optional configuration properties that must be conditionally added.
   * Extracting into smaller functions would reduce readability by scattering related logic.
   */
  // eslint-disable-next-line complexity
  getProviderConfigs(): IKmsProviderConfig[] {
    const resolved = this.resolve();
    const configs: IKmsProviderConfig[] = [];

    // Add GCP KMS if configured
    if (resolved.gcp) {
      const gcpOptions: IGcpKmsProviderOptions = {
        projectId: resolved.gcp.projectId,
        locationId: resolved.gcp.locationId,
        keyRingId: resolved.gcp.keyRingId,
        keyId: resolved.gcp.keyId
      };

      if (resolved.gcp.credentialsFile !== undefined) {
        gcpOptions.credentialsFile = resolved.gcp.credentialsFile;
      }
      if (resolved.gcp.credentials !== undefined) {
        gcpOptions.credentials = resolved.gcp.credentials;
      }
      if (resolved.gcp.endpoint !== undefined) {
        gcpOptions.endpoint = resolved.gcp.endpoint;
      }

      configs.push({
        type: KmsProviderType.GCP,
        default: configs.length === 0, // First provider becomes default
        options: gcpOptions
      });
    }

    // Add AWS KMS if configured
    if (resolved.aws) {
      const awsOptions: IAwsKmsProviderOptions = {
        region: resolved.aws.region
      };

      if (resolved.aws.keyId !== undefined) {
        awsOptions.keyId = resolved.aws.keyId;
      }
      if (resolved.aws.accessKeyId !== undefined) {
        awsOptions.accessKeyId = resolved.aws.accessKeyId;
      }
      if (resolved.aws.secretAccessKey !== undefined) {
        awsOptions.secretAccessKey = resolved.aws.secretAccessKey;
      }
      if (resolved.aws.sessionToken !== undefined) {
        awsOptions.sessionToken = resolved.aws.sessionToken;
      }
      if (resolved.aws.endpoint !== undefined) {
        awsOptions.endpoint = resolved.aws.endpoint;
      }

      configs.push({
        type: KmsProviderType.AWS,
        default: configs.length === 0, // First provider becomes default
        options: awsOptions
      });
    }

    // Add Azure Key Vault if configured
    if (resolved.azure) {
      const azureOptions: IAzureKeyVaultProviderOptions = {
        vaultUrl: resolved.azure.vaultUrl,
        credentialType: resolved.azure.credentialType
      };

      if (resolved.azure.keyName !== undefined) {
        azureOptions.keyName = resolved.azure.keyName;
      }
      if (resolved.azure.keyVersion !== undefined) {
        azureOptions.keyVersion = resolved.azure.keyVersion;
      }
      if (resolved.azure.clientId !== undefined) {
        azureOptions.clientId = resolved.azure.clientId;
      }
      if (resolved.azure.clientSecret !== undefined) {
        azureOptions.clientSecret = resolved.azure.clientSecret;
      }
      if (resolved.azure.tenantId !== undefined) {
        azureOptions.tenantId = resolved.azure.tenantId;
      }

      configs.push({
        type: KmsProviderType.AZURE,
        default: configs.length === 0, // First provider becomes default
        options: azureOptions
      });
    }

    // Add Vault Transit if configured
    if (resolved.vault) {
      const vaultOptions: IVaultTransitProviderOptions = {
        address: resolved.vault.address,
        token: resolved.vault.token,
        enginePath: resolved.vault.enginePath
      };

      if (resolved.vault.keyName !== undefined) {
        vaultOptions.keyName = resolved.vault.keyName;
      }
      if (resolved.vault.namespace !== undefined) {
        vaultOptions.namespace = resolved.vault.namespace;
      }

      configs.push({
        type: KmsProviderType.VAULT,
        default: configs.length === 0, // First provider becomes default
        options: vaultOptions
      });
    }

    return configs;
  }
}

/**
 * Resolve configuration from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/encryption';
 *
 * const config = resolveConfig({
 *   gcp: {
 *     projectId: 'my-project',
 *     locationId: 'global',
 *     keyRingId: 'my-keyring',
 *     keyId: 'my-key',
 *   },
 *   encryption: {
 *     algorithm: 'aes-256-gcm',
 *     enableDecorators: true,
 *   },
 * });
 * ```
 */
export function resolveConfig(
  userConfig: IInfrastructureEncryptionConfig = {},
  env: NodeJS.ProcessEnv = process.env
): IResolvedInfrastructureEncryptionConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

/**
 * Resolve provider configurations from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Provider configurations array
 *
 * @example
 * ```typescript
 * import { resolveProviderConfigs } from '@package/encryption';
 *
 * const providerConfigs = resolveProviderConfigs();
 * // Returns: [{ type: 'gcp', default: true, options: {...} }]
 * ```
 */
export function resolveProviderConfigs(
  userConfig: IInfrastructureEncryptionConfig = {},
  env: NodeJS.ProcessEnv = process.env
): IKmsProviderConfig[] {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.getProviderConfigs();
}

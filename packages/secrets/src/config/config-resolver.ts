/**
 * Infrastructure Secrets Configuration Resolver
 * ============================================
 * This class resolves the final configuration by merging user config, environment variables,
 * and default values in that priority order.
 *
 * Priority Order:
 * 1. User-provided config (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import {
  DEFAULT_GCP_CONFIG,
  DEFAULT_HASHICORP_CONFIG,
  DEFAULT_ONEPASSWORD_CONFIG,
  DEFAULT_ENV_VAR_NAMES
} from './defaults';
import type {
  EnvironmentVariableNames,
  GcpSecretManagerConfig,
  HashiCorpVaultConfig,
  InfrastructureSecretsConfig,
  OnePasswordConfig,
  ResolvedInfrastructureSecretsConfig,
  SecretProviderType
} from './interfaces';
import { SecretProviderType as SecretProviderTypeEnum } from './interfaces';

/**
 * Configuration resolver class
 * Resolves user config + environment variables + defaults into a final configuration
 */
export class ConfigResolver {
  private readonly userConfig: InfrastructureSecretsConfig;
  private readonly env: NodeJS.ProcessEnv;
  private readonly customEnvVarNames: EnvironmentVariableNames;

  constructor(userConfig: InfrastructureSecretsConfig, env: NodeJS.ProcessEnv = process.env) {
    this.userConfig = userConfig;
    this.env = env;
    this.customEnvVarNames = userConfig.envVarNames || {};
  }

  /**
   * Resolve a configuration value with priority: user config > env var > default
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: keyof EnvironmentVariableNames,
    defaultValue: T
  ): T {
    // Priority 1: User-provided value
    if (userValue !== undefined) {
      return userValue;
    }

    // Priority 2: Environment variable
    const envVarNameResolved =
      this.customEnvVarNames[envVarName] || DEFAULT_ENV_VAR_NAMES[envVarName];
    const envValue = this.env[envVarNameResolved];
    if (envValue !== undefined) {
      // Type coercion for boolean and number values
      if (typeof defaultValue === 'boolean') {
        return (envValue.toLowerCase() === 'true' || envValue === '1') as T;
      }
      if (typeof defaultValue === 'number') {
        const num = Number.parseInt(envValue, 10);
        return (Number.isNaN(num) ? defaultValue : num) as T;
      }
      return envValue as T;
    }

    // Priority 3: Default value
    return defaultValue;
  }

  /**
   * Parse a boolean string value
   */
  private parseBoolean(value: boolean | string | undefined): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return false;
  }

  /**
   * Parse a number string value
   */
  private parseNumber(value: number | string | undefined, defaultValue: number): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const num = Number.parseInt(value, 10);
      return Number.isNaN(num) ? defaultValue : num;
    }
    return defaultValue;
  }

  /**
   * Resolve the secret provider type
   */
  private resolveProviderType(): SecretProviderType {
    const userProvider = this.userConfig.provider;

    // Priority 1: User-provided provider
    if (userProvider) {
      // Convert string to enum if needed
      if (typeof userProvider === 'string') {
        const upperProvider = userProvider.toUpperCase() as keyof typeof SecretProviderTypeEnum;
        if (upperProvider in SecretProviderTypeEnum) {
          return SecretProviderTypeEnum[upperProvider];
        }
        // If it's already a valid enum value (lowercase), return it
        if (Object.values(SecretProviderTypeEnum).includes(userProvider as SecretProviderType)) {
          return userProvider as SecretProviderType;
        }
      }
      return userProvider as SecretProviderType;
    }

    // Priority 2: Environment variable
    const envVarName =
      this.customEnvVarNames.SECRET_PROVIDER || DEFAULT_ENV_VAR_NAMES.SECRET_PROVIDER;
    const envProvider = this.env[envVarName];
    if (envProvider) {
      const upperProvider = envProvider.toUpperCase() as keyof typeof SecretProviderTypeEnum;
      if (upperProvider in SecretProviderTypeEnum) {
        return SecretProviderTypeEnum[upperProvider];
      }
      // If it's already a valid enum value (lowercase), return it
      if (Object.values(SecretProviderTypeEnum).includes(envProvider as SecretProviderType)) {
        return envProvider as SecretProviderType;
      }
    }

    // Priority 3: Default to GCP
    return SecretProviderTypeEnum.GCP;
  }

  /**
   * Resolve GCP configuration
   */
  private resolveGcpConfig(): GcpSecretManagerConfig {
    const userGcp = this.userConfig.gcp || {};

    return {
      projectId: this.resolveValue(userGcp.projectId, 'GOOGLE_CLOUD_PROJECT', ''),
      credentialsPath: this.resolveValue(
        userGcp.credentialsPath,
        'GOOGLE_APPLICATION_CREDENTIALS',
        ''
      ),
      kmsKeyLocation: this.resolveValue(
        userGcp.kmsKeyLocation,
        'KMS_KEY_LOCATION',
        DEFAULT_GCP_CONFIG.kmsKeyLocation ?? 'global'
      ),
      kmsKeyRingId: this.resolveValue(
        userGcp.kmsKeyRingId,
        'KMS_KEY_RING_ID',
        DEFAULT_GCP_CONFIG.kmsKeyRingId ?? 'vault-keys'
      ),
      kmsKeyId: this.resolveValue(
        userGcp.kmsKeyId,
        'KMS_KEY_ID',
        DEFAULT_GCP_CONFIG.kmsKeyId ?? 'vault-key'
      )
    };
  }

  /**
   * Resolve HashiCorp Vault configuration
   */
  private resolveHashicorpConfig(): HashiCorpVaultConfig {
    const userHashicorp = this.userConfig.hashicorp || {};

    return {
      addr: this.resolveValue(
        userHashicorp.addr,
        'VAULT_ADDR',
        DEFAULT_HASHICORP_CONFIG.addr ?? 'http://localhost:8200'
      ),
      token: this.resolveValue(userHashicorp.token, 'VAULT_TOKEN', ''),
      roleId: this.resolveValue(userHashicorp.roleId, 'VAULT_ROLE_ID', ''),
      secretId: this.resolveValue(userHashicorp.secretId, 'VAULT_SECRET_ID', ''),
      namespace: this.resolveValue(userHashicorp.namespace, 'VAULT_NAMESPACE', '')
    };
  }

  /**
   * Resolve 1Password configuration
   */
  private resolveOnepasswordConfig(): OnePasswordConfig {
    const userOnepassword = this.userConfig.onepassword || {};

    return {
      token: this.resolveValue(userOnepassword.token, 'OP_SERVICE_ACCOUNT_TOKEN', ''),
      connectHost: this.resolveValue(
        userOnepassword.connectHost,
        'OP_CONNECT_HOST',
        DEFAULT_ONEPASSWORD_CONFIG.connectHost ?? 'http://localhost:8080'
      ),
      vaultId: this.resolveValue(
        userOnepassword.vaultId,
        'OP_VAULT_ID',
        DEFAULT_ONEPASSWORD_CONFIG.vaultId ?? 'runtime-secrets'
      ),
      itemName: this.resolveValue(
        userOnepassword.itemName,
        'OP_ITEM_NAME',
        DEFAULT_ONEPASSWORD_CONFIG.itemName ?? 'Runtime Secrets'
      ),
      fieldName: this.resolveValue(
        userOnepassword.fieldName,
        'OP_FIELD_NAME',
        DEFAULT_ONEPASSWORD_CONFIG.fieldName ?? 'notes'
      ),
      cacheTtl: this.parseNumber(
        userOnepassword.cacheTtl,
        DEFAULT_ONEPASSWORD_CONFIG.cacheTtl ?? 300_000
      )
    };
  }

  /**
   * Resolve the complete configuration
   * This is the main method that returns the final resolved configuration
   */
  resolve(): ResolvedInfrastructureSecretsConfig {
    const provider = this.resolveProviderType();
    const enableTracing = this.parseBoolean(this.userConfig.enableTracing);

    return {
      provider,
      gcp: this.resolveGcpConfig(),
      hashicorp: this.resolveHashicorpConfig(),
      onepassword: this.resolveOnepasswordConfig(),
      enableTracing
    };
  }
}

/**
 * Helper function to resolve configuration
 * This is the public API for resolving configuration
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration with all defaults applied
 */
export function resolveConfig(
  userConfig: InfrastructureSecretsConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedInfrastructureSecretsConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}

/**
 * KMS Provider Factory
 *
 * Central factory for creating and managing KMS provider instances.
 * Provides lazy loading, registry management, and multi-provider support.
 *
 * ## Key Features
 *
 * - **Lazy Loading**: Provider SDKs are only imported when needed, reducing
 *   bundle size and startup time for applications using a single provider.
 *
 * - **Provider Registry**: Maintains a registry of instantiated providers
 *   for reuse, avoiding duplicate connections and credential loading.
 *
 * - **Default Provider**: Supports designating a default provider for
 *   simplified API usage when only one provider is needed.
 *
 * - **Multi-Provider**: Enables fallback scenarios, multi-region deployments,
 *   and gradual migrations between cloud providers.
 *
 * @module encryption/providers/factory
 */

import { InvalidKmsConfigError } from '../errors';
import { IKmsProvider, KmsProviderType } from './kms-provider.interface';

import type {
  IGcpKmsProviderOptions,
  IAwsKmsProviderOptions,
  IAzureKeyVaultProviderOptions,
  IVaultTransitProviderOptions,
  IGcpSecretManagerProviderOptions,
  IEnvVarProviderOptions
} from './factory.types';

// Re-export types for external use
export type {
  IGcpKmsProviderOptions,
  IAwsKmsProviderOptions,
  IAzureKeyVaultProviderOptions,
  IVaultTransitProviderOptions,
  IGcpSecretManagerProviderOptions,
  IEnvVarProviderOptions
};

// Re-export IKmsProvider for convenience
export type { IKmsProvider } from './kms-provider.interface';

/**
 * Configuration for creating and registering a KMS provider.
 *
 * @interface IKmsProviderConfig
 *
 * @example GCP KMS configuration
 * ```typescript
 * const gcpConfig: IKmsProviderConfig = {
 *   type: KmsProviderType.GCP,
 *   default: true,
 *   options: {
 *     projectId: 'my-project',
 *     locationId: 'us-east1',
 *     keyRingId: 'my-keyring',
 *     keyId: 'my-key'
 *   }
 * };
 * ```
 *
 * @example AWS KMS configuration
 * ```typescript
 * const awsConfig: IKmsProviderConfig = {
 *   type: KmsProviderType.AWS,
 *   options: {
 *     region: 'us-east-1',
 *     keyId: 'alias/my-key'
 *   }
 * };
 * ```
 */
export interface IKmsProviderConfig {
  /**
   * Provider type identifier.
   * Determines which provider class to instantiate.
   */
  type: KmsProviderType;

  /**
   * Mark this provider as the default.
   * The default provider is used when no provider name is specified.
   */
  default?: boolean;

  /**
   * Provider-specific configuration options.
   * Each provider type has different required and optional fields.
   *
   * @see IGcpKmsProviderOptions for GCP Cloud KMS
   * @see IAwsKmsProviderOptions for AWS KMS
   * @see IAzureKeyVaultProviderOptions for Azure Key Vault
   * @see IVaultTransitProviderOptions for HashiCorp Vault
   * @see IEnvVarProviderOptions for development/testing
   */
  options:
    | IGcpKmsProviderOptions
    | IAwsKmsProviderOptions
    | IAzureKeyVaultProviderOptions
    | IVaultTransitProviderOptions
    | IGcpSecretManagerProviderOptions
    | IEnvVarProviderOptions;
}

/**
 * Factory for creating and managing KMS provider instances.
 *
 * The factory handles:
 * - Dynamic provider instantiation with lazy SDK loading
 * - Provider registry for instance reuse
 * - Default provider designation and retrieval
 * - Health checks across all registered providers
 *
 * ## Architecture
 *
 * ```
 * KmsProviderFactory
 *    ├── providers: Map<name, IKmsProvider>  // Registry
 *    ├── defaultProviderName: string | null  // Default selection
 *    │
 *    ├── createProvider(config)      // Lazy instantiation
 *    ├── registerProvider(name, p)   // Add to registry
 *    ├── getProvider(name)           // Retrieve by name
 *    └── getDefaultProvider()        // Get default or first
 * ```
 *
 * @example Multi-provider registration for fallback
 * ```typescript
 * const factory = new KmsProviderFactory();
 *
 * // Register primary provider (AWS)
 * await factory.registerProviderConfig({
 *   type: KmsProviderType.AWS,
 *   default: true,
 *   options: { region: 'us-east-1', keyId: 'alias/primary' }
 * });
 *
 * // Register fallback provider (GCP)
 * await factory.registerProviderConfig({
 *   type: KmsProviderType.GCP,
 *   options: {
 *     projectId: 'backup-project',
 *     locationId: 'us-east1',
 *     keyRingId: 'backup-ring',
 *     keyId: 'backup-key'
 *   }
 * });
 *
 * // Use primary, fallback to secondary
 * const primary = factory.getDefaultProvider();
 * const fallback = factory.getProvider('gcp');
 *
 * try {
 *   return await primary.encrypt(data);
 * } catch (error) {
 *   console.warn('Primary failed, using fallback');
 *   return await fallback.encrypt(data);
 * }
 * ```
 *
 * @example Development setup with env-var provider
 * ```typescript
 * const factory = new KmsProviderFactory();
 *
 * if (process.env.NODE_ENV === 'development') {
 *   await factory.registerProviderConfig({
 *     type: KmsProviderType.ENV_VAR,
 *     default: true,
 *     options: { encryptionKey: process.env.DEV_ENCRYPTION_KEY }
 *   });
 * } else {
 *   await factory.registerProviderConfig({
 *     type: KmsProviderType.AWS,
 *     default: true,
 *     options: { region: 'us-east-1', keyId: 'alias/prod' }
 *   });
 * }
 * ```
 */
export class KmsProviderFactory {
  private providers = new Map<string, IKmsProvider>();
  private defaultProviderName: string | null = null;

  /**
   * Register a provider
   *
   * @param name - Provider name for identification
   * @param provider - KMS provider instance
   * @param isDefault - Whether this provider should be the default
   */
  registerProvider(name: string, provider: IKmsProvider, isDefault = false): void {
    // Don't overwrite existing providers
    if (!this.providers.has(name)) {
      this.providers.set(name, provider);
    }
    if (isDefault) {
      this.defaultProviderName = name;
    }
  }

  /**
   * Get a provider by name
   *
   * @param name - Provider name to retrieve
   * @returns The KMS provider or undefined if not found
   */
  getProvider(name: string): IKmsProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get the default provider
   *
   * @returns The default KMS provider or the first registered provider if no default is set
   */
  getDefaultProvider(): IKmsProvider | undefined {
    if (this.defaultProviderName) {
      return this.providers.get(this.defaultProviderName);
    }
    // Return first registered provider if no explicit default
    const firstKey = this.providers.keys().next().value;
    return firstKey ? this.providers.get(firstKey) : undefined;
  }

  /**
   * Get all registered provider names
   *
   * @returns Array of registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a provider from configuration
   *
   * @param config - Provider configuration with type and options
   * @returns Promise resolving to the created KMS provider
   * @throws InvalidKmsConfigError if provider type is unknown
   */
  async createProvider(config: IKmsProviderConfig): Promise<IKmsProvider> {
    const { type, options } = config;

    switch (type) {
      case KmsProviderType.GCP: {
        // Lazy load GCP provider
        const { GcpKmsProvider } = await import('../providers/gcp-kms.provider');
        return new GcpKmsProvider(options as IGcpKmsProviderOptions);
      }
      case KmsProviderType.AWS: {
        // Lazy load AWS provider
        const { AwsKmsProvider } = await import('../providers/aws-kms.provider');
        return new AwsKmsProvider(options as IAwsKmsProviderOptions);
      }
      case KmsProviderType.AZURE: {
        // Lazy load Azure provider
        const { AzureKeyVaultProvider } = await import('../providers/azure-keyvault.provider');
        return new AzureKeyVaultProvider(options as IAzureKeyVaultProviderOptions);
      }
      case KmsProviderType.VAULT: {
        // Lazy load Vault provider
        const { VaultTransitProvider } = await import('../providers/vault-transit.provider');
        return new VaultTransitProvider(options as IVaultTransitProviderOptions);
      }
      case KmsProviderType.GCP_SECRET_MANAGER: {
        // Lazy load GCP Secret Manager provider
        const { GcpSecretManagerProvider } =
          await import('../providers/gcp-secret-manager.provider');
        return new GcpSecretManagerProvider(options as IGcpSecretManagerProviderOptions);
      }
      case KmsProviderType.ENV_VAR: {
        // Lazy load EnvVar provider
        const { EnvVarProvider } = await import('../providers/env-var.provider');
        return new EnvVarProvider(options as IEnvVarProviderOptions);
      }
      default:
        throw new InvalidKmsConfigError(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Create and register a provider from configuration
   *
   * @param config - Provider configuration with type and options
   * @returns Promise resolving to the registered KMS provider
   */
  async registerProviderConfig(config: IKmsProviderConfig): Promise<IKmsProvider> {
    const provider = await this.createProvider(config);
    this.registerProvider(config.type, provider, config.default);
    return provider;
  }

  /**
   * Create and register multiple providers from configurations
   *
   * @param configs - Array of provider configurations
   * @returns Promise that resolves when all providers are registered
   */
  async registerProviderConfigs(configs: IKmsProviderConfig[]): Promise<void> {
    await Promise.all(configs.map((config) => this.registerProviderConfig(config)));
  }

  /**
   * Clear all registered providers
   *
   * @returns void
   */
  clearProviders(): void {
    this.providers.clear();
    this.defaultProviderName = null;
  }

  /**
   * Health check for all registered providers
   *
   * @returns Promise resolving to a map of provider names to health status
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }
}

/**
 * Global provider factory instance
 */
export const kmsProviderFactory = new KmsProviderFactory();

/**
 * Helper function to create a provider (uses global factory)
 *
 * @param config - Provider configuration with type and options
 * @returns Promise resolving to the created KMS provider
 */
export async function createKmsProvider(config: IKmsProviderConfig): Promise<IKmsProvider> {
  return kmsProviderFactory.createProvider(config);
}

/**
 * Helper function to get a provider by name (uses global factory)
 *
 * @param name - Provider name to retrieve
 * @returns The KMS provider or undefined if not found
 */
export function getKmsProvider(name: string): IKmsProvider | undefined {
  return kmsProviderFactory.getProvider(name);
}

/**
 * Helper function to get the default provider (uses global factory)
 *
 * @returns The default KMS provider or undefined if no providers are registered
 */
export function getDefaultKmsProvider(): IKmsProvider | undefined {
  return kmsProviderFactory.getDefaultProvider();
}

import {
  Module,
  Global,
  OnModuleInit,
  OnApplicationShutdown,
  DynamicModule,
  Provider,
  Inject
} from '@nestjs/common';

import { resolveConfig, SecretProviderType, type InfrastructureSecretsConfig } from './config';
import { GcpSecretManagerProvider } from './gcp-secret-manager.provider';
import { HashiCorpVaultProvider } from './hashicorp-vault.provider';
import { OnePasswordProvider } from './one-password.provider';
import type { SecretProvider } from './secret-provider.interface';

/**
 * Secrets module configuration
 *
 * This configuration interface allows complete customization of the
 * secrets package behavior. All options can be overridden
 * via input configuration, with environment variables as fallback.
 *
 * @example Basic configuration
 * ```typescript
 * const config: SecretsModuleConfig = {
 *   provider: 'gcp',
 *   gcp: {
 *     projectId: 'my-project',
 *     credentialsPath: '/path/to/credentials.json',
 *   },
 *   enableTracing: true,
 * };
 * ```
 *
 * @example Using a custom provider instance
 * ```typescript
 * const customProvider = new GcpSecretManagerProvider({
 *   projectId: 'my-project',
 *   enableCache: true,
 *   cacheTtl: 60000,
 * });
 *
 * const config: SecretsModuleConfig = {
 *   secretProvider: customProvider,
 * };
 * ```
 */
export interface SecretsModuleConfig extends InfrastructureSecretsConfig {
  /**
   * Custom secret provider instance
   * If not provided, one will be created based on the provider type
   */
  readonly secretProvider?: SecretProvider;

  /**
   * Enable graceful shutdown of provider connections
   * Default: true
   */
  readonly enableGracefulShutdown?: boolean;
}

/**
 * Injection token for the secret provider
 *
 * Use this token with NestJS dependency injection to inject the SecretProvider.
 *
 * @example Injecting the secret provider
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, SecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class PaymentService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {}
 *
 *   async getStripeApiKey(): Promise<string> {
 *     return this.secrets.getSecret('STRIPE_API_KEY');
 *   }
 * }
 * ```
 */
export const SECRET_PROVIDER_TOKEN = 'SECRET_PROVIDER';

/**
 * Global secrets module for NestJS
 *
 * This module provides:
 * - Dependency injection for SecretProvider
 * - Automatic configuration resolution from environment variables
 * - Graceful shutdown handling
 * - Support for GCP Secret Manager, HashiCorp Vault, and 1Password
 *
 * @example Basic module import with default configuration
 * ```typescript
 * @Module({
 *   imports: [SecretsModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Using secrets in a service
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, SecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class UsersService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {}
 *
 *   async getDatabasePassword(): Promise<string> {
 *     return this.secrets.getSecret('DATABASE_PASSWORD');
 *   }
 * }
 * ```
 *
 * @example Batch secret retrieval pattern
 * ```typescript
 * @Injectable()
 * export class ConfigurationService {
 *   private config: Record<string, string> = {};
 *
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {}
 *
 *   async loadSecrets(): Promise<void> {
 *     const secretKeys = ['DATABASE_URL', 'API_KEY', 'JWT_SECRET'];
 *
 *     const results = await Promise.all(
 *       secretKeys.map(key => this.secrets.getSecret(key))
 *     );
 *
 *     secretKeys.forEach((key, index) => {
 *       this.config[key] = results[index];
 *     });
 *   }
 *
 *   get(key: string): string {
 *     return this.config[key];
 *   }
 * }
 * ```
 */
@Global()
@Module({})
export class SecretsModule implements OnModuleInit, OnApplicationShutdown {
  private static providerInstance: SecretProvider | null = null;
  private static enableGracefulShutdown = true;

  constructor(@Inject(SECRET_PROVIDER_TOKEN) secretProvider: SecretProvider) {
    // Store provider instance for health checks
    SecretsModule.providerInstance = secretProvider;
  }

  /**
   * Log module initialization
   */
  async onModuleInit(): Promise<void> {
    // Module initialized successfully
  }

  /**
   * Cleanup on application shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    const provider = SecretsModule.providerInstance;

    if (provider && SecretsModule.enableGracefulShutdown) {
      const destroyable = provider as SecretProvider & { destroy?: () => Promise<void> | void };
      if (typeof destroyable.destroy === 'function') {
        await destroyable.destroy();
      }
    }

    SecretsModule.providerInstance = null;
  }

  /**
   * Configure secrets module (synchronous)
   *
   * @param config - Module configuration options
   * @returns Dynamic module configuration
   *
   * @example Using GCP Secret Manager
   * ```typescript
   * @Module({
   *   imports: [SecretsModule.forRoot({
   *     provider: 'gcp',
   *     gcp: {
   *       projectId: 'my-gcp-project',
   *       credentialsPath: '/path/to/credentials.json',
   *       enableCache: true,
   *       cacheTtl: 300000,
   *     },
   *     enableTracing: true,
   *   })],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Using HashiCorp Vault
   * ```typescript
   * @Module({
   *   imports: [SecretsModule.forRoot({
   *     provider: 'hashicorp',
   *     hashicorp: {
   *       addr: 'https://vault.example.com:8200',
   *       token: process.env.VAULT_TOKEN,
   *       namespace: 'production',
   *     },
   *   })],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Using 1Password
   * ```typescript
   * @Module({
   *   imports: [SecretsModule.forRoot({
   *     provider: 'onepassword',
   *     onepassword: {
   *       token: process.env.OP_SERVICE_ACCOUNT_TOKEN,
   *       vaultId: 'Production',
   *       itemName: 'API Keys',
   *     },
   *   })],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(config: SecretsModuleConfig = {}): DynamicModule {
    // Resolve configuration with defaults
    const resolvedConfig = resolveConfig(config);

    // Create provider instance if not provided
    const provider = config.secretProvider ?? SecretsModule.createProvider(resolvedConfig);
    SecretsModule.providerInstance = provider;
    SecretsModule.enableGracefulShutdown = config.enableGracefulShutdown ?? true;

    const providers: Provider[] = [
      {
        provide: SECRET_PROVIDER_TOKEN,
        useValue: provider
      }
    ];

    return {
      module: SecretsModule,
      providers,
      exports: [SECRET_PROVIDER_TOKEN]
    };
  }

  /**
   * Configure secrets module with async configuration
   *
   * Use this method when you need to load configuration from other modules
   * like ConfigModule or when configuration requires async operations.
   *
   * @param options - Async module options with factory function
   * @returns Dynamic module configuration
   *
   * @example Using with ConfigService
   * ```typescript
   * @Module({
   *   imports: [
   *     SecretsModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => ({
   *         provider: config.get('SECRET_PROVIDER', 'gcp'),
   *         gcp: {
   *           projectId: config.get('GOOGLE_CLOUD_PROJECT'),
   *           credentialsPath: config.get('GOOGLE_APPLICATION_CREDENTIALS'),
   *         },
   *         enableTracing: config.get('SECRETS_TRACING', 'false') === 'true',
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Complete multi-provider configuration
   * ```typescript
   * @Module({
   *   imports: [
   *     SecretsModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => ({
   *         provider: config.get('SECRET_PROVIDER', 'gcp'),
   *         gcp: {
   *           projectId: config.get('GOOGLE_CLOUD_PROJECT'),
   *           credentialsPath: config.get('GOOGLE_APPLICATION_CREDENTIALS'),
   *           kmsKeyLocation: config.get('KMS_KEY_LOCATION', 'global'),
   *           kmsKeyRingId: config.get('KMS_KEY_RING_ID', 'vault-keys'),
   *           kmsKeyId: config.get('KMS_KEY_ID', 'vault-key'),
   *         },
   *         hashicorp: {
   *           addr: config.get('VAULT_ADDR', 'http://localhost:8200'),
   *           token: config.get('VAULT_TOKEN'),
   *           roleId: config.get('VAULT_ROLE_ID'),
   *           secretId: config.get('VAULT_SECRET_ID'),
   *           namespace: config.get('VAULT_NAMESPACE'),
   *         },
   *         onepassword: {
   *           token: config.get('OP_SERVICE_ACCOUNT_TOKEN'),
   *           vaultId: config.get('OP_VAULT_ID', 'runtime-secrets'),
   *           itemName: config.get('OP_ITEM_NAME', 'Runtime Secrets'),
   *           fieldName: config.get('OP_FIELD_NAME', 'notes'),
   *           cacheTtl: config.get('OP_CACHE_TTL', 300000),
   *         },
   *         enableTracing: config.get('SECRETS_TRACING', 'false') === 'true',
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Using async factory for remote configuration
   * ```typescript
   * @Module({
   *   imports: [
   *     SecretsModule.forRootAsync({
   *       imports: [HttpModule],
   *       inject: [HttpService],
   *       useFactory: async (http: HttpService) => {
   *         // Fetch configuration from a remote source
   *         const response = await http.get('/config/secrets').toPromise();
   *         return response.data;
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => Promise<SecretsModuleConfig> | SecretsModuleConfig;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: SecretsModule,
      imports: [...(options.imports ?? [])],
      providers: [
        {
          provide: 'SECRETS_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const moduleConfig = await options.useFactory(...args);

            // Resolve configuration with defaults
            resolveConfig(moduleConfig);

            return moduleConfig;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: SECRET_PROVIDER_TOKEN,
          useFactory: (config: SecretsModuleConfig) => {
            // Resolve configuration with defaults
            const finalConfig = resolveConfig(config);

            // Create provider instance if not provided
            const provider = config.secretProvider ?? SecretsModule.createProvider(finalConfig);
            SecretsModule.providerInstance = provider;
            SecretsModule.enableGracefulShutdown = config.enableGracefulShutdown ?? true;

            return provider;
          },
          inject: ['SECRETS_CONFIG']
        }
      ],
      exports: [SECRET_PROVIDER_TOKEN]
    };
  }

  /**
   * Create a provider instance based on resolved configuration
   */
  private static createProvider(resolvedConfig: ReturnType<typeof resolveConfig>): SecretProvider {
    switch (resolvedConfig.provider) {
      case SecretProviderType.GCP:
        return new GcpSecretManagerProvider(resolvedConfig.gcp);

      case SecretProviderType.HASHICORP:
        return new HashiCorpVaultProvider(resolvedConfig.hashicorp);

      case SecretProviderType.ONEPASSWORD:
        return new OnePasswordProvider(resolvedConfig.onepassword);

      default:
        throw new Error(`Unknown secret provider: ${resolvedConfig.provider}`);
    }
  }

  /**
   * Health check for secret provider connectivity
   *
   * Calls the provider's actual healthCheck() method if available,
   * otherwise falls back to checking if the provider is configured.
   *
   * @returns true if provider is healthy, false otherwise
   *
   * @example Using in a NestJS health controller
   * ```typescript
   * import { Controller, Get } from '@nestjs/common';
   * import { SecretsModule } from '@package/secrets';
   *
   * @Controller('health')
   * export class HealthController {
   *   @Get()
   *   async check() {
   *     const secretsHealthy = await SecretsModule.healthCheck();
   *     return {
   *       status: secretsHealthy ? 'ok' : 'error',
   *       secrets: secretsHealthy ? 'connected' : 'disconnected',
   *     };
   *   }
   * }
   * ```
   *
   * @example Using with NestJS Terminus health checks
   * ```typescript
   * import { Injectable } from '@nestjs/common';
   * import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
   * import { SecretsModule } from '@package/secrets';
   *
   * @Injectable()
   * export class SecretsHealthIndicator extends HealthIndicator {
   *   async isHealthy(key: string): Promise<HealthIndicatorResult> {
   *     const isHealthy = await SecretsModule.healthCheck();
   *     return this.getStatus(key, isHealthy);
   *   }
   * }
   * ```
   */
  static async healthCheck(): Promise<boolean> {
    const provider = SecretsModule.providerInstance;
    if (!provider) return false;

    try {
      if (typeof provider.healthCheck === 'function') {
        return await provider.healthCheck();
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Re-export all types and classes for convenience
 */
export type { SecretProvider } from './secret-provider.interface';
export { SecretProviderType } from './config/interfaces';

// Export configuration types
export * from './config';

// Export providers
export { GcpSecretManagerProvider } from './gcp-secret-manager.provider';
export { HashiCorpVaultProvider } from './hashicorp-vault.provider';
export { OnePasswordProvider } from './one-password.provider';

// Export factory for backward compatibility
export { SecretProviderFactory } from './secret-provider.factory';

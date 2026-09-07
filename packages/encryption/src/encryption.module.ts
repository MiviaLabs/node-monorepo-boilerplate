/**
 * Encryption Module
 *
 * NestJS module for encryption infrastructure
 */

import {
  Module,
  DynamicModule,
  Global,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Provider
} from '@nestjs/common';

import { ConfigResolver, type IInfrastructureEncryptionConfig } from './config';
import { IEncryptionModuleConfig, validateEncryptionConfig } from './config/encryption-config';
import { EncryptionAlgorithm } from './constants';
import {
  EntityTransformer,
  createEntityTransformer,
  type IEntityTransformerOptions
} from './decorators/entity-transformer';
import { EncryptedEntityHooks, createEncryptedEntityHooks } from './decorators/hooks';
import { EncryptionOperationError, InvalidKmsConfigError } from './errors';
import {
  kmsProviderFactory,
  KmsProviderFactory,
  type IKmsProvider,
  type IKmsProviderConfig
} from './providers/factory';
import { EncryptionService } from './services/encryption.service';

import type { IEncryptionAdapter } from './providers';

/**
 * Encryption module tokens
 */
export const ENCRYPTION_SERVICE = 'ENCRYPTION_SERVICE';
export const ENTITY_TRANSFORMER = 'ENTITY_TRANSFORMER';
export const ENCRYPTED_ENTITY_HOOKS = 'ENCRYPTED_ENTITY_HOOKS';
export const KMS_PROVIDER_FACTORY = 'KMS_PROVIDER_FACTORY';

/**
 * Encryption module configuration
 */
export interface EncryptionModuleOptions {
  /** KMS provider configurations (optional, will use env vars if not provided) */
  providers?: IKmsProviderConfig[];
  /** Default encryption options (optional, will use env vars if not provided) */
  encryption?: {
    algorithm?: EncryptionAlgorithm;
    enableDecorators?: boolean;
    enableMetrics?: boolean;
  };
  /** Infrastructure encryption config for env var resolution */
  infrastructureConfig?: IInfrastructureEncryptionConfig;
  /**
   * Optional encryption adapter for multi-tenant key resolution.
   *
   * When provided, enables per-tenant encryption key isolation by using
   * the adapter to resolve tenant-specific keys and providers based on
   * the organizationId passed to encrypt/decrypt methods.
   *
   * @see IEncryptionAdapter for implementation requirements
   *
   * @example
   * ```typescript
   * EncryptionModule.forRoot({
   *   providers: [...],
   *   adapter: new TenantKeyAdapter(tenantKeyStore, providerFactory)
   * })
   * ```
   */
  adapter?: IEncryptionAdapter;
  /**
   * Suppress the warning logged when forRoot() is called multiple times.
   *
   * By default, EncryptionModule logs a warning when forRoot() is called
   * but the module is already initialized. This can occur in test scenarios
   * where multiple test modules import EncryptionModule.
   *
   * Set to `true` to suppress this warning when re-initialization is expected.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // In test setup where re-initialization is expected
   * EncryptionModule.forRoot({
   *   providers: [...],
   *   suppressDoubleInitWarning: true
   * })
   * ```
   */
  suppressDoubleInitWarning?: boolean;
}

/**
 * Global encryption module for NestJS
 *
 * This module provides:
 * - Dependency injection for EncryptionService, EntityTransformer, and Hooks
 * - Automatic KMS provider initialization
 * - OpenTelemetry integration for metrics
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     EncryptionModule.forRoot({
 *       providers: [
 *         gcpKmsConfig({
 *           projectId: 'my-project',
 *           locationId: 'global',
 *           keyRingId: 'my-keyring',
 *           keyId: 'my-key',
 *           default: true,
 *         }),
 *       ],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @Injectable()
 * export class UsersService {
 *   constructor(
 *     private readonly encryption: EncryptionService,
 *   ) {}
 *
 *   async encryptSensitiveData(data: string) {
 *     return this.encryption.encryptToBase64(data);
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: KMS_PROVIDER_FACTORY,
      useValue: kmsProviderFactory
    }
  ],
  exports: [KMS_PROVIDER_FACTORY]
})
export class EncryptionModule implements OnModuleInit, OnApplicationShutdown {
  /** @internal Static logger for module-level operations */
  private static readonly logger = new Logger(EncryptionModule.name);

  private static config: IEncryptionModuleConfig | null = null;
  private static encryptionService: EncryptionService | null = null;
  private static entityTransformer: EntityTransformer | null = null;
  private static encryptedEntityHooks: EncryptedEntityHooks | null = null;
  private static adapter: IEncryptionAdapter | null = null;

  /**
   * Initialize module on startup
   */
  async onModuleInit(): Promise<void> {
    if (EncryptionModule.config) {
      await this.initializeProviders();
    }
  }

  /**
   * Initialize KMS providers from config
   */
  private async initializeProviders(): Promise<void> {
    const config = EncryptionModule.config;
    if (!config) return;

    try {
      // Clear existing providers
      kmsProviderFactory.clearProviders();

      // Register all providers
      await kmsProviderFactory.registerProviderConfigs(config.providers);

      // Create services
      const defaultProvider = kmsProviderFactory.getDefaultProvider();
      if (!defaultProvider) {
        throw new EncryptionOperationError('initialization', 'No default KMS provider configured');
      }

      const defaultProviderType = config.providers.find((p) => p.default)?.type ?? 'gcp';

      EncryptionModule.encryptionService = new EncryptionService(
        (name?: string) => kmsProviderFactory.getProvider(name ?? defaultProviderType),
        defaultProviderType,
        config.encryption
      );

      EncryptionModule.entityTransformer = createEntityTransformer(
        EncryptionModule.buildTransformerOptions(defaultProviderType)
      );

      EncryptionModule.encryptedEntityHooks = createEncryptedEntityHooks(
        EncryptionModule.entityTransformer
      );
    } catch (error) {
      throw new EncryptionOperationError('module_initialization', error);
    }
  }

  /**
   * Cleanup on shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    kmsProviderFactory.clearProviders();
    EncryptionModule.config = null;
    EncryptionModule.encryptionService = null;
    EncryptionModule.entityTransformer = null;
    EncryptionModule.encryptedEntityHooks = null;
    EncryptionModule.adapter = null;
  }

  /**
   * Reset module state for testing.
   *
   * Clears all static singleton state to prevent leakage between tests.
   * This method should be called in test teardown (afterEach/afterAll) to
   * ensure complete isolation between test cases.
   *
   * @internal For test isolation only - do not use in production code
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   EncryptionModule.reset();
   * });
   * ```
   */
  static reset(): void {
    kmsProviderFactory.clearProviders();
    EncryptionModule.config = null;
    EncryptionModule.encryptionService = null;
    EncryptionModule.entityTransformer = null;
    EncryptionModule.encryptedEntityHooks = null;
    EncryptionModule.adapter = null;
  }

  /**
   * Builds transformer options for EntityTransformer initialization.
   *
   * Consolidates the duplicated transformer options creation logic used
   * by both forRoot and forRootAsync initialization paths.
   *
   * @param defaultProviderType - The default KMS provider type (e.g., 'gcp', 'aws')
   * @returns IEntityTransformerOptions configured with provider resolution and adapter
   */
  private static buildTransformerOptions(defaultProviderType: string): IEntityTransformerOptions {
    return {
      getProvider: (name?: string) => kmsProviderFactory.getProvider(name ?? defaultProviderType),
      defaultProvider: defaultProviderType,
      ...(EncryptionModule.adapter && { adapter: EncryptionModule.adapter })
    };
  }

  /**
   * Resolve module configuration from options
   *
   * Extracts duplicated logic from forRoot and forRootAsync into a shared method.
   * Handles three resolution paths:
   * 1. Explicit provider configuration
   * 2. Infrastructure config with environment variable overrides
   * 3. Pure environment variable resolution
   *
   * @param options - Module options from forRoot or forRootAsync
   * @returns Resolved encryption module configuration
   * @throws Error if no KMS providers are configured
   */
  private static resolveModuleConfig(options: EncryptionModuleOptions): IEncryptionModuleConfig {
    // Path 1: Use explicitly provided providers
    if (options.providers && options.providers.length > 0) {
      const config: IEncryptionModuleConfig = {
        providers: options.providers
      };
      if (options.encryption !== undefined) {
        config.encryption = options.encryption;
      }
      return config;
    }

    // Path 2: Resolve from infrastructure config (env vars + user config)
    if (options.infrastructureConfig) {
      const resolver = new ConfigResolver(options.infrastructureConfig);
      const providerConfigs = resolver.getProviderConfigs();
      const resolvedConfig = resolver.resolve();

      if (providerConfigs.length === 0) {
        throw new InvalidKmsConfigError(
          'No KMS providers configured. Provide explicit provider configuration in EncryptionModuleOptions.providers, ' +
            'or set environment variables (e.g., GCP_KMS_PROJECT_ID, AWS_KMS_KEY_ID). ' +
            'infraConfigProvided=true, resolvedProviders=0'
        );
      }

      return {
        providers: providerConfigs,
        encryption: {
          algorithm: options.encryption?.algorithm ?? resolvedConfig.encryption.algorithm,
          enableDecorators:
            options.encryption?.enableDecorators ?? resolvedConfig.encryption.enableDecorators,
          enableMetrics:
            options.encryption?.enableMetrics ?? resolvedConfig.encryption.enableMetrics
        }
      };
    }

    // Path 3: Resolve from environment variables only
    const resolver = new ConfigResolver();
    const providerConfigs = resolver.getProviderConfigs();
    const resolvedConfig = resolver.resolve();

    if (providerConfigs.length === 0) {
      throw new InvalidKmsConfigError(
        'No KMS providers configured. Provide explicit provider configuration in EncryptionModuleOptions.providers, ' +
          'or set environment variables (e.g., GCP_KMS_PROJECT_ID, AWS_KMS_KEY_ID). ' +
          'infraConfigProvided=false, resolvedProviders=0'
      );
    }

    return {
      providers: providerConfigs,
      encryption: {
        algorithm: options.encryption?.algorithm ?? resolvedConfig.encryption.algorithm,
        enableDecorators:
          options.encryption?.enableDecorators ?? resolvedConfig.encryption.enableDecorators,
        enableMetrics: options.encryption?.enableMetrics ?? resolvedConfig.encryption.enableMetrics
      }
    };
  }

  /**
   * Configure encryption module
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     // Option 1: Explicit provider configuration
   *     EncryptionModule.forRoot({
   *       providers: [
   *         gcpKmsConfig({
   *           projectId: 'my-project',
   *           locationId: 'global',
   *           keyRingId: 'my-keyring',
   *           keyId: 'my-key',
   *           default: true,
   *         }),
   *       ],
   *       encryption: {
   *         algorithm: 'aes-256-gcm',
   *         enableDecorators: true,
   *         enableMetrics: true,
   *       },
   *     }),
   *
   *     // Option 2: Use environment variables (providers resolved from env)
   *     EncryptionModule.forRoot({
   *       infrastructureConfig: {
   *         gcp: {
   *           // Options override env vars
   *           projectId: 'my-project',
   *         },
   *         encryption: {
   *           algorithm: 'aes-256-gcm',
   *         },
   *       },
   *     }),
   *
   *     // Option 3: Use only environment variables
   *     EncryptionModule.forRoot({}),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: EncryptionModuleOptions = {}): DynamicModule {
    // Only resolve and set config if not already initialized
    // This allows multiple calls to forRoot() without resetting the config
    let finalOptions = EncryptionModule.config;

    if (!finalOptions) {
      // Resolve configuration using shared method
      finalOptions = EncryptionModule.resolveModuleConfig(options);
      validateEncryptionConfig(finalOptions);
      EncryptionModule.config = finalOptions;
      // Store adapter for multi-tenant encryption support
      EncryptionModule.adapter = options.adapter ?? null;
    } else if (!options.suppressDoubleInitWarning) {
      // Warn about double initialization to aid debugging in tests
      // Can be suppressed via options.suppressDoubleInitWarning for expected re-initialization scenarios
      EncryptionModule.logger.warn(
        'forRoot() called but module is already initialized. ' +
          'This may indicate duplicate imports. Call EncryptionModule.reset() in test teardown to clear state. ' +
          'Set suppressDoubleInitWarning: true to suppress this warning if re-initialization is expected.'
      );
    }

    const providers: Provider[] = [
      {
        provide: KMS_PROVIDER_FACTORY,
        useValue: kmsProviderFactory
      },
      // Provide KmsProviderFactory class as an alias to KMS_PROVIDER_FACTORY token
      // This allows injecting KmsProviderFactory directly: constructor(private readonly kmsFactory: KmsProviderFactory)
      {
        provide: KmsProviderFactory,
        useExisting: KMS_PROVIDER_FACTORY
      },
      {
        provide: ENCRYPTION_SERVICE,
        useFactory: () => {
          if (!EncryptionModule.encryptionService) {
            throw new Error('EncryptionModule not initialized. Call forRoot() first.');
          }
          return EncryptionModule.encryptionService;
        }
      },
      // Provide EncryptionService class as an alias to ENCRYPTION_SERVICE token
      // This allows injecting EncryptionService directly: constructor(private readonly encryption: EncryptionService)
      {
        provide: EncryptionService,
        useExisting: ENCRYPTION_SERVICE
      },
      {
        provide: ENTITY_TRANSFORMER,
        useFactory: () => {
          if (!EncryptionModule.entityTransformer) {
            throw new Error('EncryptionModule not initialized. Call forRoot() first.');
          }
          return EncryptionModule.entityTransformer;
        }
      },
      {
        provide: ENCRYPTED_ENTITY_HOOKS,
        useFactory: () => {
          if (!EncryptionModule.encryptedEntityHooks) {
            throw new Error('EncryptionModule not initialized. Call forRoot() first.');
          }
          return EncryptionModule.encryptedEntityHooks;
        }
      }
    ];

    return {
      module: EncryptionModule,
      providers,
      exports: [
        KMS_PROVIDER_FACTORY,
        KmsProviderFactory, // Export KmsProviderFactory class for direct injection
        ENCRYPTION_SERVICE,
        EncryptionService, // Export EncryptionService class for direct injection
        ENTITY_TRANSFORMER,
        ENCRYPTED_ENTITY_HOOKS
      ]
    };
  }

  /**
   * Configure encryption module with async configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EncryptionModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: async (config: ConfigService) => {
   *         // Option 1: Return explicit provider configuration
   *         return {
   *           providers: [
   *             gcpKmsConfig({
   *               projectId: config.get('GCP_PROJECT_ID'),
   *               locationId: config.get('GCP_LOCATION_ID'),
   *               keyRingId: config.get('GCP_KEY_RING_ID'),
   *               keyId: config.get('GCP_KEY_ID'),
   *               default: true,
   *             }),
   *           ],
   *         };
   *
   *         // Option 2: Return infrastructure config (providers resolved from env)
   *         return {
   *           infrastructureConfig: {
   *             gcp: {
   *               projectId: config.get('GCP_PROJECT_ID'),
   *             },
   *           },
   *         };
   *
   *         // Option 3: Return empty config (providers resolved from env vars)
   *         return {};
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => Promise<EncryptionModuleOptions> | EncryptionModuleOptions;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: EncryptionModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: 'ENCRYPTION_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const moduleOptions = await options.useFactory(...args);

            // Only resolve and set config if not already initialized
            // This allows multiple calls to forRootAsync() without resetting the config
            let finalOptions = EncryptionModule.config;

            if (!finalOptions) {
              // Resolve configuration using shared method
              finalOptions = EncryptionModule.resolveModuleConfig(moduleOptions);
              validateEncryptionConfig(finalOptions);
              EncryptionModule.config = finalOptions;
              // Store adapter for multi-tenant encryption support
              EncryptionModule.adapter = moduleOptions.adapter ?? null;
            }

            // Initialize providers (only if not already initialized)
            if (!EncryptionModule.encryptionService) {
              kmsProviderFactory.clearProviders();
              await kmsProviderFactory.registerProviderConfigs(finalOptions.providers);

              const defaultProvider = kmsProviderFactory.getDefaultProvider();
              if (!defaultProvider) {
                throw new EncryptionOperationError(
                  'initialization',
                  'No default KMS provider configured'
                );
              }

              const defaultProviderType =
                finalOptions.providers.find((p) => p.default)?.type ?? 'gcp';

              EncryptionModule.encryptionService = new EncryptionService(
                (name?: string) => kmsProviderFactory.getProvider(name ?? defaultProviderType),
                defaultProviderType,
                finalOptions.encryption
              );

              EncryptionModule.entityTransformer = createEntityTransformer(
                EncryptionModule.buildTransformerOptions(defaultProviderType)
              );

              EncryptionModule.encryptedEntityHooks = createEncryptedEntityHooks(
                EncryptionModule.entityTransformer
              );
            }

            return finalOptions;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: KMS_PROVIDER_FACTORY,
          useValue: kmsProviderFactory
        },
        // Provide KmsProviderFactory class as an alias to KMS_PROVIDER_FACTORY token
        // This allows injecting KmsProviderFactory directly: constructor(private readonly kmsFactory: KmsProviderFactory)
        {
          provide: KmsProviderFactory,
          useExisting: KMS_PROVIDER_FACTORY
        },
        {
          provide: ENCRYPTION_SERVICE,
          useFactory: () => {
            if (!EncryptionModule.encryptionService) {
              throw new Error('EncryptionModule not initialized. Call forRootAsync() first.');
            }
            return EncryptionModule.encryptionService;
          },
          inject: ['ENCRYPTION_CONFIG']
        },
        // Provide EncryptionService class as an alias to ENCRYPTION_SERVICE token
        // This allows injecting EncryptionService directly: constructor(private readonly encryption: EncryptionService)
        {
          provide: EncryptionService,
          useExisting: ENCRYPTION_SERVICE
        },
        {
          provide: ENTITY_TRANSFORMER,
          useFactory: () => {
            if (!EncryptionModule.entityTransformer) {
              throw new Error('EncryptionModule not initialized. Call forRootAsync() first.');
            }
            return EncryptionModule.entityTransformer;
          },
          inject: ['ENCRYPTION_CONFIG']
        },
        {
          provide: ENCRYPTED_ENTITY_HOOKS,
          useFactory: () => {
            if (!EncryptionModule.encryptedEntityHooks) {
              throw new Error('EncryptionModule not initialized. Call forRootAsync() first.');
            }
            return EncryptionModule.encryptedEntityHooks;
          },
          inject: ['ENCRYPTION_CONFIG']
        }
      ],
      exports: [
        KMS_PROVIDER_FACTORY,
        KmsProviderFactory, // Export KmsProviderFactory class for direct injection
        ENCRYPTION_SERVICE,
        EncryptionService, // Export EncryptionService class for direct injection
        ENTITY_TRANSFORMER,
        ENCRYPTED_ENTITY_HOOKS
      ]
    };
  }

  /**
   * Health check for all KMS providers
   */
  static async healthCheck(): Promise<Record<string, boolean>> {
    return kmsProviderFactory.healthCheckAll();
  }

  /**
   * Get a KMS provider by name
   */
  static getProvider(name?: string): IKmsProvider | undefined {
    if (!name) return undefined;
    return kmsProviderFactory.getProvider(name);
  }

  /**
   * Get the default KMS provider
   */
  static getDefaultProvider(): IKmsProvider | undefined {
    return kmsProviderFactory.getDefaultProvider();
  }
}

/**
 * Re-export types
 */
export * from './providers/kms-provider.interface';
export * from './services/encryption.service';
export * from './services/envelope-encryption.service';
export * from './decorators/entity-transformer';
export * from './decorators/hooks';
export * from './decorators/encrypted-metadata';
export * from './config/encryption-config';
export * from './errors';
export * from './telemetry';

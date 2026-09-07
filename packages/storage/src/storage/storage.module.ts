import { DynamicModule, Logger, Module, Provider } from '@nestjs/common';

import { DisabledStorageProvider } from './disabled-storage.provider';
import { StorageRegistryService } from './storage-registry.service';
import { StorageService } from './storage.service';
import {
  STORAGE_MODULE_OPTIONS,
  STORAGE_PROVIDER_MAP_TOKEN,
  STORAGE_PROVIDER_TOKEN,
  STORAGE_REGISTRY_TOKEN
} from './tokens';
import { resolveStorageConfigs } from '../config/config-resolver';
import { StorageConfigurationError } from '../errors';
import { createStorageProvider } from '../providers/provider-factory';

import type {
  IStorageModuleAsyncOptions,
  IStorageModuleOptions,
  IStorageModuleOptionsFactory,
  IStorageRootModuleOptions
} from './interfaces';
import type { IStorageProvider } from '../providers/storage-provider.interface';

const STORAGE_MODULE_LOG_CONTEXT = 'StorageModule';

function normalizeResolvedModuleOptions(
  options: IStorageModuleOptions & { global?: boolean },
  hasExplicitGlobal: boolean
): IStorageModuleOptions {
  if (options.global !== undefined && !hasExplicitGlobal) {
    throw new StorageConfigurationError(
      'Set global on StorageModule.forRootAsync(...) options, not inside async-resolved module options'
    );
  }

  return options;
}

function getInvalidConfigBehavior(options: IStorageModuleOptions): 'throw' | 'warn-and-disable' {
  return options.invalidConfigBehavior ?? 'throw';
}

function getWarningLogger(options: IStorageModuleOptions): { warn(message: string): void } {
  return options.warningLogger ?? new Logger(STORAGE_MODULE_LOG_CONTEXT);
}

function createDisabledProviderForInvalidConfig(
  options: IStorageModuleOptions,
  error: StorageConfigurationError
): IStorageProvider {
  getWarningLogger(options).warn(
    `Storage module started in disabled mode because configuration is invalid: ${error.message}`
  );

  return new DisabledStorageProvider(error.message);
}

function resolveDefaultInstanceName(options: IStorageModuleOptions): string {
  return options.defaultInstance?.trim() || 'default';
}

function getInstanceNames(options: IStorageModuleOptions): string[] {
  const names = new Set<string>([resolveDefaultInstanceName(options)]);

  for (const instanceName of Object.keys(options.storages ?? {})) {
    names.add(instanceName);
  }

  for (const instanceName of Object.keys(options.providers ?? {})) {
    names.add(instanceName);
  }

  return Array.from(names);
}

function getStorageConfigByInstance(
  options: IStorageModuleOptions
): Record<string, ReturnType<typeof resolveStorageConfigs>['storages'][string]> {
  const defaultInstance = resolveDefaultInstanceName(options);
  const storageInputs = { ...(options.storages ?? {}) };

  if (options.storage) {
    storageInputs[defaultInstance] = options.storage;
  }

  return resolveStorageConfigs({
    defaultInstance,
    storages: storageInputs
  }).storages;
}

function createStorageProviderMap(
  options: IStorageModuleOptions
): Record<string, IStorageProvider> {
  const defaultInstance = resolveDefaultInstanceName(options);
  const instanceNames = getInstanceNames(options);
  const explicitProviders = {
    ...(options.providers ?? {}),
    ...(options.provider ? { [defaultInstance]: options.provider } : {})
  };

  try {
    const instancesNeedingResolvedConfig = instanceNames.filter(
      (instanceName) => !explicitProviders[instanceName]
    );
    const resolvedConfigs: Partial<
      Record<string, ReturnType<typeof getStorageConfigByInstance>[string]>
    > = instancesNeedingResolvedConfig.length > 0 ? getStorageConfigByInstance(options) : {};

    return Object.fromEntries(
      instanceNames.map((instanceName) => {
        const explicitProvider = explicitProviders[instanceName];
        if (explicitProvider) {
          return [instanceName, explicitProvider];
        }

        const resolvedConfig = resolvedConfigs[instanceName];
        if (!resolvedConfig) {
          throw new StorageConfigurationError(
            `Storage instance "${instanceName}" must define either a provider or a storage config`
          );
        }

        return [
          instanceName,
          createStorageProvider(
            resolvedConfig,
            options.providerOptionsByInstance?.[instanceName] ?? options.providerOptions
          )
        ];
      })
    );
  } catch (error) {
    if (
      error instanceof StorageConfigurationError &&
      getInvalidConfigBehavior(options) === 'warn-and-disable'
    ) {
      return Object.fromEntries(
        instanceNames.map((instanceName) => [
          instanceName,
          createDisabledProviderForInvalidConfig(options, error)
        ])
      );
    }

    throw error;
  }
}

@Module({})
export class StorageModule {
  static forRoot(options: IStorageRootModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: STORAGE_MODULE_OPTIONS,
      useValue: options
    };

    return {
      module: StorageModule,
      providers: [
        optionsProvider,
        this.createProviderMapFactory(),
        this.createRegistryProvider(),
        {
          provide: STORAGE_REGISTRY_TOKEN,
          useExisting: StorageRegistryService
        },
        this.createDefaultProviderFactory(),
        this.createStorageServiceProvider()
      ],
      exports: [
        STORAGE_PROVIDER_TOKEN,
        STORAGE_PROVIDER_MAP_TOKEN,
        STORAGE_REGISTRY_TOKEN,
        StorageRegistryService,
        StorageService
      ],
      global: options.global ?? false
    };
  }

  static forRootAsync(options: IStorageModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: StorageModule,
      imports: options.imports ?? [],
      providers: [
        ...asyncProviders,
        this.createProviderMapFactory(),
        this.createRegistryProvider(),
        {
          provide: STORAGE_REGISTRY_TOKEN,
          useExisting: StorageRegistryService
        },
        this.createDefaultProviderFactory(),
        this.createStorageServiceProvider()
      ],
      exports: [
        STORAGE_PROVIDER_TOKEN,
        STORAGE_PROVIDER_MAP_TOKEN,
        STORAGE_REGISTRY_TOKEN,
        StorageRegistryService,
        StorageService
      ],
      global: options.global ?? false
    };
  }

  private static createAsyncProviders(options: IStorageModuleAsyncOptions): Provider[] {
    if (options.useFactory || options.useExisting) {
      return [this.createAsyncOptionsProvider(options), this.createProviderMapFactory()];
    }

    if (options.useClass) {
      return [
        this.createAsyncOptionsProvider(options),
        {
          provide: options.useClass,
          useClass: options.useClass
        },
        this.createProviderMapFactory()
      ];
    }

    return [
      {
        provide: STORAGE_MODULE_OPTIONS,
        useValue: normalizeResolvedModuleOptions(
          options.useValue ?? {},
          options.global !== undefined
        )
      },
      this.createProviderMapFactory()
    ];
  }

  private static createAsyncOptionsProvider(options: IStorageModuleAsyncOptions): Provider {
    if (options.useFactory) {
      const useFactory = options.useFactory;

      return {
        provide: STORAGE_MODULE_OPTIONS,
        useFactory: async (...injectedDependencies: unknown[]) =>
          normalizeResolvedModuleOptions(
            await useFactory(...injectedDependencies),
            options.global !== undefined
          ),
        inject: options.inject ?? []
      };
    }

    if (options.useExisting) {
      return {
        provide: STORAGE_MODULE_OPTIONS,
        useFactory: async (optionsFactory: IStorageModuleOptionsFactory) =>
          normalizeResolvedModuleOptions(
            await optionsFactory.createStorageModuleOptions(),
            options.global !== undefined
          ),
        inject: [options.useExisting]
      };
    }

    if (options.useClass) {
      return {
        provide: STORAGE_MODULE_OPTIONS,
        useFactory: async (optionsFactory: IStorageModuleOptionsFactory) =>
          normalizeResolvedModuleOptions(
            await optionsFactory.createStorageModuleOptions(),
            options.global !== undefined
          ),
        inject: [options.useClass]
      };
    }

    return {
      provide: STORAGE_MODULE_OPTIONS,
      useValue: normalizeResolvedModuleOptions(options.useValue ?? {}, options.global !== undefined)
    };
  }

  private static createProviderMapFactory(): Provider {
    return {
      provide: STORAGE_PROVIDER_MAP_TOKEN,
      useFactory: (options: IStorageModuleOptions) => createStorageProviderMap(options),
      inject: [STORAGE_MODULE_OPTIONS]
    };
  }

  private static createRegistryProvider(): Provider {
    return {
      provide: StorageRegistryService,
      useFactory: (providerMap: Record<string, IStorageProvider>, options: IStorageModuleOptions) =>
        new StorageRegistryService(providerMap, resolveDefaultInstanceName(options)),
      inject: [STORAGE_PROVIDER_MAP_TOKEN, STORAGE_MODULE_OPTIONS]
    };
  }

  private static createDefaultProviderFactory(): Provider {
    return {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (registry: StorageRegistryService) => registry.get(),
      inject: [StorageRegistryService]
    };
  }

  private static createStorageServiceProvider(): Provider {
    return {
      provide: StorageService,
      useFactory: (provider: IStorageProvider) => new StorageService(provider),
      inject: [STORAGE_PROVIDER_TOKEN]
    };
  }
}

import type { IStorageConfig } from '../config/interfaces';
import type { CreateStorageProviderOptions } from '../providers/provider-factory';
import type { IStorageProvider } from '../providers/storage-provider.interface';
import type { InjectionToken, ModuleMetadata, Type } from '@nestjs/common';

export const STORAGE_INVALID_CONFIG_BEHAVIORS = ['throw', 'warn-and-disable'] as const;

export type StorageInvalidConfigBehavior = (typeof STORAGE_INVALID_CONFIG_BEHAVIORS)[number];

export interface StorageModuleWarningLogger {
  warn(message: string): void;
}

export interface IStorageModuleOptions {
  storage?: IStorageConfig;
  storages?: Record<string, IStorageConfig>;
  provider?: IStorageProvider;
  providers?: Record<string, IStorageProvider>;
  providerOptions?: CreateStorageProviderOptions;
  providerOptionsByInstance?: Record<string, CreateStorageProviderOptions>;
  defaultInstance?: string;
  invalidConfigBehavior?: StorageInvalidConfigBehavior;
  warningLogger?: StorageModuleWarningLogger;
}

export interface IStorageRootModuleOptions extends IStorageModuleOptions {
  global?: boolean;
}

export interface StorageModuleAsyncFactory {
  (...injectedDependencies: unknown[]): IStorageModuleOptions | Promise<IStorageModuleOptions>;
}

export interface IStorageModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: StorageModuleAsyncFactory;
  inject?: InjectionToken[];
  useClass?: Type<IStorageModuleOptionsFactory>;
  useExisting?: Type<IStorageModuleOptionsFactory>;
  useValue?: IStorageModuleOptions;
  global?: boolean;
}

export interface IStorageModuleOptionsFactory {
  createStorageModuleOptions(): IStorageModuleOptions | Promise<IStorageModuleOptions>;
}

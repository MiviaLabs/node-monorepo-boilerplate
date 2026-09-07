import { StorageConfigurationError } from '../errors';
import { MockStorageProvider, type MockStorageProviderOptions } from './mock-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

import type { IStorageProvider } from './storage-provider.interface';
import type { ResolvedStorageConfig } from '../config/interfaces';

export interface CreateStorageProviderOptions {
  useMock?: boolean;
  mock?: MockStorageProviderOptions;
}

export function createStorageProvider(
  config: ResolvedStorageConfig,
  options: CreateStorageProviderOptions = {}
): IStorageProvider {
  if (options.useMock || config.testMode) {
    return new MockStorageProvider(config, options.mock);
  }

  if (config.provider === 's3') {
    return new S3StorageProvider(config);
  }

  throw new StorageConfigurationError(`Storage provider "${config.provider}" is not supported`);
}

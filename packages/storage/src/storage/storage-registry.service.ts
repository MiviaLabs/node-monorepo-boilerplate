import { StorageConfigurationError } from '../errors';

import type { IStorageProvider } from '../providers/storage-provider.interface';

export class StorageRegistryService {
  constructor(
    private readonly providers: Record<string, IStorageProvider>,
    private readonly defaultInstance: string
  ) {}

  get(instanceName = this.defaultInstance): IStorageProvider {
    const provider = this.providers[instanceName];

    if (!provider) {
      throw new StorageConfigurationError(
        `Storage instance "${instanceName}" is not registered. Available instances: ${Object.keys(
          this.providers
        ).join(', ')}`
      );
    }

    return provider;
  }

  getDefaultInstanceName(): string {
    return this.defaultInstance;
  }

  listInstanceNames(): string[] {
    return Object.keys(this.providers);
  }
}

import { describe, expect, it } from '@jest/globals';

import {
  createStorageModuleOptions,
  getConfiguredInstanceNames,
  getStorageEnvPrefix
} from '../storage.module';

type ConfigValues = Record<string, string | undefined>;

function createConfigService(values: ConfigValues): {
  get<T = string>(key: string, defaultValue?: T): T | undefined;
} {
  return {
    get<T = string>(key: string, defaultValue?: T): T | undefined {
      return (values[key] as T | undefined) ?? defaultValue;
    }
  };
}

describe('storage.module config bridge', () => {
  it('includes named instances from the configured STORAGE_INSTANCES list', () => {
    const config = createConfigService({
      STORAGE_DEFAULT_INSTANCE: 'default',
      STORAGE_INSTANCES: 'uploads,avatars'
    });

    expect(getConfiguredInstanceNames(config as never, 'default')).toEqual([
      'default',
      'uploads',
      'avatars'
    ]);
  });

  it('normalizes named-instance env prefixes the same way as the shared storage package', () => {
    expect(getStorageEnvPrefix('my-files')).toBe('STORAGE_MY_FILES');
    expect(getStorageEnvPrefix('default')).toBe('STORAGE');
  });

  it('includes the effective default instance even when STORAGE_INSTANCES omits it', () => {
    const config = createConfigService({
      STORAGE_DEFAULT_INSTANCE: 'assets',
      STORAGE_INSTANCES: 'uploads'
    });

    expect(getConfiguredInstanceNames(config as never, 'assets')).toEqual(['assets', 'uploads']);
  });

  it('normalizes quoted instance names from env-backed config values', () => {
    const config = createConfigService({
      STORAGE_DEFAULT_INSTANCE: '"uploads"',
      STORAGE_INSTANCES: '"uploads", "avatars"',
      STORAGE_UPLOADS_S3_REGION: 'us-central1',
      STORAGE_AVATARS_S3_REGION: 'us-central1',
      STORAGE_UPLOADS_DEFAULT_BUCKET: '"uploads-bucket"',
      STORAGE_AVATARS_DEFAULT_BUCKET: "'avatars-bucket'"
    });

    const options = createStorageModuleOptions(config as never);
    const uploadsStorage = options.storages?.uploads;
    const avatarsStorage = options.storages?.avatars;

    expect(options.defaultInstance).toBe('uploads');
    expect(Object.keys(options.storages ?? {})).toEqual(['uploads', 'avatars']);
    expect(uploadsStorage?.s3?.region).toBe('us-central1');
    expect(avatarsStorage?.s3?.region).toBe('us-central1');
    expect(uploadsStorage?.defaultBucket).toBe('uploads-bucket');
    expect(avatarsStorage?.defaultBucket).toBe('avatars-bucket');
  });

  it('builds storage configs for the effective default instance', () => {
    const config = createConfigService({
      NODE_ENV: 'test',
      STORAGE_DEFAULT_INSTANCE: 'my-files',
      STORAGE_INSTANCES: 'uploads',
      STORAGE_MY_FILES_DEFAULT_BUCKET: 'my-files-bucket',
      STORAGE_MY_FILES_S3_BUCKET: 'my-files-provider-bucket',
      STORAGE_UPLOADS_DEFAULT_BUCKET: 'uploads-bucket',
      STORAGE_UPLOADS_S3_BUCKET: 'uploads-provider-bucket'
    });

    const options = createStorageModuleOptions(config as never);

    expect(options.defaultInstance).toBe('my-files');
    expect(Object.keys(options.storages ?? {})).toEqual(['my-files', 'uploads']);
    expect(options.storages?.['my-files']?.defaultBucket).toBe('my-files-bucket');
    expect(options.storages?.['uploads']?.defaultBucket).toBe('uploads-bucket');
  });
});

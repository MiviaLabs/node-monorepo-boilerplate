import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { StorageConfigurationError, StorageOperationError } from '../errors.js';
import { StorageRegistryService } from './storage-registry.service.js';
import { StorageModule } from './storage.module.js';
import { StorageService } from './storage.service.js';
import {
  STORAGE_MODULE_OPTIONS,
  STORAGE_PROVIDER_MAP_TOKEN,
  STORAGE_PROVIDER_TOKEN
} from './tokens.js';
import { MockStorageProvider } from '../providers/mock-storage.provider.js';

import type { IStorageModuleOptionsFactory } from './interfaces.js';
import type { IStorageProvider } from '../providers/storage-provider.interface.js';

describe('StorageModule', () => {
  it('registers StorageService and provider forRoot()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          storage: {
            testMode: true,
            defaultBucket: 'uploads',
            s3: {
              region: 'us-east-1',
              accessKeyId: 'key',
              secretAccessKey: 'secret'
            }
          }
        })
      ]
    }).compile();

    const service = moduleRef.get(StorageService);
    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);

    assert.ok(service instanceof StorageService);
    assert.ok(provider);
    assert.equal(await provider.objectExists({ key: 'missing.txt' }), false);
  });

  it('registers StorageService and provider forRootAsync() with useFactory', async () => {
    class ModuleConfig {
      readonly bucket = 'factory-bucket';
    }

    @Module({
      providers: [ModuleConfig],
      exports: [ModuleConfig]
    })
    class ModuleConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ModuleConfigModule,
        StorageModule.forRootAsync({
          imports: [ModuleConfigModule],
          useFactory: async (config: ModuleConfig) => ({
            storage: {
              testMode: true,
              defaultBucket: config.bucket,
              s3: {
                region: 'us-east-1',
                accessKeyId: 'key',
                secretAccessKey: 'secret'
              }
            }
          }),
          inject: [ModuleConfig]
        })
      ]
    }).compile();

    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);
    const putResult = await provider.putObject({ key: 'factory.txt', body: 'ok' });

    assert.equal(putResult.bucket, 'factory-bucket');
  });

  it('supports useClass async options factories', async () => {
    @Injectable()
    class StorageOptionsFactory implements IStorageModuleOptionsFactory {
      createStorageModuleOptions() {
        return {
          storage: {
            testMode: true,
            defaultBucket: 'class-bucket',
            s3: {
              region: 'us-east-1',
              accessKeyId: 'key',
              secretAccessKey: 'secret'
            }
          }
        };
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRootAsync({
          useClass: StorageOptionsFactory
        })
      ]
    }).compile();

    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);
    const signedUrl = await provider.getSignedUploadUrl({ key: 'class.txt' });

    assert.equal(signedUrl.bucket, 'class-bucket');
  });

  it('supports useExisting async options factories', async () => {
    @Injectable()
    class ExistingStorageOptionsFactory implements IStorageModuleOptionsFactory {
      createStorageModuleOptions() {
        return {
          storage: {
            testMode: true,
            defaultBucket: 'existing-bucket',
            s3: {
              region: 'us-east-1',
              accessKeyId: 'key',
              secretAccessKey: 'secret'
            }
          }
        };
      }
    }

    @Module({
      providers: [ExistingStorageOptionsFactory],
      exports: [ExistingStorageOptionsFactory]
    })
    class ExistingStorageOptionsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ExistingStorageOptionsModule,
        StorageModule.forRootAsync({
          imports: [ExistingStorageOptionsModule],
          useExisting: ExistingStorageOptionsFactory
        })
      ]
    }).compile();

    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);
    const putResult = await provider.putObject({ key: 'existing.txt', body: 'ok' });

    assert.equal(putResult.bucket, 'existing-bucket');
  });

  it('defaults global to false and preserves module options', async () => {
    const dynamicModule = StorageModule.forRoot({
      storage: {
        testMode: true,
        defaultBucket: 'module-bucket',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        }
      }
    });

    assert.equal(dynamicModule.global, false);
    const optionsProvider = (dynamicModule.providers ?? []).find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === STORAGE_MODULE_OPTIONS
    ) as { useValue: unknown } | undefined;

    assert.ok(optionsProvider);
    assert.ok(optionsProvider?.useValue);
  });

  it('supports a caller-supplied provider instance', async () => {
    const provider = new MockStorageProvider({
      provider: 's3',
      defaultBucket: 'provided-bucket',
      testMode: true,
      s3: {
        region: 'us-east-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: false,
        bucket: 'provider-bucket',
        signedUrlExpiresInSeconds: 300
      }
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          provider
        })
      ]
    }).compile();

    const injectedProvider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);
    const result = await injectedProvider.putObject({ key: 'provider.txt', body: 'ok' });

    assert.equal(result.bucket, 'provided-bucket');
  });

  it('registers multiple named storage instances and exposes them through the registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          defaultInstance: 'public',
          storages: {
            public: {
              testMode: true,
              defaultBucket: 'public-bucket',
              s3: {
                region: 'us-east-1',
                accessKeyId: 'public-key',
                secretAccessKey: 'public-secret'
              }
            },
            private: {
              testMode: true,
              defaultBucket: 'private-bucket',
              s3: {
                region: 'us-west-2',
                accessKeyId: 'private-key',
                secretAccessKey: 'private-secret'
              }
            }
          }
        })
      ]
    }).compile();

    const defaultProvider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);
    const providerMap = moduleRef.get<Record<string, IStorageProvider>>(STORAGE_PROVIDER_MAP_TOKEN);
    const registry = moduleRef.get(StorageRegistryService);
    const defaultService = moduleRef.get(StorageService);

    const privateProvider = registry.get('private');
    const defaultPutResult = await defaultProvider.putObject({ key: 'default.txt', body: 'ok' });
    const privatePutResult = await privateProvider.putObject({ key: 'private.txt', body: 'ok' });

    assert.equal(defaultPutResult.bucket, 'public-bucket');
    assert.equal(privatePutResult.bucket, 'private-bucket');
    assert.deepEqual(Object.keys(providerMap).sort(), ['private', 'public']);
    assert.deepEqual(registry.listInstanceNames().sort(), ['private', 'public']);
    assert.equal(registry.getDefaultInstanceName(), 'public');
    assert.equal(await defaultService.objectExists({ key: 'default.txt' }), true);
  });

  it('fails during module compilation when config is invalid', async () => {
    await assert.rejects(
      () =>
        Test.createTestingModule({
          imports: [
            StorageModule.forRoot({
              storage: {
                testMode: true,
                defaultBucket: 'uploads',
                s3: {
                  accessKeyId: 'key',
                  secretAccessKey: 'secret'
                }
              }
            })
          ]
        }).compile(),
      StorageConfigurationError
    );
  });

  it('warns and installs a disabled provider when configured to tolerate invalid config', async () => {
    const warnings: string[] = [];

    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          invalidConfigBehavior: 'warn-and-disable',
          warningLogger: {
            warn(message: string) {
              warnings.push(message);
            }
          },
          storage: {
            testMode: true,
            defaultBucket: 'uploads',
            s3: {
              accessKeyId: 'key',
              secretAccessKey: 'secret'
            }
          }
        })
      ]
    }).compile();

    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);

    await assert.rejects(
      () => provider.putObject({ key: 'disabled.txt', body: 'nope' }),
      (error: unknown) =>
        error instanceof StorageOperationError &&
        error.message.includes('Storage is disabled because configuration is invalid.')
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /configuration is invalid/i);
    assert.match(warnings[0] ?? '', /S3 region is required/i);
  });

  it('fails when async-resolved module options try to set global', async () => {
    await assert.rejects(
      () =>
        Test.createTestingModule({
          imports: [
            StorageModule.forRootAsync({
              useFactory: async () => ({
                global: true,
                storage: {
                  testMode: true,
                  defaultBucket: 'uploads',
                  s3: {
                    region: 'us-east-1',
                    accessKeyId: 'key',
                    secretAccessKey: 'secret'
                  }
                }
              })
            })
          ]
        }).compile(),
      StorageConfigurationError
    );
  });

  it('fails during module compilation when async config is invalid', async () => {
    await assert.rejects(
      () =>
        Test.createTestingModule({
          imports: [
            StorageModule.forRootAsync({
              useFactory: async () => ({
                storage: {
                  testMode: true,
                  defaultBucket: 'uploads',
                  s3: {
                    accessKeyId: 'key',
                    secretAccessKey: 'secret'
                  }
                }
              })
            })
          ]
        }).compile(),
      StorageConfigurationError
    );
  });

  it('supports warn-and-disable through forRootAsync()', async () => {
    const warnings: string[] = [];

    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRootAsync({
          useFactory: async () => ({
            invalidConfigBehavior: 'warn-and-disable',
            warningLogger: {
              warn(message: string) {
                warnings.push(message);
              }
            },
            storage: {
              testMode: true,
              defaultBucket: 'uploads',
              s3: {
                accessKeyId: 'key',
                secretAccessKey: 'secret'
              }
            }
          })
        })
      ]
    }).compile();

    const provider = moduleRef.get<IStorageProvider>(STORAGE_PROVIDER_TOKEN);

    await assert.rejects(
      () => provider.getSignedUploadUrl({ key: 'disabled.txt' }),
      (error: unknown) =>
        error instanceof StorageOperationError && error.operation === 'getSignedUploadUrl'
    );
    assert.equal(warnings.length, 1);
  });

  it('supports multiple storages through forRootAsync()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StorageModule.forRootAsync({
          useFactory: async () => ({
            defaultInstance: 'assets',
            storages: {
              assets: {
                testMode: true,
                defaultBucket: 'assets-bucket',
                s3: {
                  region: 'us-east-1',
                  accessKeyId: 'assets-key',
                  secretAccessKey: 'assets-secret'
                }
              },
              backups: {
                testMode: true,
                defaultBucket: 'backups-bucket',
                s3: {
                  region: 'us-east-1',
                  accessKeyId: 'backups-key',
                  secretAccessKey: 'backups-secret'
                }
              }
            }
          })
        })
      ]
    }).compile();

    const registry = moduleRef.get(StorageRegistryService);
    const backupProvider = registry.get('backups');
    const result = await backupProvider.putObject({ key: 'backup.txt', body: 'ok' });

    assert.equal(result.bucket, 'backups-bucket');
  });
});

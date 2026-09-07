import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { resolveStorageConfig, resolveStorageConfigs } from './config-resolver.js';
import { MAX_SIGNED_URL_EXPIRES_IN_SECONDS } from './defaults.js';
import { StorageConfigurationError } from '../errors.js';

describe('resolveStorageConfig', () => {
  it('resolves explicit config over environment variables', () => {
    const config = resolveStorageConfig(
      {
        defaultBucket: 'user-bucket',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'user-key',
          secretAccessKey: 'user-secret',
          forcePathStyle: true,
          signedUrlExpiresInSeconds: 123
        }
      },
      {
        STORAGE_DEFAULT_BUCKET: 'env-bucket',
        STORAGE_S3_REGION: 'eu-west-1',
        STORAGE_S3_ACCESS_KEY_ID: 'env-key',
        STORAGE_S3_SECRET_ACCESS_KEY: 'env-secret'
      }
    );

    assert.equal(config.provider, 's3');
    assert.equal(config.defaultBucket, 'user-bucket');
    assert.equal(config.s3.region, 'us-east-1');
    assert.equal(config.s3.accessKeyId, 'user-key');
    assert.equal(config.s3.secretAccessKey, 'user-secret');
    assert.equal(config.s3.forcePathStyle, true);
    assert.equal(config.s3.signedUrlExpiresInSeconds, 123);
  });

  it('resolves configuration from environment variables', () => {
    const config = resolveStorageConfig(
      {},
      {
        STORAGE_DEFAULT_BUCKET: 'env-bucket',
        STORAGE_S3_REGION: 'us-east-2',
        STORAGE_S3_ACCESS_KEY_ID: 'env-key',
        STORAGE_S3_SECRET_ACCESS_KEY: 'env-secret',
        STORAGE_S3_FORCE_PATH_STYLE: '1',
        STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS: '600',
        STORAGE_TEST_MODE: 'true'
      }
    );

    assert.equal(config.defaultBucket, 'env-bucket');
    assert.equal(config.s3.region, 'us-east-2');
    assert.equal(config.s3.accessKeyId, 'env-key');
    assert.equal(config.s3.secretAccessKey, 'env-secret');
    assert.equal(config.s3.forcePathStyle, true);
    assert.equal(config.s3.signedUrlExpiresInSeconds, 600);
    assert.equal(config.testMode, true);
  });

  it('uses the provider bucket as the default bucket fallback', () => {
    const config = resolveStorageConfig(
      {},
      {
        STORAGE_S3_BUCKET: 'provider-bucket',
        STORAGE_S3_REGION: 'us-east-2',
        STORAGE_S3_ACCESS_KEY_ID: 'env-key',
        STORAGE_S3_SECRET_ACCESS_KEY: 'env-secret'
      }
    );

    assert.equal(config.defaultBucket, 'provider-bucket');
    assert.equal(config.s3.bucket, 'provider-bucket');
  });

  it('supports custom environment variable names', () => {
    const config = resolveStorageConfig(
      {
        envVarNames: {
          STORAGE_DEFAULT_BUCKET: 'CUSTOM_BUCKET',
          STORAGE_S3_REGION: 'CUSTOM_REGION',
          STORAGE_S3_ACCESS_KEY_ID: 'CUSTOM_KEY',
          STORAGE_S3_SECRET_ACCESS_KEY: 'CUSTOM_SECRET'
        }
      },
      {
        CUSTOM_BUCKET: 'custom-bucket',
        CUSTOM_REGION: 'ap-southeast-1',
        CUSTOM_KEY: 'custom-key',
        CUSTOM_SECRET: 'custom-secret'
      }
    );

    assert.equal(config.defaultBucket, 'custom-bucket');
    assert.equal(config.s3.region, 'ap-southeast-1');
    assert.equal(config.s3.accessKeyId, 'custom-key');
    assert.equal(config.s3.secretAccessKey, 'custom-secret');
  });

  it('preserves bucket precedence when both defaultBucket and provider bucket are set', () => {
    const config = resolveStorageConfig(
      {
        defaultBucket: 'default-bucket',
        s3: {
          bucket: 'provider-bucket',
          region: 'us-east-1',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        }
      },
      {}
    );

    assert.equal(config.defaultBucket, 'default-bucket');
    assert.equal(config.s3.bucket, 'provider-bucket');
  });

  it('defaults forcePathStyle to false and signedUrlExpiresInSeconds to the package default', () => {
    const config = resolveStorageConfig(
      {
        defaultBucket: 'bucket',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        }
      },
      {}
    );

    assert.equal(config.s3.forcePathStyle, false);
    assert.equal(config.s3.signedUrlExpiresInSeconds, 900);
  });

  it('clamps signed URL expiry to the safe max', () => {
    const config = resolveStorageConfig(
      {
        defaultBucket: 'bucket',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          signedUrlExpiresInSeconds: MAX_SIGNED_URL_EXPIRES_IN_SECONDS + 100
        }
      },
      {}
    );

    assert.equal(config.s3.signedUrlExpiresInSeconds, MAX_SIGNED_URL_EXPIRES_IN_SECONDS);
  });

  it('throws for unsupported provider values', () => {
    assert.throws(
      () =>
        resolveStorageConfig(
          {
            provider: 'gcs' as never,
            defaultBucket: 'bucket',
            s3: {
              region: 'us-east-1',
              accessKeyId: 'key',
              secretAccessKey: 'secret'
            }
          },
          {}
        ),
      StorageConfigurationError
    );
  });

  it('throws when signed URL expiry from the environment is not numeric', () => {
    assert.throws(
      () =>
        resolveStorageConfig(
          {},
          {
            STORAGE_DEFAULT_BUCKET: 'env-bucket',
            STORAGE_S3_REGION: 'us-east-1',
            STORAGE_S3_ACCESS_KEY_ID: 'env-key',
            STORAGE_S3_SECRET_ACCESS_KEY: 'env-secret',
            STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS: 'not-a-number'
          }
        ),
      StorageConfigurationError
    );
  });

  it('resolves multiple named storage instances from prefixed environment variables', () => {
    const configs = resolveStorageConfigs(
      {},
      {
        STORAGE_INSTANCES: 'default,private',
        STORAGE_DEFAULT_BUCKET: 'public-assets',
        STORAGE_S3_REGION: 'us-east-1',
        STORAGE_S3_ACCESS_KEY_ID: 'public-key',
        STORAGE_S3_SECRET_ACCESS_KEY: 'public-secret',
        STORAGE_PRIVATE_DEFAULT_BUCKET: 'private-assets',
        STORAGE_PRIVATE_S3_REGION: 'eu-west-1',
        STORAGE_PRIVATE_S3_ACCESS_KEY_ID: 'private-key',
        STORAGE_PRIVATE_S3_SECRET_ACCESS_KEY: 'private-secret'
      }
    );

    assert.equal(configs.defaultInstance, 'default');
    assert.deepEqual(Object.keys(configs.storages).sort(), ['default', 'private']);
    assert.equal(configs.storages.default?.defaultBucket, 'public-assets');
    assert.equal(configs.storages.private?.defaultBucket, 'private-assets');
    assert.equal(configs.storages.private?.s3.region, 'eu-west-1');
  });

  it('supports a named default instance for multi-storage config resolution', () => {
    const configs = resolveStorageConfigs(
      {
        storages: {
          media: {
            defaultBucket: 'media-bucket',
            s3: {
              region: 'us-east-1',
              accessKeyId: 'media-key',
              secretAccessKey: 'media-secret'
            }
          },
          backups: {
            defaultBucket: 'backup-bucket',
            s3: {
              region: 'us-west-2',
              accessKeyId: 'backup-key',
              secretAccessKey: 'backup-secret'
            }
          }
        },
        defaultInstance: 'backups'
      },
      {}
    );

    assert.equal(configs.defaultInstance, 'backups');
    assert.equal(configs.storages.backups?.defaultBucket, 'backup-bucket');
    assert.equal(configs.storages.media?.defaultBucket, 'media-bucket');
  });
});

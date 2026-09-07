import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MAX_SIGNED_URL_EXPIRES_IN_SECONDS } from './defaults.js';
import { clampSignedUrlExpiresInSeconds, validateStorageConfig } from './validation.js';
import { StorageConfigurationError } from '../errors.js';

import type { ResolvedStorageConfig } from './interfaces.js';

function createConfig(overrides: Partial<ResolvedStorageConfig> = {}): ResolvedStorageConfig {
  return {
    provider: 's3',
    defaultBucket: 'bucket',
    testMode: false,
    s3: {
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: false,
      bucket: 'bucket',
      signedUrlExpiresInSeconds: 900,
      ...overrides.s3
    },
    ...overrides
  };
}

describe('validateStorageConfig', () => {
  it('throws when the region is missing', () => {
    assert.throws(
      () =>
        validateStorageConfig(
          createConfig({
            s3: {
              region: '',
              accessKeyId: 'key',
              secretAccessKey: 'secret',
              forcePathStyle: false,
              bucket: 'bucket',
              signedUrlExpiresInSeconds: 900
            }
          })
        ),
      StorageConfigurationError
    );
  });

  it('throws when credentials are missing', () => {
    assert.throws(
      () =>
        validateStorageConfig(
          createConfig({
            s3: {
              region: 'us-east-1',
              accessKeyId: '',
              secretAccessKey: '',
              forcePathStyle: false,
              bucket: 'bucket',
              signedUrlExpiresInSeconds: 900
            }
          })
        ),
      StorageConfigurationError
    );
  });

  it('throws when the default bucket is missing', () => {
    assert.throws(
      () =>
        validateStorageConfig(
          createConfig({
            defaultBucket: ''
          })
        ),
      StorageConfigurationError
    );
  });

  it('throws when the endpoint is not a valid URL', () => {
    assert.throws(
      () =>
        validateStorageConfig(
          createConfig({
            s3: {
              region: 'us-east-1',
              accessKeyId: 'key',
              secretAccessKey: 'secret',
              forcePathStyle: false,
              bucket: 'bucket',
              endpoint: 'not-a-url',
              signedUrlExpiresInSeconds: 900
            }
          })
        ),
      StorageConfigurationError
    );
  });

  it('normalizes whitespace-only optional fields to undefined', () => {
    const config = validateStorageConfig(
      createConfig({
        defaultBucket: ' bucket ',
        s3: {
          region: ' us-east-1 ',
          accessKeyId: ' key ',
          secretAccessKey: ' secret ',
          forcePathStyle: false,
          bucket: 'bucket',
          endpoint: ' https://storage.example.com ',
          publicBaseUrl: '   ',
          sessionToken: '   ',
          signedUrlExpiresInSeconds: 900
        }
      })
    );

    assert.equal(config.defaultBucket, 'bucket');
    assert.equal(config.s3.region, 'us-east-1');
    assert.equal(config.s3.accessKeyId, 'key');
    assert.equal(config.s3.secretAccessKey, 'secret');
    assert.equal(config.s3.endpoint, 'https://storage.example.com');
    assert.equal(config.s3.publicBaseUrl, undefined);
    assert.equal(config.s3.sessionToken, undefined);
  });
});

describe('clampSignedUrlExpiresInSeconds', () => {
  it('clamps values above the safe maximum', () => {
    assert.equal(
      clampSignedUrlExpiresInSeconds(MAX_SIGNED_URL_EXPIRES_IN_SECONDS + 1),
      MAX_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });

  it('throws when the value is zero or negative', () => {
    assert.throws(() => clampSignedUrlExpiresInSeconds(0), StorageConfigurationError);
    assert.throws(() => clampSignedUrlExpiresInSeconds(-1), StorageConfigurationError);
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MockStorageProvider } from './mock-storage.provider.js';
import { createStorageProvider } from './provider-factory.js';
import { S3StorageProvider } from './s3-storage.provider.js';

import type { ResolvedStorageConfig } from '../config/interfaces.js';

function createConfig(testMode = false): ResolvedStorageConfig {
  return {
    provider: 's3',
    defaultBucket: 'default-bucket',
    testMode,
    s3: {
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: false,
      bucket: 'provider-bucket',
      signedUrlExpiresInSeconds: 300
    }
  };
}

describe('createStorageProvider', () => {
  it('returns the mock provider when explicitly requested', () => {
    const provider = createStorageProvider(createConfig(), { useMock: true });

    assert.ok(provider instanceof MockStorageProvider);
  });

  it('returns the mock provider when testMode is enabled', () => {
    const provider = createStorageProvider(createConfig(true));

    assert.ok(provider instanceof MockStorageProvider);
  });

  it('returns the S3 provider for non-test production config', () => {
    const provider = createStorageProvider(createConfig(false));

    assert.ok(provider instanceof S3StorageProvider);
  });
});

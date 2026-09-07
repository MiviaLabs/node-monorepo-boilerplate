import { describe } from 'node:test';

import { MockStorageProvider } from './mock-storage.provider.js';
import { runStorageProviderContract } from './storage-provider.contract.js';

import type { ResolvedStorageConfig } from '../config/interfaces.js';

function createConfig(): ResolvedStorageConfig {
  return {
    provider: 's3',
    defaultBucket: 'default-bucket',
    testMode: true,
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

describe('MockStorageProvider contract', () => {
  runStorageProviderContract('mock provider', async () => {
    let tick = 0;

    return new MockStorageProvider(createConfig(), {
      clock: () => new Date(`2026-03-23T00:00:${String(tick++).padStart(2, '0')}Z`)
    });
  });
});

import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import { StorageService } from './storage.service.js';
import { SignedUrlMethod } from '../providers/storage-provider.interface.js';

import type { IStorageProvider } from '../providers/storage-provider.interface.js';

function createProvider(): IStorageProvider {
  return {
    putObject: async (input) => ({
      bucket: input.bucket ?? 'default-bucket',
      key: input.key,
      etag: 'etag'
    }),
    getObject: async (input) => ({
      bucket: input.bucket ?? 'default-bucket',
      key: input.key,
      body: Readable.from(['payload'])
    }),
    deleteObject: async (input) => ({
      bucket: input.bucket ?? 'default-bucket',
      key: input.key,
      deleted: true
    }),
    headObject: async (input) => ({
      bucket: input.bucket ?? 'default-bucket',
      key: input.key
    }),
    objectExists: async () => true,
    copyObject: async (input) => ({
      bucket: input.destination.bucket ?? 'default-bucket',
      key: input.destination.key,
      etag: 'copy-etag'
    }),
    getSignedUploadUrl: async (input) => ({
      url: 'https://upload.example',
      method: SignedUrlMethod.PUT,
      expiresAt: new Date('2026-03-23T00:01:00Z'),
      bucket: input.bucket ?? 'default-bucket',
      key: input.key
    }),
    getSignedDownloadUrl: async (input) => ({
      url: 'https://download.example',
      method: SignedUrlMethod.GET,
      expiresAt: new Date('2026-03-23T00:02:00Z'),
      bucket: input.bucket ?? 'default-bucket',
      key: input.key
    })
  };
}

describe('StorageService', () => {
  it('maps service methods 1:1 onto the provider', async () => {
    const service = new StorageService(createProvider());

    const putResult = await service.putObject({ key: 'avatar.png', body: 'data' });
    const existsResult = await service.objectExists({ key: 'avatar.png' });
    const signedResult = await service.getSignedDownloadUrl({ key: 'avatar.png' });

    assert.equal(putResult.bucket, 'default-bucket');
    assert.equal(existsResult, true);
    assert.equal(signedResult.method, 'GET');
  });
});

import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { StorageObjectNotFoundError } from '../errors.js';

import type { IStorageProvider } from './storage-provider.interface.js';

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

export type StorageProviderFactory = () => Promise<IStorageProvider> | IStorageProvider;

export function runStorageProviderContract(
  name: string,
  createProvider: StorageProviderFactory
): void {
  test(`${name}: bucket overrides, metadata normalization, and streams`, async () => {
    const provider = await createProvider();

    await provider.putObject({
      bucket: 'tenant-a',
      key: 'reports/latest.txt',
      body: Readable.from(['hello world']),
      contentType: 'text/plain',
      metadata: {
        Source: 'suite',
        'X-Trace': 'abc123'
      }
    });

    const firstRead = await provider.getObject({ bucket: 'tenant-a', key: 'reports/latest.txt' });
    const secondRead = await provider.getObject({ bucket: 'tenant-a', key: 'reports/latest.txt' });
    const head = await provider.headObject({ bucket: 'tenant-a', key: 'reports/latest.txt' });

    assert.notEqual(firstRead.body, secondRead.body);
    assert.equal(await streamToString(firstRead.body), 'hello world');
    assert.equal(await streamToString(secondRead.body), 'hello world');
    assert.equal(head.bucket, 'tenant-a');
    assert.equal(head.contentType, 'text/plain');
    assert.equal(head.metadata?.['source'], 'suite');
    assert.equal(head.metadata?.['x-trace'], 'abc123');
  });

  test(`${name}: delete and exists semantics`, async () => {
    const provider = await createProvider();

    await provider.putObject({ key: 'delete-me.txt', body: 'bye' });
    assert.equal(await provider.objectExists({ key: 'delete-me.txt' }), true);

    const deleted = await provider.deleteObject({ key: 'delete-me.txt' });
    assert.equal(deleted.deleted, true);
    assert.equal(await provider.objectExists({ key: 'delete-me.txt' }), false);
    const deletedAgain = await provider.deleteObject({ key: 'delete-me.txt' });
    assert.equal(deletedAgain.deleted, true);
    await assert.rejects(
      () => provider.getObject({ key: 'delete-me.txt' }),
      StorageObjectNotFoundError
    );
  });

  test(`${name}: falls back to defaultBucket before provider bucket`, async () => {
    const provider = await createProvider();

    await provider.putObject({ key: 'fallback.txt', body: 'fallback' });

    assert.equal(await provider.objectExists({ key: 'fallback.txt' }), true);
    assert.equal(
      await provider.objectExists({ bucket: 'provider-bucket', key: 'fallback.txt' }),
      false
    );

    const head = await provider.headObject({ key: 'fallback.txt' });
    const download = await provider.getSignedDownloadUrl({ key: 'fallback.txt' });

    assert.equal(head.bucket, 'default-bucket');
    assert.equal(download.bucket, 'default-bucket');
  });

  test(`${name}: copy snapshots the source object`, async () => {
    const provider = await createProvider();

    await provider.putObject({
      bucket: 'source-a',
      key: 'manual.txt',
      body: 'v1',
      metadata: { Stage: 'source' }
    });

    await provider.copyObject({
      source: { bucket: 'source-a', key: 'manual.txt' },
      destination: { bucket: 'archive-a', key: 'manual-copy.txt' }
    });

    await provider.putObject({
      bucket: 'source-a',
      key: 'manual.txt',
      body: 'v2',
      metadata: { Stage: 'updated' }
    });

    const copied = await provider.getObject({ bucket: 'archive-a', key: 'manual-copy.txt' });
    assert.equal(await streamToString(copied.body), 'v1');
    assert.equal(copied.metadata?.['stage'], 'source');
  });

  test(`${name}: signed URL helpers expose stable contract fields`, async () => {
    const provider = await createProvider();

    await provider.putObject({ bucket: 'signed-bucket', key: 'signed.txt', body: 'payload' });

    const upload = await provider.getSignedUploadUrl({
      bucket: 'signed-bucket',
      key: 'signed.txt',
      expiresInSeconds: 60,
      contentType: 'text/plain',
      metadata: { Purpose: 'contract' }
    });
    const download = await provider.getSignedDownloadUrl({
      bucket: 'signed-bucket',
      key: 'signed.txt',
      expiresInSeconds: 120
    });

    assert.equal(upload.method, 'PUT');
    assert.equal(upload.bucket, 'signed-bucket');
    assert.equal(upload.key, 'signed.txt');
    assert.ok(upload.url.length > 0);
    assert.ok(upload.expiresAt instanceof Date);
    assert.equal(upload.headers?.['content-type'], 'text/plain');
    assert.ok(upload.headers);

    assert.equal(download.method, 'GET');
    assert.equal(download.bucket, 'signed-bucket');
    assert.equal(download.key, 'signed.txt');
    assert.ok(download.url.length > 0);
    assert.ok(download.expiresAt instanceof Date);
  });
}

import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import { StorageConfigurationError, StorageObjectNotFoundError } from '../errors.js';
import { MockStorageProvider } from './mock-storage.provider.js';

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

describe('MockStorageProvider', () => {
  it('stores content in memory and returns independent read streams', async () => {
    const provider = new MockStorageProvider(createConfig());

    await provider.putObject({
      key: 'avatar.png',
      body: Readable.from(['hello']),
      contentType: 'image/png',
      metadata: { origin: 'test' }
    });

    const firstRead = await provider.getObject({ key: 'avatar.png' });
    const secondRead = await provider.getObject({ key: 'avatar.png' });

    assert.notEqual(firstRead.body, secondRead.body);
    assert.equal(await streamToString(firstRead.body), 'hello');
    assert.equal(await streamToString(secondRead.body), 'hello');
    assert.equal(firstRead.contentType, 'image/png');
    assert.equal(firstRead.metadata?.origin, 'test');
  });

  it('overwrites an object and refreshes metadata deterministically from the clock', async () => {
    let tick = 0;
    const clock = () => new Date(`2026-03-23T00:00:0${tick++}Z`);
    const provider = new MockStorageProvider(createConfig(), { clock });

    await provider.putObject({ key: 'report.txt', body: 'v1', metadata: { version: '1' } });
    await provider.putObject({ key: 'report.txt', body: 'v2', metadata: { version: '2' } });

    const head = await provider.headObject({ key: 'report.txt' });

    assert.equal(head.metadata?.version, '2');
    assert.equal(head.lastModified?.toISOString(), '2026-03-23T00:00:01.000Z');
  });

  it('copies objects across buckets and preserves the original content', async () => {
    let tick = 0;
    const clock = () => new Date(`2026-03-23T00:00:0${tick++}Z`);
    const provider = new MockStorageProvider(createConfig(), { clock });

    await provider.putObject({
      bucket: 'source-bucket',
      key: 'docs/manual.pdf',
      body: Buffer.from('manual'),
      metadata: { copied: 'no' }
    });

    await provider.copyObject({
      source: { bucket: 'source-bucket', key: 'docs/manual.pdf' },
      destination: { bucket: 'archive-bucket', key: 'docs/manual-copy.pdf' }
    });

    const original = await provider.getObject({ bucket: 'source-bucket', key: 'docs/manual.pdf' });
    const copied = await provider.getObject({
      bucket: 'archive-bucket',
      key: 'docs/manual-copy.pdf'
    });

    assert.equal(await streamToString(original.body), 'manual');
    assert.equal(await streamToString(copied.body), 'manual');
    assert.equal(copied.lastModified?.toISOString(), '2026-03-23T00:00:01.000Z');
  });

  it('returns false for missing objects, throws for reads, and treats deletes as idempotent', async () => {
    const provider = new MockStorageProvider(createConfig());

    assert.equal(await provider.objectExists({ key: 'missing.txt' }), false);

    await assert.rejects(
      () => provider.getObject({ key: 'missing.txt' }),
      StorageObjectNotFoundError
    );

    const deleted = await provider.deleteObject({ key: 'missing.txt' });
    assert.equal(deleted.deleted, true);
  });

  it('keeps bucket and key pairs distinct even when both contain colons', async () => {
    const provider = new MockStorageProvider(createConfig());

    await provider.putObject({ bucket: 'a:b', key: 'c', body: 'first' });
    await provider.putObject({ bucket: 'a', key: 'b:c', body: 'second' });

    const first = await provider.getObject({ bucket: 'a:b', key: 'c' });
    const second = await provider.getObject({ bucket: 'a', key: 'b:c' });

    assert.equal(await streamToString(first.body), 'first');
    assert.equal(await streamToString(second.body), 'second');
  });

  it('simulates signed upload and download URLs with stable shape', async () => {
    const provider = new MockStorageProvider(createConfig(), {
      clock: () => new Date('2026-03-23T00:00:00Z')
    });

    await provider.putObject({ key: 'signed.txt', body: 'payload' });

    const upload = await provider.getSignedUploadUrl({
      key: 'signed.txt',
      expiresInSeconds: 60,
      contentType: 'text/plain',
      metadata: { purpose: 'test' }
    });
    const download = await provider.getSignedDownloadUrl({
      key: 'signed.txt',
      expiresInSeconds: 120
    });

    assert.equal(upload.method, 'PUT');
    assert.equal(upload.bucket, 'default-bucket');
    assert.equal(upload.headers?.['content-type'], 'text/plain');
    assert.equal(upload.headers?.['x-amz-meta-purpose'], 'test');
    assert.equal(upload.expiresAt.toISOString(), '2026-03-23T00:01:00.000Z');

    assert.equal(download.method, 'GET');
    assert.equal(download.bucket, 'default-bucket');
    assert.equal(download.expiresAt.toISOString(), '2026-03-23T00:02:00.000Z');
  });

  it('fails fast when a bucket cannot be resolved', async () => {
    const config = createConfig();
    config.defaultBucket = '';
    config.s3.bucket = '';
    const provider = new MockStorageProvider(config);

    await assert.rejects(
      () => provider.putObject({ key: 'missing-bucket.txt', body: 'x' }),
      StorageConfigurationError
    );
  });
});

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3ServiceException
} from '@aws-sdk/client-s3';

import {
  StorageConfigurationError,
  StorageObjectNotFoundError,
  StorageOperationError,
  StorageProviderError
} from '../errors.js';
import {
  buildS3ClientConfig,
  S3StorageProvider,
  type S3StorageProviderDependencies
} from './s3-storage.provider.js';
import { SignedUrlMethod } from './storage-provider.interface.js';
import { MAX_SIGNED_URL_EXPIRES_IN_SECONDS } from '../config/defaults.js';

import type { ResolvedStorageConfig } from '../config/interfaces.js';

function createConfig(): ResolvedStorageConfig {
  return {
    provider: 's3',
    defaultBucket: 'default-bucket',
    testMode: false,
    s3: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      sessionToken: 'token',
      forcePathStyle: true,
      bucket: 'provider-bucket',
      signedUrlExpiresInSeconds: 300
    }
  };
}

function createProvider(
  send: (command: unknown) => Promise<unknown>,
  signUrl?: S3StorageProviderDependencies['signUrl']
): S3StorageProvider {
  return new S3StorageProvider(createConfig(), {
    client: { send },
    signUrl
  });
}

describe('buildS3ClientConfig', () => {
  it('maps endpoint, credentials, session token, and forcePathStyle', () => {
    const clientConfig = buildS3ClientConfig(createConfig());

    assert.equal(clientConfig.region, 'us-east-1');
    assert.equal(clientConfig.endpoint, 'http://localhost:9000');
    assert.equal(clientConfig.forcePathStyle, true);
    assert.equal(clientConfig.requestChecksumCalculation, 'WHEN_REQUIRED');
    assert.equal(clientConfig.responseChecksumValidation, 'WHEN_REQUIRED');
    assert.deepEqual(clientConfig.credentials, {
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      sessionToken: 'token'
    });
  });
});

describe('S3StorageProvider', () => {
  it('sends PutObject with resolved bucket and normalized metadata', async () => {
    let seenCommand: PutObjectCommand | undefined;
    const provider = createProvider(async (command) => {
      seenCommand = command as PutObjectCommand;
      return {
        ETag: '"etag-value"',
        VersionId: 'v1'
      };
    });

    const result = await provider.putObject({
      key: 'avatars/user.png',
      body: Buffer.from('data'),
      contentLength: 4,
      contentType: 'image/png',
      metadata: { Origin: 'suite' }
    });

    assert.equal(result.bucket, 'default-bucket');
    assert.equal(result.etag, '"etag-value"');
    assert.equal(result.versionId, 'v1');
    assert.ok(seenCommand);
    assert.equal(seenCommand?.input.Bucket, 'default-bucket');
    assert.equal(seenCommand?.input.ContentLength, 4);
    assert.equal(seenCommand?.input.ContentType, 'image/png');
    assert.deepEqual(seenCommand?.input.Metadata, { origin: 'suite' });
  });

  it('maps getObject responses into the public contract', async () => {
    const provider = createProvider(async () => ({
      Body: Readable.from(['payload']),
      ContentType: 'text/plain',
      ContentLength: 7,
      ETag: '"etag"',
      LastModified: new Date('2026-03-23T00:00:00Z'),
      Metadata: {
        origin: 'suite'
      }
    }));

    const result = await provider.getObject({ key: 'docs/readme.txt' });
    const body = await streamToString(result.body);

    assert.equal(body, 'payload');
    assert.equal(result.bucket, 'default-bucket');
    assert.equal(result.contentType, 'text/plain');
    assert.equal(result.contentLength, 7);
    assert.equal(result.metadata?.origin, 'suite');
  });

  it('uses bucket overrides and PutObjectCommand for upload presigning', async () => {
    let seenCommand: unknown;
    let seenExpiresIn: number | undefined;
    const provider = createProvider(
      async () => ({}),
      async (_client, command, options) => {
        seenCommand = command;
        seenExpiresIn = options.expiresIn;
        return 'https://signed-upload.example';
      }
    );

    const result = await provider.getSignedUploadUrl({
      bucket: 'tenant-bucket',
      key: 'upload.txt',
      expiresInSeconds: 60,
      contentType: 'text/plain',
      metadata: { Purpose: 'suite' }
    });

    assert.ok(seenCommand instanceof PutObjectCommand);
    assert.equal(seenExpiresIn, 60);
    assert.equal(result.method, SignedUrlMethod.PUT);
    assert.equal(result.bucket, 'tenant-bucket');
    assert.equal(result.headers?.['content-type'], 'text/plain');
    assert.equal(result.headers?.['x-amz-meta-purpose'], 'suite');
  });

  it('clamps oversized upload expirations before presigning', async () => {
    let seenExpiresIn: number | undefined;
    const provider = createProvider(
      async () => ({}),
      async (_client, _command, options) => {
        seenExpiresIn = options.expiresIn;
        return 'https://signed-upload.example';
      }
    );

    await provider.getSignedUploadUrl({
      key: 'upload.txt',
      expiresInSeconds: MAX_SIGNED_URL_EXPIRES_IN_SECONDS + 1
    });

    assert.equal(seenExpiresIn, MAX_SIGNED_URL_EXPIRES_IN_SECONDS);
  });

  it('uses GetObjectCommand for download presigning without an existence precheck', async () => {
    let sendCalls = 0;
    let seenCommand: unknown;
    const provider = createProvider(
      async () => {
        sendCalls += 1;
        return {};
      },
      async (_client, command) => {
        seenCommand = command;
        return 'https://signed-download.example';
      }
    );

    const result = await provider.getSignedDownloadUrl({
      bucket: 'tenant-bucket',
      key: 'download.txt',
      expiresInSeconds: 120
    });

    assert.equal(sendCalls, 0);
    assert.ok(seenCommand instanceof GetObjectCommand);
    assert.equal(result.method, SignedUrlMethod.GET);
    assert.equal(result.bucket, 'tenant-bucket');
  });

  it('rejects invalid download expirations before presigning', async () => {
    let signUrlCalls = 0;
    const provider = createProvider(
      async () => ({}),
      async () => {
        signUrlCalls += 1;
        return 'https://signed-download.example';
      }
    );

    await assert.rejects(
      () =>
        provider.getSignedDownloadUrl({
          key: 'download.txt',
          expiresInSeconds: 0
        }),
      StorageConfigurationError
    );
    assert.equal(signUrlCalls, 0);
  });

  it('normalizes NoSuchKey into StorageObjectNotFoundError', async () => {
    const provider = createProvider(async () => {
      const error = new Error('missing');
      error.name = 'NoSuchKey';
      throw error;
    });

    await assert.rejects(
      () => provider.getObject({ bucket: 'tenant-bucket', key: 'missing.txt' }),
      StorageObjectNotFoundError
    );
  });

  it('deletes without a separate existence precheck', async () => {
    const commands: unknown[] = [];
    const provider = createProvider(async (command) => {
      commands.push(command);
      return {};
    });

    await provider.deleteObject({ key: 'existing.txt' });

    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.constructor.name, 'DeleteObjectCommand');
  });

  it('treats deleteObject as idempotent when S3 reports a missing key', async () => {
    const provider = createProvider(async () => {
      return {};
    });

    const result = await provider.deleteObject({ key: 'missing.txt' });

    assert.equal(result.deleted, true);
    assert.equal(result.bucket, 'default-bucket');
  });

  it('maps S3 service exceptions into StorageProviderError', async () => {
    const provider = createProvider(async () => {
      throw new S3ServiceException({
        name: 'S3ServiceException',
        $fault: 'client',
        $metadata: {
          httpStatusCode: 500
        },
        message: 'forbidden'
      });
    });

    await assert.rejects(() => provider.putObject({ key: 'broken.txt', body: 'x' }), {
      constructor: StorageProviderError
    });
  });

  it('maps generic failures into StorageOperationError', async () => {
    const provider = createProvider(async () => {
      throw new Error('boom');
    });

    await assert.rejects(() => provider.putObject({ key: 'broken.txt', body: 'x' }), {
      constructor: StorageOperationError
    });
  });

  it('returns false from objectExists when headObject reports NotFound', async () => {
    const provider = createProvider(async () => {
      const error = new Error('missing');
      error.name = 'NotFound';
      throw error;
    });

    assert.equal(await provider.objectExists({ key: 'missing.txt' }), false);
  });

  it('maps CopyObject inputs and response fields', async () => {
    let seenCommand: CopyObjectCommand | undefined;
    const provider = createProvider(async (command) => {
      seenCommand = command as CopyObjectCommand;
      return {
        CopyObjectResult: {
          ETag: '"copy-etag"'
        },
        VersionId: 'copy-v1'
      };
    });

    const result = await provider.copyObject({
      source: { bucket: 'source-bucket', key: 'nested/file.txt' },
      destination: { bucket: 'dest-bucket', key: 'copy.txt' }
    });

    assert.equal(result.bucket, 'dest-bucket');
    assert.equal(result.etag, '"copy-etag"');
    assert.equal(result.versionId, 'copy-v1');
    assert.equal(seenCommand?.input.Bucket, 'dest-bucket');
    assert.equal(seenCommand?.input.Key, 'copy.txt');
    assert.equal(seenCommand?.input.CopySource, 'source-bucket/nested/file.txt');
  });

  it('encodes reserved characters in CopySource without rewriting path separators', async () => {
    let seenCommand: CopyObjectCommand | undefined;
    const provider = createProvider(async (command) => {
      seenCommand = command as CopyObjectCommand;
      return {
        CopyObjectResult: {
          ETag: '"copy-etag"'
        }
      };
    });

    await provider.copyObject({
      source: { bucket: 'source:bucket', key: 'nested dir/file+name?#%.txt' },
      destination: { bucket: 'dest-bucket', key: 'copy.txt' }
    });

    assert.equal(
      seenCommand?.input.CopySource,
      'source%3Abucket/nested%20dir/file%2Bname%3F%23%25.txt'
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

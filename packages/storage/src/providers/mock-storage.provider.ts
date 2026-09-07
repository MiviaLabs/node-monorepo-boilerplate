import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { StorageConfigurationError, StorageObjectNotFoundError } from '../errors';
import { SignedUrlMethod } from './storage-provider.interface';

import type { IStorageProvider } from './storage-provider.interface';
import type { ResolvedStorageConfig } from '../config/interfaces';

const enum CopyAddressSide {
  SOURCE = 'source',
  DESTINATION = 'destination'
}

type PutObjectInput = Parameters<IStorageProvider['putObject']>[0];
type PutObjectResult = Awaited<ReturnType<IStorageProvider['putObject']>>;
type GetObjectInput = Parameters<IStorageProvider['getObject']>[0];
type GetObjectResult = Awaited<ReturnType<IStorageProvider['getObject']>>;
type DeleteObjectInput = Parameters<IStorageProvider['deleteObject']>[0];
type DeleteObjectResult = Awaited<ReturnType<IStorageProvider['deleteObject']>>;
type HeadObjectInput = Parameters<IStorageProvider['headObject']>[0];
type HeadObjectResult = Awaited<ReturnType<IStorageProvider['headObject']>>;
type ObjectExistsInput = Parameters<IStorageProvider['objectExists']>[0];
type ObjectExistsResult = Awaited<ReturnType<IStorageProvider['objectExists']>>;
type CopyObjectInput = Parameters<IStorageProvider['copyObject']>[0];
type CopyObjectResult = Awaited<ReturnType<IStorageProvider['copyObject']>>;
type GetSignedUploadUrlInput = Parameters<IStorageProvider['getSignedUploadUrl']>[0];
type GetSignedUploadUrlResult = Awaited<ReturnType<IStorageProvider['getSignedUploadUrl']>>;
type GetSignedDownloadUrlInput = Parameters<IStorageProvider['getSignedDownloadUrl']>[0];
type GetSignedDownloadUrlResult = Awaited<ReturnType<IStorageProvider['getSignedDownloadUrl']>>;

type StoredObjectRecord = {
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  etag: string;
  contentLength: number;
  lastModified: Date;
};

type InitialObject = {
  bucket?: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
};

export interface MockStorageProviderOptions {
  clock?: () => Date;
  initialObjects?: InitialObject[];
}

function cloneMetadata(metadata?: Record<string, string>): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const normalizedEntries = Object.entries(metadata).map(([key, value]) => [
    key.trim().toLowerCase(),
    value
  ]);

  return Object.fromEntries(normalizedEntries);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

async function readBody(body: Buffer | Uint8Array | string | Readable): Promise<Buffer> {
  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (Buffer.isBuffer(body)) {
    return Buffer.from(body);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function getEtag(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function buildStorageKey(bucket: string, key: string): string {
  return JSON.stringify([bucket, key]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringField(record: Record<string, unknown>, fieldName: string): string | undefined {
  return normalizeOptionalString(record[fieldName]);
}

function resolveCopyAddress(
  input: CopyObjectInput,
  side: CopyAddressSide
): { bucket?: string; key: string } {
  const record = input as unknown as Record<string, unknown>;
  const nested = isObject(record[side]) ? record[side] : undefined;
  const prefix = side === CopyAddressSide.SOURCE ? 'source' : 'destination';

  const key =
    (nested ? getStringField(nested, 'key') : undefined) ?? getStringField(record, `${prefix}Key`);
  const bucket =
    (nested ? getStringField(nested, 'bucket') : undefined) ??
    getStringField(record, `${prefix}Bucket`);

  if (!key) {
    throw new StorageConfigurationError(`${prefix} key is required`);
  }

  return { bucket, key };
}

export class MockStorageProvider implements IStorageProvider {
  private readonly objects = new Map<string, StoredObjectRecord>();

  private readonly clock: () => Date;

  constructor(
    private readonly config: ResolvedStorageConfig,
    options: MockStorageProviderOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());

    for (const object of options.initialObjects ?? []) {
      const bucket = object.bucket ?? this.getDefaultBucket();
      const body = Buffer.isBuffer(object.body)
        ? Buffer.from(object.body)
        : Buffer.from(object.body);
      const now = this.clock();
      const record: StoredObjectRecord = {
        body,
        contentType: normalizeOptionalString(object.contentType),
        metadata: cloneMetadata(object.metadata),
        etag: getEtag(body),
        contentLength: body.byteLength,
        lastModified: now
      };

      this.objects.set(buildStorageKey(bucket, object.key), record);
    }
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const bucket = this.resolveBucket(input.bucket);
    const body = await readBody(input.body);
    const lastModified = this.clock();
    const record: StoredObjectRecord = {
      body,
      contentType: normalizeOptionalString(input.contentType),
      metadata: cloneMetadata(input.metadata),
      etag: getEtag(body),
      contentLength: body.byteLength,
      lastModified
    };

    this.objects.set(buildStorageKey(bucket, input.key), record);

    return {
      bucket,
      key: input.key,
      etag: record.etag
    } as PutObjectResult;
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const bucket = this.resolveBucket(input.bucket);
    const record = this.requireObject(bucket, input.key);

    return {
      bucket,
      key: input.key,
      body: Readable.from(record.body),
      contentType: record.contentType,
      contentLength: record.contentLength,
      etag: record.etag,
      lastModified: record.lastModified,
      metadata: cloneMetadata(record.metadata)
    } as GetObjectResult;
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const bucket = this.resolveBucket(input.bucket);
    this.objects.delete(buildStorageKey(bucket, input.key));

    return {
      bucket,
      key: input.key,
      deleted: true
    } as DeleteObjectResult;
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const bucket = this.resolveBucket(input.bucket);
    const record = this.requireObject(bucket, input.key);

    return {
      bucket,
      key: input.key,
      contentType: record.contentType,
      contentLength: record.contentLength,
      etag: record.etag,
      lastModified: record.lastModified,
      metadata: cloneMetadata(record.metadata)
    } as HeadObjectResult;
  }

  async objectExists(input: ObjectExistsInput): Promise<ObjectExistsResult> {
    const bucket = this.resolveBucket(input.bucket);
    return this.objects.has(buildStorageKey(bucket, input.key)) as ObjectExistsResult;
  }

  async copyObject(input: CopyObjectInput): Promise<CopyObjectResult> {
    const source = resolveCopyAddress(input, CopyAddressSide.SOURCE);
    const destination = resolveCopyAddress(input, CopyAddressSide.DESTINATION);
    const sourceBucket = this.resolveBucket(source.bucket);
    const destinationBucket = this.resolveBucket(destination.bucket);
    const sourceRecord = this.requireObject(sourceBucket, source.key);
    const copiedAt = this.clock();
    const copiedRecord: StoredObjectRecord = {
      ...sourceRecord,
      body: Buffer.from(sourceRecord.body),
      metadata: cloneMetadata(sourceRecord.metadata),
      lastModified: copiedAt
    };

    this.objects.set(buildStorageKey(destinationBucket, destination.key), copiedRecord);

    return {
      bucket: destinationBucket,
      key: destination.key,
      etag: copiedRecord.etag
    } as CopyObjectResult;
  }

  async getSignedUploadUrl(input: GetSignedUploadUrlInput): Promise<GetSignedUploadUrlResult> {
    const bucket = this.resolveBucket(input.bucket);
    const expiresAt = new Date(
      this.clock().getTime() +
        (input.expiresInSeconds ?? this.config.s3.signedUrlExpiresInSeconds) * 1000
    );
    const metadata = cloneMetadata(input.metadata);
    const headers = {
      ...(input.contentType ? { 'content-type': input.contentType } : {}),
      ...Object.fromEntries(
        Object.entries(metadata ?? {}).map(([key, value]) => [`x-amz-meta-${key}`, value])
      )
    };

    return {
      url: `mock://storage/upload/${encodeURIComponent(bucket)}/${encodeURIComponent(input.key)}`,
      method: SignedUrlMethod.PUT,
      expiresAt,
      bucket,
      key: input.key,
      headers
    } as GetSignedUploadUrlResult;
  }

  async getSignedDownloadUrl(
    input: GetSignedDownloadUrlInput
  ): Promise<GetSignedDownloadUrlResult> {
    const bucket = this.resolveBucket(input.bucket);
    const expiresAt = new Date(
      this.clock().getTime() +
        (input.expiresInSeconds ?? this.config.s3.signedUrlExpiresInSeconds) * 1000
    );

    return {
      url: `mock://storage/download/${encodeURIComponent(bucket)}/${encodeURIComponent(input.key)}`,
      method: SignedUrlMethod.GET,
      expiresAt,
      bucket,
      key: input.key
    } as GetSignedDownloadUrlResult;
  }

  private getDefaultBucket(): string {
    return this.config.defaultBucket || this.config.s3.bucket;
  }

  private resolveBucket(bucket: string | undefined): string {
    const resolvedBucket = bucket ?? this.getDefaultBucket() ?? this.config.s3.bucket;

    if (!resolvedBucket) {
      throw new StorageConfigurationError('A bucket is required for storage operations');
    }

    return resolvedBucket;
  }

  private requireObject(bucket: string, key: string): StoredObjectRecord {
    const record = this.objects.get(buildStorageKey(bucket, key));

    if (!record) {
      throw new StorageObjectNotFoundError(bucket, key);
    }

    return record;
  }
}

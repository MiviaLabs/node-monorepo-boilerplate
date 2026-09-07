import { Readable } from 'node:stream';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException
} from '@aws-sdk/client-s3';
import {
  RequestChecksumCalculation,
  ResponseChecksumValidation
} from '@aws-sdk/middleware-flexible-checksums';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  SignedUrlMethod,
  type CopyObjectInput,
  type CopyObjectResult,
  type DeleteObjectInput,
  type DeleteObjectResult,
  type GetObjectInput,
  type GetObjectResult,
  type GetSignedDownloadUrlInput,
  type GetSignedUploadUrlInput,
  type HeadObjectInput,
  type HeadObjectResult,
  type IStorageProvider,
  type ObjectExistsInput,
  type ObjectExistsResult,
  type PutObjectInput,
  type PutObjectResult,
  type SignedUrlResult,
  type StorageBodyInput,
  type StorageMetadata
} from './storage-provider.interface';
import { clampSignedUrlExpiresInSeconds } from '../config/validation';
import { StorageObjectNotFoundError, StorageOperationError, StorageProviderError } from '../errors';

import type { ResolvedStorageConfig } from '../config/interfaces';

type S3LikeClient = Pick<S3Client, 'send'>;
type S3ClientConfigInput = NonNullable<ConstructorParameters<typeof S3Client>[0]>;

type SignUrl = (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number }
) => Promise<string>;

export interface S3StorageProviderDependencies {
  client?: S3LikeClient;
  createClient?: (config: S3ClientConfigInput) => S3Client;
  signUrl?: SignUrl;
}

function normalizeMetadata(metadata?: StorageMetadata): StorageMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).map(([key, value]) => [key.trim().toLowerCase(), value]);
  return Object.fromEntries(entries);
}

function toSdkBody(body: StorageBodyInput): StorageBodyInput {
  return body;
}

function toReadable(body: unknown): Readable {
  if (body instanceof Readable) {
    return body;
  }

  if (body && typeof body === 'object' && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }

  if (
    body &&
    typeof body === 'object' &&
    'transformToWebStream' in body &&
    typeof (body as { transformToWebStream?: () => ReadableStream<Uint8Array> })
      .transformToWebStream === 'function'
  ) {
    return Readable.fromWeb(
      (
        body as {
          transformToWebStream: () => ReadableStream<Uint8Array>;
        }
      ).transformToWebStream() as never
    );
  }

  throw new StorageOperationError(
    'Unable to convert S3 object body into a Node Readable',
    'getObject'
  );
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return error.name === 'NoSuchKey' || error.name === 'NotFound';
  }

  if (isNamedError(error)) {
    const name = String(error.name);
    return name === 'NoSuchKey' || name === 'NotFound';
  }

  return false;
}

function isNamedError(error: unknown): error is { name: unknown } {
  return Boolean(error && typeof error === 'object' && 'name' in error);
}

function toCopySource(sourceBucket: string, sourceKey: string): string {
  return `${encodeURIComponent(sourceBucket)}/${sourceKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function toSignedHeaders(input: {
  contentType?: string;
  metadata?: StorageMetadata;
}): Record<string, string> | undefined {
  const metadata = normalizeMetadata(input.metadata);
  const headers = {
    ...(input.contentType ? { 'content-type': input.contentType } : {}),
    ...Object.fromEntries(
      Object.entries(metadata ?? {}).map(([key, value]) => [`x-amz-meta-${key}`, value])
    )
  };

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function buildS3ClientConfig(config: ResolvedStorageConfig): S3ClientConfigInput {
  return {
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: config.s3.forcePathStyle,
    requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED,
    responseChecksumValidation: ResponseChecksumValidation.WHEN_REQUIRED,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      ...(config.s3.sessionToken ? { sessionToken: config.s3.sessionToken } : {})
    }
  };
}

export class S3StorageProvider implements IStorageProvider {
  private readonly client: S3LikeClient;

  private readonly signUrl: SignUrl;

  constructor(
    private readonly config: ResolvedStorageConfig,
    dependencies: S3StorageProviderDependencies = {}
  ) {
    this.client =
      dependencies.client ??
      (dependencies.createClient
        ? dependencies.createClient(buildS3ClientConfig(config))
        : new S3Client(buildS3ClientConfig(config)));
    this.signUrl = dependencies.signUrl ?? (getSignedUrl as SignUrl);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const bucket = this.resolveBucket(input.bucket);

    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: toSdkBody(input.body),
          ContentLength: input.contentLength,
          ContentType: input.contentType,
          Metadata: normalizeMetadata(input.metadata)
        })
      );

      return {
        bucket,
        key: input.key,
        etag: response.ETag,
        versionId: response.VersionId
      };
    } catch (error) {
      throw this.normalizeError('putObject', error, bucket, input.key);
    }
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const bucket = this.resolveBucket(input.bucket);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.key
        })
      );

      return {
        bucket,
        key: input.key,
        body: toReadable(response.Body),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: normalizeMetadata(response.Metadata)
      };
    } catch (error) {
      throw this.normalizeError('getObject', error, bucket, input.key);
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const bucket = this.resolveBucket(input.bucket);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: input.key
        })
      );

      return {
        bucket,
        key: input.key,
        deleted: true
      };
    } catch (error) {
      throw this.normalizeError('deleteObject', error, bucket, input.key);
    }
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const bucket = this.resolveBucket(input.bucket);

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: input.key
        })
      );

      return {
        bucket,
        key: input.key,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: normalizeMetadata(response.Metadata)
      };
    } catch (error) {
      throw this.normalizeError('headObject', error, bucket, input.key);
    }
  }

  async objectExists(input: ObjectExistsInput): Promise<ObjectExistsResult> {
    try {
      await this.headObject(input);
      return true;
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        return false;
      }

      throw error;
    }
  }

  async copyObject(input: CopyObjectInput): Promise<CopyObjectResult> {
    const sourceBucket = this.resolveBucket(input.source.bucket);
    const destinationBucket = this.resolveBucket(input.destination.bucket);

    try {
      const response = await this.client.send(
        new CopyObjectCommand({
          Bucket: destinationBucket,
          Key: input.destination.key,
          CopySource: toCopySource(sourceBucket, input.source.key)
        })
      );

      return {
        bucket: destinationBucket,
        key: input.destination.key,
        etag: response.CopyObjectResult?.ETag,
        versionId: response.VersionId
      };
    } catch (error) {
      throw this.normalizeError('copyObject', error, destinationBucket, input.destination.key);
    }
  }

  async getSignedUploadUrl(input: GetSignedUploadUrlInput): Promise<SignedUrlResult> {
    const bucket = this.resolveBucket(input.bucket);
    const expiresIn = this.resolveSignedUrlExpiresInSeconds(input.expiresInSeconds);

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ContentType: input.contentType,
        Metadata: normalizeMetadata(input.metadata)
      });
      const url = await this.signUrl(this.client as S3Client, command, { expiresIn });

      return {
        url,
        method: SignedUrlMethod.PUT,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        bucket,
        key: input.key,
        headers: toSignedHeaders(input)
      };
    } catch (error) {
      throw this.normalizeError('getSignedUploadUrl', error, bucket, input.key);
    }
  }

  async getSignedDownloadUrl(input: GetSignedDownloadUrlInput): Promise<SignedUrlResult> {
    const bucket = this.resolveBucket(input.bucket);
    const expiresIn = this.resolveSignedUrlExpiresInSeconds(input.expiresInSeconds);

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: input.key
      });
      const url = await this.signUrl(this.client as S3Client, command, { expiresIn });

      return {
        url,
        method: SignedUrlMethod.GET,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        bucket,
        key: input.key
      };
    } catch (error) {
      throw this.normalizeError('getSignedDownloadUrl', error, bucket, input.key);
    }
  }

  private resolveBucket(bucket?: string): string {
    return bucket ?? this.config.defaultBucket ?? this.config.s3.bucket;
  }

  private resolveSignedUrlExpiresInSeconds(expiresInSeconds?: number): number {
    return clampSignedUrlExpiresInSeconds(
      expiresInSeconds ?? this.config.s3.signedUrlExpiresInSeconds
    );
  }

  private normalizeError(operation: string, error: unknown, bucket: string, key: string): Error {
    if (isNotFoundError(error)) {
      return new StorageObjectNotFoundError(bucket, key, error);
    }

    if (error instanceof S3ServiceException) {
      return new StorageProviderError(`S3 ${operation} failed`, 's3', error);
    }

    return new StorageOperationError(`Storage ${operation} failed`, operation, error);
  }
}

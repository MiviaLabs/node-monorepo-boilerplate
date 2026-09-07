import type { Readable } from 'node:stream';

export type StorageBodyInput = Buffer | Uint8Array | string | Readable;

export type StorageMetadata = Record<string, string>;

export const enum SignedUrlMethod {
  GET = 'GET',
  PUT = 'PUT'
}

export interface StorageObjectLocator {
  key: string;
  bucket?: string;
}

export interface PutObjectInput extends StorageObjectLocator {
  body: StorageBodyInput;
  contentLength?: number;
  contentType?: string;
  metadata?: StorageMetadata;
}

export interface PutObjectResult {
  bucket: string;
  key: string;
  etag?: string;
  versionId?: string;
}

export type GetObjectInput = StorageObjectLocator;

export interface GetObjectResult {
  bucket: string;
  key: string;
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
  metadata?: StorageMetadata;
}

export type DeleteObjectInput = StorageObjectLocator;

export interface DeleteObjectResult {
  bucket: string;
  key: string;
  deleted: true;
}

export type HeadObjectInput = StorageObjectLocator;

export interface HeadObjectResult {
  bucket: string;
  key: string;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
  metadata?: StorageMetadata;
}

export type ObjectExistsInput = StorageObjectLocator;

export type ObjectExistsResult = boolean;

export interface CopyObjectInput {
  source: StorageObjectLocator;
  destination: StorageObjectLocator;
}

export interface CopyObjectResult {
  bucket: string;
  key: string;
  etag?: string;
  versionId?: string;
}

export interface GetSignedUploadUrlInput extends StorageObjectLocator {
  expiresInSeconds?: number;
  contentType?: string;
  metadata?: StorageMetadata;
}

export interface GetSignedDownloadUrlInput extends StorageObjectLocator {
  expiresInSeconds?: number;
}

export interface SignedUrlResult {
  url: string;
  method: SignedUrlMethod;
  expiresAt: Date;
  bucket: string;
  key: string;
  headers?: Record<string, string>;
}

export interface IStorageProvider {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  objectExists(input: ObjectExistsInput): Promise<ObjectExistsResult>;
  copyObject(input: CopyObjectInput): Promise<CopyObjectResult>;
  getSignedUploadUrl(input: GetSignedUploadUrlInput): Promise<SignedUrlResult>;
  getSignedDownloadUrl(input: GetSignedDownloadUrlInput): Promise<SignedUrlResult>;
}

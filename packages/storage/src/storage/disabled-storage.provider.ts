import { StorageOperationError } from '../errors';

import type {
  CopyObjectInput,
  CopyObjectResult,
  DeleteObjectInput,
  DeleteObjectResult,
  GetObjectInput,
  GetObjectResult,
  GetSignedDownloadUrlInput,
  GetSignedUploadUrlInput,
  HeadObjectInput,
  HeadObjectResult,
  IStorageProvider,
  ObjectExistsInput,
  ObjectExistsResult,
  PutObjectInput,
  PutObjectResult,
  SignedUrlResult
} from '../providers/storage-provider.interface';

export class DisabledStorageProvider implements IStorageProvider {
  constructor(private readonly reason: string) {}

  putObject(_input: PutObjectInput): Promise<PutObjectResult> {
    return Promise.reject(this.createDisabledError('putObject'));
  }

  getObject(_input: GetObjectInput): Promise<GetObjectResult> {
    return Promise.reject(this.createDisabledError('getObject'));
  }

  deleteObject(_input: DeleteObjectInput): Promise<DeleteObjectResult> {
    return Promise.reject(this.createDisabledError('deleteObject'));
  }

  headObject(_input: HeadObjectInput): Promise<HeadObjectResult> {
    return Promise.reject(this.createDisabledError('headObject'));
  }

  objectExists(_input: ObjectExistsInput): Promise<ObjectExistsResult> {
    return Promise.reject(this.createDisabledError('objectExists'));
  }

  copyObject(_input: CopyObjectInput): Promise<CopyObjectResult> {
    return Promise.reject(this.createDisabledError('copyObject'));
  }

  getSignedUploadUrl(_input: GetSignedUploadUrlInput): Promise<SignedUrlResult> {
    return Promise.reject(this.createDisabledError('getSignedUploadUrl'));
  }

  getSignedDownloadUrl(_input: GetSignedDownloadUrlInput): Promise<SignedUrlResult> {
    return Promise.reject(this.createDisabledError('getSignedDownloadUrl'));
  }

  private createDisabledError(operation: string): StorageOperationError {
    return new StorageOperationError(
      `Storage is disabled because configuration is invalid. ${this.reason}`,
      operation
    );
  }
}

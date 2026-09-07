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

export class StorageService {
  constructor(private readonly provider: IStorageProvider) {}

  putObject(input: PutObjectInput): Promise<PutObjectResult> {
    return this.provider.putObject(input);
  }

  getObject(input: GetObjectInput): Promise<GetObjectResult> {
    return this.provider.getObject(input);
  }

  deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    return this.provider.deleteObject(input);
  }

  headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    return this.provider.headObject(input);
  }

  objectExists(input: ObjectExistsInput): Promise<ObjectExistsResult> {
    return this.provider.objectExists(input);
  }

  copyObject(input: CopyObjectInput): Promise<CopyObjectResult> {
    return this.provider.copyObject(input);
  }

  getSignedUploadUrl(input: GetSignedUploadUrlInput): Promise<SignedUrlResult> {
    return this.provider.getSignedUploadUrl(input);
  }

  getSignedDownloadUrl(input: GetSignedDownloadUrlInput): Promise<SignedUrlResult> {
    return this.provider.getSignedDownloadUrl(input);
  }
}

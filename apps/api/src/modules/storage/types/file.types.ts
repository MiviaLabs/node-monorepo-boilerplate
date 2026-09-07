import type { FileUploadTransport } from '../dto/create-file-upload.dto';
import type { FilePurpose, FileStatus, FileVisibility, IFileMetadata } from '@package/db-core';
import type { SignedUrlMethod } from '@package/storage';

export interface StorageFileDtoShape {
  id: number;
  organizationId: number;
  uploadedByUserId: number;
  storageInstance: string;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  checksumSha256: string | null;
  etag: string | null;
  status: FileStatus;
  visibility: FileVisibility;
  purpose: FilePurpose;
  metadata: IFileMetadata;
  uploadedAt: string | Date | null;
  lastAccessedAt: string | Date | null;
  deletedAt: string | Date | null;
  purgedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface StorageSignedUrlDtoShape {
  transport: FileUploadTransport;
  url: string;
  method: SignedUrlMethod;
  expiresAt?: string | Date;
  bucket: string;
  key: string;
  headers?: Record<string, string>;
}

export interface FileUploadReservationDtoShape {
  file: StorageFileDtoShape;
  upload: StorageSignedUrlDtoShape;
}

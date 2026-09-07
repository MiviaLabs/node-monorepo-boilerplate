import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Errors } from '@package/errors';
import { SignedUrlMethod, StorageObjectNotFoundError } from '@package/storage';

import { CreateFileUploadDto } from '../../dto';
import { StorageFilesService } from '../storage-files.service';

import type { FileRepository } from '../../repositories';
import type { FileRoutingService } from '../file-routing.service';
import type { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import type { File as DbFile } from '@package/db-core';
import type { IStorageProvider } from '@package/storage';
import type { StorageRegistryService } from '@package/storage/nest';

type MockedStorageProvider = {
  putObject: jest.MockedFunction<IStorageProvider['putObject']>;
  getSignedUploadUrl: jest.MockedFunction<IStorageProvider['getSignedUploadUrl']>;
  headObject: jest.MockedFunction<IStorageProvider['headObject']>;
  getSignedDownloadUrl: jest.MockedFunction<IStorageProvider['getSignedDownloadUrl']>;
  deleteObject: jest.MockedFunction<IStorageProvider['deleteObject']>;
};

const createDbMock = (): {
  execute: jest.MockedFunction<(query: unknown) => Promise<unknown>>;
  transaction: jest.MockedFunction<
    (
      callback: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<unknown>
    ) => Promise<unknown>
  >;
} => {
  const execute = jest.fn(async () => ({ rows: [] }));

  return {
    execute,
    transaction: jest.fn(async (callback) => callback({ execute }))
  };
};

describe('StorageFilesService', () => {
  let service: StorageFilesService;
  let repository: jest.Mocked<FileRepository>;
  let routingService: jest.Mocked<FileRoutingService>;
  let storageRegistry: jest.Mocked<StorageRegistryService>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: ReturnType<typeof createDbMock>;
  let provider: MockedStorageProvider;

  beforeEach(() => {
    repository = {
      findByIdOrThrow: jest.fn(),
      findByIdOrThrowWithDatabase: jest.fn(),
      allocateIdWithDatabase: jest.fn(),
      createWithDatabase: jest.fn(),
      markUploadReadyWithDatabase: jest.fn(),
      touchLastAccessedAtWithDatabase: jest.fn(),
      findByIdIncludingDeletedOrThrowWithDatabase: jest.fn(),
      countActiveReferencesWithDatabase: jest.fn(),
      markPendingDeleteWithDatabase: jest.fn(),
      listPurgeCandidatesWithDatabase: jest.fn(),
      markPurgedWithDatabase: jest.fn(),
      listStalePendingUploadsWithDatabase: jest.fn(),
      markUploadFailedWithDatabase: jest.fn()
    } as unknown as jest.Mocked<FileRepository>;
    routingService = {
      resolve: jest.fn()
    } as unknown as jest.Mocked<FileRoutingService>;
    provider = {
      putObject: jest.fn(),
      getSignedUploadUrl: jest.fn(),
      headObject: jest.fn(),
      getSignedDownloadUrl: jest.fn(),
      deleteObject: jest.fn()
    } as unknown as MockedStorageProvider;
    storageRegistry = {
      get: jest.fn(() => provider),
      listInstanceNames: jest.fn(() => ['default', 'uploads', 'avatars']),
      getDefaultInstanceName: jest.fn(() => 'default')
    } as unknown as jest.Mocked<StorageRegistryService>;
    auditOutbox = {
      insert: jest.fn()
    } as unknown as jest.Mocked<AuditOutboxPublisher>;
    db = createDbMock();

    service = new StorageFilesService(
      repository,
      routingService,
      storageRegistry,
      auditOutbox,
      db as never
    );
  });

  it('creates an API upload reservation by default', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'issue_attachment';
    dto.originalFilename = 'spec.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 1024;
    dto.metadata = { source: 'issues-ui' };

    repository.allocateIdWithDatabase.mockResolvedValue(101);
    routingService.resolve.mockReturnValue({
      instanceName: 'uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    provider.getSignedUploadUrl.mockResolvedValue({
      url: 'https://ignored.example.test',
      method: SignedUrlMethod.PUT,
      expiresAt: new Date('2026-03-24T00:00:00.000Z'),
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      headers: { 'content-type': 'application/pdf' }
    });

    const pendingFile = {
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: { source: 'issues-ui' },
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile;
    repository.createWithDatabase.mockResolvedValue(pendingFile);

    const result = await service.createUploadReservation(
      '12',
      '34',
      '34',
      ['tenant_user'],
      dto,
      {},
      {
        issueAttachmentContext: {
          issueId: 77,
          projectId: 12
        }
      }
    );

    expect(provider.getSignedUploadUrl).toHaveBeenCalledWith({
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      contentType: 'application/pdf',
      metadata: { source: 'issues-ui' }
    });
    expect(result.upload.transport).toBe('api_proxy');
    expect(result.upload.url).toBe('/v1/objects/uploads/101/content');
    expect(result.upload.headers).toEqual({
      'content-type': 'application/pdf',
      'content-length': '1024'
    });
  });

  it('creates a presigned upload reservation when explicitly requested', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'issue_attachment';
    dto.originalFilename = 'spec.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 1024;
    dto.metadata = { source: 'issues-ui' };
    dto.transport = 'presigned';

    repository.allocateIdWithDatabase.mockResolvedValue(101);
    routingService.resolve.mockReturnValue({
      instanceName: 'uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    provider.getSignedUploadUrl.mockResolvedValue({
      url: 'https://upload.example.test',
      method: SignedUrlMethod.PUT,
      expiresAt: new Date('2026-03-24T00:00:00.000Z'),
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      headers: { 'content-type': 'application/pdf' }
    });

    const pendingFile = {
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: { source: 'issues-ui' },
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile;
    repository.createWithDatabase.mockResolvedValue(pendingFile);

    const result = await service.createUploadReservation(
      '12',
      '34',
      '34',
      ['tenant_user'],
      dto,
      {},
      {
        issueAttachmentContext: {
          issueId: 77,
          projectId: 12
        }
      }
    );

    expect(repository.allocateIdWithDatabase).toHaveBeenCalled();
    expect(routingService.resolve).toHaveBeenCalledWith({
      organizationId: 12,
      purpose: 'issue_attachment',
      fileId: 101,
      originalFilename: 'spec.pdf',
      issueAttachmentContext: {
        issueId: 77,
        projectId: 12
      }
    });
    expect(provider.getSignedUploadUrl).toHaveBeenCalledWith({
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      contentType: 'application/pdf',
      metadata: { source: 'issues-ui' }
    });
    expect(repository.createWithDatabase).toHaveBeenCalled();
    expect(result.file.id).toBe(101);
    expect(result.upload.method).toBe('PUT');
    expect(result.upload.transport).toBe('presigned');
  });

  it('rejects oversized avatar uploads', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'user_avatar';
    dto.originalFilename = 'avatar.png';
    dto.mimeType = 'image/png';
    dto.byteSize = 3 * 1024 * 1024;

    await expect(
      service.createUploadReservation('12', '34', '34', ['tenant_user'], dto)
    ).rejects.toThrow(Errors.filefileSizeSizemb003({ size: 3, maxSize: 2 }));
  });

  it('rejects non-image avatar uploads', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'user_avatar';
    dto.originalFilename = 'avatar.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 256;

    await expect(
      service.createUploadReservation('12', '34', '34', ['tenant_user'], dto)
    ).rejects.toThrow(
      Errors.fileinvalidFileType002({
        fileType: 'application/pdf',
        allowedTypes: 'image/*'
      })
    );
  });

  it('rejects generic issue attachment reservations without issue context', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'issue_attachment';
    dto.originalFilename = 'spec.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 256;

    await expect(
      service.createUploadReservation('12', '34', '34', ['tenant_user'], dto)
    ).rejects.toMatchObject({
      code: 'API_006'
    });

    expect(repository.allocateIdWithDatabase).not.toHaveBeenCalled();
    expect(routingService.resolve).not.toHaveBeenCalled();
  });

  it('completes a pending upload after the object exists in storage', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.headObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      contentLength: 1024,
      contentType: 'application/pdf',
      etag: 'etag-1'
    });
    repository.markUploadReadyWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);

    const result = await service.completeUpload('12', '34', '34', ['tenant_user'], '101');

    expect(provider.headObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.markUploadReadyWithDatabase).toHaveBeenCalled();
    expect(result.status).toBe('ready');
  });

  it('uploads file content through the API and finalizes the file', async () => {
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: { source: 'issues-ui' },
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.putObject.mockImplementation(async (input) => {
      for await (const _chunk of input.body) {
        // Drain the stream so the service byte counter sees the upload contents.
      }

      return {
        bucket: 'app-uploads',
        key: 'org/12/uploads/issue_attachment/101/spec.pdf',
        etag: 'etag-uploaded'
      };
    });
    repository.markUploadReadyWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      checksumSha256: null,
      etag: 'etag-uploaded',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: { source: 'issues-ui' },
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);

    const result = await service.uploadFileContent(
      '12',
      '34',
      '34',
      ['tenant_user'],
      '101',
      Readable.from(['payload']),
      'application/pdf',
      '7',
      {
        requestId: 'req-upload',
        correlationId: 'corr-upload',
        causationId: 'cause-upload'
      }
    );

    expect(provider.putObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      body: expect.anything(),
      contentLength: 7,
      contentType: 'application/pdf',
      metadata: { source: 'issues-ui' }
    });
    expect(db.transaction).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(repository.findByIdOrThrowWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      12,
      101,
      true
    );
    expect(repository.markUploadReadyWithDatabase).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.status).toBe('ready');
  });

  it('deletes the uploaded object when streamed byte count does not match the reservation', async () => {
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 8,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.putObject.mockImplementation(async (input) => {
      for await (const _chunk of input.body) {
        // Drain the stream so the service byte counter sees the upload contents.
      }

      return {
        bucket: 'app-uploads',
        key: 'org/12/uploads/issue_attachment/101/spec.pdf',
        etag: 'etag-uploaded'
      };
    });
    provider.deleteObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      deleted: true
    });

    await expect(
      service.uploadFileContent(
        '12',
        '34',
        '34',
        ['tenant_user'],
        '101',
        Readable.from(['payload']),
        'application/pdf',
        '8'
      )
    ).rejects.toThrow('uploaded content length does not match the reserved file size');

    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.markUploadReadyWithDatabase).not.toHaveBeenCalled();
  });

  it('deletes the uploaded object when streamed byte count exceeds the reservation before completion', async () => {
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.putObject.mockImplementation(async (input) => {
      for await (const _chunk of input.body) {
        // Drain until the counting stream raises the oversize error.
      }

      return {
        bucket: 'app-uploads',
        key: 'org/12/uploads/issue_attachment/101/spec.pdf',
        etag: 'etag-uploaded'
      };
    });
    provider.deleteObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      deleted: true
    });

    await expect(
      service.uploadFileContent(
        '12',
        '34',
        '34',
        ['tenant_user'],
        '101',
        Readable.from(['payload!']),
        'application/pdf',
        '7'
      )
    ).rejects.toThrow('uploaded content length exceeds the reserved file size');

    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.markUploadReadyWithDatabase).not.toHaveBeenCalled();
  });

  it('deletes the uploaded object when finalize fails after storage upload succeeds', async () => {
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.putObject.mockImplementation(async (input) => {
      for await (const _chunk of input.body) {
        // Drain the stream so the service byte counter sees the upload contents.
      }

      return {
        bucket: 'app-uploads',
        key: 'org/12/uploads/issue_attachment/101/spec.pdf',
        etag: 'etag-uploaded'
      };
    });
    provider.deleteObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      deleted: true
    });
    repository.markUploadReadyWithDatabase.mockRejectedValue(
      Errors.databaserecordNotFound004({ entity: 'File' })
    );

    await expect(
      service.uploadFileContent(
        '12',
        '34',
        '34',
        ['tenant_user'],
        '101',
        Readable.from(['payload']),
        'application/pdf',
        '7'
      )
    ).rejects.toThrow(Errors.databaserecordNotFound004({ entity: 'File' }));

    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
  });

  it('deletes the uploaded object when storage upload fails after starting the write', async () => {
    repository.findByIdOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 7,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.putObject.mockRejectedValue(new Error('storage write failed'));
    provider.deleteObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      deleted: true
    });

    await expect(
      service.uploadFileContent(
        '12',
        '34',
        '34',
        ['tenant_user'],
        '101',
        Readable.from(['payload']),
        'application/pdf',
        '7'
      )
    ).rejects.toThrow('storage write failed');

    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.markUploadReadyWithDatabase).not.toHaveBeenCalled();
  });

  it('returns an already-ready file without re-finalizing it', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);

    const result = await service.completeUpload('12', '34', '34', ['tenant_user'], '101');

    expect(provider.headObject).not.toHaveBeenCalled();
    expect(repository.markUploadReadyWithDatabase).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
  });

  it('surfaces missing uploaded objects as a file not found error', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'pending_upload',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.headObject.mockRejectedValue(
      new StorageObjectNotFoundError('app-uploads', 'org/12/uploads/issue_attachment/101/spec.pdf')
    );

    await expect(service.completeUpload('12', '34', '34', ['tenant_user'], '101')).rejects.toThrow(
      Errors.filefileNotFound004({ filename: 'spec.pdf' })
    );
  });

  it('returns a signed download url for a ready file and records access time', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    provider.getSignedDownloadUrl.mockResolvedValue({
      url: 'https://download.example.test',
      method: SignedUrlMethod.GET,
      expiresAt: new Date('2026-03-24T00:00:00.000Z'),
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });

    const result = await service.getDownloadUrl('12', '34', '34', '101', {
      requestId: 'req-download',
      correlationId: 'corr-download',
      causationId: 'cause-download'
    });

    expect(provider.getSignedDownloadUrl).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.touchLastAccessedAtWithDatabase).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.method).toBe('GET');
  });

  it('rejects direct download access when the caller did not upload the file', async () => {
    repository.findByIdOrThrow.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 99,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);

    await expect(service.getDownloadUrl('12', '34', '34', '101')).rejects.toThrow(
      Errors.databaserecordNotFound004({ entity: 'File' })
    );
  });

  it('soft deletes an unattached file and returns the pending_delete record', async () => {
    const file = {
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile;
    repository.findByIdIncludingDeletedOrThrowWithDatabase.mockResolvedValue(file);
    repository.countActiveReferencesWithDatabase.mockResolvedValue({
      avatarCount: 0,
      issueAttachmentCount: 0,
      contentAttachmentCount: 0,
      total: 0
    });
    repository.markPendingDeleteWithDatabase.mockResolvedValue({
      ...file,
      status: 'pending_delete',
      deletedAt: new Date('2026-03-24T01:00:00.000Z')
    } satisfies DbFile);

    const result = await service.deleteFile('12', '34', '34', ['tenant_user'], '101', {
      requestId: 'req-delete',
      correlationId: 'corr-delete',
      causationId: 'cause-delete'
    });

    expect(repository.countActiveReferencesWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      12,
      101
    );
    expect(repository.markPendingDeleteWithDatabase).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.status).toBe('pending_delete');
    expect(result.deletedAt).toEqual(new Date('2026-03-24T01:00:00.000Z'));
  });

  it('blocks soft delete when the file is still attached to domain records', async () => {
    repository.findByIdIncludingDeletedOrThrowWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);
    repository.countActiveReferencesWithDatabase.mockResolvedValue({
      avatarCount: 0,
      issueAttachmentCount: 1,
      contentAttachmentCount: 0,
      total: 1
    });

    await expect(service.deleteFile('12', '34', '34', ['tenant_user'], '101')).rejects.toThrow(
      'file cannot be deleted while it is still attached to domain records'
    );

    expect(repository.markPendingDeleteWithDatabase).not.toHaveBeenCalled();
  });

  it('purges deleted files by removing the object and marking the row deleted', async () => {
    repository.listPurgeCandidatesWithDatabase.mockResolvedValue([
      {
        id: 101,
        organizationId: 12,
        uploadedByUserId: 34,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
        originalFilename: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        checksumSha256: null,
        etag: 'etag-1',
        status: 'pending_delete',
        visibility: 'private',
        purpose: 'issue_attachment',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: new Date('2026-03-23T00:00:00.000Z'),
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } satisfies DbFile
    ]);
    provider.deleteObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      deleted: true
    });
    repository.markPurgedWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'deleted',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: new Date('2026-03-23T00:00:00.000Z'),
      purgedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile);

    const result = await service.purgeDeletedFiles({
      retentionHours: 24,
      batchSize: 100,
      dryRun: false,
      trace: { requestId: 'req-purge', correlationId: 'corr-purge', causationId: 'cause-purge' }
    });

    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf'
    });
    expect(repository.markPurgedWithDatabase).toHaveBeenCalled();
    expect(result.purgedCount).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('fails stale pending uploads when the object no longer exists', async () => {
    repository.listStalePendingUploadsWithDatabase.mockResolvedValue([
      {
        id: 101,
        organizationId: 12,
        uploadedByUserId: 34,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
        originalFilename: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        checksumSha256: null,
        etag: null,
        status: 'pending_upload',
        visibility: 'private',
        purpose: 'issue_attachment',
        metadata: {},
        uploadedAt: null,
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date('2026-03-20T00:00:00.000Z'),
        updatedAt: new Date('2026-03-20T00:00:00.000Z')
      } satisfies DbFile
    ]);
    provider.headObject.mockRejectedValue(
      new StorageObjectNotFoundError('app-uploads', 'org/12/uploads/issue_attachment/101/spec.pdf')
    );
    repository.markUploadFailedWithDatabase.mockResolvedValue({
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: null,
      status: 'upload_failed',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date()
    } satisfies DbFile);

    const result = await service.reconcileStalePendingUploads({
      staleHours: 24,
      batchSize: 100,
      dryRun: false
    });

    expect(repository.markUploadFailedWithDatabase).toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
    expect(result.recoveredCount).toBe(0);
  });

  it('treats a concurrent finalize race as idempotent when another request already marked the file ready', async () => {
    const readyFile = {
      id: 101,
      organizationId: 12,
      uploadedByUserId: 34,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/12/uploads/issue_attachment/101/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: null,
      etag: 'etag-1',
      status: 'ready',
      visibility: 'private',
      purpose: 'issue_attachment',
      metadata: {},
      uploadedAt: new Date(),
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies DbFile;

    repository.findByIdOrThrow.mockResolvedValueOnce({
      ...readyFile,
      etag: null,
      status: 'pending_upload',
      uploadedAt: null
    });
    provider.headObject.mockResolvedValue({
      bucket: 'app-uploads',
      key: 'org/12/uploads/issue_attachment/101/spec.pdf',
      contentLength: 1024,
      contentType: 'application/pdf',
      etag: 'etag-1'
    });
    repository.markUploadReadyWithDatabase.mockRejectedValue(
      Errors.databaserecordNotFound004({ entity: 'File' })
    );
    repository.findByIdOrThrow.mockResolvedValueOnce(readyFile);

    const result = await service.completeUpload('12', '34', '34', ['tenant_user'], '101');

    expect(repository.markUploadReadyWithDatabase).toHaveBeenCalled();
    expect(repository.findByIdOrThrow).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ready');
  });
});

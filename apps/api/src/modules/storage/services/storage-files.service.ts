import { Transform } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import { LIMITS } from '@package/constants';
import { sql } from '@package/db-core';
import { Errors } from '@package/errors';
import {
  SignedUrlMethod,
  StorageObjectNotFoundError,
  StorageRegistryService,
  type IStorageProvider,
  type SignedUrlResult
} from '@package/storage';

import { CreateFileUploadDto } from '../dto';
import { FileRepository } from '../repositories';
import { FileRoutingService } from './file-routing.service';

import type { FileUploadTransport } from '../dto/create-file-upload.dto';
import type {
  FileUploadReservationDtoShape,
  StorageFileDtoShape,
  StorageSignedUrlDtoShape
} from '../types/file.types';
import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { NodePgDatabase, File as DbFile, IFileMetadata } from '@package/db-core';
import type { Readable } from 'node:stream';

import { MAIN_DB } from '@/common/database/database.constants';
import { ApiException } from '@/common/errors/api-exception';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { buildTenantAuditEvent } from '@/modules/tenants/events/tenant-audit-event';

const enum PendingUploadFailureReason {
  MissingObject = 'missing_object',
  SizeMismatch = 'size_mismatch'
}

const STORAGE_API_UPLOAD_ADVISORY_LOCK_KEY = 8643306;

@Injectable()
export class StorageFilesService {
  constructor(
    private readonly fileRepository: FileRepository,
    private readonly fileRoutingService: FileRoutingService,
    private readonly storageRegistry: StorageRegistryService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async getFile(
    tenantIdValue: string,
    userIdValue: string,
    fileIdValue: string
  ): Promise<StorageFileDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const fileId = this.parseNumericId(fileIdValue, 'id');

    const file = await this.fileRepository.findByIdOrThrow(tenantId, fileId);
    this.assertDirectFileAccess(file, userId);
    return this.toFileDto(file);
  }

  async getDownloadUrl(
    tenantIdValue: string,
    userIdValue: string,
    actorIdValue: string,
    fileIdValue: string,
    trace: RequestTrace = {}
  ): Promise<StorageSignedUrlDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const fileId = this.parseNumericId(fileIdValue, 'id');

    const file = await this.fileRepository.findByIdOrThrow(tenantId, fileId);
    this.assertDirectFileAccess(file, userId);
    if (file.status !== 'ready') {
      throw ApiException.requestValidationFailed('status', 'file must be ready before download');
    }

    const provider = this.storageRegistry.get(file.storageInstance);
    const signedUrl = await provider.getSignedDownloadUrl({
      bucket: file.bucket,
      key: file.objectKey
    });

    const accessedAt = new Date();
    await this.db.transaction(async (tx) => {
      await this.fileRepository.touchLastAccessedAtWithDatabase(tx, tenantId, fileId, accessedAt);

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.file.download_url.generated.audit',
          tenantId: tenantIdValue,
          actorId: actorIdValue,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: String(file.id),
          action: 'GET_FILE_DOWNLOAD_URL',
          details: {
            fileId: String(file.id),
            purpose: file.purpose,
            storageInstance: file.storageInstance
          }
        })
      );
    });

    return this.toSignedUrlDto(signedUrl);
  }

  async createUploadReservation(
    tenantIdValue: string,
    userIdValue: string,
    actorIdValue: string,
    _roles: readonly string[] | undefined,
    dto: CreateFileUploadDto,
    trace: RequestTrace = {},
    options?: {
      issueAttachmentContext?: {
        issueId: number;
        projectId: number | null;
      };
    }
  ): Promise<FileUploadReservationDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const transport = dto.transport ?? 'api_proxy';

    this.validateCreateUploadDto(dto, options);

    return this.db.transaction(async (tx) => {
      const fileId = await this.fileRepository.allocateIdWithDatabase(tx);
      const routing = this.fileRoutingService.resolve({
        organizationId: tenantId,
        purpose: dto.purpose,
        fileId,
        originalFilename: dto.originalFilename,
        issueAttachmentContext: options?.issueAttachmentContext
      });
      const provider = this.storageRegistry.get(routing.instanceName);
      const signedUpload = await provider.getSignedUploadUrl({
        key: routing.objectKey,
        contentType: dto.mimeType,
        metadata: this.toStorageMetadata(dto.metadata)
      });
      const file = await this.fileRepository.createWithDatabase(tx, tenantId, {
        id: fileId,
        uploadedByUserId: userId,
        storageInstance: routing.instanceName,
        bucket: signedUpload.bucket,
        objectKey: signedUpload.key,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        byteSize: dto.byteSize,
        checksumSha256: null,
        etag: null,
        status: 'pending_upload',
        visibility: dto.visibility ?? 'private',
        purpose: dto.purpose,
        metadata: dto.metadata ?? {}
      });

      const upload = await this.createUploadTarget(file, transport, signedUpload);

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.file.upload.reserved.audit',
          tenantId: tenantIdValue,
          actorId: actorIdValue,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: String(file.id),
          action: 'RESERVE_FILE_UPLOAD',
          details: {
            fileId: String(file.id),
            purpose: file.purpose,
            storageInstance: file.storageInstance,
            bucket: file.bucket
          }
        })
      );

      return {
        file: this.toFileDto(file),
        upload
      };
    });
  }

  async uploadFileContent(
    tenantIdValue: string,
    userIdValue: string,
    actorIdValue: string,
    _roles: readonly string[] | undefined,
    fileIdValue: string,
    body: Readable,
    contentTypeValue: string | undefined,
    contentLengthValue: string | undefined,
    trace: RequestTrace = {}
  ): Promise<StorageFileDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const fileId = this.parseNumericId(fileIdValue, 'id');
    const normalizedContentType = this.normalizeMimeType(contentTypeValue);
    if (!normalizedContentType) {
      throw ApiException.requestValidationFailed(
        'contentType',
        'content-type header is required for API upload'
      );
    }

    const contentLength = this.parseNumericId(contentLengthValue ?? '', 'contentLength');

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${STORAGE_API_UPLOAD_ADVISORY_LOCK_KEY}, ${fileId})`
      );

      const file = await this.fileRepository.findByIdOrThrowWithDatabase(
        tx,
        tenantId,
        fileId,
        true
      );
      this.assertDirectFileAccess(file, userId);
      if (file.status === 'ready') {
        throw ApiException.requestValidationFailed(
          'status',
          'file has already been uploaded and finalized'
        );
      }
      if (file.status !== 'pending_upload') {
        throw ApiException.requestValidationFailed(
          'status',
          'file must be in pending_upload state before API upload'
        );
      }

      const normalizedReservedMimeType = this.normalizeMimeType(file.mimeType ?? undefined);
      if (
        normalizedReservedMimeType !== undefined &&
        normalizedContentType !== normalizedReservedMimeType
      ) {
        throw ApiException.requestValidationFailed(
          'contentType',
          'content-type must match the reserved file mime type'
        );
      }

      if (contentLength !== file.byteSize) {
        throw ApiException.requestValidationFailed(
          'contentLength',
          'content-length must match the reserved file size'
        );
      }

      const provider = this.storageRegistry.get(file.storageInstance);
      let uploadedByteCount = 0;
      const countingStream = new Transform({
        transform(chunk, _encoding, callback) {
          const chunkBuffer =
            typeof chunk === 'string'
              ? Buffer.from(chunk)
              : Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk as Uint8Array);

          uploadedByteCount += chunkBuffer.byteLength;
          if (uploadedByteCount > file.byteSize) {
            callback(
              ApiException.requestValidationFailed(
                'contentLength',
                'uploaded content length exceeds the reserved file size'
              )
            );
            return;
          }

          callback(null, chunk);
        }
      });

      let uploadResult: Awaited<ReturnType<IStorageProvider['putObject']>>;
      try {
        uploadResult = await provider.putObject({
          bucket: file.bucket,
          key: file.objectKey,
          body: body.pipe(countingStream),
          contentLength: file.byteSize,
          contentType: normalizedContentType,
          metadata: this.toStorageMetadata(file.metadata ?? {})
        });
      } catch (error) {
        await this.deleteUploadedObjectQuietly(provider, file);
        throw error;
      }

      if (uploadedByteCount !== file.byteSize) {
        await this.deleteUploadedObjectQuietly(provider, file);
        throw ApiException.requestValidationFailed(
          'contentLength',
          'uploaded content length does not match the reserved file size'
        );
      }

      const uploadedAt = new Date();
      try {
        const readyFile = await this.fileRepository.markUploadReadyWithDatabase(
          tx,
          tenantId,
          fileId,
          {
            byteSize: uploadedByteCount,
            etag: uploadResult.etag,
            mimeType: normalizedContentType,
            uploadedAt,
            updatedAt: uploadedAt
          }
        );

        await this.auditOutbox.insert(
          tx,
          buildTenantAuditEvent({
            eventType: 'tenant.file.upload.completed.audit',
            tenantId: tenantIdValue,
            actorId: actorIdValue,
            requestId: trace.requestId,
            correlationId: trace.correlationId,
            causationId: trace.causationId,
            aggregateId: String(readyFile.id),
            action: 'COMPLETE_FILE_UPLOAD',
            details: {
              fileId: String(readyFile.id),
              purpose: readyFile.purpose,
              storageInstance: readyFile.storageInstance,
              bucket: readyFile.bucket,
              transport: 'api_proxy'
            }
          })
        );

        return this.toFileDto(readyFile);
      } catch (error) {
        await this.deleteUploadedObjectQuietly(provider, file);
        throw error;
      }
    });
  }

  async completeUpload(
    tenantIdValue: string,
    userIdValue: string,
    _actorIdValue: string,
    _roles: readonly string[] | undefined,
    fileIdValue: string,
    _trace: RequestTrace = {}
  ): Promise<StorageFileDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const fileId = this.parseNumericId(fileIdValue, 'id');

    const file = await this.fileRepository.findByIdOrThrow(tenantId, fileId);
    this.assertDirectFileAccess(file, userId);
    if (file.status === 'ready') {
      return this.toFileDto(file);
    }
    if (file.status !== 'pending_upload') {
      throw ApiException.requestValidationFailed(
        'status',
        'file must be in pending_upload state before completion'
      );
    }

    const provider = this.storageRegistry.get(file.storageInstance);

    let headObject;
    try {
      headObject = await provider.headObject({
        bucket: file.bucket,
        key: file.objectKey
      });
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw Errors.filefileNotFound004({ filename: file.originalFilename });
      }
      throw error;
    }

    if (headObject.contentLength !== undefined && headObject.contentLength !== file.byteSize) {
      throw ApiException.requestValidationFailed(
        'byteSize',
        'uploaded object size does not match the reserved file size'
      );
    }

    let updatedFile: DbFile;
    try {
      updatedFile = await this.db.transaction(async (tx) => {
        const readyFile = await this.fileRepository.markUploadReadyWithDatabase(
          tx,
          tenantId,
          fileId,
          {
            byteSize: headObject.contentLength ?? file.byteSize,
            etag: headObject.etag,
            mimeType: headObject.contentType ?? file.mimeType,
            uploadedAt: new Date(),
            updatedAt: new Date()
          }
        );

        await this.auditOutbox.insert(
          tx,
          buildTenantAuditEvent({
            eventType: 'tenant.file.upload.completed.audit',
            tenantId: tenantIdValue,
            actorId: _actorIdValue,
            requestId: _trace.requestId,
            correlationId: _trace.correlationId,
            causationId: _trace.causationId,
            aggregateId: String(readyFile.id),
            action: 'COMPLETE_FILE_UPLOAD',
            details: {
              fileId: String(readyFile.id),
              purpose: readyFile.purpose,
              storageInstance: readyFile.storageInstance,
              bucket: readyFile.bucket
            }
          })
        );

        return readyFile;
      });
    } catch (error) {
      try {
        const currentFile = await this.fileRepository.findByIdOrThrow(tenantId, fileId);
        if (currentFile.status === 'ready') {
          return this.toFileDto(currentFile);
        }
      } catch {
        // Preserve the original mutation error when the recovery read also fails.
      }

      throw error;
    }

    return this.toFileDto(updatedFile);
  }

  async deleteFile(
    tenantIdValue: string,
    userIdValue: string,
    actorIdValue: string,
    _roles: readonly string[] | undefined,
    fileIdValue: string,
    trace: RequestTrace = {}
  ): Promise<StorageFileDtoShape> {
    const tenantId = this.parseNumericId(tenantIdValue, 'tenantId');
    const userId = this.parseNumericId(userIdValue, 'userId');
    const fileId = this.parseNumericId(fileIdValue, 'id');

    const deletedFile = await this.db.transaction(async (tx) => {
      const file = await this.fileRepository.findByIdIncludingDeletedOrThrowWithDatabase(
        tx,
        tenantId,
        fileId,
        true
      );
      this.assertDirectFileAccess(file, userId);

      if (file.deletedAt !== null) {
        return file;
      }

      const activeReferences = await this.fileRepository.countActiveReferencesWithDatabase(
        tx,
        tenantId,
        fileId
      );
      if (activeReferences.total > 0) {
        throw ApiException.requestValidationFailed(
          'fileId',
          'file cannot be deleted while it is still attached to domain records'
        );
      }

      const now = new Date();
      const updatedFile = await this.fileRepository.markPendingDeleteWithDatabase(
        tx,
        tenantId,
        fileId,
        now
      );
      if (!updatedFile) {
        return file;
      }

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.file.deleted.audit',
          tenantId: tenantIdValue,
          actorId: actorIdValue,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: String(updatedFile.id),
          action: 'DELETE_FILE',
          details: {
            fileId: String(updatedFile.id),
            purpose: updatedFile.purpose,
            storageInstance: updatedFile.storageInstance
          }
        })
      );

      return updatedFile;
    });

    return this.toFileDto(deletedFile);
  }

  async purgeDeletedFiles(params: {
    retentionHours: number;
    batchSize: number;
    dryRun: boolean;
    trace?: RequestTrace;
  }): Promise<{
    purgedCount: number;
    candidates: number;
    errors: string[];
  }> {
    const cutoff = new Date(Date.now() - params.retentionHours * 60 * 60 * 1000);
    const candidates = await this.fileRepository.listPurgeCandidatesWithDatabase(
      this.db,
      cutoff,
      params.batchSize
    );
    const errors: string[] = [];
    let purgedCount = 0;

    for (const file of candidates) {
      try {
        if (params.dryRun) {
          purgedCount++;
          continue;
        }

        const provider = this.storageRegistry.get(file.storageInstance);
        await provider.deleteObject({
          bucket: file.bucket,
          key: file.objectKey
        });

        await this.db.transaction(async (tx) => {
          const updatedFile = await this.fileRepository.markPurgedWithDatabase(
            tx,
            file.organizationId,
            file.id,
            new Date()
          );
          if (!updatedFile) {
            return;
          }

          await this.auditOutbox.insert(
            tx,
            buildTenantAuditEvent({
              eventType: 'tenant.file.purged.audit',
              tenantId: String(updatedFile.organizationId),
              actorId: undefined,
              requestId: params.trace?.requestId,
              correlationId: params.trace?.correlationId,
              causationId: params.trace?.causationId,
              aggregateId: String(updatedFile.id),
              action: 'PURGE_FILE',
              details: {
                fileId: String(updatedFile.id),
                purpose: updatedFile.purpose,
                storageInstance: updatedFile.storageInstance
              }
            })
          );
        });

        purgedCount++;
      } catch (error) {
        errors.push(
          `Failed to purge file ${file.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      purgedCount,
      candidates: candidates.length,
      errors
    };
  }

  async reconcileStalePendingUploads(params: {
    staleHours: number;
    batchSize: number;
    dryRun: boolean;
    trace?: RequestTrace;
  }): Promise<{
    candidates: number;
    recoveredCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const cutoff = new Date(Date.now() - params.staleHours * 60 * 60 * 1000);
    const candidates = await this.fileRepository.listStalePendingUploadsWithDatabase(
      this.db,
      cutoff,
      params.batchSize
    );
    const errors: string[] = [];
    let recoveredCount = 0;
    let failedCount = 0;

    for (const file of candidates) {
      try {
        const provider = this.storageRegistry.get(file.storageInstance);
        const now = new Date();

        try {
          const headObject = await provider.headObject({
            bucket: file.bucket,
            key: file.objectKey
          });

          if (
            headObject.contentLength !== undefined &&
            headObject.contentLength !== file.byteSize
          ) {
            if (!params.dryRun) {
              await this.failPendingUpload(
                file,
                params.trace,
                PendingUploadFailureReason.SizeMismatch,
                now
              );
            }
            failedCount++;
            continue;
          }

          if (!params.dryRun) {
            await this.db.transaction(async (tx) => {
              const updatedFile = await this.fileRepository.markUploadReadyWithDatabase(
                tx,
                file.organizationId,
                file.id,
                {
                  byteSize: headObject.contentLength ?? file.byteSize,
                  etag: headObject.etag,
                  mimeType: headObject.contentType ?? file.mimeType,
                  uploadedAt: now,
                  updatedAt: now
                }
              );

              await this.auditOutbox.insert(
                tx,
                buildTenantAuditEvent({
                  eventType: 'tenant.file.upload.recovered.audit',
                  tenantId: String(updatedFile.organizationId),
                  actorId: undefined,
                  requestId: params.trace?.requestId,
                  correlationId: params.trace?.correlationId,
                  causationId: params.trace?.causationId,
                  aggregateId: String(updatedFile.id),
                  action: 'RECOVER_PENDING_FILE_UPLOAD',
                  details: {
                    fileId: String(updatedFile.id),
                    purpose: updatedFile.purpose,
                    storageInstance: updatedFile.storageInstance
                  }
                })
              );
            });
          }

          recoveredCount++;
        } catch (error) {
          if (error instanceof StorageObjectNotFoundError) {
            if (!params.dryRun) {
              await this.failPendingUpload(
                file,
                params.trace,
                PendingUploadFailureReason.MissingObject,
                now
              );
            }
            failedCount++;
            continue;
          }

          throw error;
        }
      } catch (error) {
        errors.push(
          `Failed to reconcile pending upload ${file.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      candidates: candidates.length,
      recoveredCount,
      failedCount,
      errors
    };
  }

  private validateCreateUploadDto(
    dto: CreateFileUploadDto,
    options?: {
      issueAttachmentContext?: {
        issueId: number;
        projectId: number | null;
      };
    }
  ): void {
    const maxSize = dto.purpose === 'user_avatar' ? LIMITS.MAX_AVATAR_SIZE : LIMITS.MAX_FILE_SIZE;

    if (dto.byteSize > maxSize) {
      throw Errors.filefileSizeSizemb003({
        size: Math.round((dto.byteSize / (1024 * 1024)) * 10) / 10,
        maxSize: Math.round((maxSize / (1024 * 1024)) * 10) / 10
      });
    }

    if (dto.purpose === 'user_avatar' && !dto.mimeType.toLowerCase().startsWith('image/')) {
      throw Errors.fileinvalidFileType002({
        fileType: dto.mimeType,
        allowedTypes: 'image/*'
      });
    }

    if (dto.purpose === 'issue_attachment' && !options?.issueAttachmentContext) {
      throw ApiException.requestValidationFailed(
        'purpose',
        'issue_attachment uploads must be reserved through an issue-scoped endpoint'
      );
    }
  }

  private async createUploadTarget(
    file: DbFile,
    transport: FileUploadTransport,
    presignedUpload?: SignedUrlResult
  ): Promise<StorageSignedUrlDtoShape> {
    if (transport === 'presigned') {
      if (presignedUpload) {
        return this.toSignedUrlDto(presignedUpload, transport);
      }

      const provider = this.storageRegistry.get(file.storageInstance);
      return this.toSignedUrlDto(
        await provider.getSignedUploadUrl({
          bucket: file.bucket,
          key: file.objectKey,
          contentType: file.mimeType ?? undefined,
          metadata: this.toStorageMetadata(file.metadata ?? {})
        }),
        transport
      );
    }

    return {
      transport,
      url: `/v1/objects/uploads/${file.id}/content`,
      method: SignedUrlMethod.PUT,
      bucket: file.bucket,
      key: file.objectKey,
      headers: {
        'content-type': file.mimeType ?? 'application/octet-stream',
        'content-length': String(file.byteSize)
      }
    };
  }

  private toStorageMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      ])
    );
  }

  private toFileDto(file: DbFile): StorageFileDtoShape {
    return {
      id: file.id,
      organizationId: file.organizationId,
      uploadedByUserId: file.uploadedByUserId,
      storageInstance: file.storageInstance,
      bucket: file.bucket,
      objectKey: file.objectKey,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType ?? null,
      byteSize: file.byteSize,
      checksumSha256: file.checksumSha256 ?? null,
      etag: file.etag ?? null,
      status: file.status,
      visibility: file.visibility,
      purpose: file.purpose,
      metadata: (file.metadata ?? {}) as IFileMetadata,
      uploadedAt: file.uploadedAt ?? null,
      lastAccessedAt: file.lastAccessedAt ?? null,
      deletedAt: file.deletedAt ?? null,
      purgedAt: file.purgedAt ?? null,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    };
  }

  private toSignedUrlDto(
    signedUrl: SignedUrlResult,
    transport: 'api_proxy' | 'presigned' = 'presigned'
  ): StorageSignedUrlDtoShape {
    return {
      transport,
      url: signedUrl.url,
      method: signedUrl.method === SignedUrlMethod.PUT ? SignedUrlMethod.PUT : SignedUrlMethod.GET,
      expiresAt: signedUrl.expiresAt,
      bucket: signedUrl.bucket,
      key: signedUrl.key,
      headers: signedUrl.headers
    };
  }

  private normalizeMimeType(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      return undefined;
    }

    return normalizedValue.split(';', 1)[0]?.trim().toLowerCase() ?? undefined;
  }

  private async deleteUploadedObjectQuietly(
    provider: IStorageProvider,
    file: Pick<DbFile, 'bucket' | 'objectKey'>
  ): Promise<void> {
    try {
      await provider.deleteObject({
        bucket: file.bucket,
        key: file.objectKey
      });
    } catch {
      // Preserve the original upload/finalize error when cleanup also fails.
    }
  }

  private parseNumericId(value: string | number, field: string): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw Errors.validationinvalidValueFor002({ field, expectedType: 'integer' });
    }
    return parsed;
  }

  private assertDirectFileAccess(file: DbFile, userId: number): void {
    if (file.uploadedByUserId !== userId) {
      throw Errors.databaserecordNotFound004({ entity: 'File' });
    }
  }

  private async failPendingUpload(
    file: DbFile,
    trace: RequestTrace | undefined,
    reason: PendingUploadFailureReason,
    updatedAt: Date
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updatedFile = await this.fileRepository.markUploadFailedWithDatabase(
        tx,
        file.organizationId,
        file.id,
        updatedAt
      );
      if (!updatedFile) {
        return;
      }

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.file.upload.failed.audit',
          tenantId: String(updatedFile.organizationId),
          actorId: undefined,
          requestId: trace?.requestId,
          correlationId: trace?.correlationId,
          causationId: trace?.causationId,
          aggregateId: String(updatedFile.id),
          action: 'FAIL_PENDING_FILE_UPLOAD',
          details: {
            fileId: String(updatedFile.id),
            purpose: updatedFile.purpose,
            reason
          }
        })
      );
    });
  }
}

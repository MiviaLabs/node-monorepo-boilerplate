import { Injectable } from '@nestjs/common';
import { Errors } from '@package/errors';

import { FileRepository } from '../repositories';

import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { File as DbFile, NodePgDatabase } from '@package/db-core';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { buildTenantAuditEvent } from '@/modules/tenants/events/tenant-audit-event';

export const enum DetachedFileCleanupStatus {
  Noop = 'noop',
  RetainedDueToReference = 'retained_due_to_reference',
  PendingDelete = 'pending_delete'
}

export interface DetachedFileCleanupResult {
  file: DbFile;
  cleanupStatus: DetachedFileCleanupStatus;
}

export interface DetachedFileCleanupOptions {
  expectedPurpose?: DbFile['purpose'];
  failIfReferenced?: boolean;
}

@Injectable()
export class DetachedFileCleanupService {
  constructor(
    private readonly fileRepository: FileRepository,
    private readonly auditOutbox: AuditOutboxPublisher
  ) {}

  async softDeleteDetachedFileWithDatabase(
    database: NodePgDatabase,
    tenantId: number,
    actorId: string | undefined,
    fileId: number,
    trace: RequestTrace = {},
    options: DetachedFileCleanupOptions = {}
  ): Promise<DetachedFileCleanupResult> {
    const file = await this.fileRepository.findByIdIncludingDeletedOrThrowWithDatabase(
      database,
      tenantId,
      fileId,
      true
    );

    if (options.expectedPurpose !== undefined && file.purpose !== options.expectedPurpose) {
      throw Errors.validationinvalidValueFor002({
        field: 'fileId',
        expectedType: `${options.expectedPurpose} file`
      });
    }

    if (file.deletedAt !== null || file.purgedAt !== null) {
      return {
        file,
        cleanupStatus: DetachedFileCleanupStatus.Noop
      };
    }

    const activeReferences = await this.fileRepository.countActiveReferencesWithDatabase(
      database,
      tenantId,
      fileId
    );
    if (activeReferences.total > 0) {
      if (options.failIfReferenced) {
        throw Errors.validationinvalidValueFor002({
          field: 'fileId',
          expectedType: 'file detached from all domain records'
        });
      }

      return {
        file,
        cleanupStatus: DetachedFileCleanupStatus.RetainedDueToReference
      };
    }

    const deletedAt = new Date();
    const updatedFile = await this.fileRepository.markPendingDeleteWithDatabase(
      database,
      tenantId,
      fileId,
      deletedAt
    );
    if (!updatedFile) {
      return {
        file,
        cleanupStatus: DetachedFileCleanupStatus.Noop
      };
    }

    await this.auditOutbox.insert(
      database,
      buildTenantAuditEvent({
        eventType: 'tenant.file.deleted.audit',
        tenantId: String(tenantId),
        actorId,
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

    return {
      file: updatedFile,
      cleanupStatus: DetachedFileCleanupStatus.PendingDelete
    };
  }
}

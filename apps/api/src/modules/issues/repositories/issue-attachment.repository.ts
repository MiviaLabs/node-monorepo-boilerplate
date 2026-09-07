import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  files,
  issueAttachments,
  isNull,
  users,
  type File,
  type NewIssueAttachment,
  type NodePgDatabase
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';

export type IssueAttachmentListRow = {
  id: number;
  issueId: number;
  uploadedByUserId: number;
  uploaderDisplayName: string | null;
  uploaderAvatarFileId: number | null;
  uploaderPhotoUrl: string | null;
  fileId: number | null;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  status: File['status'] | null;
  visibility: File['visibility'] | null;
  storageInstance: string | null;
  bucket: string | null;
  objectKey: string | null;
  createdAt: Date;
};

type IssueAttachmentDatabaseTarget = NodePgDatabase;

@Injectable()
export class IssueAttachmentRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueId(tenantId: number, issueId: number): Promise<IssueAttachmentListRow[]> {
    return this.listByIssueIdWithDatabase(this.db, tenantId, issueId);
  }

  async listByIssueIdWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    issueId: number
  ): Promise<IssueAttachmentListRow[]> {
    return database
      .select({
        id: issueAttachments.id,
        issueId: issueAttachments.issueId,
        uploadedByUserId: issueAttachments.uploadedByUserId,
        uploaderDisplayName: users.displayName,
        uploaderAvatarFileId: users.avatarFileId,
        uploaderPhotoUrl: users.photoUrl,
        fileId: issueAttachments.fileId,
        legacyOriginalFilename: issueAttachments.originalFilename,
        legacyMimeType: issueAttachments.mimeType,
        legacyByteSize: issueAttachments.byteSize,
        legacyObjectKey: issueAttachments.storageKey,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        byteSize: files.byteSize,
        status: files.status,
        visibility: files.visibility,
        storageInstance: files.storageInstance,
        bucket: files.bucket,
        objectKey: files.objectKey,
        createdAt: issueAttachments.createdAt
      })
      .from(issueAttachments)
      .leftJoin(
        files,
        and(
          eq(files.id, issueAttachments.fileId),
          eq(files.organizationId, tenantId),
          isNull(files.deletedAt)
        )
      )
      .leftJoin(users, eq(users.id, issueAttachments.uploadedByUserId))
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          eq(issueAttachments.issueId, issueId),
          isNull(issueAttachments.deletedAt)
        )
      )
      .orderBy(desc(issueAttachments.createdAt), desc(issueAttachments.id))
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          issueId: row.issueId,
          uploadedByUserId: row.uploadedByUserId,
          uploaderDisplayName: row.uploaderDisplayName,
          uploaderAvatarFileId: row.uploaderAvatarFileId,
          uploaderPhotoUrl: row.uploaderPhotoUrl,
          fileId: row.fileId,
          originalFilename: row.originalFilename ?? row.legacyOriginalFilename,
          mimeType: row.mimeType ?? row.legacyMimeType ?? null,
          byteSize: row.byteSize ?? row.legacyByteSize,
          status: row.status ?? null,
          visibility: row.visibility ?? null,
          storageInstance: row.storageInstance ?? null,
          bucket: row.bucket ?? null,
          objectKey: row.objectKey ?? row.legacyObjectKey,
          createdAt: row.createdAt
        }))
      );
  }

  async findActiveByFileIdWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    fileId: number
  ): Promise<typeof issueAttachments.$inferSelect | null> {
    const [attachment] = await database
      .select()
      .from(issueAttachments)
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          eq(issueAttachments.fileId, fileId),
          isNull(issueAttachments.deletedAt)
        )
      )
      .limit(1);

    return attachment ?? null;
  }

  async findActiveByIdWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    issueId: number,
    attachmentId: number
  ): Promise<typeof issueAttachments.$inferSelect | null> {
    const [attachment] = await database
      .select()
      .from(issueAttachments)
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          eq(issueAttachments.issueId, issueId),
          eq(issueAttachments.id, attachmentId),
          isNull(issueAttachments.deletedAt)
        )
      )
      .limit(1);

    return attachment ?? null;
  }

  async findByIdWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    issueId: number,
    attachmentId: number
  ): Promise<typeof issueAttachments.$inferSelect | null> {
    const [attachment] = await database
      .select()
      .from(issueAttachments)
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          eq(issueAttachments.issueId, issueId),
          eq(issueAttachments.id, attachmentId)
        )
      )
      .limit(1);

    return attachment ?? null;
  }

  async createWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    data: Omit<NewIssueAttachment, 'organizationId'>
  ): Promise<typeof issueAttachments.$inferSelect> {
    const [attachment] = await database
      .insert(issueAttachments)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!attachment) {
      throw new Error('Failed to create issue attachment');
    }

    return attachment;
  }

  async softDeleteByIdWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    issueId: number,
    attachmentId: number,
    deletedAt: Date
  ): Promise<typeof issueAttachments.$inferSelect | null> {
    const [attachment] = await database
      .update(issueAttachments)
      .set({
        deletedAt
      })
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          eq(issueAttachments.issueId, issueId),
          eq(issueAttachments.id, attachmentId),
          isNull(issueAttachments.deletedAt)
        )
      )
      .returning();

    return attachment ?? null;
  }

  async softDeleteByIssueIdsWithDatabase(
    database: IssueAttachmentDatabaseTarget,
    tenantId: number,
    issueIds: readonly number[],
    deletedAt: Date
  ): Promise<Array<typeof issueAttachments.$inferSelect>> {
    if (issueIds.length === 0) {
      return [];
    }

    return database
      .update(issueAttachments)
      .set({
        deletedAt
      })
      .where(
        and(
          eq(issueAttachments.organizationId, tenantId),
          inArray(issueAttachments.issueId, [...issueIds]),
          isNull(issueAttachments.deletedAt)
        )
      )
      .returning();
  }
}

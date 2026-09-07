import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  contentAttachments,
  desc,
  eq,
  files,
  isNull,
  users,
  type File,
  type NewContentAttachment,
  type NodePgDatabase
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';

export type ContentAttachmentListRow = {
  id: number;
  contentEntryId: number;
  fileId: number;
  attachedByUserId: number;
  attachedByDisplayName: string | null;
  uploadedByUserId: number | null;
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

type ContentAttachmentDatabaseTarget = NodePgDatabase;

@Injectable()
export class ContentAttachmentRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByContentEntryId(
    tenantId: number,
    contentEntryId: number
  ): Promise<ContentAttachmentListRow[]> {
    return this.listByContentEntryIdWithDatabase(this.db, tenantId, contentEntryId);
  }

  async listByContentEntryIdWithDatabase(
    database: ContentAttachmentDatabaseTarget,
    tenantId: number,
    contentEntryId: number
  ): Promise<ContentAttachmentListRow[]> {
    return database
      .select({
        id: contentAttachments.id,
        contentEntryId: contentAttachments.contentEntryId,
        fileId: contentAttachments.fileId,
        attachedByUserId: contentAttachments.attachedByUserId,
        attachedByDisplayName: users.displayName,
        uploadedByUserId: files.uploadedByUserId,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        byteSize: files.byteSize,
        status: files.status,
        visibility: files.visibility,
        storageInstance: files.storageInstance,
        bucket: files.bucket,
        objectKey: files.objectKey,
        createdAt: contentAttachments.createdAt
      })
      .from(contentAttachments)
      .leftJoin(
        files,
        and(
          eq(files.id, contentAttachments.fileId),
          eq(files.organizationId, tenantId),
          isNull(files.deletedAt)
        )
      )
      .leftJoin(users, eq(users.id, contentAttachments.attachedByUserId))
      .where(
        and(
          eq(contentAttachments.organizationId, tenantId),
          eq(contentAttachments.contentEntryId, contentEntryId),
          isNull(contentAttachments.deletedAt)
        )
      )
      .orderBy(desc(contentAttachments.createdAt), desc(contentAttachments.id))
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          originalFilename: row.originalFilename ?? '',
          byteSize: row.byteSize ?? 0,
          uploadedByUserId: row.uploadedByUserId ?? null,
          mimeType: row.mimeType ?? null,
          status: row.status ?? null,
          visibility: row.visibility ?? null,
          storageInstance: row.storageInstance ?? null,
          bucket: row.bucket ?? null,
          objectKey: row.objectKey ?? null
        }))
      );
  }

  async findActiveByEntryAndFileWithDatabase(
    database: ContentAttachmentDatabaseTarget,
    tenantId: number,
    contentEntryId: number,
    fileId: number
  ): Promise<typeof contentAttachments.$inferSelect | null> {
    const [attachment] = await database
      .select()
      .from(contentAttachments)
      .where(
        and(
          eq(contentAttachments.organizationId, tenantId),
          eq(contentAttachments.contentEntryId, contentEntryId),
          eq(contentAttachments.fileId, fileId),
          isNull(contentAttachments.deletedAt)
        )
      )
      .limit(1);

    return attachment ?? null;
  }

  async createWithDatabase(
    database: ContentAttachmentDatabaseTarget,
    tenantId: number,
    data: Omit<NewContentAttachment, 'organizationId'>
  ): Promise<typeof contentAttachments.$inferSelect> {
    const [attachment] = await database
      .insert(contentAttachments)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!attachment) {
      throw new Error('Failed to create content attachment');
    }

    return attachment;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  asc,
  and,
  contentAttachments,
  eq,
  files,
  inArray,
  issueAttachments,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  users,
  type File as DbFile,
  type NewFile,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '@/common/database/database.constants';
import { BaseRepository } from '@/common/infrastructure/repositories/base.repository';

type FileDatabaseTarget = NodePgDatabase;
type FileReferenceCounts = {
  avatarCount: number;
  issueAttachmentCount: number;
  contentAttachmentCount: number;
  total: number;
};

@Injectable()
export class FileRepository extends BaseRepository<DbFile, NewFile, Partial<NewFile>, number> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof files {
    return files;
  }

  protected getIdColumn(): typeof files.id {
    return files.id;
  }

  protected getTenantColumn(): typeof files.organizationId {
    return files.organizationId;
  }

  protected getEntityName(): string {
    return 'File';
  }

  override async findById(tenantId: number, id: number): Promise<DbFile | null> {
    return this.findByIdWithDatabase(this.db, tenantId, id);
  }

  async findByIds(tenantId: number, ids: readonly number[]): Promise<DbFile[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.organizationId, tenantId),
          inArray(files.id, [...ids]),
          isNull(files.deletedAt)
        )
      );
  }

  async findByIdWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<DbFile | null> {
    const query = database
      .select()
      .from(files)
      .where(and(eq(files.organizationId, tenantId), eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);

    const [file] = lockForUpdate ? await query.for('update') : await query;
    return file ?? null;
  }

  async findByIdIncludingDeletedWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<DbFile | null> {
    const query = database
      .select()
      .from(files)
      .where(and(eq(files.organizationId, tenantId), eq(files.id, id)))
      .limit(1);

    const [file] = lockForUpdate ? await query.for('update') : await query;
    return file ?? null;
  }

  async findByIdOrThrowWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<DbFile> {
    const file = await this.findByIdWithDatabase(database, tenantId, id, lockForUpdate);
    if (!file) {
      throw Errors.databaserecordNotFound004({ entity: 'File' });
    }
    return file;
  }

  async findByIdIncludingDeletedOrThrowWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    id: number,
    lockForUpdate = false
  ): Promise<DbFile> {
    const file = await this.findByIdIncludingDeletedWithDatabase(
      database,
      tenantId,
      id,
      lockForUpdate
    );
    if (!file) {
      throw Errors.databaserecordNotFound004({ entity: 'File' });
    }
    return file;
  }

  async allocateIdWithDatabase(database: FileDatabaseTarget): Promise<number> {
    const result = await database.execute(
      sql`select nextval(pg_get_serial_sequence('files', 'id'))::int as id`
    );
    const allocatedId = Number(result.rows[0]?.['id']);

    if (!Number.isInteger(allocatedId) || allocatedId <= 0) {
      throw new Error('Failed to allocate file identifier from the files sequence');
    }

    return allocatedId;
  }

  async createWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    data: Omit<NewFile, 'organizationId'>
  ): Promise<DbFile> {
    const [createdFile] = await database
      .insert(files)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!createdFile) {
      throw new Error('Insert operation failed to return inserted file');
    }

    return createdFile;
  }

  async markUploadReadyWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number,
    updates: Pick<NewFile, 'byteSize' | 'etag' | 'mimeType' | 'uploadedAt'> & {
      updatedAt: Date;
    }
  ): Promise<DbFile> {
    const [updatedFile] = await database
      .update(files)
      .set({
        status: 'ready',
        byteSize: updates.byteSize,
        etag: updates.etag ?? null,
        mimeType: updates.mimeType ?? null,
        uploadedAt: updates.uploadedAt,
        updatedAt: updates.updatedAt
      })
      .where(
        and(
          eq(files.organizationId, tenantId),
          eq(files.id, fileId),
          eq(files.status, 'pending_upload'),
          isNull(files.deletedAt)
        )
      )
      .returning();

    if (!updatedFile) {
      throw Errors.databaserecordNotFound004({ entity: 'File' });
    }

    return updatedFile;
  }

  async touchLastAccessedAtWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number,
    accessedAt: Date
  ): Promise<void> {
    await database
      .update(files)
      .set({
        lastAccessedAt: accessedAt,
        updatedAt: accessedAt
      })
      .where(
        and(eq(files.organizationId, tenantId), eq(files.id, fileId), isNull(files.deletedAt))
      );
  }

  async countActiveReferencesWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number
  ): Promise<FileReferenceCounts> {
    const [[avatarResult], [issueResult], [contentResult]] = await Promise.all([
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            eq(users.organizationId, tenantId),
            eq(users.avatarFileId, fileId),
            isNull(users.deletedAt)
          )
        ),
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(issueAttachments)
        .where(
          and(
            eq(issueAttachments.organizationId, tenantId),
            eq(issueAttachments.fileId, fileId),
            isNull(issueAttachments.deletedAt)
          )
        ),
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(contentAttachments)
        .where(
          and(
            eq(contentAttachments.organizationId, tenantId),
            eq(contentAttachments.fileId, fileId),
            isNull(contentAttachments.deletedAt)
          )
        )
    ]);

    const avatarCount = avatarResult?.count ?? 0;
    const issueAttachmentCount = issueResult?.count ?? 0;
    const contentAttachmentCount = contentResult?.count ?? 0;

    return {
      avatarCount,
      issueAttachmentCount,
      contentAttachmentCount,
      total: avatarCount + issueAttachmentCount + contentAttachmentCount
    };
  }

  async markPendingDeleteWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number,
    deletedAt: Date
  ): Promise<DbFile | null> {
    const [updatedFile] = await database
      .update(files)
      .set({
        status: 'pending_delete',
        deletedAt,
        updatedAt: deletedAt
      })
      .where(and(eq(files.organizationId, tenantId), eq(files.id, fileId), isNull(files.deletedAt)))
      .returning();

    return updatedFile ?? null;
  }

  async listPurgeCandidatesWithDatabase(
    database: FileDatabaseTarget,
    deletedBeforeOrAt: Date,
    limit: number
  ): Promise<DbFile[]> {
    return database
      .select()
      .from(files)
      .where(
        and(
          isNotNull(files.deletedAt),
          isNull(files.purgedAt),
          lte(files.deletedAt, deletedBeforeOrAt),
          or(eq(files.status, 'pending_delete'), eq(files.status, 'deleted'))
        )
      )
      .orderBy(asc(files.deletedAt), asc(files.id))
      .limit(limit);
  }

  async markPurgedWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number,
    purgedAt: Date
  ): Promise<DbFile | null> {
    const [updatedFile] = await database
      .update(files)
      .set({
        status: 'deleted',
        purgedAt,
        updatedAt: purgedAt
      })
      .where(
        and(
          eq(files.organizationId, tenantId),
          eq(files.id, fileId),
          isNotNull(files.deletedAt),
          isNull(files.purgedAt)
        )
      )
      .returning();

    return updatedFile ?? null;
  }

  async listStalePendingUploadsWithDatabase(
    database: FileDatabaseTarget,
    createdBeforeOrAt: Date,
    limit: number
  ): Promise<DbFile[]> {
    return database
      .select()
      .from(files)
      .where(
        and(
          eq(files.status, 'pending_upload'),
          isNull(files.deletedAt),
          isNull(files.uploadedAt),
          lte(files.createdAt, createdBeforeOrAt)
        )
      )
      .orderBy(asc(files.createdAt), asc(files.id))
      .limit(limit);
  }

  async markUploadFailedWithDatabase(
    database: FileDatabaseTarget,
    tenantId: number,
    fileId: number,
    updatedAt: Date
  ): Promise<DbFile | null> {
    const [updatedFile] = await database
      .update(files)
      .set({
        status: 'upload_failed',
        updatedAt
      })
      .where(
        and(
          eq(files.organizationId, tenantId),
          eq(files.id, fileId),
          eq(files.status, 'pending_upload'),
          isNull(files.deletedAt)
        )
      )
      .returning();

    return updatedFile ?? null;
  }
}

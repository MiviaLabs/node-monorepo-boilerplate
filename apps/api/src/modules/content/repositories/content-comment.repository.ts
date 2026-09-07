import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  contentComments,
  desc,
  eq,
  isNull,
  users,
  type NewContentComment,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

export type ContentCommentRow = {
  id: number;
  contentEntryId: number;
  authorUserId: number;
  authorDisplayName: string | null;
  authorAvatarFileId: number | null;
  authorPhotoUrl: string | null;
  bodyMarkdown: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ContentCommentRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByContentEntryId(
    tenantId: number,
    contentEntryId: number
  ): Promise<ContentCommentRow[]> {
    return this.db
      .select({
        id: contentComments.id,
        contentEntryId: contentComments.contentEntryId,
        authorUserId: contentComments.authorUserId,
        authorDisplayName: users.displayName,
        authorAvatarFileId: users.avatarFileId,
        authorPhotoUrl: users.photoUrl,
        bodyMarkdown: contentComments.bodyMarkdown,
        createdAt: contentComments.createdAt,
        updatedAt: contentComments.updatedAt
      })
      .from(contentComments)
      .innerJoin(users, eq(users.id, contentComments.authorUserId))
      .where(
        and(
          eq(contentComments.organizationId, tenantId),
          eq(contentComments.contentEntryId, contentEntryId),
          isNull(contentComments.deletedAt)
        )
      )
      .orderBy(desc(contentComments.createdAt), desc(contentComments.id));
  }

  async findVisibleByIdOrThrow(
    database: NodePgDatabase,
    tenantId: number,
    contentEntryId: number,
    commentId: number,
    lockForUpdate = false
  ): Promise<ContentCommentRow> {
    const query = database
      .select({
        id: contentComments.id,
        contentEntryId: contentComments.contentEntryId,
        authorUserId: contentComments.authorUserId,
        authorDisplayName: users.displayName,
        authorAvatarFileId: users.avatarFileId,
        authorPhotoUrl: users.photoUrl,
        bodyMarkdown: contentComments.bodyMarkdown,
        createdAt: contentComments.createdAt,
        updatedAt: contentComments.updatedAt
      })
      .from(contentComments)
      .innerJoin(users, eq(users.id, contentComments.authorUserId))
      .where(
        and(
          eq(contentComments.organizationId, tenantId),
          eq(contentComments.contentEntryId, contentEntryId),
          eq(contentComments.id, commentId),
          isNull(contentComments.deletedAt)
        )
      )
      .limit(1);

    const [row] = await (lockForUpdate ? query.for('update') : query);
    if (!row) {
      throw Errors.databaserecordNotFound004({ entity: 'ContentComment' });
    }

    return row;
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: Omit<NewContentComment, 'organizationId'>
  ): Promise<typeof contentComments.$inferSelect> {
    const [created] = await tx
      .insert(contentComments)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create content comment');
    }

    return created;
  }

  async softDeleteWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    contentEntryId: number,
    commentId: number,
    deletedAt: Date
  ): Promise<void> {
    await tx
      .update(contentComments)
      .set({
        deletedAt,
        updatedAt: deletedAt
      })
      .where(
        and(
          eq(contentComments.organizationId, tenantId),
          eq(contentComments.contentEntryId, contentEntryId),
          eq(contentComments.id, commentId),
          isNull(contentComments.deletedAt)
        )
      );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  inArray,
  issueComments,
  isNull,
  users,
  type NewIssueComment,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueCommentRow = {
  id: number;
  authorUserId: number;
  authorDisplayName: string | null;
  authorAvatarFileId: number | null;
  authorPhotoUrl: string | null;
  bodyMarkdown: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class IssueCommentRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueId(tenantId: number, issueId: number): Promise<IssueCommentRow[]> {
    return this.db
      .select({
        id: issueComments.id,
        authorUserId: issueComments.authorUserId,
        authorDisplayName: users.displayName,
        authorAvatarFileId: users.avatarFileId,
        authorPhotoUrl: users.photoUrl,
        bodyMarkdown: issueComments.bodyMarkdown,
        createdAt: issueComments.createdAt,
        updatedAt: issueComments.updatedAt
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.authorUserId))
      .where(
        and(
          eq(issueComments.organizationId, tenantId),
          eq(issueComments.issueId, issueId),
          isNull(issueComments.deletedAt)
        )
      )
      .orderBy(asc(issueComments.createdAt), asc(issueComments.id));
  }

  async findVisibleByIdOrThrow(
    database: NodePgDatabase,
    tenantId: number,
    issueId: number,
    commentId: number
  ): Promise<IssueCommentRow> {
    const [row] = await database
      .select({
        id: issueComments.id,
        authorUserId: issueComments.authorUserId,
        authorDisplayName: users.displayName,
        authorAvatarFileId: users.avatarFileId,
        authorPhotoUrl: users.photoUrl,
        bodyMarkdown: issueComments.bodyMarkdown,
        createdAt: issueComments.createdAt,
        updatedAt: issueComments.updatedAt
      })
      .from(issueComments)
      .innerJoin(users, eq(users.id, issueComments.authorUserId))
      .where(
        and(
          eq(issueComments.organizationId, tenantId),
          eq(issueComments.issueId, issueId),
          eq(issueComments.id, commentId),
          isNull(issueComments.deletedAt)
        )
      )
      .limit(1);

    if (!row) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueComment' });
    }

    return row;
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: Omit<NewIssueComment, 'organizationId'>
  ): Promise<typeof issueComments.$inferSelect> {
    const [created] = await tx
      .insert(issueComments)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create issue comment');
    }

    return created;
  }

  async softDeleteByIssueIdsWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueIds: readonly number[],
    deletedAt: Date
  ): Promise<number> {
    if (issueIds.length === 0) {
      return 0;
    }

    const rows = await tx
      .update(issueComments)
      .set({
        deletedAt,
        updatedAt: deletedAt
      })
      .where(
        and(
          eq(issueComments.organizationId, tenantId),
          inArray(issueComments.issueId, [...issueIds]),
          isNull(issueComments.deletedAt)
        )
      )
      .returning({ id: issueComments.id });

    return rows.length;
  }
}

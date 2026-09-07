import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  issueActivity,
  sql,
  users,
  type NewIssueActivity,
  type NodePgDatabase
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueActivityRow = {
  id: number;
  activityType: string;
  actorUserId: number | null;
  actorDisplayName: string | null;
  actorAvatarFileId: number | null;
  actorPhotoUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type IssueActivityByIssueRow = IssueActivityRow & {
  issueId: number;
};

@Injectable()
export class IssueActivityRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueId(tenantId: number, issueId: number, limit = 20): Promise<IssueActivityRow[]> {
    return this.db
      .select({
        id: issueActivity.id,
        activityType: issueActivity.activityType,
        actorUserId: issueActivity.actorUserId,
        actorDisplayName: users.displayName,
        actorAvatarFileId: users.avatarFileId,
        actorPhotoUrl: users.photoUrl,
        metadata: issueActivity.metadataJson,
        createdAt: issueActivity.createdAt
      })
      .from(issueActivity)
      .leftJoin(users, eq(users.id, issueActivity.actorUserId))
      .where(and(eq(issueActivity.organizationId, tenantId), eq(issueActivity.issueId, issueId)))
      .orderBy(desc(issueActivity.createdAt), desc(issueActivity.id))
      .limit(limit);
  }

  async listByIssueIds(
    tenantId: number,
    issueIds: number[],
    limitPerIssue = 4
  ): Promise<IssueActivityByIssueRow[]> {
    if (issueIds.length === 0) {
      return [];
    }

    const rankedActivitySql = sql`
      select
        ${issueActivity.issueId} as issue_id,
        ${issueActivity.id} as id,
        ${issueActivity.activityType} as activity_type,
        ${issueActivity.actorUserId} as actor_user_id,
        ${users.displayName} as actor_display_name,
        ${users.avatarFileId} as actor_avatar_file_id,
        ${users.photoUrl} as actor_photo_url,
        ${issueActivity.metadataJson} as metadata,
        ${issueActivity.createdAt} as created_at,
        row_number() over (
          partition by ${issueActivity.issueId}
          order by ${issueActivity.createdAt} desc, ${issueActivity.id} desc
        ) as row_number
      from ${issueActivity}
      left join ${users}
        on ${users.id} = ${issueActivity.actorUserId}
      where ${issueActivity.organizationId} = ${tenantId}
        and ${issueActivity.issueId} in (${sql.join(
          issueIds.map((issueId) => sql`${issueId}`),
          sql`, `
        )})
    `;

    const result = await this.db.execute(sql`
      with ranked_activity as (${rankedActivitySql})
      select
        ranked_activity.issue_id,
        ranked_activity.id,
        ranked_activity.activity_type,
        ranked_activity.actor_user_id,
        ranked_activity.actor_display_name,
        ranked_activity.actor_avatar_file_id,
        ranked_activity.actor_photo_url,
        ranked_activity.metadata,
        ranked_activity.created_at
      from ranked_activity
      where ranked_activity.row_number <= ${limitPerIssue}
      order by ranked_activity.issue_id asc, ranked_activity.created_at desc, ranked_activity.id desc
    `);

    return result.rows.map((row) => ({
      issueId: Number(row['issue_id']),
      id: Number(row['id']),
      activityType: String(row['activity_type']),
      actorUserId:
        row['actor_user_id'] === null || row['actor_user_id'] === undefined
          ? null
          : Number(row['actor_user_id']),
      actorDisplayName:
        typeof row['actor_display_name'] !== 'string' ? null : row['actor_display_name'],
      actorAvatarFileId:
        row['actor_avatar_file_id'] === null || row['actor_avatar_file_id'] === undefined
          ? null
          : Number(row['actor_avatar_file_id']),
      actorPhotoUrl: typeof row['actor_photo_url'] === 'string' ? row['actor_photo_url'] : null,
      metadata: (row['metadata'] as Record<string, unknown> | null | undefined) ?? {},
      createdAt: row['created_at'] as Date
    }));
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: Omit<NewIssueActivity, 'organizationId'>
  ): Promise<typeof issueActivity.$inferSelect> {
    const [created] = await tx
      .insert(issueActivity)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create issue activity');
    }

    return created;
  }

  async deleteByIssueIdsWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueIds: readonly number[]
  ): Promise<number> {
    if (issueIds.length === 0) {
      return 0;
    }

    const rows = await tx
      .delete(issueActivity)
      .where(
        and(
          eq(issueActivity.organizationId, tenantId),
          inArray(issueActivity.issueId, [...issueIds])
        )
      )
      .returning({ id: issueActivity.id });

    return rows.length;
  }
}

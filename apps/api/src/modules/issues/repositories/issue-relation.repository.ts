import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  issueRelations,
  issues,
  isNull,
  or,
  sql,
  type NewIssueRelation,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueRelationQueryResult = {
  rows: Array<Record<string, unknown>>;
};

@Injectable()
export class IssueRelationRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueId(tenantId: number, issueId: number): Promise<IssueRelationQueryResult> {
    return this.db.execute(sql`
      select
        r.id,
        case
          when r.source_issue_id = ${issueId} then r.relation_type
          when r.relation_type = 'blocks' then 'blocked_by'
          when r.relation_type = 'blocked_by' then 'blocks'
          else r.relation_type
        end as relation_type,
        case when r.source_issue_id = ${issueId} then r.target_issue_id else r.source_issue_id end as related_issue_id,
        i.title as related_issue_title,
        i.issue_number as related_issue_number
      from ${issueRelations} r
      inner join ${issues} base_issue on base_issue.id = ${issueId}
      inner join ${issues} i on i.id = case when r.source_issue_id = ${issueId} then r.target_issue_id else r.source_issue_id end
      where base_issue.organization_id = ${tenantId}
        and (r.source_issue_id = ${issueId} or r.target_issue_id = ${issueId})
        and i.deleted_at is null
        and base_issue.deleted_at is null
      order by r.id asc
    `);
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: Omit<NewIssueRelation, 'organizationId'>
  ): Promise<typeof issueRelations.$inferSelect> {
    const [created] = await tx
      .insert(issueRelations)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create issue relation');
    }

    return created;
  }

  async findByIdOrThrow(
    tenantId: number,
    relationId: number
  ): Promise<typeof issueRelations.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(issueRelations)
      .innerJoin(issues, eq(issues.id, issueRelations.sourceIssueId))
      .where(
        and(
          eq(issueRelations.id, relationId),
          eq(issueRelations.organizationId, tenantId),
          isNull(issues.deletedAt)
        )
      )
      .limit(1);

    if (!row) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueRelation' });
    }

    return row.issue_relations;
  }

  async deleteWithDatabase(tx: NodePgDatabase, relationId: number): Promise<void> {
    await tx.delete(issueRelations).where(eq(issueRelations.id, relationId));
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
      .delete(issueRelations)
      .where(
        and(
          eq(issueRelations.organizationId, tenantId),
          or(
            inArray(issueRelations.sourceIssueId, [...issueIds]),
            inArray(issueRelations.targetIssueId, [...issueIds])
          )
        )
      )
      .returning({ id: issueRelations.id });

    return rows.length;
  }
}

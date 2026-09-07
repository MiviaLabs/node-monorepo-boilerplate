import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  issueAssignees,
  issueActivity,
  issueLabelAssignments,
  issueLabels,
  issueAttachments,
  issueComments,
  issueWatchers,
  issues,
  or,
  projectMembers,
  projects,
  sql,
  type Issue,
  type NewIssue,
  type NodePgDatabase,
  type SQL
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

import type { IssueSortBy, IssueSortOrder } from '../dto/query-issues.dto';
import type { IssueProjectDtoShape } from '../types/issue.types';

export type IssueActorContext = {
  userId: number;
  roles?: readonly string[];
};

export type IssueListOptions = {
  page: number;
  pageSize: number;
  projectId?: number;
  labelId?: number;
  assigneeUserId?: number;
  watcherUserId?: number;
  activityActorUserId?: number;
  search?: string;
  status?: Issue['status'];
  priority?: Issue['priority'];
  sortBy?: IssueSortBy;
  sortOrder?: IssueSortOrder;
};

export type IssueSummaryFilter = Pick<
  IssueListOptions,
  | 'projectId'
  | 'labelId'
  | 'assigneeUserId'
  | 'watcherUserId'
  | 'search'
  | 'status'
  | 'priority'
  | 'activityActorUserId'
>;

export type VisibleIssueRow = Issue & {
  projectKey: string | null;
  projectName: string | null;
  projectVisibility: IssueProjectDtoShape['visibility'] | null;
};

export type IssueRelationCandidateOptions = {
  projectId: number;
  excludeIssueId: number;
  limit: number;
};

@Injectable()
export class IssueRepository extends BaseRepository<Issue, NewIssue, Partial<NewIssue>, number> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof issues {
    return issues;
  }

  protected getIdColumn(): typeof issues.id {
    return issues.id;
  }

  protected getTenantColumn(): typeof issues.organizationId {
    return issues.organizationId;
  }

  protected getEntityName(): string {
    return 'Issue';
  }

  async listVisibleIssues(
    tenantId: number,
    actor: IssueActorContext,
    options: IssueListOptions
  ): Promise<{ data: VisibleIssueRow[]; total: number }> {
    const offset = (options.page - 1) * options.pageSize;
    const whereClause = this.buildWhereClause(tenantId, actor, options);
    const [countRow] = await this.db
      .select({ count: count(issues.id) })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(whereClause);

    const data = await this.db
      .select({
        id: issues.id,
        organizationId: issues.organizationId,
        projectId: issues.projectId,
        parentIssueId: issues.parentIssueId,
        issueNumber: issues.issueNumber,
        title: issues.title,
        descriptionMarkdown: issues.descriptionMarkdown,
        status: issues.status,
        priority: issues.priority,
        position: issues.position,
        estimate: issues.estimate,
        dueAt: issues.dueAt,
        resolvedAt: issues.resolvedAt,
        createdBy: issues.createdBy,
        updatedBy: issues.updatedBy,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        deletedAt: issues.deletedAt,
        projectKey: projects.key,
        projectName: projects.name,
        projectVisibility: projects.visibility
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(whereClause)
      .orderBy(...this.buildOrderBy(options.sortBy, options.sortOrder))
      .limit(options.pageSize)
      .offset(offset);

    return {
      data: data as VisibleIssueRow[],
      total: Number(countRow?.count ?? 0)
    };
  }

  async findVisibleIssueByIdOrThrow(
    tenantId: number,
    issueId: number,
    actor: IssueActorContext
  ): Promise<VisibleIssueRow> {
    const [issue] = await this.db
      .select({
        id: issues.id,
        organizationId: issues.organizationId,
        projectId: issues.projectId,
        parentIssueId: issues.parentIssueId,
        issueNumber: issues.issueNumber,
        title: issues.title,
        descriptionMarkdown: issues.descriptionMarkdown,
        status: issues.status,
        priority: issues.priority,
        position: issues.position,
        estimate: issues.estimate,
        dueAt: issues.dueAt,
        resolvedAt: issues.resolvedAt,
        createdBy: issues.createdBy,
        updatedBy: issues.updatedBy,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        deletedAt: issues.deletedAt,
        projectKey: projects.key,
        projectName: projects.name,
        projectVisibility: projects.visibility
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(
        and(
          eq(issues.organizationId, tenantId),
          eq(issues.id, issueId),
          isNull(issues.deletedAt),
          this.buildVisibilityClause(actor)
        )
      )
      .limit(1);

    if (!issue) {
      throw Errors.databaserecordNotFound004({ entity: 'Issue' });
    }

    return issue as VisibleIssueRow;
  }

  async summarizeVisibleIssues(
    tenantId: number,
    actor: IssueActorContext,
    filters: IssueSummaryFilter
  ): Promise<{
    total: number;
    backlog: number;
    inProgress: number;
    blocked: number;
    done: number;
  }> {
    const [row] = await this.db
      .select({
        total: count(issues.id),
        backlog: sql<number>`count(*) filter (where ${issues.status} = 'backlog')`,
        inProgress: sql<number>`count(*) filter (where ${issues.status} = 'in_progress')`,
        blocked: sql<number>`count(*) filter (where ${issues.status} = 'blocked')`,
        done: sql<number>`count(*) filter (where ${issues.status} = 'done')`
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(this.buildWhereClause(tenantId, actor, filters));

    return {
      total: Number(row?.total ?? 0),
      backlog: Number(row?.backlog ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      blocked: Number(row?.blocked ?? 0),
      done: Number(row?.done ?? 0)
    };
  }

  async listRelationCandidates(
    tenantId: number,
    actor: IssueActorContext,
    options: IssueRelationCandidateOptions
  ): Promise<VisibleIssueRow[]> {
    return this.db
      .select({
        id: issues.id,
        organizationId: issues.organizationId,
        projectId: issues.projectId,
        parentIssueId: issues.parentIssueId,
        issueNumber: issues.issueNumber,
        title: issues.title,
        descriptionMarkdown: issues.descriptionMarkdown,
        status: issues.status,
        priority: issues.priority,
        position: issues.position,
        estimate: issues.estimate,
        dueAt: issues.dueAt,
        resolvedAt: issues.resolvedAt,
        createdBy: issues.createdBy,
        updatedBy: issues.updatedBy,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        deletedAt: issues.deletedAt,
        projectKey: projects.key,
        projectName: projects.name,
        projectVisibility: projects.visibility
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(
        and(
          eq(issues.organizationId, tenantId),
          eq(issues.projectId, options.projectId),
          isNull(issues.parentIssueId),
          isNull(issues.deletedAt),
          this.buildVisibilityClause(actor),
          sql`${issues.id} <> ${options.excludeIssueId}`
        )
      )
      .orderBy(desc(issues.updatedAt), desc(issues.id))
      .limit(options.limit) as Promise<VisibleIssueRow[]>;
  }

  async countCommentsByIssueIds(
    tenantId: number,
    issueIds: number[]
  ): Promise<Map<number, number>> {
    if (issueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        issueId: issueComments.issueId,
        count: count(issueComments.id)
      })
      .from(issueComments)
      .innerJoin(issues, eq(issues.id, issueComments.issueId))
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issueComments.issueId, issueIds),
          isNull(issueComments.deletedAt),
          isNull(issues.deletedAt)
        )
      )
      .groupBy(issueComments.issueId);

    return new Map(rows.map((row) => [row.issueId, Number(row.count)]));
  }

  async countAttachmentsByIssueIds(
    tenantId: number,
    issueIds: number[]
  ): Promise<Map<number, number>> {
    if (issueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        issueId: issueAttachments.issueId,
        count: count(issueAttachments.id)
      })
      .from(issueAttachments)
      .innerJoin(issues, eq(issues.id, issueAttachments.issueId))
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issueAttachments.issueId, issueIds),
          isNull(issueAttachments.deletedAt),
          isNull(issues.deletedAt)
        )
      )
      .groupBy(issueAttachments.issueId);

    return new Map(rows.map((row) => [row.issueId, Number(row.count)]));
  }

  async countWatchersByIssueIds(
    tenantId: number,
    issueIds: number[]
  ): Promise<Map<number, number>> {
    if (issueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        issueId: issueWatchers.issueId,
        count: count(issueWatchers.id)
      })
      .from(issueWatchers)
      .innerJoin(issues, eq(issues.id, issueWatchers.issueId))
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issueWatchers.issueId, issueIds),
          isNull(issues.deletedAt)
        )
      )
      .groupBy(issueWatchers.issueId);

    return new Map(rows.map((row) => [row.issueId, Number(row.count)]));
  }

  async countSubtasksByIssueIds(
    tenantId: number,
    issueIds: number[]
  ): Promise<Map<number, { total: number; done: number }>> {
    if (issueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        parentIssueId: issues.parentIssueId,
        total: count(issues.id),
        done: sql<number>`count(*) filter (where ${issues.status} = 'done')`
      })
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issues.parentIssueId, issueIds),
          isNull(issues.deletedAt)
        )
      )
      .groupBy(issues.parentIssueId);

    return new Map(
      rows
        .filter((row): row is typeof row & { parentIssueId: number } => row.parentIssueId !== null)
        .map((row) => [row.parentIssueId, { total: Number(row.total), done: Number(row.done) }])
    );
  }

  async listVisibleSubtasksByParentIssueId(
    tenantId: number,
    actor: IssueActorContext,
    parentIssueId: number
  ): Promise<VisibleIssueRow[]> {
    const rows = await this.db
      .select({
        id: issues.id,
        organizationId: issues.organizationId,
        projectId: issues.projectId,
        parentIssueId: issues.parentIssueId,
        issueNumber: issues.issueNumber,
        title: issues.title,
        descriptionMarkdown: issues.descriptionMarkdown,
        status: issues.status,
        priority: issues.priority,
        position: issues.position,
        estimate: issues.estimate,
        dueAt: issues.dueAt,
        resolvedAt: issues.resolvedAt,
        createdBy: issues.createdBy,
        updatedBy: issues.updatedBy,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        deletedAt: issues.deletedAt,
        projectKey: projects.key,
        projectName: projects.name,
        projectVisibility: projects.visibility
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, issues.projectId), eq(projectMembers.userId, actor.userId))
      )
      .where(
        and(
          eq(issues.organizationId, tenantId),
          eq(issues.parentIssueId, parentIssueId),
          isNull(issues.deletedAt),
          this.buildVisibilityClause(actor)
        )
      )
      .orderBy(asc(issues.position), asc(issues.id));

    return rows as VisibleIssueRow[];
  }

  async getNextIssueNumber(tenantId: number): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(max(${issues.issueNumber}), 0)` })
      .from(issues)
      .where(and(eq(issues.organizationId, tenantId), isNull(issues.deletedAt)));

    return Number(row?.value ?? 0) + 1;
  }

  async getNextPosition(
    tenantId: number,
    scope: { projectId: number | null; status: Issue['status'] }
  ): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(max(${issues.position}), -1)` })
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, tenantId),
          scope.projectId === null
            ? isNull(issues.projectId)
            : eq(issues.projectId, scope.projectId),
          eq(issues.status, scope.status),
          isNull(issues.deletedAt)
        )
      );

    return Number(row?.value ?? -1) + 1;
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: Omit<NewIssue, 'organizationId'>
  ): Promise<Issue> {
    const [created] = await tx
      .insert(issues)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create issue');
    }

    return created;
  }

  async listActiveIssueTreeIdsWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    rootIssueId: number
  ): Promise<number[]> {
    const result = await tx.execute(sql`
      with recursive issue_tree as (
        select ${issues.id} as id
        from ${issues}
        where ${issues.organizationId} = ${tenantId}
          and ${issues.id} = ${rootIssueId}
          and ${issues.deletedAt} is null
        union
        select child.id as id
        from ${issues} child
        inner join issue_tree parent on child.parent_issue_id = parent.id
        where child.organization_id = ${tenantId}
          and child.deleted_at is null
      )
      select id
      from issue_tree
      order by id asc
    `);

    return result.rows.map((row) => Number(row['id']));
  }

  async updateWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueId: number,
    data: Partial<NewIssue>
  ): Promise<Issue> {
    const [updated] = await tx
      .update(issues)
      .set(data)
      .where(
        and(eq(issues.organizationId, tenantId), eq(issues.id, issueId), isNull(issues.deletedAt))
      )
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'Issue' });
    }

    return updated;
  }

  async softDeleteWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueId: number,
    userId: number,
    deletedAt: Date
  ): Promise<Issue> {
    const [deleted] = await tx
      .update(issues)
      .set({
        deletedAt,
        updatedAt: deletedAt,
        updatedBy: userId
      })
      .where(
        and(eq(issues.organizationId, tenantId), eq(issues.id, issueId), isNull(issues.deletedAt))
      )
      .returning();

    if (!deleted) {
      throw Errors.databaserecordNotFound004({ entity: 'Issue' });
    }

    return deleted;
  }

  async softDeleteByIdsWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueIds: readonly number[],
    userId: number,
    deletedAt: Date
  ): Promise<Array<Pick<Issue, 'id' | 'issueNumber'>>> {
    if (issueIds.length === 0) {
      return [];
    }

    return tx
      .update(issues)
      .set({
        deletedAt,
        updatedAt: deletedAt,
        updatedBy: userId
      })
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issues.id, [...issueIds]),
          isNull(issues.deletedAt)
        )
      )
      .returning({
        id: issues.id,
        issueNumber: issues.issueNumber
      });
  }

  async clearParentIssueForChildIssuesWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    parentIssueId: number,
    userId: number,
    updatedAt: Date
  ): Promise<number> {
    const rows = await tx
      .update(issues)
      .set({
        parentIssueId: null,
        updatedAt,
        updatedBy: userId
      })
      .where(
        and(
          eq(issues.organizationId, tenantId),
          eq(issues.parentIssueId, parentIssueId),
          isNull(issues.deletedAt)
        )
      )
      .returning({ id: issues.id });

    return rows.length;
  }

  async findByIdOrThrowWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueId: number
  ): Promise<Issue> {
    const [row] = await tx
      .select()
      .from(issues)
      .where(
        and(eq(issues.organizationId, tenantId), eq(issues.id, issueId), isNull(issues.deletedAt))
      )
      .limit(1);

    if (!row) {
      throw Errors.databaserecordNotFound004({ entity: 'Issue' });
    }

    return row;
  }

  private buildWhereClause(
    tenantId: number,
    actor: IssueActorContext,
    options: IssueSummaryFilter
  ): SQL {
    const clauses: SQL[] = [
      eq(issues.organizationId, tenantId),
      isNull(issues.deletedAt),
      this.buildVisibilityClause(actor)
    ];

    if (options.projectId !== undefined) {
      clauses.push(eq(issues.projectId, options.projectId));
    }

    if (options.status !== undefined) {
      clauses.push(eq(issues.status, options.status));
    }

    if (options.priority !== undefined) {
      clauses.push(eq(issues.priority, options.priority));
    }

    if (options.labelId !== undefined) {
      clauses.push(
        sql`exists (
          select 1
          from ${issueLabelAssignments}
          inner join ${issueLabels}
            on ${issueLabels.id} = ${issueLabelAssignments.labelId}
          where ${issueLabelAssignments.issueId} = ${issues.id}
            and ${issueLabelAssignments.labelId} = ${options.labelId}
            and ${issueLabels.organizationId} = ${tenantId}
            and ${issueLabels.deletedAt} is null
        )`
      );
    }

    if (options.assigneeUserId !== undefined) {
      clauses.push(
        sql`exists (
          select 1
          from ${issueAssignees}
          where ${issueAssignees.issueId} = ${issues.id}
            and ${issueAssignees.userId} = ${options.assigneeUserId}
        )`
      );
    }

    if (options.watcherUserId !== undefined) {
      clauses.push(
        sql`(
          exists (
            select 1
            from ${issueWatchers}
            where ${issueWatchers.issueId} = ${issues.id}
              and ${issueWatchers.userId} = ${options.watcherUserId}
          )
          or exists (
            select 1
            from ${issueAssignees}
            where ${issueAssignees.issueId} = ${issues.id}
              and ${issueAssignees.userId} = ${options.watcherUserId}
          )
        )`
      );
    }

    if (options.activityActorUserId !== undefined) {
      clauses.push(
        sql`exists (
          select 1
          from ${issueActivity}
          where ${issueActivity.issueId} = ${issues.id}
            and ${issueActivity.actorUserId} = ${options.activityActorUserId}
        )`
      );
    }

    if (options.search && options.search.trim().length > 0) {
      const pattern = `%${options.search.trim()}%`;
      clauses.push(
        sql`(${issues.title} ilike ${pattern} or ${issues.descriptionMarkdown} ilike ${pattern})`
      );
    }

    return and(...clauses) ?? sql`true`;
  }

  private buildVisibilityClause(actor: IssueActorContext): SQL {
    if (this.isAdmin(actor.roles)) {
      return sql`true`;
    }

    return (
      or(
        isNull(issues.projectId),
        eq(projects.visibility, 'public'),
        eq(projects.createdBy, actor.userId),
        eq(projectMembers.userId, actor.userId)
      ) ?? sql`false`
    );
  }

  private buildOrderBy(sortBy?: IssueSortBy, sortOrder?: IssueSortOrder): SQL[] {
    const order = sortOrder ?? 'desc';

    if (sortBy === 'createdAt') {
      return [order === 'asc' ? asc(issues.createdAt) : desc(issues.createdAt), desc(issues.id)];
    }
    if (sortBy === 'priority') {
      return [
        order === 'asc'
          ? asc(
              sql`case ${issues.priority}
                when 'urgent' then 1
                when 'high' then 2
                when 'medium' then 3
                else 4 end`
            )
          : desc(
              sql`case ${issues.priority}
                when 'urgent' then 1
                when 'high' then 2
                when 'medium' then 3
                else 4 end`
            ),
        desc(issues.updatedAt),
        desc(issues.id)
      ];
    }
    if (sortBy === 'dueAt') {
      return [order === 'asc' ? asc(issues.dueAt) : desc(issues.dueAt), desc(issues.id)];
    }
    if (sortBy === 'position') {
      return [order === 'asc' ? asc(issues.position) : desc(issues.position), desc(issues.id)];
    }

    return [order === 'asc' ? asc(issues.updatedAt) : desc(issues.updatedAt), desc(issues.id)];
  }

  private isAdmin(roles?: readonly string[]): boolean {
    if (!roles) {
      return false;
    }

    return roles.includes('tenant_owner') || roles.includes('tenant_admin');
  }
}

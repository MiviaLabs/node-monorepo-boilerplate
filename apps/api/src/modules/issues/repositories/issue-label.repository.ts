import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  issueLabelAssignments,
  issueLabels,
  issues,
  isNull,
  or,
  projectMembers,
  projects,
  sql,
  type NodePgDatabase,
  type SQL
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueLabelActorContext = {
  userId: number;
  roles?: readonly string[];
};

@Injectable()
export class IssueLabelRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listVisibleLabels(
    tenantId: number,
    actor: IssueLabelActorContext
  ): Promise<
    Array<{
      id: number;
      name: string;
      color: string | null;
      description: string | null;
      projectId: number | null;
    }>
  > {
    return this.db
      .select({
        id: issueLabels.id,
        name: issueLabels.name,
        color: issueLabels.color,
        description: issueLabels.description,
        projectId: issueLabels.projectId
      })
      .from(issueLabels)
      .leftJoin(projects, eq(projects.id, issueLabels.projectId))
      .leftJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, issueLabels.projectId),
          eq(projectMembers.userId, actor.userId)
        )
      )
      .where(
        and(
          eq(issueLabels.organizationId, tenantId),
          isNull(issueLabels.deletedAt),
          this.buildVisibilityClause(actor)
        )
      )
      .orderBy(issueLabels.name);
  }

  async listByIssueIds(
    tenantId: number,
    issueIds: number[]
  ): Promise<
    Array<{
      issueId: number;
      id: number;
      name: string;
      color: string | null;
      description: string | null;
      projectId: number | null;
    }>
  > {
    if (issueIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        issueId: issueLabelAssignments.issueId,
        id: issueLabels.id,
        name: issueLabels.name,
        color: issueLabels.color,
        description: issueLabels.description,
        projectId: issueLabels.projectId
      })
      .from(issueLabelAssignments)
      .innerJoin(issues, eq(issues.id, issueLabelAssignments.issueId))
      .innerJoin(issueLabels, eq(issueLabels.id, issueLabelAssignments.labelId))
      .where(
        and(
          eq(issues.organizationId, tenantId),
          inArray(issueLabelAssignments.issueId, issueIds),
          isNull(issueLabels.deletedAt),
          isNull(issues.deletedAt)
        )
      )
      .orderBy(issueLabelAssignments.issueId, issueLabels.name);
  }

  async listByIssueId(
    tenantId: number,
    issueId: number
  ): Promise<
    Array<{
      id: number;
      name: string;
      color: string | null;
      description: string | null;
      projectId: number | null;
    }>
  > {
    const rows = await this.listByIssueIds(tenantId, [issueId]);
    return rows.map(({ issueId: _issueId, ...label }) => label);
  }

  async findVisibleByIdOrThrow(
    tenantId: number,
    labelId: number,
    actor: IssueLabelActorContext
  ): Promise<{
    id: number;
    name: string;
    color: string | null;
    description: string | null;
    projectId: number | null;
  }> {
    const [row] = await this.db
      .select({
        id: issueLabels.id,
        name: issueLabels.name,
        color: issueLabels.color,
        description: issueLabels.description,
        projectId: issueLabels.projectId
      })
      .from(issueLabels)
      .leftJoin(projects, eq(projects.id, issueLabels.projectId))
      .leftJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, issueLabels.projectId),
          eq(projectMembers.userId, actor.userId)
        )
      )
      .where(
        and(
          eq(issueLabels.organizationId, tenantId),
          eq(issueLabels.id, labelId),
          isNull(issueLabels.deletedAt),
          this.buildVisibilityClause(actor)
        )
      )
      .limit(1);

    if (!row) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueLabel' });
    }

    return row;
  }

  private buildVisibilityClause(actor: IssueLabelActorContext): SQL {
    if (this.isAdmin(actor.roles)) {
      return sql`true`;
    }

    return or(
      isNull(issueLabels.projectId),
      eq(projects.visibility, 'public'),
      eq(projects.createdBy, actor.userId),
      eq(projectMembers.userId, actor.userId)
    )!;
  }

  private isAdmin(roles?: readonly string[]): boolean {
    return (
      roles?.some(
        (role) => role === 'tenant_owner' || role === 'tenant_admin' || role === 'super_admin'
      ) ?? false
    );
  }

  async findByNormalizedName(
    tenantId: number,
    normalizedName: string,
    excludeLabelId?: number
  ): Promise<{ id: number } | null> {
    const [row] = await this.db
      .select({ id: issueLabels.id })
      .from(issueLabels)
      .where(
        and(
          eq(issueLabels.organizationId, tenantId),
          isNull(issueLabels.projectId),
          isNull(issueLabels.deletedAt),
          sql`lower(${issueLabels.name}) = ${normalizedName}`,
          excludeLabelId === undefined ? undefined : sql`${issueLabels.id} <> ${excludeLabelId}`
        )
      )
      .limit(1);

    return row ?? null;
  }

  async createWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    data: typeof issueLabels.$inferInsert
  ): Promise<typeof issueLabels.$inferSelect> {
    const [created] = await tx
      .insert(issueLabels)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create issue label');
    }

    return created;
  }

  async updateWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    labelId: number,
    data: Partial<typeof issueLabels.$inferInsert>
  ): Promise<typeof issueLabels.$inferSelect> {
    const [updated] = await tx
      .update(issueLabels)
      .set(data)
      .where(
        and(
          eq(issueLabels.organizationId, tenantId),
          eq(issueLabels.id, labelId),
          isNull(issueLabels.deletedAt)
        )
      )
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueLabel' });
    }

    return updated;
  }

  async softDeleteWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    labelId: number,
    userId: number,
    deletedAt: Date
  ): Promise<typeof issueLabels.$inferSelect> {
    const [deleted] = await tx
      .update(issueLabels)
      .set({
        deletedAt,
        updatedAt: deletedAt,
        updatedBy: userId
      })
      .where(
        and(
          eq(issueLabels.organizationId, tenantId),
          eq(issueLabels.id, labelId),
          isNull(issueLabels.deletedAt)
        )
      )
      .returning();

    if (!deleted) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueLabel' });
    }

    return deleted;
  }

  async createAssignmentWithDatabase(
    tx: NodePgDatabase,
    data: typeof issueLabelAssignments.$inferInsert
  ): Promise<typeof issueLabelAssignments.$inferSelect | undefined> {
    const [created] = await tx.insert(issueLabelAssignments).values(data).returning();
    return created;
  }

  async deleteAssignmentWithDatabase(
    tx: NodePgDatabase,
    issueId: number,
    labelId: number
  ): Promise<void> {
    const existing = await tx
      .select({ issueId: issueLabelAssignments.issueId })
      .from(issueLabelAssignments)
      .where(
        and(eq(issueLabelAssignments.issueId, issueId), eq(issueLabelAssignments.labelId, labelId))
      )
      .limit(1);

    if (existing.length === 0) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueLabelAssignment' });
    }

    await tx
      .delete(issueLabelAssignments)
      .where(
        and(eq(issueLabelAssignments.issueId, issueId), eq(issueLabelAssignments.labelId, labelId))
      );
  }

  async deleteAssignmentsByIssueIdsWithDatabase(
    tx: NodePgDatabase,
    tenantId: number,
    issueIds: readonly number[]
  ): Promise<number> {
    if (issueIds.length === 0) {
      return 0;
    }

    const rows = await tx
      .delete(issueLabelAssignments)
      .where(
        and(
          eq(issueLabelAssignments.organizationId, tenantId),
          inArray(issueLabelAssignments.issueId, [...issueIds])
        )
      )
      .returning({ id: issueLabelAssignments.id });

    return rows.length;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  issueAssignees,
  issues,
  users,
  type NewIssueAssignee,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueAssigneeDatabaseTarget = NodePgDatabase;
type IssueAssigneeRow = {
  issueId: number;
  userId: number;
  displayName: string | null;
  avatarFileId: number | null;
  photoUrl: string | null;
};

@Injectable()
export class IssueAssigneeRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueId(tenantId: number, issueId: number): Promise<IssueAssigneeRow[]> {
    const rows = await this.listByIssueIds(tenantId, [issueId]);
    return rows.filter((row) => row.issueId === issueId);
  }

  async listByIssueIds(tenantId: number, issueIds: number[]): Promise<IssueAssigneeRow[]> {
    if (issueIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        issueId: issueAssignees.issueId,
        userId: issueAssignees.userId,
        displayName: users.displayName,
        avatarFileId: users.avatarFileId,
        photoUrl: users.photoUrl
      })
      .from(issueAssignees)
      .innerJoin(issues, eq(issues.id, issueAssignees.issueId))
      .innerJoin(users, eq(users.id, issueAssignees.userId))
      .where(and(eq(issues.organizationId, tenantId), inArray(issueAssignees.issueId, issueIds)))
      .orderBy(issueAssignees.issueId, issueAssignees.id);
  }

  async createWithDatabase(
    database: IssueAssigneeDatabaseTarget,
    data: NewIssueAssignee
  ): Promise<void> {
    try {
      await database.insert(issueAssignees).values(data);
    } catch (error) {
      if (this.isConflict(error)) {
        throw Errors.databaserecordAlreadyExists003({ entity: 'IssueAssignee' });
      }
      throw error;
    }
  }

  async deleteWithDatabase(
    database: IssueAssigneeDatabaseTarget,
    issueId: number,
    userId: number
  ): Promise<void> {
    const existing = await database
      .select({ id: issueAssignees.id })
      .from(issueAssignees)
      .where(and(eq(issueAssignees.issueId, issueId), eq(issueAssignees.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueAssignee' });
    }

    await database
      .delete(issueAssignees)
      .where(and(eq(issueAssignees.issueId, issueId), eq(issueAssignees.userId, userId)));
  }

  async deleteByIssueIdsWithDatabase(
    database: IssueAssigneeDatabaseTarget,
    issueIds: readonly number[]
  ): Promise<number> {
    if (issueIds.length === 0) {
      return 0;
    }

    const rows = await database
      .delete(issueAssignees)
      .where(inArray(issueAssignees.issueId, [...issueIds]))
      .returning({ id: issueAssignees.id });

    return rows.length;
  }

  private isConflict(error: unknown): boolean {
    const stack: unknown[] = [error];

    while (stack.length > 0) {
      const current = stack.pop();
      if (typeof current !== 'object' || current === null) {
        continue;
      }

      const code = 'code' in current ? String(current.code) : '';
      const constraint = 'constraint' in current ? String(current.constraint).toLowerCase() : '';
      const detail = 'detail' in current ? String(current.detail).toLowerCase() : '';

      if (
        code === '23505' &&
        (constraint.includes('issue_assignees_issue_user_uidx') ||
          detail.includes('(issue_id, user_id)='))
      ) {
        return true;
      }

      if ('cause' in current) {
        stack.push(current.cause);
      }
    }

    return false;
  }
}

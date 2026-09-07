import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  issueWatchers,
  issues,
  users,
  type NewIssueWatcher,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';

type IssueWatcherDatabaseTarget = NodePgDatabase;
type IssueWatcherRow = {
  issueId: number;
  userId: number;
  displayName: string | null;
  avatarFileId: number | null;
  photoUrl: string | null;
};

@Injectable()
export class IssueWatcherRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listByIssueIds(tenantId: number, issueIds: number[]): Promise<IssueWatcherRow[]> {
    if (issueIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        issueId: issueWatchers.issueId,
        userId: issueWatchers.userId,
        displayName: users.displayName,
        avatarFileId: users.avatarFileId,
        photoUrl: users.photoUrl
      })
      .from(issueWatchers)
      .innerJoin(issues, eq(issues.id, issueWatchers.issueId))
      .innerJoin(users, eq(users.id, issueWatchers.userId))
      .where(and(eq(issues.organizationId, tenantId), inArray(issueWatchers.issueId, issueIds)))
      .orderBy(issueWatchers.issueId, issueWatchers.id);
  }

  async listByIssueId(tenantId: number, issueId: number): Promise<IssueWatcherRow[]> {
    const rows = await this.listByIssueIds(tenantId, [issueId]);
    return rows.filter((row) => row.issueId === issueId);
  }

  async createWithDatabase(
    database: IssueWatcherDatabaseTarget,
    data: NewIssueWatcher
  ): Promise<void> {
    try {
      await database.insert(issueWatchers).values(data);
    } catch (error) {
      if (this.isConflict(error)) {
        throw Errors.databaserecordAlreadyExists003({ entity: 'IssueWatcher' });
      }
      throw error;
    }
  }

  async deleteWithDatabase(
    database: IssueWatcherDatabaseTarget,
    issueId: number,
    userId: number
  ): Promise<void> {
    const existing = await database
      .select({ id: issueWatchers.id })
      .from(issueWatchers)
      .where(and(eq(issueWatchers.issueId, issueId), eq(issueWatchers.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      throw Errors.databaserecordNotFound004({ entity: 'IssueWatcher' });
    }

    await database
      .delete(issueWatchers)
      .where(and(eq(issueWatchers.issueId, issueId), eq(issueWatchers.userId, userId)));
  }

  async deleteByIssueIdsWithDatabase(
    database: IssueWatcherDatabaseTarget,
    issueIds: readonly number[]
  ): Promise<number> {
    if (issueIds.length === 0) {
      return 0;
    }

    const rows = await database
      .delete(issueWatchers)
      .where(inArray(issueWatchers.issueId, [...issueIds]))
      .returning({ id: issueWatchers.id });

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
        (constraint.includes('issue_watchers_issue_user_uidx') ||
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

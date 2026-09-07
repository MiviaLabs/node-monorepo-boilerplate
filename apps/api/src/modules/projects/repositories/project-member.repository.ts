import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  inArray,
  eq,
  isNull,
  or,
  organizations,
  projectMembers,
  projects,
  type NewProjectMember,
  type NodePgDatabase,
  userTenants,
  users
} from '@package/db-core';
import { Errors } from '@package/errors';
import { sql } from 'drizzle-orm';

import { MAIN_DB } from '../../../common/database/database.constants';

import type { ProjectMemberSummary } from '../types/project.types';

type ProjectMemberDatabaseTarget = NodePgDatabase;

@Injectable()
export class ProjectMemberRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async listMembers(tenantId: number, projectId: number): Promise<ProjectMemberSummary[]> {
    return this.listMembersWithDatabase(this.db, tenantId, projectId);
  }

  async listMembersByProjectIds(
    tenantId: number,
    projectIds: readonly number[]
  ): Promise<Map<number, ProjectMemberSummary[]>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        projectId: projectMembers.projectId,
        userId: users.id,
        displayName: users.displayName,
        photoUrl: users.photoUrl,
        createdAt: projectMembers.createdAt,
        isCreator: sql<boolean>`${projects.createdBy} = ${users.id}`
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projects.organizationId, tenantId),
          inArray(projectMembers.projectId, [...projectIds]),
          isNull(projects.deletedAt),
          isNull(users.deletedAt)
        )
      )
      .orderBy(projectMembers.projectId, projectMembers.createdAt, users.id);

    const membersByProjectId = new Map<number, ProjectMemberSummary[]>();
    for (const projectId of projectIds) {
      membersByProjectId.set(projectId, []);
    }

    for (const row of rows) {
      const current = membersByProjectId.get(row.projectId) ?? [];
      current.push({
        userId: row.userId,
        displayName: row.displayName ?? null,
        photoUrl: row.photoUrl ?? null,
        isCreator: Boolean(row.isCreator),
        assignedAt: row.createdAt
      });
      membersByProjectId.set(row.projectId, current);
    }

    return membersByProjectId;
  }

  async listMembersWithDatabase(
    database: ProjectMemberDatabaseTarget,
    tenantId: number,
    projectId: number
  ): Promise<ProjectMemberSummary[]> {
    const rows = await database
      .select({
        userId: users.id,
        displayName: users.displayName,
        photoUrl: users.photoUrl,
        createdAt: projectMembers.createdAt,
        isCreator: sql<boolean>`${projects.createdBy} = ${users.id}`
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt),
          isNull(users.deletedAt)
        )
      )
      .orderBy(projectMembers.createdAt, users.id);

    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName ?? null,
      photoUrl: row.photoUrl ?? null,
      isCreator: Boolean(row.isCreator),
      assignedAt: row.createdAt
    }));
  }

  async isProjectMember(
    tenantId: number,
    projectId: number,
    userId: number,
    database: ProjectMemberDatabaseTarget = this.db
  ): Promise<boolean> {
    const [member] = await database
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          eq(projectMembers.userId, userId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    return member !== undefined;
  }

  async listMembershipProjectIds(
    tenantId: number,
    userId: number,
    projectIds: readonly number[],
    database: ProjectMemberDatabaseTarget = this.db
  ): Promise<number[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const rows = await database
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projectMembers.userId, userId),
          inArray(projectMembers.projectId, [...projectIds]),
          isNull(projects.deletedAt)
        )
      );

    return rows.map((row) => row.projectId);
  }

  async assertAssignableOrganizationMember(
    tenantId: number,
    userId: number,
    database: ProjectMemberDatabaseTarget = this.db
  ): Promise<void> {
    const [member] = await database
      .select({ id: users.id })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .leftJoin(
        userTenants,
        and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, organizations.tenantId))
      )
      .where(
        and(
          eq(users.id, userId),
          eq(users.organizationId, tenantId),
          or(eq(userTenants.isActive, true), isNull(userTenants.id)),
          eq(users.isActive, true),
          isNull(users.deletedAt),
          isNull(organizations.deletedAt)
        )
      )
      .limit(1);

    if (!member) {
      throw Errors.databaserecordNotFound004({ entity: 'AssignableProjectMember' });
    }
  }

  async addMemberWithDatabase(
    database: ProjectMemberDatabaseTarget,
    tenantId: number,
    projectId: number,
    memberId: number,
    assignedByUserId: number
  ): Promise<ProjectMemberSummary> {
    const payload: NewProjectMember = {
      projectId,
      userId: memberId,
      assignedByUserId
    };
    try {
      await database.insert(projectMembers).values(payload);
    } catch (error) {
      if (this.isProjectMemberConflict(error)) {
        throw Errors.databaserecordAlreadyExists003({ entity: 'ProjectMember' });
      }
      throw error;
    }

    const members = await this.listMembersWithDatabase(database, tenantId, projectId);
    const created = members.find((member) => member.userId === memberId);
    if (!created) {
      throw new Error('Failed to load project member after insert');
    }

    return created;
  }

  private isProjectMemberConflict(error: unknown): boolean {
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
        (constraint.includes('project_members_project_user_uidx') ||
          constraint.includes('project_members') ||
          detail.includes('(project_id, user_id)='))
      ) {
        return true;
      }

      if ('cause' in current) {
        stack.push(current.cause);
      }
    }

    return false;
  }

  async removeMemberWithDatabase(
    database: ProjectMemberDatabaseTarget,
    _tenantId: number,
    projectId: number,
    memberId: number
  ): Promise<void> {
    const existing = await this.isProjectMember(_tenantId, projectId, memberId, database);
    if (!existing) {
      throw Errors.databaserecordNotFound004({ entity: 'ProjectMember' });
    }

    await database
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)));
  }
}

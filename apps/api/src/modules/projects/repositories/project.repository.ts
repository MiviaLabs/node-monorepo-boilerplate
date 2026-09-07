import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  or,
  projectMembers,
  projects,
  type NewProject,
  type NodePgDatabase,
  type Project,
  type SQL
} from '@package/db-core';
import { Errors } from '@package/errors';
import { ilike, sql } from 'drizzle-orm';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { ProjectSortBy, ProjectSortOrder } from '../dto/query-projects.dto';

export type ProjectActorContext = {
  userId: number;
  roles?: readonly string[];
};

export type ProjectListOptions = {
  page: number;
  pageSize: number;
  search?: string;
  visibility?: Project['visibility'];
  sortBy?: ProjectSortBy;
  sortOrder?: ProjectSortOrder;
};

type ProjectDatabaseTarget = NodePgDatabase;

@Injectable()
export class ProjectRepository extends BaseRepository<
  Project,
  NewProject,
  Partial<NewProject>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof projects {
    return projects;
  }

  protected getIdColumn(): typeof projects.id {
    return projects.id;
  }

  protected getTenantColumn(): typeof projects.organizationId {
    return projects.organizationId;
  }

  protected getEntityName(): string {
    return 'Project';
  }

  override async findById(tenantId: number, id: number): Promise<Project | null> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(
        and(eq(projects.organizationId, tenantId), eq(projects.id, id), isNull(projects.deletedAt))
      )
      .limit(1);

    return project ?? null;
  }

  async findVisibleByIdOrThrow(
    tenantId: number,
    projectId: number,
    actor: ProjectActorContext
  ): Promise<Project> {
    const project = await this.findByIdOrThrow(tenantId, projectId);

    if (
      this.canReadProject(project, actor) ||
      (await this.isProjectMember(tenantId, projectId, actor.userId))
    ) {
      return project;
    }

    throw Errors.databaserecordNotFound004({ entity: 'Project' });
  }

  async findVisibleByIdOrThrowWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    projectId: number,
    actor: ProjectActorContext
  ): Promise<Project> {
    const project = await this.findByIdOrThrowWithDatabase(database, tenantId, projectId);

    if (
      this.canReadProject(project, actor) ||
      (await this.isProjectMemberWithDatabase(database, tenantId, projectId, actor.userId))
    ) {
      return project;
    }

    throw Errors.databaserecordNotFound004({ entity: 'Project' });
  }

  async listVisibleProjects(
    tenantId: number,
    actor: ProjectActorContext,
    options: ProjectListOptions
  ): Promise<{
    data: Project[];
    total: number;
  }> {
    const offset = (options.page - 1) * options.pageSize;
    const scopedVisibilityFilter = this.buildVisibilityFilter(actor);
    const searchFilter =
      options.search && options.search.trim().length > 0
        ? ilike(projects.name, `%${options.search.trim()}%`)
        : undefined;
    const visibilityFilter =
      options.visibility !== undefined ? eq(projects.visibility, options.visibility) : undefined;
    const whereClause =
      scopedVisibilityFilter === undefined
        ? and(
            eq(projects.organizationId, tenantId),
            isNull(projects.deletedAt),
            visibilityFilter,
            searchFilter
          )
        : and(
            eq(projects.organizationId, tenantId),
            isNull(projects.deletedAt),
            scopedVisibilityFilter,
            visibilityFilter,
            searchFilter
          );

    const primaryOrder =
      options.sortBy === ProjectSortBy.Name
        ? options.sortOrder === ProjectSortOrder.Asc
          ? asc(projects.name)
          : desc(projects.name)
        : options.sortBy === ProjectSortBy.CreatedAt
          ? options.sortOrder === ProjectSortOrder.Asc
            ? asc(projects.createdAt)
            : desc(projects.createdAt)
          : options.sortBy === ProjectSortBy.Visibility
            ? options.sortOrder === ProjectSortOrder.Asc
              ? asc(projects.visibility)
              : desc(projects.visibility)
            : options.sortOrder === ProjectSortOrder.Asc
              ? asc(projects.updatedAt)
              : desc(projects.updatedAt);

    const secondaryOrder =
      options.sortBy === ProjectSortBy.UpdatedAt || options.sortBy === undefined
        ? desc(projects.id)
        : desc(projects.updatedAt);

    const [countRow] = await this.db
      .select({ count: count(projects.id) })
      .from(projects)
      .where(whereClause);

    const data = await this.db
      .select()
      .from(projects)
      .where(whereClause)
      .orderBy(primaryOrder, secondaryOrder, desc(projects.id))
      .limit(options.pageSize)
      .offset(offset);

    return {
      data,
      total: Number(countRow?.count ?? 0)
    };
  }

  async countActiveByOrganization(tenantId: number): Promise<number> {
    return this.countActiveByOrganizationWithDatabase(this.db, tenantId);
  }

  async countActiveByOrganizationWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number
  ): Promise<number> {
    const [countRow] = await database
      .select({ count: count(projects.id) })
      .from(projects)
      .where(and(eq(projects.organizationId, tenantId), isNull(projects.deletedAt)));

    return Number(countRow?.count ?? 0);
  }

  async findActiveByKeyWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    key: string
  ): Promise<Project | null> {
    const [project] = await database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.key, key),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    return project ?? null;
  }

  async createWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    data: Omit<NewProject, 'organizationId'>
  ): Promise<Project> {
    const [createdProject] = await database
      .insert(projects)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!createdProject) {
      throw new Error('Insert operation failed to return inserted project');
    }

    return createdProject;
  }

  async findByIdOrThrowWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    projectId: number
  ): Promise<Project> {
    const [project] = await database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.databaserecordNotFound004({ entity: 'Project' });
    }

    return project;
  }

  async updateWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    projectId: number,
    data: Partial<NewProject>
  ): Promise<Project> {
    const [updatedProject] = await database
      .update(projects)
      .set(data)
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt)
        )
      )
      .returning();

    if (!updatedProject) {
      throw Errors.databaserecordNotFound004({ entity: 'Project' });
    }

    return updatedProject;
  }

  async softDeleteProject(tenantId: number, projectId: number): Promise<Project> {
    return this.softDeleteProjectWithDatabase(this.db, tenantId, projectId);
  }

  async softDeleteProjectWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    projectId: number
  ): Promise<Project> {
    const [deletedProject] = await database
      .update(projects)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(projects.organizationId, tenantId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt)
        )
      )
      .returning();

    if (!deletedProject) {
      throw Errors.databaserecordNotFound004({ entity: 'Project' });
    }

    return deletedProject;
  }

  canManageProject(project: Pick<Project, 'createdBy'>, actor: ProjectActorContext): boolean {
    if (this.isAdmin(actor.roles)) {
      return true;
    }

    return project.createdBy === actor.userId;
  }

  canReadProject(
    project: Pick<Project, 'createdBy' | 'visibility'>,
    actor: ProjectActorContext
  ): boolean {
    if (this.isAdmin(actor.roles)) {
      return true;
    }

    return project.visibility === 'public' || project.createdBy === actor.userId;
  }

  private buildVisibilityFilter(actor: ProjectActorContext): SQL | undefined {
    if (this.isAdmin(actor.roles)) {
      return undefined;
    }

    return or(
      eq(projects.visibility, 'public'),
      eq(projects.createdBy, actor.userId),
      sql`exists (
        select 1
        from ${projectMembers}
        where ${projectMembers.projectId} = ${projects.id}
          and ${projectMembers.userId} = ${actor.userId}
      )`
    );
  }

  private isAdmin(roles?: readonly string[]): boolean {
    if (!roles) {
      return false;
    }

    return roles.includes('tenant_owner') || roles.includes('tenant_admin');
  }

  private async isProjectMember(
    tenantId: number,
    projectId: number,
    userId: number
  ): Promise<boolean> {
    return this.isProjectMemberWithDatabase(this.db, tenantId, projectId, userId);
  }

  private async isProjectMemberWithDatabase(
    database: ProjectDatabaseTarget,
    tenantId: number,
    projectId: number,
    userId: number
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
}

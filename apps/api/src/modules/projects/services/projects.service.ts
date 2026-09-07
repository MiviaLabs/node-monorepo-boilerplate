import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  eq,
  organizations,
  tenants,
  type ITenantSettings,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';
import { sql } from 'drizzle-orm';

import { buildTenantAuditEvent } from '../../tenants/events/tenant-audit-event';
import {
  CreateProjectDto,
  ProjectMemberDto,
  ProjectSortBy,
  ProjectSortOrder,
  QueryProjectsDto,
  UpdateProjectDto
} from '../dto';
import { ProjectMemberRepository, ProjectRepository } from '../repositories';

import type { Project, ProjectMemberSummary } from '../types/project.types';
import type { RequestTrace } from '@/common/cqrs/request-trace';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

const MAX_PROJECT_KEY_LENGTH = 8;

/**
 * Projects service
 *
 * Handles project management operations within a tenant.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * List projects
   *
   * @param queryDto - Pagination parameters
   * @returns Paginated list of projects
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async listProjects(params: {
    tenantId: string;
    userId: string;
    roles?: readonly string[];
    page?: QueryProjectsDto['page'];
    pageSize?: QueryProjectsDto['pageSize'];
    search?: QueryProjectsDto['search'];
    visibility?: QueryProjectsDto['visibility'];
    sortBy?: QueryProjectsDto['sortBy'];
    sortOrder?: QueryProjectsDto['sortOrder'];
  }): Promise<{
    data: Project[];
    metadata: {
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
      };
    };
  }> {
    const tenantId = this.parseNumericId(params.tenantId, 'tenantId');
    const userId = this.parseNumericId(params.userId, 'userId');
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const trimmedSearch = params.search?.trim();
    const search = trimmedSearch && trimmedSearch.length > 0 ? trimmedSearch : undefined;
    const sortBy = params.sortBy ?? ProjectSortBy.UpdatedAt;
    const sortOrder = params.sortOrder ?? ProjectSortOrder.Desc;

    this.logger.debug(
      `Listing projects for tenant ${tenantId} - page ${page}, size ${pageSize}, search=${search ?? ''}, visibility=${params.visibility ?? ''}, sortBy=${sortBy}, sortOrder=${sortOrder}`
    );

    const { data, total } = await this.projectRepository.listVisibleProjects(
      tenantId,
      { userId, roles: params.roles },
      {
        page,
        pageSize,
        search,
        visibility: params.visibility,
        sortBy,
        sortOrder
      }
    );
    const membershipProjectIds = new Set(
      await this.projectMemberRepository.listMembershipProjectIds(
        tenantId,
        userId,
        data.map((project) => project.id)
      )
    );
    const projectsWithMembership = data.map((project) => ({
      ...project,
      isMember: membershipProjectIds.has(project.id)
    }));

    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      data: projectsWithMembership,
      metadata: {
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1
        }
      }
    };
  }

  /**
   * Create project
   *
   * @param createDto - Project creation data
   * @returns Created project
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createProject(
    tenantId: string,
    userId: string,
    actorId: string,
    createDto: CreateProjectDto,
    trace: RequestTrace = {}
  ): Promise<Project> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');

    return this.db.transaction(async (tx) => {
      await this.assertProjectLimitNotExceeded(tx, tenantIdNum);
      const projectKey = await this.generateProjectKey(tx, tenantIdNum, createDto.name);

      const project = await this.projectRepository.createWithDatabase(tx, tenantIdNum, {
        createdBy: userIdNum,
        key: projectKey,
        name: createDto.name.trim(),
        visibility: createDto.visibility
      });
      await this.projectMemberRepository.addMemberWithDatabase(
        tx,
        tenantIdNum,
        project.id,
        userIdNum,
        userIdNum
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.project.created.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: project.id,
          action: 'CREATE_PROJECT',
          details: {
            projectId: String(project.id),
            visibility: project.visibility
          }
        })
      );

      return project;
    });
  }

  async listProjectMembers(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    projectId: string
  ): Promise<ProjectMemberDto[]> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');

    this.logger.debug(`Listing members for project ${projectIdNum} in tenant ${tenantIdNum}`);

    const project = await this.projectRepository.findVisibleByIdOrThrow(tenantIdNum, projectIdNum, {
      userId: userIdNum,
      roles
    });
    this.assertCanManageProject(project, userIdNum, roles, 'list members for');

    const members = await this.projectMemberRepository.listMembers(tenantIdNum, projectIdNum);
    return members.map((member) => this.toProjectMemberDto(member));
  }

  async listProjectMembersBulk(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    projectIds: readonly string[]
  ): Promise<Record<string, ProjectMemberDto[]>> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const normalizedProjectIds = Array.from(
      new Set(projectIds.map((projectId) => projectId.trim()))
    )
      .filter((projectId) => projectId.length > 0)
      .map((projectId) => ({
        raw: projectId,
        numeric: this.parseNumericId(projectId, 'projectId')
      }));

    if (normalizedProjectIds.length === 0) {
      return {};
    }

    const authorizedProjects = (
      await Promise.all(
        normalizedProjectIds.map(async ({ raw, numeric }) => {
          try {
            const project = await this.projectRepository.findVisibleByIdOrThrow(
              tenantIdNum,
              numeric,
              {
                userId: userIdNum,
                roles
              }
            );
            this.assertCanManageProject(project, userIdNum, roles, 'list members for');

            return { raw, numeric };
          } catch (error) {
            if (error instanceof ForbiddenException || error instanceof NotFoundException) {
              return null;
            }

            throw error;
          }
        })
      )
    ).filter((project): project is { raw: string; numeric: number } => project !== null);

    if (authorizedProjects.length === 0) {
      return {};
    }

    const membersByProjectId = await this.projectMemberRepository.listMembersByProjectIds(
      tenantIdNum,
      authorizedProjects.map(({ numeric }) => numeric)
    );

    return Object.fromEntries(
      authorizedProjects.map(({ raw, numeric }) => [
        raw,
        (membersByProjectId.get(numeric) ?? []).map((member) => this.toProjectMemberDto(member))
      ])
    );
  }

  /**
   * Get project by ID
   *
   * @param projectId - Project ID
   * @returns Project details
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async findById(
    tenantId: string,
    userId: string,
    roles: readonly string[] | undefined,
    projectId: string
  ): Promise<Project> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');

    this.logger.debug(`Fetching project ${projectIdNum} for tenant ${tenantIdNum}`);

    return this.projectRepository.findVisibleByIdOrThrow(tenantIdNum, projectIdNum, {
      userId: userIdNum,
      roles
    });
  }

  /**
   * Update project
   *
   * @param projectId - Project ID
   * @param updateDto - Update data
   * @returns Updated project
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async updateProject(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    projectId: string,
    updateDto: UpdateProjectDto,
    trace: RequestTrace = {}
  ): Promise<Project> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');

    this.logger.debug(`Updating project ${projectIdNum} for tenant ${tenantIdNum}`);

    return this.db.transaction(async (tx) => {
      const existingProject = await this.projectRepository.findVisibleByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        { userId: userIdNum, roles }
      );
      this.assertCanManageProject(existingProject, userIdNum, roles, 'update');

      const updatedProject = await this.projectRepository.updateWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        {
          ...(updateDto.name !== undefined && { name: updateDto.name.trim() }),
          ...(updateDto.visibility !== undefined && { visibility: updateDto.visibility }),
          updatedAt: new Date()
        }
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.project.updated.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: updatedProject.id,
          action: 'UPDATE_PROJECT',
          details: {
            projectId: String(updatedProject.id),
            visibility: updatedProject.visibility
          }
        })
      );

      return updatedProject;
    });
  }

  /**
   * Delete project
   *
   * @param projectId - Project ID
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async deleteProject(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    projectId: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');

    this.logger.warn(`Deleting project ${projectIdNum} for tenant ${tenantIdNum}`);

    await this.db.transaction(async (tx) => {
      const existingProject = await this.projectRepository.findVisibleByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        { userId: userIdNum, roles }
      );
      this.assertCanManageProject(existingProject, userIdNum, roles, 'delete');

      const deletedProject = await this.projectRepository.softDeleteProjectWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.project.deleted.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: deletedProject.id,
          action: 'DELETE_PROJECT',
          details: {
            projectId: String(deletedProject.id)
          }
        })
      );
    });
  }

  async addProjectMember(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    projectId: string,
    memberId: string,
    trace: RequestTrace = {}
  ): Promise<ProjectMemberDto> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');
    const memberIdNum = this.parseNumericId(memberId, 'memberId');

    this.logger.debug(
      `Adding member ${memberIdNum} to project ${projectIdNum} in tenant ${tenantIdNum}`
    );

    return this.db.transaction(async (tx) => {
      const existingProject = await this.projectRepository.findVisibleByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        { userId: userIdNum, roles }
      );
      this.assertCanManageProject(existingProject, userIdNum, roles, 'manage members for');
      await this.projectMemberRepository.assertAssignableOrganizationMember(
        tenantIdNum,
        memberIdNum,
        tx
      );

      const projectMember = await this.projectMemberRepository.addMemberWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        memberIdNum,
        userIdNum
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.project.member.added.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: existingProject.id,
          action: 'ADD_PROJECT_MEMBER',
          details: {
            projectId: String(existingProject.id),
            userId: String(memberIdNum)
          }
        })
      );

      return this.toProjectMemberDto(projectMember);
    });
  }

  async removeProjectMember(
    tenantId: string,
    userId: string,
    actorId: string,
    roles: readonly string[] | undefined,
    projectId: string,
    memberId: string,
    trace: RequestTrace = {}
  ): Promise<void> {
    const tenantIdNum = this.parseNumericId(tenantId, 'tenantId');
    const userIdNum = this.parseNumericId(userId, 'userId');
    const projectIdNum = this.parseNumericId(projectId, 'projectId');
    const memberIdNum = this.parseNumericId(memberId, 'memberId');

    this.logger.warn(
      `Removing member ${memberIdNum} from project ${projectIdNum} in tenant ${tenantIdNum}`
    );

    await this.db.transaction(async (tx) => {
      const existingProject = await this.projectRepository.findVisibleByIdOrThrowWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        { userId: userIdNum, roles }
      );
      this.assertCanManageProject(existingProject, userIdNum, roles, 'manage members for');

      if (existingProject.createdBy === memberIdNum) {
        throw new ForbiddenException('You cannot remove the project creator from the project.');
      }

      await this.projectMemberRepository.removeMemberWithDatabase(
        tx,
        tenantIdNum,
        projectIdNum,
        memberIdNum
      );

      await this.auditOutbox.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.project.member.removed.audit',
          tenantId,
          actorId,
          requestId: trace.requestId,
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          aggregateId: existingProject.id,
          action: 'REMOVE_PROJECT_MEMBER',
          details: {
            projectId: String(existingProject.id),
            userId: String(memberIdNum)
          }
        })
      );
    });
  }

  private async assertProjectLimitNotExceeded(
    database: NodePgDatabase,
    tenantId: number
  ): Promise<void> {
    const [organization] = await database
      .select({ tenantId: organizations.tenantId })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1)
      .for('update');

    if (!organization) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    const tenantResult = await database.execute<{ settings: ITenantSettings }>(sql`
      SELECT ${tenants.settings} AS settings
      FROM ${tenants}
      WHERE ${tenants.id} = ${organization.tenantId}
      LIMIT 1
    `);
    const tenant = tenantResult.rows[0];

    const settings = (tenant?.settings ?? {}) as ITenantSettings;
    const maxProjects = settings.features?.maxProjects;
    if (maxProjects === undefined) {
      return;
    }

    const activeProjects = await this.projectRepository.countActiveByOrganizationWithDatabase(
      database,
      tenantId
    );
    if (activeProjects >= maxProjects) {
      throw new ForbiddenException('Project limit reached for this organization.');
    }
  }

  private parseNumericId(value: string, field: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ForbiddenException(`Invalid ${field}.`);
    }

    return parsed;
  }

  private async generateProjectKey(
    tx: NodePgDatabase,
    tenantId: number,
    projectName: string
  ): Promise<string> {
    const baseKey = this.buildProjectKeyBase(projectName);
    let candidate = baseKey;
    let suffix = 2;

    while (await this.projectRepository.findActiveByKeyWithDatabase(tx, tenantId, candidate)) {
      const suffixValue = String(suffix);
      const trimmedBase = baseKey.slice(
        0,
        Math.max(1, MAX_PROJECT_KEY_LENGTH - suffixValue.length)
      );
      candidate = `${trimmedBase}${suffixValue}`;
      suffix += 1;
    }

    return candidate;
  }

  private buildProjectKeyBase(projectName: string): string {
    const tokens = projectName
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return 'PRJ';
    }

    const initials = tokens.map((token) => token[0] ?? '').join('');
    if (tokens.length > 1 && initials.length >= 2) {
      return initials.slice(0, MAX_PROJECT_KEY_LENGTH);
    }

    const compact = tokens.join('');
    return compact.slice(0, MAX_PROJECT_KEY_LENGTH) || 'PRJ';
  }

  private assertCanManageProject(
    project: Pick<Project, 'createdBy'>,
    userId: number,
    roles: readonly string[] | undefined,
    action: string
  ): void {
    if (!this.projectRepository.canManageProject(project, { userId, roles })) {
      throw new ForbiddenException(`You do not have permission to ${action} this project.`);
    }
  }

  private toProjectMemberDto(member: ProjectMemberSummary): ProjectMemberDto {
    return {
      userId: member.userId,
      displayName: member.displayName,
      photoUrl: member.photoUrl,
      isCreator: member.isCreator,
      assignedAt:
        member.assignedAt instanceof Date ? member.assignedAt.toISOString() : member.assignedAt
    };
  }
}

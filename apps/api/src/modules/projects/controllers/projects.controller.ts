import {
  BadRequestException,
  Body,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';
import { Action, Resource } from '@package/opa';

import {
  AddProjectMemberCommand,
  CreateProjectCommand,
  DeleteProjectCommand,
  RemoveProjectMemberCommand,
  UpdateProjectCommand
} from '../commands';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ProjectMemberDto,
  QueryProjectsDto,
  UpdateProjectDto,
  PROJECT_SORT_BY_VALUES,
  PROJECT_SORT_ORDER_VALUES
} from '../dto';
import { ProjectsService } from '../services/projects.service';
import { PROJECT_VISIBILITY } from '../types/project.types';

import type { Project } from '../types/project.types';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser } from '@/common/decorators';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
// Import guards from local auth module
import { JwtAuthGuard, HybridPolicyGuard } from '@/modules/auth/guards';

/**
 * Projects controller
 *
 * Handles project management operations within a tenant.
 * All endpoints require authentication and specific tenant permissions.
 */
@ApiTags('projects')
@ApiBearerAuth()
@VersionedController('v1', 'spaces')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class SpacesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly projectsService: ProjectsService
  ) {}

  /**
   * List projects
   *
   * Requires TENANT_PERMISSIONS.PROJECTS_READ
   */
  @Get()
  @ApiOperation({
    summary: 'List projects',
    description:
      'Returns a paginated list of projects within the tenant. Requires tenant:projects:read permission.'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Number of items per page',
    example: 20
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search projects by name',
    example: 'atlas'
  })
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: Object.values(PROJECT_VISIBILITY),
    description: 'Filter by visibility'
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: PROJECT_SORT_BY_VALUES,
    description: 'Sort field',
    example: 'updatedAt'
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: PROJECT_SORT_ORDER_VALUES,
    description: 'Sort direction',
    example: 'desc'
  })
  @ApiOkResponse({ description: 'Projects list returned successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_READ)
  async listProjects(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryProjectsDto
  ): Promise<ReturnType<ProjectsService['listProjects']>> {
    return this.projectsService.listProjects({ tenantId, userId, roles, ...queryDto });
  }

  /**
   * Create project
   *
   * Requires TENANT_PERMISSIONS.PROJECTS_CREATE
   */
  @Post()
  @ApiOperation({
    summary: 'Create project',
    description:
      'Creates a new project within the tenant. Requires tenant:projects:create permission.'
  })
  @ApiCreatedResponse({ description: 'Project created successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_CREATE)
  async createProject(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {},
    @Body() createDto: CreateProjectDto
  ): Promise<Project> {
    try {
      return await this.commandBus.execute(
        new CreateProjectCommand(tenantId, userId, actorId, createDto, toCqrsTrace(trace))
      );
    } catch (error) {
      // Re-throw HTTP exceptions as-is
      if (error && typeof error === 'object' && 'getStatus' in error) {
        throw error;
      }
      // Wrap other errors
      throw error;
    }
  }

  @Get('members/bulk')
  @ApiOperation({
    summary: 'List project members for multiple projects',
    description:
      'Returns members for the provided project ids. Requires tenant:projects:update permission and project manager access for every requested project.'
  })
  @ApiQuery({
    name: 'projectIds',
    required: true,
    type: String,
    description: 'Comma-separated project ids',
    example: '12,15,18'
  })
  @ApiOkResponse({ description: 'Project members returned successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_UPDATE)
  async listProjectMembersBulk(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query('projectIds') projectIds?: string
  ): Promise<Record<string, ProjectMemberDto[]>> {
    if (!projectIds || projectIds.trim().length === 0) {
      throw new BadRequestException('projectIds query parameter is required');
    }

    const normalizedProjectIds = projectIds
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return this.projectsService.listProjectMembersBulk(
      tenantId,
      userId,
      roles,
      normalizedProjectIds
    );
  }

  /**
   * Get project by ID
   *
   * Requires TENANT_PERMISSIONS.PROJECTS_READ
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get project by ID',
    description: 'Returns a single project by ID. Requires tenant:projects:read permission.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @ApiOkResponse({ description: 'Project returned successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_READ)
  async getProject(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') projectId: string
  ): Promise<Project> {
    return this.projectsService.findById(tenantId, userId, roles, projectId);
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'List project members',
    description:
      'Returns the members assigned to a project. Requires tenant:projects:update permission and project manager access.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @ApiOkResponse({
    description: 'Project members returned successfully.',
    type: ProjectMemberDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_UPDATE)
  async listProjectMembers(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') projectId: string
  ): Promise<ProjectMemberDto[]> {
    return this.projectsService.listProjectMembers(tenantId, userId, roles, projectId);
  }

  /**
   * Update project
   *
   * Requires TENANT_PERMISSIONS.PROJECTS_UPDATE
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update project',
    description: 'Updates an existing project. Requires tenant:projects:update permission.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_UPDATE)
  async updateProject(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') projectId: string,
    @Body() updateDto: UpdateProjectDto
  ): Promise<Project> {
    try {
      return await this.commandBus.execute(
        new UpdateProjectCommand(
          tenantId,
          userId,
          actorId,
          roles,
          projectId,
          updateDto,
          toCqrsTrace(trace)
        )
      );
    } catch (error) {
      // Re-throw HTTP exceptions as-is
      if (error && typeof error === 'object' && 'getStatus' in error) {
        throw error;
      }
      // Wrap other errors
      throw error;
    }
  }

  @Post(':id/members')
  @ApiOperation({
    summary: 'Add project member',
    description:
      'Assigns an organization member to the project. Requires tenant:projects:update permission and project manager access.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @ApiCreatedResponse({ description: 'Project member added successfully.', type: ProjectMemberDto })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_UPDATE)
  async addProjectMember(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') projectId: string,
    @Body() addMemberDto: AddProjectMemberDto
  ): Promise<ProjectMemberDto> {
    return this.commandBus.execute(
      new AddProjectMemberCommand(
        tenantId,
        userId,
        actorId,
        roles,
        projectId,
        String(addMemberDto.userId),
        toCqrsTrace(trace)
      )
    );
  }

  /**
   * Delete project
   *
   * Requires TENANT_PERMISSIONS.PROJECTS_DELETE
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete project',
    description: 'Deletes a project. Requires tenant:projects:delete permission.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @ApiNoContentResponse({ description: 'Project deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_DELETE)
  async deleteProject(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') projectId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteProjectCommand(tenantId, userId, actorId, roles, projectId, toCqrsTrace(trace))
    );
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({
    summary: 'Remove project member',
    description:
      'Removes an assigned member from the project. Requires tenant:projects:update permission and project manager access.'
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: String,
    example: '123'
  })
  @ApiParam({
    name: 'memberId',
    description: 'Assigned member user ID',
    type: String,
    example: '42'
  })
  @ApiNoContentResponse({ description: 'Project member removed successfully.' })
  @Resource({ type: OPA_RESOURCES.PROJECTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.PROJECTS_UPDATE)
  async removeProjectMember(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') projectId: string,
    @Param('memberId') memberId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveProjectMemberCommand(
        tenantId,
        userId,
        actorId,
        roles,
        projectId,
        memberId,
        toCqrsTrace(trace)
      )
    );
  }
}

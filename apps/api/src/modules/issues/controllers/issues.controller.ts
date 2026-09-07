import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
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
import { ISSUE_PRIORITY_ENUM, ISSUE_STATUS_ENUM } from '@package/db-core';
import { Action, Resource } from '@package/opa';

import { FileUploadReservationDto } from '../../storage/dto';
import {
  AddIssueAssigneeCommand,
  AddIssueLabelCommand,
  AddIssueWatcherCommand,
  CreateIssueAttachmentCommand,
  CreateIssueAttachmentUploadCommand,
  CreateIssueLabelCommand,
  CreateIssueCommentCommand,
  CreateIssueCommand,
  CreateIssueRelationCommand,
  DeleteIssueAttachmentCommand,
  DeleteIssueLabelCommand,
  DeleteIssueCommand,
  DeleteIssueRelationCommand,
  RemoveIssueAssigneeCommand,
  RemoveIssueLabelCommand,
  RemoveIssueWatcherCommand,
  UpdateIssueLabelCommand,
  UpdateIssueCommand
} from '../commands';
import {
  CreateIssueAttachmentDto,
  CreateIssueAttachmentUploadDto,
  CreateIssueLabelDto,
  CreateIssueCommentDto,
  CreateIssueDto,
  CreateIssueRelationDto,
  IssueActivityDto,
  IssueAttachmentDto,
  IssueCommentDto,
  IssueDetailDto,
  IssuePageDto,
  IssueLabelDto,
  IssueListItemDto,
  IssueRelationDto,
  MutateIssueLabelDto,
  IssueParticipantDto,
  IssuesSummaryDto,
  WorkspaceIssuesPageDto,
  MyWorkPageDto,
  MutateIssueParticipantDto,
  QueryIssuesDto,
  UpdateIssueLabelDto,
  UpdateIssueDto,
  ISSUE_SORT_BY_VALUES,
  ISSUE_SORT_ORDER_VALUES
} from '../dto';
import { IssuesService } from '../services';

import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { Response } from 'express';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser } from '@/common/decorators';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

@ApiTags('issues')
@ApiBearerAuth()
@VersionedController('v1', 'tickets')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class TicketsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly issuesService: IssuesService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List visible issues within the tenant scope.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'projectId', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'labelId', required: false, type: Number, example: 3 })
  @ApiQuery({ name: 'assigneeUserId', required: false, type: Number, example: 9 })
  @ApiQuery({ name: 'watcherUserId', required: false, type: Number, example: 9 })
  @ApiQuery({ name: 'activityActorUserId', required: false, type: Number, example: 9 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'restore' })
  @ApiQuery({ name: 'status', required: false, enum: ISSUE_STATUS_ENUM })
  @ApiQuery({ name: 'priority', required: false, enum: ISSUE_PRIORITY_ENUM })
  @ApiQuery({ name: 'sortBy', required: false, enum: ISSUE_SORT_BY_VALUES })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ISSUE_SORT_ORDER_VALUES })
  @ApiOkResponse({
    description: 'Issues returned successfully.',
    type: IssueListItemDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssues(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) queryDto: QueryIssuesDto
  ): Promise<ReturnType<IssuesService['listIssues']>> {
    return this.issuesService.listIssues({
      tenantId,
      userId,
      roles,
      page: queryDto.page,
      pageSize: queryDto.pageSize,
      projectId: queryDto.projectId,
      labelId: queryDto.labelId,
      assigneeUserId: queryDto.assigneeUserId,
      watcherUserId: queryDto.watcherUserId,
      activityActorUserId: queryDto.activityActorUserId,
      search: queryDto.search,
      status: queryDto.status,
      priority: queryDto.priority,
      sortBy: queryDto.sortBy,
      sortOrder: queryDto.sortOrder
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create one issue.' })
  @ApiCreatedResponse({ description: 'Issue created successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_CREATE)
  async createIssue(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Body() createDto: CreateIssueDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new CreateIssueCommand(tenantId, userId, actorId, roles, createDto, toCqrsTrace(trace))
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Return issue counts for the current visible scope.' })
  @ApiOkResponse({ description: 'Issue summary returned successfully.', type: IssuesSummaryDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getIssuesSummary(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) queryDto: QueryIssuesDto
  ): Promise<IssuesSummaryDto> {
    return this.issuesService.getIssuesSummary({
      tenantId,
      userId,
      roles,
      projectId: queryDto.projectId,
      labelId: queryDto.labelId,
      assigneeUserId: queryDto.assigneeUserId,
      watcherUserId: queryDto.watcherUserId,
      activityActorUserId: queryDto.activityActorUserId,
      search: queryDto.search,
      status: queryDto.status,
      priority: queryDto.priority
    });
  }

  @Get('workspace')
  @ApiOperation({ summary: 'Return the page-shaped workspace issues payload.' })
  @ApiOkResponse({
    description: 'Workspace issues payload returned successfully.',
    type: WorkspaceIssuesPageDto
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getWorkspaceIssuesPage(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined
  ): Promise<WorkspaceIssuesPageDto> {
    return this.issuesService.getWorkspaceIssuesPage({
      tenantId,
      userId,
      roles
    });
  }

  @Get('my-work')
  @ApiOperation({ summary: 'Return the page-shaped my-work payload.' })
  @ApiOkResponse({
    description: 'My-work payload returned successfully.',
    type: MyWorkPageDto
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getMyWorkPage(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined
  ): Promise<MyWorkPageDto> {
    return this.issuesService.getMyWorkPage({
      tenantId,
      userId,
      roles
    });
  }

  @Get(':id/page')
  @ApiOperation({ summary: 'Return the page-shaped issue detail payload.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue page payload returned successfully.',
    type: IssuePageDto
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getIssuePage(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssuePageDto> {
    return this.issuesService.getIssuePage(tenantId, userId, roles, issueId);
  }

  @Get('labels')
  @ApiOperation({ summary: 'List active issue labels within the tenant scope.' })
  @ApiOkResponse({
    description: 'Issue labels returned successfully.',
    type: IssueLabelDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueLabels(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined
  ): Promise<IssueLabelDto[]> {
    return this.issuesService.listIssueLabels(tenantId, userId, roles);
  }

  @Get(':id/relation-candidates')
  @ApiOperation({ summary: 'List relation candidates for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Relation candidates returned successfully.',
    type: IssueListItemDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listRelationCandidateIssues(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueListItemDto[]> {
    return this.issuesService.listRelationCandidateIssues(tenantId, userId, roles, issueId);
  }

  @Get(':id/relations')
  @ApiOperation({ summary: 'List relations for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue relations returned successfully.',
    type: IssueRelationDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueRelations(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<ReturnType<IssuesService['listIssueRelations']>> {
    return this.issuesService.listIssueRelations(tenantId, userId, roles, issueId);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List comments for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue comments returned successfully.',
    type: IssueCommentDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueComments(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueCommentDto[]> {
    return this.issuesService.listIssueComments(tenantId, userId, roles, issueId);
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List attachments for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue attachments returned successfully.',
    type: IssueAttachmentDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueAttachments(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueAttachmentDto[]> {
    return this.issuesService.listIssueAttachments(tenantId, userId, roles, issueId);
  }

  @Get(':id/attachments/:attachmentId/content')
  @ApiOperation({ summary: 'Download content for one active issue attachment.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'attachmentId', type: String, example: '51' })
  @ApiOkResponse({
    description: 'Issue attachment content streamed successfully.'
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getIssueAttachmentContent(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.issuesService.getIssueAttachmentContent(
      tenantId,
      userId,
      actorId,
      roles,
      issueId,
      attachmentId,
      toCqrsTrace(trace)
    );

    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Disposition', content.contentDisposition);
    if (content.contentLength !== undefined) {
      response.setHeader('Content-Length', content.contentLength.toString());
    }
    if (content.etag) {
      response.setHeader('ETag', content.etag);
    }
    if (content.lastModified) {
      response.setHeader('Last-Modified', content.lastModified.toUTCString());
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        content.body.off('error', onError);
        response.off('close', onClose);
        response.off('finish', onFinish);
      };

      const onError = (error: Error): void => {
        cleanup();
        if (!response.headersSent) {
          reject(error);
          return;
        }

        response.destroy(error);
      };

      const onClose = (): void => {
        cleanup();
        content.body.destroy();
        resolve();
      };

      const onFinish = (): void => {
        cleanup();
        resolve();
      };

      content.body.on('error', onError);
      response.on('close', onClose);
      response.on('finish', onFinish);
      content.body.pipe(response);
    });
  }

  @Post(':id/attachments/uploads')
  @ApiOperation({ summary: 'Reserve one issue attachment upload.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({
    description: 'Issue attachment upload reserved successfully.',
    type: FileUploadReservationDto
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async createIssueAttachmentUpload(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() createDto: CreateIssueAttachmentUploadDto
  ): Promise<FileUploadReservationDto> {
    return this.commandBus.execute(
      new CreateIssueAttachmentUploadCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        createDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Get(':id/assignees')
  @ApiOperation({ summary: 'List assignees for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue assignees returned successfully.',
    type: IssueParticipantDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueAssignees(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueParticipantDto[]> {
    return this.issuesService.listIssueAssignees(tenantId, userId, roles, issueId);
  }

  @Get(':id/watchers')
  @ApiOperation({ summary: 'List effective watchers for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue watchers returned successfully.',
    type: IssueParticipantDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueWatchers(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueParticipantDto[]> {
    return this.issuesService.listIssueWatchers(tenantId, userId, roles, issueId);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'List activity entries for one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({
    description: 'Issue activity returned successfully.',
    type: IssueActivityDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async listIssueActivity(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueActivityDto[]> {
    return this.issuesService.listIssueActivity(tenantId, userId, roles, issueId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one issue with detail payload.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({ description: 'Issue returned successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_READ)
  async getIssueById(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') issueId: string
  ): Promise<IssueDetailDto> {
    return this.issuesService.getIssueById(tenantId, userId, roles, issueId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiOkResponse({ description: 'Issue updated successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async updateIssue(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() updateDto: UpdateIssueDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new UpdateIssueCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        updateDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiNoContentResponse({ description: 'Issue deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_DELETE)
  async deleteIssue(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteIssueCommand(tenantId, userId, actorId, roles, issueId, toCqrsTrace(trace))
    );
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add one comment to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({ description: 'Issue comment created successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async createIssueComment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() createDto: CreateIssueCommentDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new CreateIssueCommentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        createDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Attach one uploaded file to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({
    description: 'Issue attachment created successfully.',
    type: IssueAttachmentDto
  })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async createIssueAttachment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() createDto: CreateIssueAttachmentDto
  ): Promise<IssueAttachmentDto> {
    return this.commandBus.execute(
      new CreateIssueAttachmentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        createDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one issue attachment and schedule file purge.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'attachmentId', type: String, example: '51' })
  @ApiNoContentResponse({ description: 'Issue attachment deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async deleteIssueAttachment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('attachmentId') attachmentId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteIssueAttachmentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        attachmentId,
        toCqrsTrace(trace)
      )
    );
  }

  @Post('labels')
  @ApiOperation({ summary: 'Create one reusable issue label.' })
  @ApiCreatedResponse({ description: 'Issue label created successfully.', type: IssueLabelDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async createIssueLabel(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Body() dto: CreateIssueLabelDto
  ): Promise<IssueLabelDto> {
    return this.commandBus.execute(
      new CreateIssueLabelCommand(tenantId, userId, actorId, roles, dto, toCqrsTrace(trace))
    );
  }

  @Patch('labels/:labelId')
  @ApiOperation({ summary: 'Update one reusable issue label.' })
  @ApiParam({ name: 'labelId', type: String, example: '3' })
  @ApiOkResponse({ description: 'Issue label updated successfully.', type: IssueLabelDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async updateIssueLabel(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('labelId') labelId: string,
    @Body() dto: UpdateIssueLabelDto
  ): Promise<IssueLabelDto> {
    return this.commandBus.execute(
      new UpdateIssueLabelCommand(
        tenantId,
        userId,
        actorId,
        roles,
        labelId,
        dto,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete('labels/:labelId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one reusable issue label.' })
  @ApiParam({ name: 'labelId', type: String, example: '3' })
  @ApiNoContentResponse({ description: 'Issue label deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async deleteIssueLabel(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('labelId') labelId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteIssueLabelCommand(tenantId, userId, actorId, roles, labelId, toCqrsTrace(trace))
    );
  }

  @Post(':id/assignees')
  @ApiOperation({ summary: 'Add one assignee to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({ description: 'Issue assignee added successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async addIssueAssignee(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() dto: MutateIssueParticipantDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new AddIssueAssigneeCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        dto,
        toCqrsTrace(trace)
      )
    );
  }

  @Post(':id/labels')
  @ApiOperation({ summary: 'Attach one label to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({ description: 'Issue label added successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async addIssueLabel(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() dto: MutateIssueLabelDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new AddIssueLabelCommand(tenantId, userId, actorId, roles, issueId, dto, toCqrsTrace(trace))
    );
  }

  @Post(':id/relations')
  @ApiOperation({ summary: 'Attach one relation to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({ description: 'Issue relation added successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async createIssueRelation(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() dto: CreateIssueRelationDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new CreateIssueRelationCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        dto,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id/assignees/:userId')
  @ApiOperation({ summary: 'Remove one assignee from an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'userId', type: String, example: '9' })
  @ApiOkResponse({ description: 'Issue assignee removed successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_SELF)
  async removeIssueAssignee(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @CurrentUser('permissions') permissions: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('userId') assigneeUserId: string
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new RemoveIssueAssigneeCommand(
        tenantId,
        userId,
        actorId,
        roles,
        permissions,
        issueId,
        assigneeUserId,
        toCqrsTrace(trace)
      )
    );
  }

  @Post(':id/watchers')
  @ApiOperation({ summary: 'Add one watcher to an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiCreatedResponse({ description: 'Issue watcher added successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async addIssueWatcher(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Body() dto: MutateIssueParticipantDto
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new AddIssueWatcherCommand(tenantId, userId, actorId, roles, issueId, dto, toCqrsTrace(trace))
    );
  }

  @Delete(':id/watchers/:userId')
  @ApiOperation({ summary: 'Remove one watcher from an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'userId', type: String, example: '9' })
  @ApiOkResponse({ description: 'Issue watcher removed successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async removeIssueWatcher(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('userId') watcherUserId: string
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new RemoveIssueWatcherCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        watcherUserId,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id/labels/:labelId')
  @ApiOperation({ summary: 'Remove one label from an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'labelId', type: String, example: '3' })
  @ApiOkResponse({ description: 'Issue label removed successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async removeIssueLabel(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('labelId') labelId: string
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new RemoveIssueLabelCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        labelId,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id/relations/:relationId')
  @ApiOperation({ summary: 'Remove one relation from an issue.' })
  @ApiParam({ name: 'id', type: String, example: '77' })
  @ApiParam({ name: 'relationId', type: String, example: '11' })
  @ApiOkResponse({ description: 'Issue relation removed successfully.', type: IssueDetailDto })
  @Resource({ type: OPA_RESOURCES.ISSUES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.ISSUES_UPDATE)
  async deleteIssueRelation(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') issueId: string,
    @Param('relationId') relationId: string
  ): Promise<IssueDetailDto> {
    return this.commandBus.execute(
      new DeleteIssueRelationCommand(
        tenantId,
        userId,
        actorId,
        roles,
        issueId,
        relationId,
        toCqrsTrace(trace)
      )
    );
  }
}

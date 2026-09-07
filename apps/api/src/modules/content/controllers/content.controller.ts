import {
  Body,
  Delete,
  Get,
  HttpCode,
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
  CreateContentAttachmentCommand,
  CreateContentCommentCommand,
  CreateContentEntryCommand,
  DeleteContentCommentCommand,
  DeleteContentEntryCommand,
  UpdateContentEntryCommand
} from '../commands';
import {
  ContentAttachmentDto,
  ContentCommentDto,
  ContentEntryDto,
  ContentSidebarEntryDto,
  CreateContentAttachmentDto,
  CreateContentCommentDto,
  CreateContentEntryDto,
  QueryContentEntriesDto,
  UpdateContentEntryDto
} from '../dto';
import { ContentService } from '../services';

import type { RequestTrace } from '@/common/cqrs/request-trace';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser } from '@/common/decorators';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

@ApiTags('content')
@ApiBearerAuth()
@VersionedController('v1', 'pages')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class PagesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly contentService: ContentService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List content entries',
    description:
      'Returns flat content entries within the tenant and optional project or parent scope.'
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['organization', 'project'],
    example: 'organization'
  })
  @ApiQuery({ name: 'projectId', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'parentId', required: false, type: Number, example: 34 })
  @ApiOkResponse({
    description: 'Content entries returned successfully.',
    type: ContentEntryDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async listEntries(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryContentEntriesDto
  ): Promise<ContentEntryDto[]> {
    return this.contentService.listEntries({
      tenantId,
      userId,
      roles,
      scope: queryDto.scope,
      projectId: queryDto.projectId,
      parentId: queryDto.parentId
    });
  }

  @Get('sidebar')
  @ApiOperation({
    summary: 'List content sidebar entries',
    description:
      'Returns lightweight content entries for sidebar/navigation within the tenant and optional project or parent scope.'
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['organization', 'project'],
    example: 'organization'
  })
  @ApiQuery({ name: 'projectId', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'parentId', required: false, type: Number, example: 34 })
  @ApiOkResponse({
    description: 'Content sidebar entries returned successfully.',
    type: ContentSidebarEntryDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async listSidebarEntries(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryContentEntriesDto
  ): Promise<ContentSidebarEntryDto[]> {
    return this.contentService.listSidebarEntries({
      tenantId,
      userId,
      roles,
      scope: queryDto.scope,
      projectId: queryDto.projectId,
      parentId: queryDto.parentId
    });
  }

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get content entry by slug',
    description:
      'Returns a single content entry by slug within the tenant and optional project scope.'
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['organization', 'project'],
    example: 'organization'
  })
  @ApiParam({ name: 'slug', type: String, example: 'getting-started' })
  @ApiQuery({ name: 'projectId', required: false, type: Number, example: 12 })
  @ApiOkResponse({ description: 'Content entry returned successfully.', type: ContentEntryDto })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async getEntryBySlug(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryContentEntriesDto
  ): Promise<ContentEntryDto> {
    return this.contentService.getEntryBySlug({
      tenantId,
      userId,
      roles,
      slug,
      scope: queryDto.scope,
      projectId: queryDto.projectId
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get content entry by id',
    description: 'Returns a single content entry by id within the tenant.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiOkResponse({ description: 'Content entry returned successfully.', type: ContentEntryDto })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async getEntryById(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') entryId: string
  ): Promise<ContentEntryDto> {
    return this.contentService.getEntryById(tenantId, userId, roles, entryId);
  }

  @Get(':id/attachments')
  @ApiOperation({
    summary: 'List content attachments',
    description: 'Returns file-backed attachments for one content entry within the tenant scope.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiOkResponse({
    description: 'Content attachments returned successfully.',
    type: ContentAttachmentDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async listAttachments(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') entryId: string
  ): Promise<ContentAttachmentDto[]> {
    return this.contentService.listAttachments(tenantId, userId, roles, entryId);
  }

  @Get(':id/comments')
  @ApiOperation({
    summary: 'List content comments',
    description: 'Returns content comments for one content entry within the tenant scope.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiOkResponse({
    description: 'Content comments returned successfully.',
    type: ContentCommentDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.CONTENT_COMMENTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_READ)
  async listComments(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @Param('id') entryId: string
  ): Promise<ContentCommentDto[]> {
    return this.contentService.listComments(tenantId, userId, roles, entryId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create content entry',
    description: 'Creates a content entry within the tenant and optional project scope.'
  })
  @ApiCreatedResponse({ description: 'Content entry created successfully.', type: ContentEntryDto })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_CREATE)
  async createEntry(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Body() createDto: CreateContentEntryDto
  ): Promise<ContentEntryDto> {
    return this.commandBus.execute(
      new CreateContentEntryCommand(tenantId, userId, actorId, roles, createDto, toCqrsTrace(trace))
    );
  }

  @Post(':id/attachments')
  @ApiOperation({
    summary: 'Attach uploaded file to content entry',
    description: 'Links one finalized shared file into an existing content entry.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiCreatedResponse({
    description: 'Content attachment created successfully.',
    type: ContentAttachmentDto
  })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_UPDATE)
  async createAttachment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') entryId: string,
    @Body() createDto: CreateContentAttachmentDto
  ): Promise<ContentAttachmentDto> {
    return this.commandBus.execute(
      new CreateContentAttachmentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        entryId,
        createDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Post(':id/comments')
  @ApiOperation({
    summary: 'Create content comment',
    description: 'Adds one markdown comment to an existing content entry.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiCreatedResponse({
    description: 'Content comment created successfully.',
    type: ContentCommentDto
  })
  @Resource({ type: OPA_RESOURCES.CONTENT_COMMENTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_UPDATE)
  async createComment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') entryId: string,
    @Body() createDto: CreateContentCommentDto
  ): Promise<ContentCommentDto> {
    return this.commandBus.execute(
      new CreateContentCommentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        entryId,
        createDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update content entry',
    description: 'Updates title, markdown, slug, or parent for an existing content entry.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiOkResponse({ description: 'Content entry updated successfully.', type: ContentEntryDto })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_UPDATE)
  async updateEntry(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') entryId: string,
    @Body() updateDto: UpdateContentEntryDto
  ): Promise<ContentEntryDto> {
    return this.commandBus.execute(
      new UpdateContentEntryCommand(
        tenantId,
        userId,
        actorId,
        roles,
        entryId,
        updateDto,
        toCqrsTrace(trace)
      )
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete content entry',
    description:
      'Soft deletes a content entry when it has no active children in the same tenant scope.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiNoContentResponse({ description: 'Content entry deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.CONTENT, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.CONTENT_DELETE)
  async deleteEntry(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') entryId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteContentEntryCommand(tenantId, userId, actorId, roles, entryId, toCqrsTrace(trace))
    );
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({
    summary: 'Delete content comment',
    description: 'Deletes one content comment when the caller owns it or has admin scope.'
  })
  @ApiParam({ name: 'id', type: String, example: '123' })
  @ApiParam({ name: 'commentId', type: String, example: '91' })
  @ApiNoContentResponse({ description: 'Content comment deleted successfully.' })
  @Resource({ type: OPA_RESOURCES.CONTENT_COMMENTS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @HttpCode(204)
  async deleteComment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') entryId: string,
    @Param('commentId') commentId: string
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteContentCommentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        entryId,
        commentId,
        toCqrsTrace(trace)
      )
    );
  }
}

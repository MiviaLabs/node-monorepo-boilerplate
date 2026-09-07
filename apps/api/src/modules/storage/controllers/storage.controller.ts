import { Get, Param, Post, Body, Delete, Put, Req, Headers, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import { Action, Resource } from '@package/opa';

import {
  CompleteFileUploadCommand,
  CreateFileUploadCommand,
  DeleteFileCommand,
  UploadFileContentCommand
} from '../commands';
import {
  CreateFileUploadDto,
  FileResponseDto,
  FileSignedUrlDto,
  FileUploadReservationDto
} from '../dto';
import { GetFileDownloadUrlQuery, GetFileQuery } from '../queries';

import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { Request } from 'express';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser } from '@/common/decorators';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

@ApiTags('storage')
@ApiBearerAuth()
@VersionedController('v1', 'objects')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class ObjectsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @Post('uploads')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @ApiOperation({
    summary: 'Reserve a file upload and return an upload target.'
  })
  @ApiCreatedResponse({
    description: 'Upload reservation created successfully.',
    type: FileUploadReservationDto
  })
  async createUpload(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Body() dto: CreateFileUploadDto
  ): Promise<FileUploadReservationDto> {
    return this.commandBus.execute(
      new CreateFileUploadCommand(tenantId, userId, actorId, roles, dto, toCqrsTrace(trace))
    );
  }

  @Post('uploads/:id/complete')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE)
  @ApiOperation({
    summary: 'Finalize an upload after the object has been written to storage.'
  })
  @ApiParam({ name: 'id', type: String, example: '101' })
  @ApiOkResponse({
    description: 'Upload finalized successfully.',
    type: FileResponseDto
  })
  async completeUpload(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') fileId: string
  ): Promise<FileResponseDto> {
    return this.commandBus.execute(
      new CompleteFileUploadCommand(tenantId, userId, actorId, roles, fileId, toCqrsTrace(trace))
    );
  }

  @Put('uploads/:id/content')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE)
  @ApiOperation({
    summary: 'Upload file bytes through the API for a reserved pending file.'
  })
  @ApiParam({ name: 'id', type: String, example: '101' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary'
    }
  })
  @ApiOkResponse({
    description: 'Upload completed successfully.',
    type: FileResponseDto
  })
  async uploadFileContent(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') fileId: string,
    @Req() request: Request,
    @Headers('content-type') contentType?: string,
    @Headers('content-length') contentLength?: string
  ): Promise<FileResponseDto> {
    return this.commandBus.execute(
      new UploadFileContentCommand(
        tenantId,
        userId,
        actorId,
        roles,
        fileId,
        request,
        contentType,
        contentLength,
        toCqrsTrace(trace)
      )
    );
  }

  @Get('files/:id')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @ApiOperation({
    summary: 'Fetch one file record within the current tenant.'
  })
  @ApiParam({ name: 'id', type: String, example: '101' })
  @ApiOkResponse({
    description: 'File returned successfully.',
    type: FileResponseDto
  })
  async getFile(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') fileId: string
  ): Promise<FileResponseDto> {
    return this.queryBus.execute(new GetFileQuery(tenantId, userId, fileId));
  }

  @Get('files/:id/download-url')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @ApiOperation({
    summary: 'Generate a signed download URL for a ready file.'
  })
  @ApiParam({ name: 'id', type: String, example: '101' })
  @ApiOkResponse({
    description: 'Signed download URL generated successfully.',
    type: FileSignedUrlDto
  })
  async getDownloadUrl(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') fileId: string
  ): Promise<FileSignedUrlDto> {
    return this.queryBus.execute(
      new GetFileDownloadUrlQuery(tenantId, userId, actorId, fileId, toCqrsTrace(trace))
    );
  }

  @Delete('files/:id')
  @Resource({ type: OPA_RESOURCES.FILES, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @ApiOperation({
    summary: 'Soft delete one direct file record within the current tenant.'
  })
  @ApiParam({ name: 'id', type: String, example: '101' })
  @ApiOkResponse({
    description: 'File soft deleted successfully.',
    type: FileResponseDto
  })
  async deleteFile(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('actorId') actorId: string,
    @CurrentUser('roles') roles: readonly string[] | undefined,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('id') fileId: string
  ): Promise<FileResponseDto> {
    return this.commandBus.execute(
      new DeleteFileCommand(tenantId, userId, actorId, roles, fileId, toCqrsTrace(trace))
    );
  }
}

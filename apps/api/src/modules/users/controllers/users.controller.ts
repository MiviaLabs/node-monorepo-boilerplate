import {
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  ValidationPipe,
  ParseIntPipe,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiHeader,
  ApiBearerAuth
} from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';
import { Errors } from '@package/errors';
import { Action, Resource } from '@package/opa';

import { CreateUserCommand, UpdateUserCommand, DeleteUserCommand } from '../commands';
import {
  UserResponseDto,
  UserListItemDto,
  QueryUsersDto,
  PaginatedResponseDto,
  CreateUserDto,
  UpdateUserDto
} from '../dto';
import { GetUserQuery, ListUsersQuery } from '../queries';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser, RequestTraceData, TenantId } from '@/common/decorators';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Users controller
 *
 * All endpoints require authentication and specific tenant permissions.
 * All endpoints are scoped to tenant via x-tenant-id header.
 */
@ApiTags('users')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-tenant-id',
  required: true,
  description: 'Tenant ID (integer)',
  schema: { type: 'integer', example: 1 }
})
@ApiHeader({
  name: 'Accept',
  required: false,
  description: 'Content type to accept',
  schema: { type: 'string', example: 'application/json' }
})
@VersionedController('v1', 'people')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class PeopleController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Get user by ID
   *
   * Returns a single user by ID within the tenant scope
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Returns a single user by ID within the tenant scope'
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: BaseResponseDto,
    example: {
      data: {
        id: 1,
        organizationId: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Missing or invalid x-tenant-id header (API_008, API_023)'
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Tenant suspended (API_022)' })
  @ApiResponse({
    status: 404,
    description: 'Not Found - User not found (DB_004) or Tenant not found (API_021)'
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_READ)
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) userId: number
  ): Promise<BaseResponseDto<UserResponseDto>> {
    const organizationId = parseInt(tenantId, 10);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    const query = new GetUserQuery({
      tenantId: organizationId,
      userId
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * List users
   *
   * Returns paginated list of users within the tenant scope
   */
  @Get()
  @ApiOperation({
    summary: 'List users',
    description: 'Returns paginated list of users within the tenant scope'
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
  @ApiResponse({
    status: 200,
    description: 'Users found',
    type: PaginatedResponseDto,
    example: {
      data: [
        {
          id: 1,
          organizationId: 1,
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ],
      metadata: {
        pagination: {
          page: 1,
          pageSize: 20,
          total: 100,
          totalPages: 5,
          hasNext: true,
          hasPrevious: false
        }
      }
    }
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_READ)
  async findAll(
    @TenantId() tenantId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) queryDto: QueryUsersDto
  ): Promise<PaginatedResponseDto<UserListItemDto>> {
    const organizationId = parseInt(tenantId, 10);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    const query = new ListUsersQuery({
      tenantId: organizationId,
      ...(queryDto.page !== undefined && { page: queryDto.page }),
      ...(queryDto.pageSize !== undefined && { pageSize: queryDto.pageSize })
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return result as PaginatedResponseDto<UserListItemDto>;
  }

  /**
   * Create a new user
   *
   * Creates a new user within the tenant scope
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create user',
    description: 'Creates a new user within the tenant scope'
  })
  @ApiBody({
    type: CreateUserDto,
    description: 'User data for creation'
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: BaseResponseDto,
    example: {
      data: {
        id: 1,
        organizationId: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_CREATE)
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Body() dto: CreateUserDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserResponseDto>> {
    const organizationId = parseInt(tenantId, 10);
    const authenticatedActorId = parseInt(actorId, 10);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (isNaN(authenticatedActorId)) {
      throw Errors.validationinvalidValueFor002({ field: 'actorId', expectedType: 'integer' });
    }

    const command = new CreateUserCommand({
      tenantId: organizationId,
      actorId: authenticatedActorId,
      organizationId,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);

    return new BaseResponseDto(result);
  }

  /**
   * Update a user
   *
   * Updates an existing user within the tenant scope
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update user',
    description: 'Updates an existing user within the tenant scope'
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiBody({
    type: UpdateUserDto,
    description: 'User data for update (all fields optional)'
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: BaseResponseDto,
    example: {
      data: {
        id: 1,
        organizationId: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_UPDATE)
  async update(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserResponseDto>> {
    const organizationId = parseInt(tenantId, 10);
    const authenticatedActorId = parseInt(actorId, 10);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (isNaN(authenticatedActorId)) {
      throw Errors.validationinvalidValueFor002({ field: 'actorId', expectedType: 'integer' });
    }

    const command = new UpdateUserCommand({
      tenantId: organizationId,
      actorId: authenticatedActorId,
      id: userId,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isVerified !== undefined && { isVerified: dto.isVerified }),
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);

    return new BaseResponseDto(result);
  }

  /**
   * Delete a user
   *
   * Deletes a user within the tenant scope
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete user',
    description: 'Deletes a user within the tenant scope'
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully'
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_DELETE)
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Param('id', ParseIntPipe) userId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    const organizationId = parseInt(tenantId, 10);
    const authenticatedActorId = parseInt(actorId, 10);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (isNaN(authenticatedActorId)) {
      throw Errors.validationinvalidValueFor002({ field: 'actorId', expectedType: 'integer' });
    }

    const command = new DeleteUserCommand({
      tenantId: organizationId,
      actorId: authenticatedActorId,
      id: userId,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);
  }
}

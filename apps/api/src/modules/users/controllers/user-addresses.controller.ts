import {
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Injectable,
  ArgumentMetadata,
  ParseIntPipe,
  ForbiddenException
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiHeader,
  ApiBearerAuth
} from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { TENANT_PERMISSIONS, AddressType } from '@package/constants';
import { Errors } from '@package/errors';
import { Action, Resource } from '@package/opa';
import { addJob } from '@package/queues';

import {
  CreateUserAddressCommand,
  UpdateUserAddressCommand,
  DeleteUserAddressCommand
} from '../commands';
import { CreateUserAddressDto, UpdateUserAddressDto, type AddressResponseDto } from '../dto';
import {
  TriggerKeyRotationDto,
  TriggerKeyRotationResponseDto
} from '../dto/trigger-key-rotation.dto';
import {
  ADDRESS_KEY_ROTATION_QUEUE,
  RotationTriggerSource,
  type AddressKeyRotationJobPayload
} from '../jobs/address-key-rotation.job';
import { GetUserAddressQuery, GetUserAddressesQuery, GetDefaultAddressQuery } from '../queries';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser, RequestTraceData, TenantId } from '@/common/decorators';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Custom pipe to validate and parse userId parameter
 * Ensures userId is a positive integer
 */
@Injectable()
export class ParseIntUserIdPipe extends ParseIntPipe {
  constructor() {
    super();
  }

  override async transform(value: string, _metadata: ArgumentMetadata): Promise<number> {
    const parsed = Number(await super.transform(value, _metadata));
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }
    return parsed;
  }
}

/**
 * User addresses controller
 *
 * All endpoints require authentication and specific tenant permissions.
 * All endpoints are scoped to tenant via x-tenant-id header.
 * Address PII is stored in encrypted-store and returned only for authorized address reads.
 */
@ApiTags('user-addresses')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-tenant-id',
  required: true,
  description: 'Tenant ID (integer)',
  schema: { type: 'integer', example: 1 }
})
@VersionedController('v1', 'people/:userId/addresses')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class PersonAddressesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Get all addresses for a user
   *
   * Returns all addresses for a user within the tenant scope.
   * Results are ordered by isDefault (descending) and updatedAt (descending).
   * Address components are decrypted from encrypted-store for authorized reads.
   */
  @Get()
  @ApiOperation({
    summary: "Get user's addresses",
    description:
      'Returns all addresses for a user within the tenant scope with decrypted components for authorized reads.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Addresses found',
    type: BaseResponseDto,
    example: {
      data: [
        {
          id: 1,
          organizationId: 1,
          userId: 1,
          addressType: 'primary',
          label: 'Home',
          isDefault: true,
          isVerified: false,
          countryCode: 'US',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    }
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_READ)
  async findAll(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AddressResponseDto[]>> {
    const organizationId = parseInt(tenantId, 10);
    const actorUserId = this.parseActorId(actorId, userId);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    const query = new GetUserAddressesQuery({
      tenantId: organizationId,
      userId,
      actorId: actorUserId,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * Get default address for a user
   *
   * Returns the default address for a user within the tenant scope.
   * Returns null if no default address exists.
   * Address components are decrypted from encrypted-store for authorized reads.
   */
  @Get('default')
  @ApiOperation({
    summary: "Get user's default address",
    description:
      'Returns the default address for a user within the tenant scope. Returns null if no default exists.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Default address found',
    type: BaseResponseDto,
    example: {
      data: {
        id: 1,
        organizationId: 1,
        userId: 1,
        addressType: 'primary',
        isDefault: true,
        countryCode: 'US',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Not Found - No default address exists' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_READ)
  async findDefault(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AddressResponseDto | null>> {
    const organizationId = parseInt(tenantId, 10);
    const actorUserId = this.parseActorId(actorId, userId);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    const query = new GetDefaultAddressQuery({
      tenantId: organizationId,
      userId,
      actorId: actorUserId,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * Get a specific address by ID
   *
   * Returns a single address by ID within the tenant scope.
   * Address components are decrypted from encrypted-store for authorized reads.
   */
  @Get(':addressId')
  @ApiOperation({
    summary: 'Get address by ID',
    description:
      'Returns a single address by ID within the tenant scope with decrypted components for authorized reads.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiParam({
    name: 'addressId',
    description: 'Address ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Address found',
    type: BaseResponseDto
  })
  @ApiResponse({ status: 404, description: 'Not Found - Address not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_READ)
  async findOne(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @Param('addressId', ParseIntUserIdPipe) addressId: number,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AddressResponseDto>> {
    const organizationId = parseInt(tenantId, 10);
    const actorUserId = this.parseActorId(actorId, userId);

    // Validate tenant ID
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    const query = new GetUserAddressQuery({
      tenantId: organizationId,
      userId,
      addressId,
      actorId: actorUserId,
      ...toCqrsTrace(trace)
    });
    const result = (await this.queryBus.execute(query)) as AddressResponseDto;
    return new BaseResponseDto(result);
  }

  /**
   * Create a new address for a user
   *
   * Creates a new address with encrypted-store-backed PII storage.
   * Address components are encrypted and stored in the PII encrypted-store.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create address for user',
    description:
      'Creates a new address with encrypted-store-backed PII storage. Address components are encrypted.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiBody({
    type: CreateUserAddressDto,
    description: 'Address data for creation'
  })
  @ApiResponse({
    status: 201,
    description: 'Address created successfully',
    type: BaseResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_CREATE)
  async create(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @Body() dto: CreateUserAddressDto,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AddressResponseDto>> {
    const organizationId = this.parseTenantId(tenantId);
    const actorUserId = this.parseActorId(actorId, userId);

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const command = new CreateUserAddressCommand({
      tenantId: organizationId,
      actorId: actorUserId,
      userId,
      addressType: dto.addressType,
      isDefault: dto.isDefault,
      label: dto.label,
      countryCode: dto.countryCode,
      ...toCqrsTrace(trace),
      components: {
        street: dto.components?.street,
        street2: dto.components?.street2,
        city: dto.components?.city,
        state: dto.components?.state,
        postalCode: dto.components?.postalCode,
        country: dto.components?.country
      }
    });

    const result = await this.commandBus.execute(command);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */

    return new BaseResponseDto(result);
  }

  /**
   * Update an existing address
   *
   * Updates an existing address with encrypted-store-backed PII storage.
   * Changed components are encrypted and new encrypted-store entries are created.
   */
  @Patch(':addressId')
  @ApiOperation({
    summary: 'Update address',
    description:
      'Updates an existing address. Changed components are encrypted with new encrypted-store entries.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiParam({
    name: 'addressId',
    description: 'Address ID',
    type: Number,
    example: 1
  })
  @ApiBody({
    type: UpdateUserAddressDto,
    description: 'Address data for update (all fields optional)'
  })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully',
    type: BaseResponseDto
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_UPDATE)
  async update(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @Param('addressId', ParseIntUserIdPipe) addressId: number,
    @Body() dto: UpdateUserAddressDto,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AddressResponseDto>> {
    const organizationId = this.parseTenantId(tenantId);
    const actorUserId = this.parseActorId(actorId, userId);

    if (actorUserId !== userId) {
      throw new ForbiddenException('You can only modify addresses for your own account');
    }

    const command = new UpdateUserAddressCommand(
      this.buildUpdateCommandData(organizationId, actorUserId, addressId, dto, trace)
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);
    return new BaseResponseDto(result as AddressResponseDto);
  }

  /**
   * Delete an address
   *
   * Soft deletes an address within the tenant scope.
   * The address is marked as deleted but retained for audit purposes.
   */
  @Delete(':addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete address',
    description: 'Soft deletes an address within the tenant scope. Address is retained for audit.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: Number,
    example: 1
  })
  @ApiParam({
    name: 'addressId',
    description: 'Address ID',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 204,
    description: 'Address deleted successfully'
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.USER_ADDRESSES_DELETE)
  async delete(
    @TenantId() tenantId: string,
    @Param('userId', ParseIntUserIdPipe) userId: number,
    @Param('addressId', ParseIntUserIdPipe) addressId: number,
    @CurrentUser('actorId') actorId?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    const organizationId = this.parseTenantId(tenantId);
    const actorUserId = this.parseActorId(actorId, userId);

    if (actorUserId !== userId) {
      throw new ForbiddenException('You can only delete addresses for your own account');
    }

    const command = new DeleteUserAddressCommand({
      tenantId: organizationId,
      actorId: actorUserId,
      addressId,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);
  }

  private parseTenantId(tenantId: string): number {
    const organizationId = parseInt(tenantId, 10);
    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }
    return organizationId;
  }

  private parseActorId(actorId: string | undefined, fallbackUserId: number): number {
    const parsedActorId = actorId !== undefined ? parseInt(actorId, 10) : NaN;
    return isNaN(parsedActorId) ? fallbackUserId : parsedActorId;
  }

  private buildUpdateCommandData(
    organizationId: number,
    actorUserId: number,
    addressId: number,
    dto: UpdateUserAddressDto,
    trace: RequestTrace
  ): {
    tenantId: number;
    actorId: number;
    addressId: number;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    addressType?: AddressType;
    isDefault?: boolean;
    label?: string;
    countryCode?: string;
    components: {
      street?: string;
      street2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  } {
    return {
      tenantId: organizationId,
      actorId: actorUserId,
      addressId,
      ...toCqrsTrace(trace),
      ...(dto.addressType !== undefined ? { addressType: dto.addressType as AddressType } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
      components: this.extractComponentUpdates(dto.components)
    };
  }

  private extractComponentUpdates(components: UpdateUserAddressDto['components']): {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } {
    if (!components) {
      return {};
    }
    return {
      ...(components.street !== undefined ? { street: components.street } : {}),
      ...(components.street2 !== undefined ? { street2: components.street2 } : {}),
      ...(components.city !== undefined ? { city: components.city } : {}),
      ...(components.state !== undefined ? { state: components.state } : {}),
      ...(components.postalCode !== undefined ? { postalCode: components.postalCode } : {}),
      ...(components.country !== undefined ? { country: components.country } : {})
    };
  }
}

/**
 * Admin controller for tenant-level address key rotation operations.
 *
 * Exposes a single admin-only endpoint to trigger manual encrypted-store key rotation
 * for all user addresses within a tenant. The rotation is processed asynchronously
 * via BullMQ — the endpoint returns a `jobId` for status tracking.
 *
 * ## Route
 * `POST /api/v1/users/addresses/rotate-key`
 *
 * Note: This is a **tenant-level** operation (no `:userId` segment),
 * distinct from the per-user address endpoints in `PersonAddressesController`.
 *
 * ## P0 Security
 * - Requires `CRYPTO_KEY_ROTATE` permission (enforced by HybridPolicyGuard).
 * - Tenant-scoped via `x-tenant-id` header.
 * - Job payload contains only key resource IDs — no key material or PII.
 * - Job ID is deterministic to prevent duplicate enqueues for the same rotation pair.
 */
@ApiTags('user-addresses-admin')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-tenant-id',
  required: true,
  description: 'Tenant ID (integer)',
  schema: { type: 'integer', example: 1 }
})
@VersionedController('v1', 'people/addresses')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class UserAddressesAdminController {
  /**
   * Trigger a manual encrypted-store key rotation for all user addresses in the tenant.
   *
   * Enqueues an asynchronous BullMQ job and returns the job ID for tracking.
   * The job processes encrypted-store entries in batches and persists state to
   * `key_rotation_state` for restart recovery.
   *
   * ## Authorization
   * Requires permission: `tenant:crypto:key_rotate`
   *
   * ## Idempotency
   * The job ID is derived from `tenantId + oldKeyId + timestamp`. Retrying with the
   * same parameters within a short window will reuse the existing job rather than
   * creating a duplicate.
   *
   * @param tenantId - Tenant ID extracted from `x-tenant-id` header.
   * @param actorId - Authenticated user ID from JWT (audit trail).
   * @param dto - Rotation parameters (old/new key IDs, optional correlation ID).
   * @returns HTTP 202 Accepted with job ID and queue name.
   */
  @Post('rotate-key')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger manual address key rotation (admin)',
    description:
      'Enqueues an async BullMQ job to rotate all user address encrypted-store entries from an old KMS key ' +
      'to a new KMS key within the tenant. Returns a jobId for status tracking. ' +
      'Requires tenant:crypto:key_rotate permission.'
  })
  @ApiResponse({
    status: 202,
    description: 'Rotation job accepted and enqueued',
    type: TriggerKeyRotationResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires tenant:crypto:key_rotate permission'
  })
  @Resource({ type: OPA_RESOURCES.USER_ADDRESSES, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.CRYPTO_KEY_ROTATE)
  async triggerKeyRotation(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string | undefined,
    @Body() dto: TriggerKeyRotationDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<TriggerKeyRotationResponseDto>> {
    const organizationId = parseInt(tenantId, 10);

    if (isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    let parsedActorId: number | undefined;

    if (actorId !== undefined) {
      parsedActorId = parseInt(actorId, 10);

      if (isNaN(parsedActorId)) {
        throw Errors.validationinvalidValueFor002({ field: 'x-actor-id', expectedType: 'integer' });
      }
    }

    // Stable job ID: prevents duplicate CONCURRENT rotation jobs for the same
    // (tenant, oldKeyId, newKeyId) triple. BullMQ deduplicates by jobId in
    // WAITING / ACTIVE / DELAYED states, so re-enqueuing the same triple while
    // a job is in progress is a no-op (returns the existing job).
    // Once the job COMPLETES or FAILS the ID slot is freed, allowing a fresh run.
    const jobId = `rotate-${organizationId}-${dto.oldKeyId}-to-${dto.newKeyId}`;
    const requestId = trace.requestId;
    const correlationId = trace.correlationId ?? dto.correlationId ?? jobId;
    const causationId = trace.causationId ?? requestId;

    await addJob<AddressKeyRotationJobPayload>({
      queueName: ADDRESS_KEY_ROTATION_QUEUE,
      jobName: 'rotate-address-key',
      data: {
        organizationId,
        oldKeyId: dto.oldKeyId,
        newKeyId: dto.newKeyId,
        actorId: parsedActorId,
        triggerSource: RotationTriggerSource.Manual,
        requestId,
        correlationId,
        causationId
      },
      options: {
        jobId // deterministic ID for idempotency
      }
    });

    return new BaseResponseDto<TriggerKeyRotationResponseDto>({
      jobId,
      queueName: ADDRESS_KEY_ROTATION_QUEUE,
      status: 'accepted'
    });
  }
}

import {
  BadRequestException,
  Body,
  Get,
  InternalServerErrorException,
  Param,
  Post,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActorId, RequirePermissions } from '@package/auth';
import { Errors } from '@package/errors';
import { Action, Resource } from '@package/opa';
import { ICommandResult } from '@package/types';

import {
  CreateEncryptedStoreEntryCommand,
  CreateEncryptedStoreEntryResult,
  RotateEncryptedStoreKeyCommand,
  RotateEncryptedStoreKeyResult
} from './commands';
import { RotateKeyDto, StoreDataDto } from './dtos/encrypted-store.dto';
import { RetrieveEncryptedStoreEntryQuery } from './queries';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Vault Controller
 *
 * PII Vault endpoints for storing, retrieving, and rotating encrypted sensitive data.
 * All endpoints require authentication and specific tenant permissions.
 * All endpoints are scoped to tenant via x-tenant-id header.
 *
 * Uses CQRS pattern:
 * - Commands for write operations (store, rotate-key)
 * - Queries for read operations (retrieve)
 */
@VersionedController('v1', 'secure-vault')
@ApiTags('SecureVault')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class SecureVaultController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Store PII in vault
   *
   * Encrypts and stores sensitive data in PII vault with envelope encryption.
   * Returns success message for reference.
   */
  @Post('store')
  @ApiOperation({
    summary: 'Store PII in vault',
    description:
      'Encrypts and stores sensitive data in PII vault using envelope encryption. ' +
      'Data is encrypted with a tenant-specific key. Returns success message.'
  })
  @ApiResponse({
    status: 201,
    description: 'Data successfully encrypted and stored',
    type: BaseResponseDto
  })
  @Resource({ type: OPA_RESOURCES.ENCRYPTED_STORE, scope: 'tenant' })
  @Action(OPA_ACTIONS.STORE)
  async store(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @RequestTraceData() trace: RequestTrace = {},
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: StoreDataDto
  ): Promise<BaseResponseDto<{ message: string }>> {
    const tenantIdNum = Number.parseInt(tenantId, 10);
    const actorIdNum = Number.parseInt(actorId, 10);

    if (Number.isNaN(tenantIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (Number.isNaN(actorIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-actor-id', expectedType: 'integer' });
    }

    const commandResult: ICommandResult<CreateEncryptedStoreEntryResult> = await this.commandBus.execute(
      new CreateEncryptedStoreEntryCommand({
        tenantId: tenantIdNum,
        actorId: actorIdNum,
        entityType: dto.entityType,
        entityId: dto.entityId,
        fieldPath: dto.fieldPath,
        value: dto.data,
        classification: dto.classification,
        ...toCqrsTrace(trace)
      })
    );

    if (!commandResult.success || !commandResult.data) {
      throw new InternalServerErrorException(
        commandResult.errors?.join(', ') ?? 'Failed to store data in vault'
      );
    }

    return new BaseResponseDto<{ message: string }>({
      message: 'Data stored successfully in vault'
    });
  }

  /**
   * Retrieve PII from vault
   *
   * Retrieves and decrypts sensitive data from PII vault.
   * Returns decrypted plaintext data.
   */
  @Get('retrieve/:entityType/:entityId/:fieldPath')
  @ApiOperation({
    summary: 'Retrieve PII from vault',
    description:
      'Retrieves and decrypts sensitive data from PII vault. ' + 'Returns decrypted plaintext data.'
  })
  @ApiResponse({
    status: 200,
    description: 'Data successfully retrieved and decrypted',
    type: BaseResponseDto
  })
  @Resource({ type: OPA_RESOURCES.ENCRYPTED_STORE, scope: 'tenant' })
  @Action(OPA_ACTIONS.RETRIEVE)
  async retrieve(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @RequestTraceData() trace: RequestTrace = {},
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('fieldPath') fieldPath: string
  ): Promise<BaseResponseDto<{ data: string }>> {
    const tenantIdNum = Number.parseInt(tenantId, 10);
    const actorIdNum = Number.parseInt(actorId, 10);
    const entityIdNum = Number.parseInt(entityId, 10);

    if (Number.isNaN(tenantIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (Number.isNaN(actorIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-actor-id', expectedType: 'integer' });
    }

    if (Number.isNaN(entityIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'entityId', expectedType: 'integer' });
    }

    const decrypted: string = await this.queryBus.execute(
      new RetrieveEncryptedStoreEntryQuery({
        tenantId: tenantIdNum,
        actorId: actorIdNum,
        entityType,
        entityId: entityIdNum,
        fieldPath,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto<{ data: string }>({
      data: decrypted
    });
  }

  /**
   * Rotate encryption key for a tenant
   *
   * Initiates asynchronous key rotation for all vault entries belonging to a tenant.
   * This is a long-running operation that re-encrypts all data with a new key.
   */
  @Post('rotate-key')
  @ApiOperation({
    summary: 'Rotate encryption key for tenant',
    description:
      'Initiates asynchronous key rotation for all vault entries. ' +
      'Re-encrypts all vault data with a new key. ' +
      'This is a long-running operation - consider using a message queue.'
  })
  @ApiResponse({
    status: 202,
    description: 'Key rotation initiated',
    type: BaseResponseDto
  })
  @Resource({ type: OPA_RESOURCES.ENCRYPTED_STORE, scope: 'tenant' })
  @Action(OPA_ACTIONS.ROTATE_KEY)
  @RequirePermissions('tenant:crypto:key_rotate')
  async rotateKey(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @RequestTraceData() trace: RequestTrace = {},
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RotateKeyDto
  ): Promise<BaseResponseDto<{ message: string }>> {
    const tenantIdNum = Number.parseInt(tenantId, 10);
    const actorIdNum = Number.parseInt(actorId, 10);

    if (Number.isNaN(tenantIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-tenant-id', expectedType: 'integer' });
    }

    if (Number.isNaN(actorIdNum)) {
      throw Errors.validationinvalidValueFor002({ field: 'x-actor-id', expectedType: 'integer' });
    }

    if (dto.oldKeyId === dto.newKeyId) {
      throw new BadRequestException('oldKeyId and newKeyId must be different');
    }

    const commandResult: ICommandResult<RotateEncryptedStoreKeyResult> = await this.commandBus.execute(
      new RotateEncryptedStoreKeyCommand({
        tenantId: tenantIdNum,
        actorId: actorIdNum,
        oldKeyId: dto.oldKeyId,
        newKeyId: dto.newKeyId,
        ...toCqrsTrace(trace)
      })
    );

    if (!commandResult.success) {
      throw new InternalServerErrorException(
        commandResult.errors?.join(', ') || 'Key rotation failed'
      );
    }

    return new BaseResponseDto<{ message: string }>({
      message: 'Key rotation initiated successfully'
    });
  }
}

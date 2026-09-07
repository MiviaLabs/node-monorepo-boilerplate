import {
  Body,
  Post,
  Param,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
  InternalServerErrorException
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActorId, RequirePermissions } from '@package/auth';
import { Action, Resource } from '@package/opa';
import { ICommandResult } from '@package/types';
import {
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsNotEmpty
} from 'class-validator';

import { RotateAddressKeyCommand, ResumeRotationCommand, CancelRotationCommand } from '../commands';
import {
  RotateAddressKeyResult,
  ResumeRotationResult
} from '../services/address-key-rotation.service';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { RequestTraceData, TenantId } from '@/common/decorators';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Custom validator to ensure oldKeyId and newKeyId are different
 *
 * Prevents no-op rotation requests where oldKeyId === newKeyId.
 * Mirrors the Zod validation in KmsKeyRotationEventSchema.
 */
@ValidatorConstraint({ name: 'keyIdsDifferent', async: false })
class KeyIdsDifferentConstraint implements ValidatorConstraintInterface {
  validate(newKeyId: string, args: ValidationArguments): boolean {
    // Use inline type to avoid circular dependency during class initialization
    const object = args.object as { oldKeyId: string; newKeyId: string };
    return newKeyId !== object.oldKeyId;
  }

  defaultMessage(): string {
    return 'oldKeyId and newKeyId must be different';
  }
}

/**
 * DTO for rotate address key operation
 */
export class RotateAddressKeyDto {
  /**
   * Old key ID to rotate from
   */
  @IsString()
  @IsNotEmpty()
  oldKeyId!: string;

  /**
   * New key ID to rotate to
   *
   * MUST be different from oldKeyId (validated by KeyIdsDifferentConstraint)
   */
  @IsString()
  @IsNotEmpty()
  @Validate(KeyIdsDifferentConstraint)
  newKeyId!: string;
}

/**
 * Address Key Rotation Controller
 *
 * P0 SECURITY: All endpoints require explicit authorization for cryptographic key rotation operations.
 *
 * ## Authorization Requirements
 *
 * All endpoints require:
 * 1. JWT authentication (JwtAuthGuard)
 * 2. OPA policy evaluation (HybridPolicyGuard)
 * 3. CRYPTO_KEY_ROTATE permission (RequirePermissions)
 *
 * ## Multi-Tenancy
 *
 * All operations are scoped to tenant via x-tenant-id header.
 * Key rotation only affects encrypted-store entries within the requesting tenant.
 *
 * ## Audit Logging
 *
 * All key rotation operations are logged with actorId for audit trail.
 * No PII is exposed in logs or error responses (P0 compliance).
 */
@VersionedController('v1', 'people/address-key-rotation')
@ApiTags('Address Key Rotation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class PersonKeyRotationController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Rotate address encryption keys
   *
   * Initiates key rotation for all user address encrypted-store entries in the tenant.
   * This is a long-running operation that processes entries in batches.
   *
   * ## Security
   * - Requires CRYPTO_KEY_ROTATE permission
   * - Tenant-scoped to organizationId
   * - Actor ID logged for audit
   *
   * ## Process
   * 1. Create rotation state record
   * 2. Query encrypted-store entries by tenant and old key ID
   * 3. Re-encrypt each entry with new key
   * 4. Update progress after each batch
   * 5. Verify rotation completed
   * 6. Mark rotation state as completed
   */
  @Post('rotate')
  @ApiOperation({
    summary: 'Rotate address encryption keys',
    description:
      'Initiates key rotation for all user address encrypted-store entries. ' +
      'Re-encrypts all encrypted-store data with a new key. ' +
      'This is a long-running operation that processes entries in batches.'
  })
  @ApiResponse({
    status: 202,
    description: 'Key rotation initiated',
    type: BaseResponseDto<RotateAddressKeyResult>
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.ROTATE_KEY)
  @RequirePermissions('tenant:crypto:key_rotate')
  async rotate(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RotateAddressKeyDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<RotateAddressKeyResult>> {
    const commandResult: ICommandResult<RotateAddressKeyResult> = await this.commandBus.execute(
      new RotateAddressKeyCommand({
        tenantId: Number(tenantId),
        actorId: Number(actorId),
        oldKeyId: dto.oldKeyId,
        newKeyId: dto.newKeyId,
        ...toCqrsTrace(trace)
      })
    );

    if (!commandResult.success || !commandResult.data) {
      throw new InternalServerErrorException(
        commandResult.errors?.join(', ') ?? 'Key rotation failed'
      );
    }

    return new BaseResponseDto(commandResult.data);
  }

  /**
   * Resume interrupted rotation
   *
   * Resumes a key rotation operation that was interrupted.
   *
   * ## Security
   * - Requires CRYPTO_KEY_ROTATE permission
   * - Tenant-scoped via rotation state
   * - Actor ID logged for audit
   */
  @Post('resume/:rotationStateId')
  @ApiOperation({
    summary: 'Resume interrupted key rotation',
    description: 'Resumes a key rotation operation that was previously interrupted.'
  })
  @ApiResponse({
    status: 200,
    description: 'Rotation resumed',
    type: BaseResponseDto<ResumeRotationResult>
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.ROTATE_KEY)
  @RequirePermissions('tenant:crypto:key_rotate')
  async resume(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @Param('rotationStateId', ParseIntPipe) rotationStateId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<ResumeRotationResult>> {
    const commandResult: ICommandResult<ResumeRotationResult> = await this.commandBus.execute(
      new ResumeRotationCommand({
        tenantId: Number(tenantId),
        actorId: Number(actorId),
        rotationStateId,
        ...toCqrsTrace(trace)
      })
    );

    if (!commandResult.success || !commandResult.data) {
      throw new InternalServerErrorException(
        commandResult.errors?.join(', ') ?? 'Failed to resume rotation'
      );
    }

    return new BaseResponseDto(commandResult.data);
  }

  /**
   * Cancel in-progress rotation
   *
   * Cancels an active key rotation operation.
   *
   * ## Security
   * - Requires CRYPTO_KEY_ROTATE permission
   * - Tenant-scoped via rotation state
   * - Actor ID logged for audit
   */
  @Post('cancel/:rotationStateId')
  @ApiOperation({
    summary: 'Cancel in-progress rotation',
    description: 'Cancels an active key rotation operation.'
  })
  @ApiResponse({
    status: 200,
    description: 'Rotation canceled',
    type: BaseResponseDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.CANCEL)
  @RequirePermissions('tenant:crypto:key_rotate')
  async cancel(
    @TenantId() tenantId: string,
    @ActorId() actorId: string,
    @Param('rotationStateId', ParseIntPipe) rotationStateId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<void>> {
    await this.commandBus.execute(
      new CancelRotationCommand({
        tenantId: Number(tenantId),
        actorId: Number(actorId),
        rotationStateId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto<void>(undefined);
  }
}

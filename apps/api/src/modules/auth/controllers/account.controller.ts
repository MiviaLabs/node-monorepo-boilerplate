import {
  Delete,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { Action, Resource } from '@package/opa';

import { DeleteAccountCommand } from '../commands/delete-account.command';
import { ExportUserDataCommand } from '../commands/export-user-data.command';
import { TransferOwnershipCommand } from '../commands/transfer-ownership.command';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto';
import { CanDeleteUserGuard } from '../guards/can-delete-user.guard';

import type { UserDataExport } from '../handlers/commands/export-user-data.handler';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser, RequestTraceData } from '@/common/decorators';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

/**
 * Account management controller
 *
 * Handles account deletion requests
 */
@VersionedController('v1', 'iam/account')
@ApiTags('GdprAccount')
export class GdprAccountController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Delete user account
   *
   * - Regular users: Deletes only their account
   * - Organization owners: Deletes entire organization and all users
   * - Requires authentication and authorization
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, HybridPolicyGuard, CanDeleteUserGuard)
  @ApiOperation({
    summary: 'Delete user account',
    description:
      'Deletes a user account. If the user is an organization owner, the entire organization and all its users will be deleted.'
  })
  @ApiParam({
    name: 'id',
    description: 'User ID to delete',
    type: 'string',
    example: '123'
  })
  @ApiQuery({
    name: 'reason',
    description: 'Reason for deletion (optional)',
    required: false,
    type: 'string',
    example: 'gdpr'
  })
  @ApiResponse({
    status: 204,
    description: 'Account deleted successfully'
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions'
  })
  @ApiResponse({
    status: 404,
    description: 'User not found'
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  async deleteAccount(
    @TenantId() tenantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('id') targetUserId: string,
    @Query('reason') reason?: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteAccountCommand({
        tenantId,
        actorId,
        targetUserId,
        ...(reason !== undefined && { reason }),
        requestId: trace.requestId,
        ...toCqrsTrace(trace)
      })
    );
  }

  /**
   * Export user data (GDPR compliance)
   *
   * Returns all user data in JSON format.
   * Users can only export their own data (unless admin).
   */
  @Get(':id/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, HybridPolicyGuard)
  @ApiOperation({
    summary: 'Export user data',
    description: 'Exports all user data for GDPR compliance. Users can only export their own data.'
  })
  @ApiParam({
    name: 'id',
    description: 'User ID to export',
    type: 'string',
    example: '123'
  })
  @ApiResponse({
    status: 200,
    description: 'User data exported successfully',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            isVerified: { type: 'boolean' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string', nullable: true },
            lastSignInAt: { type: 'string', nullable: true }
          }
        },
        identities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              displayName: { type: 'string' },
              emailVerified: { type: 'boolean' },
              createdAt: { type: 'string' }
            }
          }
        },
        organization: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        },
        exportedAt: { type: 'string' },
        exportedBy: { type: 'string' }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions'
  })
  @ApiResponse({
    status: 404,
    description: 'User not found'
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.EXPORT)
  async exportUserData(
    @TenantId() tenantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('id') userId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserDataExport>> {
    // Verify user belongs to same tenant as actor
    // This prevents cross-tenant data export security breach
    const command = new ExportUserDataCommand({
      tenantId,
      userId,
      actorId,
      requestId: trace.requestId,
      ...toCqrsTrace(trace)
    });

    // Execute command (handler will validate tenant membership and userId format)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const exportData = await this.commandBus.execute(command);

    // Return wrapped in BaseResponseDto (VersionInterceptor will unwrap and add meta)
    return new BaseResponseDto(exportData, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Transfer organization ownership
   *
   * Transfers organization ownership from current owner to a new owner.
   * Only the current owner can initiate this transfer.
   * New owner must be an existing active member of the organization.
   */
  @Post('organizations/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, HybridPolicyGuard)
  @ApiOperation({
    summary: 'Transfer organization ownership',
    description:
      'Transfers organization ownership to another member. Only current owner can perform this action.'
  })
  @ApiResponse({
    status: 200,
    description: 'Ownership transferred successfully'
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions - only owner can transfer ownership'
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - new owner must be an active member'
  })
  @ApiResponse({
    status: 404,
    description: 'Organization or new owner not found'
  })
  @Resource({ type: OPA_RESOURCES.ORGANIZATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.TRANSFER_OWNERSHIP)
  async transferOwnership(
    @TenantId() tenantId: string,
    @CurrentUser('userId') actorId: string,
    @Body() dto: TransferOwnershipDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new TransferOwnershipCommand({
        tenantId,
        actorId,
        newOwnerId: dto.newOwnerId,
        ...(dto.reason !== undefined && { reason: dto.reason }),
        requestId: trace.requestId,
        ...toCqrsTrace(trace)
      })
    );
  }
}

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ERROR_CODES } from '@package/constants';
import { ICommandResult, commandSuccess, commandFailure } from '@package/types';

import { RotateAddressKeyCommand } from '../../commands/rotate-address-key.command';
import {
  AddressKeyRotationService,
  RotateAddressKeyResult
} from '../../services/address-key-rotation.service';

/**
 * Rotate address key handler
 *
 * Handles key rotation for user address encrypted-store entries with authorization checks.
 *
 * ## P0 Security: Authorization Required
 *
 * This handler performs critical security operation (cryptographic key rotation).
 * Authorization is enforced at TWO levels:
 *
 * 1. **Controller Level**: Guards verify CRYPTO_KEY_ROTATE permission before handler executes
 * 2. **Handler Level**: Tenant scoping and actor validation ensure operation integrity
 *
 * ## Multi-Tenancy
 *
 * All operations are scoped to tenantId to prevent cross-tenant access.
 * Key rotation only affects encrypted-store entries within the requesting tenant.
 */
@CommandHandler(RotateAddressKeyCommand)
export class RotateAddressKeyHandler implements ICommandHandler<RotateAddressKeyCommand> {
  private readonly logger = new Logger(RotateAddressKeyHandler.name);

  constructor(private readonly rotationService: AddressKeyRotationService) {}

  async execute(command: RotateAddressKeyCommand): Promise<ICommandResult<RotateAddressKeyResult>> {
    const { tenantId, actorId, oldKeyId, newKeyId } = command;

    this.logger.log(
      `[KeyRotation] Starting rotation for tenant ${tenantId} by actor ${actorId}: ${oldKeyId} -> ${newKeyId}`
    );

    try {
      // P0: All operations are tenant-scoped within rotationService
      // The service already enforces tenant isolation via organizationId parameter
      const result = await this.rotationService.rotateVaultEntries({
        organizationId: tenantId,
        oldKeyId,
        newKeyId,
        actorId,
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      });

      this.logger.log(
        `[KeyRotation] Completed rotation for tenant ${tenantId}: ${result.processedCount}/${result.totalCount} processed`
      );

      return commandSuccess({
        rotationStateId: result.rotationStateId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        totalCount: result.totalCount,
        isComplete: result.isComplete,
        errors: result.errors
      });
    } catch (error) {
      this.logger.error(
        `[KeyRotation] Failed for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Don't expose sensitive details in error response
      return commandFailure(
        ERROR_CODES.CRYPTO_KEY_ROTATION_FAILED,
        `Key rotation failed for tenant ${tenantId}`
      ) as ICommandResult<RotateAddressKeyResult>;
    }
  }
}

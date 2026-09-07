import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ERROR_CODES } from '@package/constants';
import { commandSuccess, commandFailure } from '@package/types';

import { CancelRotationCommand } from '../../commands/cancel-rotation.command';
import { AddressKeyRotationService } from '../../services/address-key-rotation.service';

import type { ICommandResult } from '@package/types';

/**
 * Cancel rotation handler
 *
 * Cancels an in-progress key rotation operation with authorization checks.
 *
 * ## P0 Security: Authorization Required
 *
 * This handler performs critical security operation (canceling key rotation).
 * Authorization is enforced at TWO levels:
 *
 * 1. **Controller Level**: Guards verify CRYPTO_KEY_ROTATE permission before handler executes
 * 2. **Handler Level**: Tenant scoping and actor validation ensure operation integrity
 *
 * ## Multi-Tenancy
 *
 * All operations are scoped to tenantId to prevent cross-tenant access.
 */
@CommandHandler(CancelRotationCommand)
export class CancelRotationHandler implements ICommandHandler<CancelRotationCommand> {
  private readonly logger = new Logger(CancelRotationHandler.name);

  constructor(private readonly rotationService: AddressKeyRotationService) {}

  async execute(command: CancelRotationCommand): Promise<ICommandResult<void>> {
    const { tenantId, actorId, rotationStateId } = command;

    this.logger.log(
      `[KeyRotation] Canceling rotation ${rotationStateId} for tenant ${tenantId} by actor ${actorId}`
    );

    try {
      // P0: Service enforces tenant isolation via rotationState lookup with organizationId
      await this.rotationService.cancelRotation(tenantId, rotationStateId, actorId, {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      });

      this.logger.log(`[KeyRotation] Canceled rotation ${rotationStateId}`);

      return commandSuccess(undefined);
    } catch (error) {
      this.logger.error(
        `[KeyRotation] Cancel failed for state ${rotationStateId}: ${error instanceof Error ? error.message : String(error)}`
      );

      return commandFailure(
        ERROR_CODES.CRYPTO_KEY_ROTATION_CANCEL_FAILED,
        `Failed to cancel rotation ${rotationStateId}`
      );
    }
  }
}

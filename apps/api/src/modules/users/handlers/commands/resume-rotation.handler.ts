import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ERROR_CODES } from '@package/constants';
import { ICommandResult, commandSuccess, commandFailure } from '@package/types';

import { ResumeRotationCommand } from '../../commands/resume-rotation.command';
import {
  AddressKeyRotationService,
  ResumeRotationResult
} from '../../services/address-key-rotation.service';

/**
 * Resume rotation handler
 *
 * Resumes an interrupted key rotation operation with authorization checks.
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
 */
@CommandHandler(ResumeRotationCommand)
export class ResumeRotationHandler implements ICommandHandler<ResumeRotationCommand> {
  private readonly logger = new Logger(ResumeRotationHandler.name);

  constructor(private readonly rotationService: AddressKeyRotationService) {}

  async execute(command: ResumeRotationCommand): Promise<ICommandResult<ResumeRotationResult>> {
    const { tenantId, actorId, rotationStateId } = command;

    this.logger.log(
      `[KeyRotation] Resuming rotation ${rotationStateId} for tenant ${tenantId} by actor ${actorId}`
    );

    try {
      // P0: Service enforces tenant isolation via rotationState lookup with organizationId
      const result = await this.rotationService.resumeRotation(
        tenantId, // organizationId
        rotationStateId,
        actorId,
        {
          requestId: command.requestId,
          correlationId: command.correlationId,
          causationId: command.causationId
        }
      );

      this.logger.log(
        `[KeyRotation] Resumed rotation ${rotationStateId}: ${result.processedCount}/${result.totalCount} processed`
      );

      return commandSuccess({
        rotationStateId,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        totalCount: result.totalCount,
        isComplete: result.isComplete,
        errors: result.errors
      });
    } catch (error) {
      this.logger.error(
        `[KeyRotation] Resume failed for state ${rotationStateId}: ${error instanceof Error ? error.message : String(error)}`
      );

      return commandFailure(
        ERROR_CODES.CRYPTO_KEY_ROTATION_RESUME_FAILED,
        `Failed to resume rotation ${rotationStateId}`
      ) as ICommandResult<ResumeRotationResult>;
    }
  }
}

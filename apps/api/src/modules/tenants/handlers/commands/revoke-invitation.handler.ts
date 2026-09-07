import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { RevokeInvitationCommand } from '../../commands/revoke-invitation.command';
import { TenantService } from '../../services/tenant.service';

@CommandHandler(RevokeInvitationCommand)
export class RevokeInvitationHandler implements ICommandHandler<RevokeInvitationCommand> {
  private readonly logger = new Logger(RevokeInvitationHandler.name);

  constructor(private readonly tenantService: TenantService) {}

  async execute(command: RevokeInvitationCommand): Promise<void> {
    this.logger.debug(`Revoking invitation ${command.invitationId} for tenant ${command.tenantId}`);

    await this.tenantService.revokeInvitation({
      tenantId: command.tenantId,
      actorId: command.actorId,
      requestId: command.requestId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      invitationId: command.invitationId
    });
  }
}

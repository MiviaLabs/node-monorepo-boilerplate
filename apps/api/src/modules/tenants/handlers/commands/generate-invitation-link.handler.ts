import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { GenerateInvitationLinkCommand } from '../../commands/generate-invitation-link.command';
import { TenantService } from '../../services/tenant.service';

@CommandHandler(GenerateInvitationLinkCommand)
export class GenerateInvitationLinkHandler implements ICommandHandler<GenerateInvitationLinkCommand> {
  private readonly logger = new Logger(GenerateInvitationLinkHandler.name);

  constructor(private readonly tenantService: TenantService) {}

  async execute(
    command: GenerateInvitationLinkCommand
  ): Promise<{ invitationId: string; invitationToken: string }> {
    this.logger.debug(
      `Generating invitation link for invitation ${command.invitationId} in tenant ${command.tenantId}`
    );

    return this.tenantService.generateInvitationLink({
      tenantId: command.tenantId,
      actorId: command.actorId,
      requestId: command.requestId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      invitationId: command.invitationId
    });
  }
}

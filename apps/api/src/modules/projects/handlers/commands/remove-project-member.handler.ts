import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { RemoveProjectMemberCommand } from '../../commands/remove-project-member.command';
import { ProjectsService } from '../../services/projects.service';

@CommandHandler(RemoveProjectMemberCommand)
export class RemoveProjectMemberHandler implements ICommandHandler<RemoveProjectMemberCommand> {
  constructor(private readonly projectsService: ProjectsService) {}

  async execute(command: RemoveProjectMemberCommand): Promise<void> {
    await this.projectsService.removeProjectMember(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.projectId,
      command.memberId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

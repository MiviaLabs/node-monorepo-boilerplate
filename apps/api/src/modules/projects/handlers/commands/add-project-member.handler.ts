import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { AddProjectMemberCommand } from '../../commands/add-project-member.command';
import { ProjectsService } from '../../services/projects.service';

import type { ProjectMemberDto } from '../../dto';

@CommandHandler(AddProjectMemberCommand)
export class AddProjectMemberHandler implements ICommandHandler<AddProjectMemberCommand> {
  constructor(private readonly projectsService: ProjectsService) {}

  async execute(command: AddProjectMemberCommand): Promise<ProjectMemberDto> {
    return this.projectsService.addProjectMember(
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

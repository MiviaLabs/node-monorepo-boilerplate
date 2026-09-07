import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UpdateProjectCommand } from '../../commands/update-project.command';
import { ProjectsService } from '../../services/projects.service';

import type { Project } from '../../types/project.types';

@CommandHandler(UpdateProjectCommand)
export class UpdateProjectHandler implements ICommandHandler<UpdateProjectCommand> {
  constructor(private readonly projectsService: ProjectsService) {}

  async execute(command: UpdateProjectCommand): Promise<Project> {
    return this.projectsService.updateProject(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.projectId,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateProjectCommand } from '../../commands/create-project.command';
import { ProjectsService } from '../../services/projects.service';

import type { Project } from '../../types/project.types';

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<CreateProjectCommand> {
  constructor(private readonly projectsService: ProjectsService) {}

  async execute(command: CreateProjectCommand): Promise<Project> {
    return this.projectsService.createProject(
      command.tenantId,
      command.userId,
      command.actorId,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

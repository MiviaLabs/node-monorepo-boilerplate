import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteProjectCommand } from '../../commands/delete-project.command';
import { ProjectsService } from '../../services/projects.service';

@CommandHandler(DeleteProjectCommand)
export class DeleteProjectHandler implements ICommandHandler<DeleteProjectCommand> {
  constructor(private readonly projectsService: ProjectsService) {}

  async execute(command: DeleteProjectCommand): Promise<void> {
    await this.projectsService.deleteProject(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.projectId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

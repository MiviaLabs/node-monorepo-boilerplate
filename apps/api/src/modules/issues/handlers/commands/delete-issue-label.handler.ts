import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteIssueLabelCommand } from '../../commands';
import { IssuesService } from '../../services';

@CommandHandler(DeleteIssueLabelCommand)
export class DeleteIssueLabelHandler implements ICommandHandler<DeleteIssueLabelCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: DeleteIssueLabelCommand): Promise<void> {
    await this.issuesService.deleteIssueLabel(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.labelId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

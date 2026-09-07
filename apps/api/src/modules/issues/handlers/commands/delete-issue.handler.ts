import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteIssueCommand } from '../../commands';
import { IssuesService } from '../../services';

@CommandHandler(DeleteIssueCommand)
export class DeleteIssueHandler implements ICommandHandler<DeleteIssueCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: DeleteIssueCommand): Promise<void> {
    await this.issuesService.deleteIssue(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

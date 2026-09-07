import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { RemoveIssueWatcherCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(RemoveIssueWatcherCommand)
export class RemoveIssueWatcherHandler implements ICommandHandler<RemoveIssueWatcherCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: RemoveIssueWatcherCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.removeIssueWatcher(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      command.watcherUserId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

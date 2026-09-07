import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { AddIssueWatcherCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(AddIssueWatcherCommand)
export class AddIssueWatcherHandler implements ICommandHandler<AddIssueWatcherCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: AddIssueWatcherCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.addIssueWatcher(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

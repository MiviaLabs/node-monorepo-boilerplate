import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UpdateIssueCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(UpdateIssueCommand)
export class UpdateIssueHandler implements ICommandHandler<UpdateIssueCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: UpdateIssueCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.updateIssue(
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

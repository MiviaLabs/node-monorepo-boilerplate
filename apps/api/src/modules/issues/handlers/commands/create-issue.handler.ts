import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(CreateIssueCommand)
export class CreateIssueHandler implements ICommandHandler<CreateIssueCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: CreateIssueCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.createIssue(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

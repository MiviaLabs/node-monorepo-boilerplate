import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueCommentCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(CreateIssueCommentCommand)
export class CreateIssueCommentHandler implements ICommandHandler<CreateIssueCommentCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: CreateIssueCommentCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.createIssueComment(
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

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { AddIssueAssigneeCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(AddIssueAssigneeCommand)
export class AddIssueAssigneeHandler implements ICommandHandler<AddIssueAssigneeCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: AddIssueAssigneeCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.addIssueAssignee(
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

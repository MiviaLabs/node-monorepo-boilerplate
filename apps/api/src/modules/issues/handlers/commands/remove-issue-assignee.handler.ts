import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { RemoveIssueAssigneeCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(RemoveIssueAssigneeCommand)
export class RemoveIssueAssigneeHandler implements ICommandHandler<RemoveIssueAssigneeCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: RemoveIssueAssigneeCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.removeIssueAssignee(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.permissions,
      command.issueId,
      command.assigneeUserId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

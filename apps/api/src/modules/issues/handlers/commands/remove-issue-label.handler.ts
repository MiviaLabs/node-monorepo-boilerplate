import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { RemoveIssueLabelCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(RemoveIssueLabelCommand)
export class RemoveIssueLabelHandler implements ICommandHandler<RemoveIssueLabelCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: RemoveIssueLabelCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.removeIssueLabel(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      command.labelId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

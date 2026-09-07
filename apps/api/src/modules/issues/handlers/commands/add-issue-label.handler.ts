import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { AddIssueLabelCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(AddIssueLabelCommand)
export class AddIssueLabelHandler implements ICommandHandler<AddIssueLabelCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: AddIssueLabelCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.addIssueLabel(
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

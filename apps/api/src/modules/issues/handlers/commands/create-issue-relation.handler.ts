import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueRelationCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(CreateIssueRelationCommand)
export class CreateIssueRelationHandler implements ICommandHandler<CreateIssueRelationCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: CreateIssueRelationCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.createIssueRelation(
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

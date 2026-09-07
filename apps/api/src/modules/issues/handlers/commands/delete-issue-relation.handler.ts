import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteIssueRelationCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueDetailDtoShape } from '../../types/issue.types';

@CommandHandler(DeleteIssueRelationCommand)
export class DeleteIssueRelationHandler implements ICommandHandler<DeleteIssueRelationCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: DeleteIssueRelationCommand): Promise<IssueDetailDtoShape> {
    return this.issuesService.deleteIssueRelation(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      command.relationId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

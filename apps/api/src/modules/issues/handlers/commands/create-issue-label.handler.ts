import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueLabelCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueLabelDtoShape } from '../../types/issue.types';

@CommandHandler(CreateIssueLabelCommand)
export class CreateIssueLabelHandler implements ICommandHandler<CreateIssueLabelCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: CreateIssueLabelCommand): Promise<IssueLabelDtoShape> {
    return this.issuesService.createIssueLabel(
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

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UpdateIssueLabelCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueLabelDtoShape } from '../../types/issue.types';

@CommandHandler(UpdateIssueLabelCommand)
export class UpdateIssueLabelHandler implements ICommandHandler<UpdateIssueLabelCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: UpdateIssueLabelCommand): Promise<IssueLabelDtoShape> {
    return this.issuesService.updateIssueLabel(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.labelId,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

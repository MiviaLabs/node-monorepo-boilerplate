import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueAttachmentCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { IssueAttachmentDtoShape } from '../../types/issue.types';

@CommandHandler(CreateIssueAttachmentCommand)
export class CreateIssueAttachmentHandler implements ICommandHandler<CreateIssueAttachmentCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: CreateIssueAttachmentCommand): Promise<IssueAttachmentDtoShape> {
    return this.issuesService.createIssueAttachment(
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

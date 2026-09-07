import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteIssueAttachmentCommand } from '../../commands';
import { IssuesService } from '../../services';

@CommandHandler(DeleteIssueAttachmentCommand)
export class DeleteIssueAttachmentHandler implements ICommandHandler<
  DeleteIssueAttachmentCommand,
  void
> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(command: DeleteIssueAttachmentCommand): Promise<void> {
    await this.issuesService.deleteIssueAttachment(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.issueId,
      command.attachmentId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

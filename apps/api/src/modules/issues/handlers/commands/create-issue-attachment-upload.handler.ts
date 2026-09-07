import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateIssueAttachmentUploadCommand } from '../../commands';
import { IssuesService } from '../../services';

import type { FileUploadReservationDtoShape } from '@/modules/storage/types/file.types';

@CommandHandler(CreateIssueAttachmentUploadCommand)
export class CreateIssueAttachmentUploadHandler implements ICommandHandler<CreateIssueAttachmentUploadCommand> {
  constructor(private readonly issuesService: IssuesService) {}

  async execute(
    command: CreateIssueAttachmentUploadCommand
  ): Promise<FileUploadReservationDtoShape> {
    return this.issuesService.createIssueAttachmentUpload(
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

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateContentAttachmentCommand } from '../../commands';
import { ContentService } from '../../services';

import type { ContentAttachmentDtoShape } from '../../types/content.types';

@CommandHandler(CreateContentAttachmentCommand)
export class CreateContentAttachmentHandler implements ICommandHandler<CreateContentAttachmentCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: CreateContentAttachmentCommand): Promise<ContentAttachmentDtoShape> {
    return this.contentService.createAttachment(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.entryId,
      command.dto,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

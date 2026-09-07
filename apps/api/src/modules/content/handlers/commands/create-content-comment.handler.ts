import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateContentCommentCommand } from '../../commands';
import { ContentService } from '../../services';

import type { ContentCommentDtoShape } from '../../types/content.types';

@CommandHandler(CreateContentCommentCommand)
export class CreateContentCommentHandler implements ICommandHandler<CreateContentCommentCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: CreateContentCommentCommand): Promise<ContentCommentDtoShape> {
    return this.contentService.createComment(
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

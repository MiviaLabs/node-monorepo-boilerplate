import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteContentCommentCommand } from '../../commands';
import { ContentService } from '../../services';

@CommandHandler(DeleteContentCommentCommand)
export class DeleteContentCommentHandler implements ICommandHandler<DeleteContentCommentCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: DeleteContentCommentCommand): Promise<void> {
    await this.contentService.deleteComment(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.entryId,
      command.commentId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

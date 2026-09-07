import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteContentEntryCommand } from '../../commands/delete-content-entry.command';
import { ContentService } from '../../services';

@CommandHandler(DeleteContentEntryCommand)
export class DeleteContentEntryHandler implements ICommandHandler<DeleteContentEntryCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: DeleteContentEntryCommand): Promise<void> {
    await this.contentService.deleteEntry(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.entryId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

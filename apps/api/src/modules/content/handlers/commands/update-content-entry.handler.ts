import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UpdateContentEntryCommand } from '../../commands/update-content-entry.command';
import { ContentService } from '../../services';

import type { ContentEntryDtoShape } from '../../types/content.types';

@CommandHandler(UpdateContentEntryCommand)
export class UpdateContentEntryHandler implements ICommandHandler<UpdateContentEntryCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: UpdateContentEntryCommand): Promise<ContentEntryDtoShape> {
    return this.contentService.updateEntry(
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

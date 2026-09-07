import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateContentEntryCommand } from '../../commands/create-content-entry.command';
import { ContentService } from '../../services';

import type { ContentEntryDtoShape } from '../../types/content.types';

@CommandHandler(CreateContentEntryCommand)
export class CreateContentEntryHandler implements ICommandHandler<CreateContentEntryCommand> {
  constructor(private readonly contentService: ContentService) {}

  async execute(command: CreateContentEntryCommand): Promise<ContentEntryDtoShape> {
    return this.contentService.createEntry(
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

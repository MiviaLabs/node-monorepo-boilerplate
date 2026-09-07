import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CreateFileUploadCommand } from '../../commands/create-file-upload.command';
import { StorageFilesService } from '../../services/storage-files.service';

import type { FileUploadReservationDtoShape } from '../../types/file.types';

@CommandHandler(CreateFileUploadCommand)
export class CreateFileUploadHandler implements ICommandHandler<CreateFileUploadCommand> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(command: CreateFileUploadCommand): Promise<FileUploadReservationDtoShape> {
    return this.storageFilesService.createUploadReservation(
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

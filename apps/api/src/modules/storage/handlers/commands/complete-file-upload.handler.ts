import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { CompleteFileUploadCommand } from '../../commands/complete-file-upload.command';
import { StorageFilesService } from '../../services/storage-files.service';

import type { StorageFileDtoShape } from '../../types/file.types';

@CommandHandler(CompleteFileUploadCommand)
export class CompleteFileUploadHandler implements ICommandHandler<CompleteFileUploadCommand> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(command: CompleteFileUploadCommand): Promise<StorageFileDtoShape> {
    return this.storageFilesService.completeUpload(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.fileId,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

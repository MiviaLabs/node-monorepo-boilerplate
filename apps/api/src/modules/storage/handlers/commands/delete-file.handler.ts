import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DeleteFileCommand } from '../../commands';
import { StorageFilesService } from '../../services';

import type { StorageFileDtoShape } from '../../types/file.types';

@CommandHandler(DeleteFileCommand)
export class DeleteFileHandler implements ICommandHandler<DeleteFileCommand> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(command: DeleteFileCommand): Promise<StorageFileDtoShape> {
    return this.storageFilesService.deleteFile(
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

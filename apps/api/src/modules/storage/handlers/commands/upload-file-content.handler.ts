import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UploadFileContentCommand } from '../../commands/upload-file-content.command';
import { StorageFilesService } from '../../services/storage-files.service';

import type { StorageFileDtoShape } from '../../types/file.types';

@CommandHandler(UploadFileContentCommand)
export class UploadFileContentHandler implements ICommandHandler<UploadFileContentCommand> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(command: UploadFileContentCommand): Promise<StorageFileDtoShape> {
    return this.storageFilesService.uploadFileContent(
      command.tenantId,
      command.userId,
      command.actorId,
      command.roles,
      command.fileId,
      command.body,
      command.contentType,
      command.contentLength,
      {
        requestId: command.requestId,
        correlationId: command.correlationId,
        causationId: command.causationId
      }
    );
  }
}

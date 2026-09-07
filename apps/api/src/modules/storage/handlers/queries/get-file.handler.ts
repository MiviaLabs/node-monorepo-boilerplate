import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { GetFileQuery } from '../../queries/get-file.query';
import { StorageFilesService } from '../../services/storage-files.service';

import type { StorageFileDtoShape } from '../../types/file.types';

@QueryHandler(GetFileQuery)
export class GetFileHandler implements IQueryHandler<GetFileQuery, StorageFileDtoShape> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(query: GetFileQuery): Promise<StorageFileDtoShape> {
    return this.storageFilesService.getFile(query.tenantId, query.userId, query.fileId);
  }
}

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { GetFileDownloadUrlQuery } from '../../queries/get-file-download-url.query';
import { StorageFilesService } from '../../services/storage-files.service';

import type { StorageSignedUrlDtoShape } from '../../types/file.types';

@QueryHandler(GetFileDownloadUrlQuery)
export class GetFileDownloadUrlHandler implements IQueryHandler<
  GetFileDownloadUrlQuery,
  StorageSignedUrlDtoShape
> {
  constructor(private readonly storageFilesService: StorageFilesService) {}

  async execute(query: GetFileDownloadUrlQuery): Promise<StorageSignedUrlDtoShape> {
    return this.storageFilesService.getDownloadUrl(
      query.tenantId,
      query.userId,
      query.actorId,
      query.fileId,
      {
        requestId: query.requestId,
        correlationId: query.correlationId,
        causationId: query.causationId
      }
    );
  }
}

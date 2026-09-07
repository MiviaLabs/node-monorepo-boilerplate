import { Injectable, Logger } from '@nestjs/common';
import { StorageRegistryService } from '@package/storage/nest';

import type { User } from '@package/db-core';

import { FileRepository } from '@/modules/storage/repositories/file.repository';

type AvatarResolutionUser = Pick<User, 'id' | 'avatarFileId' | 'photoUrl'>;

const AVATAR_SIGNING_CONCURRENCY = 8;

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        await mapper(items[currentIndex] as T);
      }
    })
  );
}

@Injectable()
export class AvatarUrlResolverService {
  private readonly logger = new Logger(AvatarUrlResolverService.name);

  constructor(
    private readonly fileRepository: FileRepository,
    private readonly storageRegistry: StorageRegistryService
  ) {}

  async resolvePhotoUrl(tenantId: string, user: AvatarResolutionUser): Promise<string | null> {
    const resolved = await this.resolvePhotoUrls(tenantId, [user]);
    return resolved.get(user.id) ?? user.photoUrl ?? null;
  }

  async resolvePhotoUrls(
    tenantId: string,
    users: readonly AvatarResolutionUser[]
  ): Promise<ReadonlyMap<number, string | null>> {
    if (users.length === 0) {
      return new Map();
    }

    const usersById = new Map<number, AvatarResolutionUser>();
    for (const user of users) {
      if (!usersById.has(user.id)) {
        usersById.set(user.id, user);
      }
    }

    const tenantIdNum = Number.parseInt(tenantId, 10);
    if (!Number.isInteger(tenantIdNum) || tenantIdNum <= 0) {
      return new Map(
        Array.from(usersById.values(), (user) => [user.id, user.photoUrl ?? null] as const)
      );
    }

    try {
      const avatarFileIds = Array.from(
        new Set(
          Array.from(usersById.values(), (user) => user.avatarFileId).filter(
            (avatarFileId): avatarFileId is number => avatarFileId != null
          )
        )
      );
      const files = await this.fileRepository.findByIds(tenantIdNum, avatarFileIds);
      const readyFilesById = new Map(
        files
          .filter((file) => file.status === 'ready' && file.purpose === 'user_avatar')
          .map((file) => [file.id, file] as const)
      );

      const signedUrlByFileId = new Map<number, string | null>();
      const providersByStorageInstance = new Map<
        string,
        ReturnType<StorageRegistryService['get']>
      >();
      await mapWithConcurrency(
        Array.from(readyFilesById.values()),
        AVATAR_SIGNING_CONCURRENCY,
        async (file) => {
          try {
            const provider =
              providersByStorageInstance.get(file.storageInstance) ??
              this.storageRegistry.get(file.storageInstance);
            providersByStorageInstance.set(file.storageInstance, provider);
            const signedUrl = await provider.getSignedDownloadUrl({
              bucket: file.bucket,
              key: file.objectKey
            });
            signedUrlByFileId.set(file.id, signedUrl.url);
          } catch (error) {
            this.logger.warn(
              `Falling back to legacy profile photo URL for user avatar file ${file.id}: ${error instanceof Error ? error.message : 'unknown error'}`
            );
          }
        }
      );

      return new Map(
        Array.from(
          usersById.values(),
          (user) =>
            [
              user.id,
              user.avatarFileId != null
                ? (signedUrlByFileId.get(user.avatarFileId) ?? user.photoUrl ?? null)
                : (user.photoUrl ?? null)
            ] as const
        )
      );
    } catch (error) {
      for (const user of usersById.values()) {
        this.logger.warn(
          `Falling back to legacy profile photo URL for user ${user.id}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
      return new Map(
        Array.from(usersById.values(), (user) => [user.id, user.photoUrl ?? null] as const)
      );
    }
  }
}

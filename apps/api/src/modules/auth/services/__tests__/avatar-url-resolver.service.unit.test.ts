import { Test } from '@nestjs/testing';
import { StorageRegistryService } from '@package/storage/nest';

import { AvatarUrlResolverService } from '../avatar-url-resolver.service';

import type { TestingModule } from '@nestjs/testing';
import type { files } from '@package/db-core';
import type { SignedUrlResult } from '@package/storage';
import type { StorageRegistryService as NestStorageRegistryService } from '@package/storage/nest';

import { FileRepository } from '@/modules/storage/repositories/file.repository';

describe('AvatarUrlResolverService', () => {
  let service: AvatarUrlResolverService;
  let fileRepository: jest.Mocked<FileRepository>;
  let storageRegistry: jest.Mocked<NestStorageRegistryService>;
  let provider: { getSignedDownloadUrl: jest.Mock };

  beforeEach(async () => {
    provider = {
      getSignedDownloadUrl: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarUrlResolverService,
        {
          provide: FileRepository,
          useValue: {
            findByIds: jest.fn()
          }
        },
        {
          provide: StorageRegistryService,
          useValue: {
            get: jest.fn(() => provider)
          }
        }
      ]
    }).compile();

    service = module.get(AvatarUrlResolverService);
    fileRepository = module.get(FileRepository);
    storageRegistry = module.get(StorageRegistryService);
  });

  it('returns a signed URL for a ready avatar file', async () => {
    fileRepository.findByIds.mockResolvedValue([
      {
        id: 301,
        organizationId: 201,
        uploadedByUserId: 101,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/301/avatar.png',
        originalFilename: 'avatar.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: 'etag-1',
        status: 'ready',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect
    ]);
    provider.getSignedDownloadUrl.mockResolvedValue({
      url: 'https://signed.example.test/avatar.png'
    } as SignedUrlResult);

    await expect(
      service.resolvePhotoUrl('201', {
        id: 101,
        avatarFileId: 301,
        photoUrl: 'https://legacy.example.test/avatar.png'
      })
    ).resolves.toBe('https://signed.example.test/avatar.png');

    expect(storageRegistry.get).toHaveBeenCalledWith('avatars');
  });

  it('falls back to the legacy photoUrl when the avatar file is not ready', async () => {
    fileRepository.findByIds.mockResolvedValue([
      {
        id: 301,
        organizationId: 201,
        uploadedByUserId: 101,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/301/avatar.png',
        originalFilename: 'avatar.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: null,
        status: 'pending_upload',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: null,
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect
    ]);

    await expect(
      service.resolvePhotoUrl('201', {
        id: 101,
        avatarFileId: 301,
        photoUrl: 'https://legacy.example.test/avatar.png'
      })
    ).resolves.toBe('https://legacy.example.test/avatar.png');
  });

  it('falls back to the legacy photoUrl when signing fails', async () => {
    fileRepository.findByIds.mockResolvedValue([
      {
        id: 301,
        organizationId: 201,
        uploadedByUserId: 101,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/301/avatar.png',
        originalFilename: 'avatar.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: 'etag-1',
        status: 'ready',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect
    ]);
    provider.getSignedDownloadUrl.mockRejectedValue(new Error('signing failed'));

    await expect(
      service.resolvePhotoUrl('201', {
        id: 101,
        avatarFileId: 301,
        photoUrl: 'https://legacy.example.test/avatar.png'
      })
    ).resolves.toBe('https://legacy.example.test/avatar.png');
  });

  it('returns null when no avatar file or legacy photoUrl exists', async () => {
    await expect(
      service.resolvePhotoUrl('201', {
        id: 101,
        avatarFileId: null,
        photoUrl: null
      })
    ).resolves.toBeNull();
  });

  it('batches file metadata lookup across multiple users', async () => {
    fileRepository.findByIds.mockResolvedValue([
      {
        id: 301,
        organizationId: 201,
        uploadedByUserId: 101,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/301/avatar.png',
        originalFilename: 'avatar.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: 'etag-1',
        status: 'ready',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect
    ]);
    provider.getSignedDownloadUrl.mockResolvedValue({
      url: 'https://signed.example.test/avatar.png'
    } as SignedUrlResult);

    const result = await service.resolvePhotoUrls('201', [
      {
        id: 101,
        avatarFileId: 301,
        photoUrl: 'https://legacy.example.test/avatar-101.png'
      },
      {
        id: 102,
        avatarFileId: null,
        photoUrl: 'https://legacy.example.test/avatar-102.png'
      }
    ]);

    expect(fileRepository.findByIds).toHaveBeenCalledWith(201, [301]);
    expect(result.get(101)).toBe('https://signed.example.test/avatar.png');
    expect(result.get(102)).toBe('https://legacy.example.test/avatar-102.png');
  });

  it('reuses the storage provider per storage instance during batch signing', async () => {
    fileRepository.findByIds.mockResolvedValue([
      {
        id: 301,
        organizationId: 201,
        uploadedByUserId: 101,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/301/avatar-a.png',
        originalFilename: 'avatar-a.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: 'etag-1',
        status: 'ready',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect,
      {
        id: 302,
        organizationId: 201,
        uploadedByUserId: 102,
        storageInstance: 'avatars',
        bucket: 'user-avatars',
        objectKey: 'org/201/avatars/302/avatar-b.png',
        originalFilename: 'avatar-b.png',
        mimeType: 'image/png',
        byteSize: 2048,
        checksumSha256: null,
        etag: 'etag-2',
        status: 'ready',
        visibility: 'private',
        purpose: 'user_avatar',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as typeof files.$inferSelect
    ]);
    provider.getSignedDownloadUrl
      .mockResolvedValueOnce({ url: 'https://signed.example.test/avatar-a.png' } as SignedUrlResult)
      .mockResolvedValueOnce({
        url: 'https://signed.example.test/avatar-b.png'
      } as SignedUrlResult);

    const result = await service.resolvePhotoUrls('201', [
      {
        id: 101,
        avatarFileId: 301,
        photoUrl: 'https://legacy.example.test/avatar-101.png'
      },
      {
        id: 102,
        avatarFileId: 302,
        photoUrl: 'https://legacy.example.test/avatar-102.png'
      }
    ]);

    expect(storageRegistry.get).toHaveBeenCalledTimes(1);
    expect(storageRegistry.get).toHaveBeenCalledWith('avatars');
    expect(result.get(101)).toBe('https://signed.example.test/avatar-a.png');
    expect(result.get(102)).toBe('https://signed.example.test/avatar-b.png');
  });
});

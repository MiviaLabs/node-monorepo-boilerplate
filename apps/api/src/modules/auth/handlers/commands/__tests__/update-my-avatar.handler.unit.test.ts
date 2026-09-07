import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { UpdateMyAvatarCommand } from '../../../commands/update-my-avatar.command';
import { UserProfileResponseDto } from '../../../dto';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserProfileViewService } from '../../../services/user-profile-view.service';
import { UpdateMyAvatarHandler } from '../update-my-avatar.handler';

import type { TestingModule } from '@nestjs/testing';
import type { files, users } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { FileRepository } from '@/modules/storage/repositories/file.repository';
import {
  DetachedFileCleanupService,
  DetachedFileCleanupStatus
} from '@/modules/storage/services/detached-file-cleanup.service';

describe('UpdateMyAvatarHandler', () => {
  let handler: UpdateMyAvatarHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let fileRepository: jest.Mocked<FileRepository>;
  let detachedFileCleanupService: jest.Mocked<DetachedFileCleanupService>;
  let userProfileViewService: jest.Mocked<UserProfileViewService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateMyAvatarHandler,
        {
          provide: AuthRepository,
          useValue: {
            replaceMyAvatarFileWithDatabase: jest.fn()
          }
        },
        {
          provide: FileRepository,
          useValue: {
            findByIdWithDatabase: jest.fn()
          }
        },
        {
          provide: DetachedFileCleanupService,
          useValue: {
            softDeleteDetachedFileWithDatabase: jest.fn()
          }
        },
        {
          provide: UserProfileViewService,
          useValue: {
            build: jest.fn()
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: {
            transaction: jest.fn()
          }
        }
      ]
    }).compile();

    handler = module.get(UpdateMyAvatarHandler);
    authRepository = module.get(AuthRepository);
    fileRepository = module.get(FileRepository);
    detachedFileCleanupService = module.get(DetachedFileCleanupService);
    userProfileViewService = module.get(UserProfileViewService);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
    db = module.get(MAIN_DB);
    db.transaction.mockImplementation(
      async (callback: Parameters<NodePgDatabase['transaction']>[0]) => callback({} as never)
    );
  });

  it('attaches a ready user avatar file for the current user', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
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
    } as typeof files.$inferSelect);
    authRepository.replaceMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: 301
      } as typeof users.$inferSelect,
      previousAvatarFileId: null,
      changed: true
    });
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Avatar User',
        name: 'Avatar User',
        photoUrl: 'https://signed.example.test/avatar.png'
      })
    );

    const result = await handler.execute(
      new UpdateMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101',
        fileId: 301
      })
    );

    expect(authRepository.replaceMyAvatarFileWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      '201',
      101,
      301
    );
    expect(outboxRepo.insert).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(detachedFileCleanupService.softDeleteDetachedFileWithDatabase).not.toHaveBeenCalled();
    expect(result.photoUrl).toBe('https://signed.example.test/avatar.png');
  });

  it('soft-deletes the previous avatar file when replacing it with a different file', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
      id: 302,
      organizationId: 201,
      uploadedByUserId: 101,
      status: 'ready',
      purpose: 'user_avatar'
    } as typeof files.$inferSelect);
    authRepository.replaceMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: 302
      } as typeof users.$inferSelect,
      previousAvatarFileId: 301,
      changed: true
    });
    detachedFileCleanupService.softDeleteDetachedFileWithDatabase.mockResolvedValue({
      file: {
        id: 301,
        organizationId: 201,
        purpose: 'user_avatar'
      } as typeof files.$inferSelect,
      cleanupStatus: DetachedFileCleanupStatus.PendingDelete
    });
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Avatar User',
        name: 'Avatar User',
        photoUrl: 'https://signed.example.test/avatar-302.png'
      })
    );

    await handler.execute(
      new UpdateMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101',
        fileId: 302,
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );

    expect(detachedFileCleanupService.softDeleteDetachedFileWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      201,
      '101',
      301,
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      },
      { expectedPurpose: 'user_avatar' }
    );
  });

  it('does not clean up the current file when the avatar is reattached to the same file id', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
      id: 301,
      organizationId: 201,
      uploadedByUserId: 101,
      status: 'ready',
      purpose: 'user_avatar'
    } as typeof files.$inferSelect);
    authRepository.replaceMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: 301
      } as typeof users.$inferSelect,
      previousAvatarFileId: 301,
      changed: false
    });
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Avatar User',
        name: 'Avatar User',
        photoUrl: 'https://signed.example.test/avatar.png'
      })
    );

    await handler.execute(
      new UpdateMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101',
        fileId: 301
      })
    );

    expect(detachedFileCleanupService.softDeleteDetachedFileWithDatabase).not.toHaveBeenCalled();
    expect(outboxRepo.insert).not.toHaveBeenCalled();
    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });

  it('rejects files that were not uploaded by the current user', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
      id: 301,
      organizationId: 201,
      uploadedByUserId: 999,
      status: 'ready',
      purpose: 'user_avatar'
    } as typeof files.$inferSelect);

    await expect(
      handler.execute(
        new UpdateMyAvatarCommand({
          tenantId: '201',
          userId: '101',
          actorId: '101',
          fileId: 301
        })
      )
    ).rejects.toThrow(
      Errors.validationinvalidValueFor002({
        field: 'fileId',
        expectedType: 'avatar uploaded by current user'
      })
    );
  });

  it('rejects files that are not ready', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
      id: 301,
      organizationId: 201,
      uploadedByUserId: 101,
      status: 'pending_upload',
      purpose: 'user_avatar'
    } as typeof files.$inferSelect);

    await expect(
      handler.execute(
        new UpdateMyAvatarCommand({
          tenantId: '201',
          userId: '101',
          actorId: '101',
          fileId: 301
        })
      )
    ).rejects.toThrow(
      Errors.validationinvalidValueFor002({
        field: 'fileId',
        expectedType: 'ready avatar file'
      })
    );
  });

  it('rejects files with the wrong purpose', async () => {
    fileRepository.findByIdWithDatabase.mockResolvedValue({
      id: 301,
      organizationId: 201,
      uploadedByUserId: 101,
      status: 'ready',
      purpose: 'issue_attachment'
    } as typeof files.$inferSelect);

    await expect(
      handler.execute(
        new UpdateMyAvatarCommand({
          tenantId: '201',
          userId: '101',
          actorId: '101',
          fileId: 301
        })
      )
    ).rejects.toThrow(
      Errors.validationinvalidValueFor002({
        field: 'fileId',
        expectedType: 'user avatar file'
      })
    );
  });
});

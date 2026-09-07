import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { RemoveMyAvatarCommand } from '../../../commands/remove-my-avatar.command';
import { UserProfileResponseDto } from '../../../dto';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserProfileViewService } from '../../../services/user-profile-view.service';
import { RemoveMyAvatarHandler } from '../remove-my-avatar.handler';

import type { TestingModule } from '@nestjs/testing';
import type { files, users } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import {
  DetachedFileCleanupService,
  DetachedFileCleanupStatus
} from '@/modules/storage/services/detached-file-cleanup.service';

describe('RemoveMyAvatarHandler', () => {
  let handler: RemoveMyAvatarHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let detachedFileCleanupService: jest.Mocked<DetachedFileCleanupService>;
  let userProfileViewService: jest.Mocked<UserProfileViewService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoveMyAvatarHandler,
        {
          provide: AuthRepository,
          useValue: {
            clearMyAvatarFileWithDatabase: jest.fn()
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

    handler = module.get(RemoveMyAvatarHandler);
    authRepository = module.get(AuthRepository);
    detachedFileCleanupService = module.get(DetachedFileCleanupService);
    userProfileViewService = module.get(UserProfileViewService);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
    db = module.get(MAIN_DB);
    db.transaction.mockImplementation(
      async (callback: Parameters<NodePgDatabase['transaction']>[0]) => callback({} as never)
    );
  });

  it('clears the current avatar and cleans up the detached file', async () => {
    authRepository.clearMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: null
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
        photoUrl: null,
        avatarFileId: null
      })
    );

    const result = await handler.execute(
      new RemoveMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101',
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      })
    );

    expect(authRepository.clearMyAvatarFileWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      '201',
      101
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
    expect(outboxRepo.insert).toHaveBeenCalled();
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(result.photoUrl).toBeNull();
    expect(result.avatarFileId).toBeNull();
  });

  it('clears the legacy photoUrl fallback when the avatar is explicitly removed', async () => {
    authRepository.clearMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: null
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
        photoUrl: null,
        avatarFileId: null
      })
    );

    const result = await handler.execute(
      new RemoveMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101'
      })
    );

    expect(authRepository.clearMyAvatarFileWithDatabase).toHaveBeenCalled();
    expect(result.photoUrl).toBeNull();
  });

  it('does not invoke detached cleanup when no avatar is attached', async () => {
    authRepository.clearMyAvatarFileWithDatabase.mockResolvedValue({
      user: {
        id: 101,
        organizationId: 201,
        displayName: 'Avatar User',
        phoneNumberEncrypted: null,
        photoUrl: null,
        avatarFileId: null
      } as typeof users.$inferSelect,
      previousAvatarFileId: null,
      changed: false
    });
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Avatar User',
        name: 'Avatar User',
        photoUrl: null,
        avatarFileId: null
      })
    );

    await handler.execute(
      new RemoveMyAvatarCommand({
        tenantId: '201',
        userId: '101',
        actorId: '101'
      })
    );

    expect(detachedFileCleanupService.softDeleteDetachedFileWithDatabase).not.toHaveBeenCalled();
    expect(outboxRepo.insert).not.toHaveBeenCalled();
    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });
});

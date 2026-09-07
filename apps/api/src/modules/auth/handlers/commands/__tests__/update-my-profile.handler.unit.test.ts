import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { UpdateMyProfileCommand } from '../../../commands/update-my-profile.command';
import { UserProfileResponseDto } from '../../../dto';
import { AuthRepository } from '../../../repositories/auth.repository';
import { UserProfileViewService } from '../../../services/user-profile-view.service';
import { UpdateMyProfileHandler } from '../update-my-profile.handler';

import type { TestingModule } from '@nestjs/testing';
import type { users } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('UpdateMyProfileHandler', () => {
  let handler: UpdateMyProfileHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let userProfileViewService: jest.Mocked<UserProfileViewService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateMyProfileHandler,
        {
          provide: AuthRepository,
          useValue: {
            updateMyProfile: jest.fn(),
            decryptPhoneNumber: jest.fn()
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

    handler = module.get(UpdateMyProfileHandler);
    authRepository = module.get(AuthRepository);
    userProfileViewService = module.get(UserProfileViewService);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
    db = module.get(MAIN_DB);
    db.transaction.mockImplementation(
      async (callback: Parameters<NodePgDatabase['transaction']>[0]) => callback({} as never)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update display name using authenticated subject user only', async () => {
    authRepository.updateMyProfile.mockResolvedValue({
      id: 101,
      organizationId: 201,
      displayName: 'Updated Name',
      phoneNumberEncrypted: 'cipher:key:iv:tag'
    } as typeof users.$inferSelect);
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Updated Name',
        name: 'Updated Name',
        phoneNumber: '+14155550199',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      })
    );

    const command = new UpdateMyProfileCommand({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      email: 'user@example.com',
      displayName: '  Updated Name  '
    });

    const result = await handler.execute(command);

    expect(authRepository.updateMyProfile).toHaveBeenCalledWith(
      '201',
      101,
      {
        displayName: 'Updated Name',
        phoneNumber: undefined
      },
      expect.anything()
    );
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'user.profileupdated',
        tenantId: '201',
        aggregateId: '101',
        payload: expect.objectContaining({
          userId: '101',
          actorId: '101',
          changedFields: ['displayName']
        })
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.profile.updated.audit',
        payload: expect.objectContaining({
          details: expect.objectContaining({
            changedFields: ['displayName']
          })
        })
      })
    );
    expect(result.displayName).toBe('Updated Name');
    expect(result.name).toBe('Updated Name');
    expect(result.phoneNumber).toBe('+14155550199');
  });

  it('should update phone number when provided', async () => {
    authRepository.updateMyProfile.mockResolvedValue({
      id: 101,
      organizationId: 201,
      displayName: 'Updated Name',
      phoneNumberEncrypted: 'cipher:key:iv:tag'
    } as typeof users.$inferSelect);
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Updated Name',
        name: 'Updated Name',
        phoneNumber: '+14155552671',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      })
    );

    const command = new UpdateMyProfileCommand({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      email: 'user@example.com',
      displayName: 'Updated Name',
      phoneNumber: ' +14155552671 '
    });

    const result = await handler.execute(command);

    expect(authRepository.updateMyProfile).toHaveBeenCalledWith(
      '201',
      101,
      {
        displayName: 'Updated Name',
        phoneNumber: '+14155552671'
      },
      expect.anything()
    );
    const outboxPayload = outboxRepo.insert.mock.calls[0]?.[1]?.payload as
      | { changedFields?: string[]; phoneNumber?: string }
      | undefined;
    expect(outboxPayload?.changedFields).toEqual(['displayName', 'phoneNumber']);
    expect(outboxPayload).not.toHaveProperty('phoneNumber');
    const auditEvent = auditOutbox.insert.mock.calls[0]?.[1] as
      | { payload?: { details?: { changedFields?: string[]; phoneNumberProvided?: boolean } } }
      | undefined;
    const auditPayload = auditEvent?.payload as
      | { details?: { changedFields?: string[]; phoneNumberProvided?: boolean } }
      | undefined;
    expect(auditPayload?.details?.changedFields).toEqual(['displayName', 'phoneNumber']);
    expect(result.displayName).toBe('Updated Name');
    expect(result.phoneNumber).toBe('+14155552671');
  });

  it('should allow clearing the phone number with an empty string', async () => {
    authRepository.updateMyProfile.mockResolvedValue({
      id: 101,
      organizationId: 201,
      displayName: 'Updated Name',
      phoneNumberEncrypted: null
    } as typeof users.$inferSelect);
    userProfileViewService.build.mockResolvedValue(
      UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: '201',
        actorId: '101',
        displayName: 'Updated Name',
        name: 'Updated Name',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      })
    );

    const command = new UpdateMyProfileCommand({
      tenantId: '201',
      userId: '101',
      actorId: '101',
      email: 'user@example.com',
      displayName: 'Updated Name',
      phoneNumber: '   '
    });

    const result = await handler.execute(command);

    expect(authRepository.updateMyProfile).toHaveBeenCalledWith(
      '201',
      101,
      {
        displayName: 'Updated Name',
        phoneNumber: ''
      },
      expect.anything()
    );
    const outboxPayload = outboxRepo.insert.mock.calls[0]?.[1]?.payload as
      | { changedFields?: string[] }
      | undefined;
    expect(outboxPayload?.changedFields).toEqual(['displayName', 'phoneNumber']);
    const auditEvent = auditOutbox.insert.mock.calls[0]?.[1] as
      | { payload?: { details?: { changedFields?: string[] } } }
      | undefined;
    const auditPayload = auditEvent?.payload as
      | { details?: { changedFields?: string[] } }
      | undefined;
    expect(auditPayload?.details?.changedFields).toEqual(['displayName', 'phoneNumber']);
    expect(result.phoneNumber).toBeUndefined();
  });

  it('should throw when no updatable fields are provided', async () => {
    const command = new UpdateMyProfileCommand({
      tenantId: '201',
      userId: '101',
      actorId: '101'
    });

    await expect(handler.execute(command)).rejects.toThrow();
  });
});

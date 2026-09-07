import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AuthRepository } from '../../../../auth/repositories/auth.repository';
import { TrackedEmailService } from '../../../../email-tracking/services/tracked-email.service';
import { InvitationRepository } from '../../../repositories/invitation.repository';
import { InvitationEmailConsumer } from '../invitation-email.consumer';

import type { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('InvitationEmailConsumer', () => {
  let consumer: InvitationEmailConsumer;
  let trackedEmailService: jest.Mocked<TrackedEmailService>;
  let mockInvitationRepo: jest.Mocked<
    Pick<InvitationRepository, 'findById' | 'decryptEmail' | 'getCurrentInvitationToken'>
  >;
  let mockAuthRepository: jest.Mocked<Pick<AuthRepository, 'findOrganizationById'>>;
  let logger: jest.Mocked<Logger>;

  const event = {
    eventId: 'evt-123',
    data: {
      tenantId: '1',
      invitationId: '42',
      role: 'tenant_user' as const,
      invitedBy: '7',
      invitedAt: '2026-03-01T00:00:00.000Z',
      emailHash: 'hash-123',
      expiresAt: '2026-03-08T00:00:00.000Z'
    }
  };

  const existingUserEvent = {
    eventId: 'evt-456',
    data: {
      tenantId: '1',
      userId: '99',
      role: 'tenant_admin' as const,
      invitedBy: '7',
      invitedAt: '2026-03-01T00:00:00.000Z',
      emailHash: 'hash-999',
      expiresAt: '2026-03-08T00:00:00.000Z'
    }
  };

  beforeEach(async () => {
    trackedEmailService = {
      sendTrackedEmail: jest.fn().mockResolvedValue({
        emailMessageId: 42,
        emailMessagePublicId: 'public-42',
        response: {
          messageId: 'msg-1',
          success: true
        }
      })
    } as unknown as jest.Mocked<TrackedEmailService>;

    mockInvitationRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 42,
        organizationId: 1,
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'hash-123',
        status: 'pending',
        expiresAt: new Date('2026-03-08T00:00:00.000Z')
      }),
      decryptEmail: jest.fn().mockResolvedValue('invitee@example.com'),
      getCurrentInvitationToken: jest.fn().mockReturnValue('invite-token-abc')
    };
    mockAuthRepository = {
      findOrganizationById: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Acme Workspace',
        displayName: 'Acme Premium',
        tenantId: 1
      })
    } as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationEmailConsumer,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              if (key === 'INVITATION_WEBAPP_URL') {
                return 'https://public.example.com/';
              }
              return fallback;
            })
          }
        },
        {
          provide: InvitationRepository,
          useValue: mockInvitationRepo
        },
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: TrackedEmailService,
          useValue: trackedEmailService
        }
      ]
    }).compile();

    consumer = module.get<InvitationEmailConsumer>(InvitationEmailConsumer);

    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (consumer as any).logger = logger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send invitation email successfully', async () => {
    await consumer.handle(event);

    expect(mockInvitationRepo.findById).toHaveBeenCalledWith(1, 42);
    expect(mockInvitationRepo.decryptEmail).toHaveBeenCalledWith('ciphertext:key:iv:tag');
    expect(mockInvitationRepo.getCurrentInvitationToken).toHaveBeenCalled();

    expect(trackedEmailService.sendTrackedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        request: expect.objectContaining({
          to: 'invitee@example.com',
          subject: expect.stringContaining('invited'),
          html: expect.stringContaining('Accept invitation'),
          emailTracking: expect.objectContaining({
            messageKind: 'tenant_invitation',
            referenceType: 'invitation',
            referenceId: '42'
          })
        })
      })
    );

    const html = (trackedEmailService.sendTrackedEmail as jest.Mock).mock.calls[0]?.[0]?.request
      ?.html as string;
    expect(html).toContain(
      'https://public.example.com/invitations/accept?tenantId=1&amp;token=invite-token-abc'
    );
  });

  it('should not log PII values', async () => {
    await consumer.handle(event);

    const allLogs = [
      ...(logger.log as jest.Mock).mock.calls.flat(),
      ...(logger.error as jest.Mock).mock.calls.flat()
    ]
      .map(String)
      .join(' ');

    expect(allLogs).not.toContain('invitee@example.com');
    expect(allLogs).toContain('evt-123');
    expect(allLogs).toContain('1');
    expect(allLogs).toContain('42');
  });

  it('should rethrow send failures for retries', async () => {
    const error = new Error('email provider down');
    trackedEmailService.sendTrackedEmail.mockRejectedValue(error);

    await expect(consumer.handle(event)).rejects.toThrow('email provider down');

    expect(logger.error).toHaveBeenCalledTimes(1);
    const errorLog = (logger.error as jest.Mock).mock.calls[0]?.[0] as string;
    expect(errorLog).not.toContain('invitee@example.com');
  });

  it('should skip email send for existing-user invite events', async () => {
    await consumer.handle(existingUserEvent);

    expect(trackedEmailService.sendTrackedEmail).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('should skip email send when invitation is no longer pending', async () => {
    mockInvitationRepo.findById.mockResolvedValueOnce({
      id: 42,
      organizationId: 1,
      emailEncrypted: 'ciphertext:key:iv:tag',
      tokenHash: 'hash-123',
      status: 'accepted',
      expiresAt: new Date('2026-03-08T00:00:00.000Z')
    } as never);

    await consumer.handle(event);

    expect(trackedEmailService.sendTrackedEmail).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

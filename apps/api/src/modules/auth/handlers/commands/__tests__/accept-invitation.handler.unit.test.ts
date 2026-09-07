import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { InvitationRepository, UserTenantRepository } from '../../../../tenants/repositories';
import { AcceptInvitationCommand } from '../../../commands/accept-invitation.command';
import { AuthRepository } from '../../../repositories/auth.repository';
import { AcceptInvitationHandler } from '../accept-invitation.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('AcceptInvitationHandler', () => {
  let handler: AcceptInvitationHandler;
  let invitationRepository: jest.Mocked<InvitationRepository>;
  let userTenantRepository: jest.Mocked<UserTenantRepository>;
  let authRepository: jest.Mocked<AuthRepository>;
  let outboxRepository: jest.Mocked<OutboxRepository>;

  beforeEach(async () => {
    const db = {
      transaction: jest.fn().mockImplementation(async (callback) => callback({}))
    } as unknown as jest.Mocked<NodePgDatabase>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcceptInvitationHandler,
        {
          provide: InvitationRepository,
          useValue: {
            findPendingByTokenHashGlobal: jest.fn(),
            markAsAcceptedWithTransaction: jest.fn()
          }
        },
        {
          provide: UserTenantRepository,
          useValue: {
            findByUserAndTenant: jest.fn(),
            createMembershipWithTransaction: jest.fn()
          }
        },
        {
          provide: AuthRepository,
          useValue: {
            findByIdGlobal: jest.fn(),
            findOrganizationById: jest.fn()
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get(AcceptInvitationHandler);
    invitationRepository = module.get(InvitationRepository);
    userTenantRepository = module.get(UserTenantRepository);
    authRepository = module.get(AuthRepository);
    outboxRepository = module.get(OutboxRepository);
  });

  it('should accept invitation and create membership when authenticated email matches', async () => {
    invitationRepository.findPendingByTokenHashGlobal.mockResolvedValue({
      id: 77,
      organizationId: 123,
      emailHash: 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
      role: 'tenant_admin',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    } as never);
    authRepository.findOrganizationById.mockResolvedValue({
      id: 123,
      tenantId: 456
    } as never);
    userTenantRepository.findByUserAndTenant.mockResolvedValue(null);
    invitationRepository.markAsAcceptedWithTransaction.mockResolvedValue({
      id: 77,
      status: 'accepted'
    } as never);

    const result = await handler.execute(
      new AcceptInvitationCommand({
        actorId: '501',
        actorEmail: 'user@example.com',
        tenantId: '123',
        invitationToken: 'token-123',
        requestId: 'req-1'
      })
    );

    expect(result).toEqual({
      status: 'accepted',
      tenantId: '123',
      invitationId: '77',
      membershipCreated: true
    });
    expect(userTenantRepository.createMembershipWithTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 501,
        tenantId: 456,
        role: 'tenant_admin'
      })
    );
    expect(outboxRepository.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.invitation.accepted.audit',
        correlationId: 'req-1',
        causationId: 'req-1',
        payload: expect.objectContaining({
          action: 'ACCEPT_INVITATION',
          requestId: 'req-1',
          details: expect.objectContaining({
            membershipCreated: true,
            role: 'tenant_admin'
          })
        })
      })
    );
  });

  it('should reject invitation when authenticated account does not match invite email', async () => {
    invitationRepository.findPendingByTokenHashGlobal.mockResolvedValue({
      id: 77,
      organizationId: 123,
      emailHash: 'different-hash',
      role: 'tenant_user',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    } as never);
    authRepository.findByIdGlobal.mockResolvedValue({
      id: 501,
      emailHash: 'actor-hash'
    } as never);

    await expect(
      handler.execute(
        new AcceptInvitationCommand({
          actorId: '501',
          tenantId: '123',
          invitationToken: 'token-123'
        })
      )
    ).rejects.toMatchObject({
      code: 'BIZ_001'
    });
    expect(userTenantRepository.createMembershipWithTransaction).not.toHaveBeenCalled();
  });

  it('should reject invitations without an email binding', async () => {
    invitationRepository.findPendingByTokenHashGlobal.mockResolvedValue({
      id: 77,
      organizationId: 123,
      emailHash: null,
      role: 'tenant_user',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    } as never);

    await expect(
      handler.execute(
        new AcceptInvitationCommand({
          actorId: '501',
          actorEmail: 'user@example.com',
          tenantId: '123',
          invitationToken: 'token-123'
        })
      )
    ).rejects.toMatchObject({
      code: 'BIZ_001'
    });
  });
});

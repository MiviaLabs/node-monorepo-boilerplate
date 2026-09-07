import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { InvitationRepository } from '../../../../tenants/repositories';
import { DeclineInvitationCommand } from '../../../commands/decline-invitation.command';
import { AuthRepository } from '../../../repositories/auth.repository';
import { DeclineInvitationHandler } from '../decline-invitation.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('DeclineInvitationHandler', () => {
  let handler: DeclineInvitationHandler;
  let invitationRepository: jest.Mocked<InvitationRepository>;
  let outboxRepository: jest.Mocked<OutboxRepository>;

  beforeEach(async () => {
    const db = {
      transaction: jest.fn().mockImplementation(async (callback) => callback({}))
    } as unknown as jest.Mocked<NodePgDatabase>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeclineInvitationHandler,
        {
          provide: InvitationRepository,
          useValue: {
            findPendingByTokenHashGlobal: jest.fn(),
            markAsCancelledWithTransaction: jest.fn()
          }
        },
        {
          provide: AuthRepository,
          useValue: {
            findByIdGlobal: jest.fn()
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

    handler = module.get(DeclineInvitationHandler);
    invitationRepository = module.get(InvitationRepository);
    outboxRepository = module.get(OutboxRepository);
  });

  it('should decline invitation when authenticated email matches', async () => {
    invitationRepository.findPendingByTokenHashGlobal.mockResolvedValue({
      id: 91,
      organizationId: 123,
      emailHash: 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
      role: 'tenant_user',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    } as never);
    invitationRepository.markAsCancelledWithTransaction.mockResolvedValue({
      id: 91,
      status: 'cancelled'
    } as never);

    const result = await handler.execute(
      new DeclineInvitationCommand({
        actorId: '501',
        actorEmail: 'user@example.com',
        tenantId: '123',
        invitationToken: 'token-123'
      })
    );

    expect(result).toEqual({
      status: 'declined',
      tenantId: '123',
      invitationId: '91',
      membershipCreated: false
    });
    expect(outboxRepository.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'auth.invitation.declined.audit',
        payload: expect.objectContaining({
          action: 'DECLINE_INVITATION',
          details: expect.objectContaining({
            invitationStateChanged: true
          })
        })
      })
    );
  });

  it('should reject invitations without an email binding', async () => {
    invitationRepository.findPendingByTokenHashGlobal.mockResolvedValue({
      id: 91,
      organizationId: 123,
      emailHash: null,
      role: 'tenant_user',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    } as never);

    await expect(
      handler.execute(
        new DeclineInvitationCommand({
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

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { ResendInvitationCommand } from '../../../commands/resend-invitation.command';
import { InvitationRepository } from '../../../repositories/invitation.repository';
import { ResendInvitationHandler } from '../resend-invitation.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('ResendInvitationHandler', () => {
  let handler: ResendInvitationHandler;
  let invitationRepo: jest.Mocked<InvitationRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let db: jest.Mocked<NodePgDatabase>;
  const tx = {} as never;

  const mockOrganization = {
    id: 1,
    tenantId: 101,
    ownerId: 5,
    publicId: 'org-public-id',
    name: 'Acme Workspace',
    displayName: 'Acme Workspace',
    slug: 'acme-workspace',
    gcpTenantId: 'gcp-tenant-1',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null
  };

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([mockOrganization])
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockInvitationRepo = {
      findById: jest.fn(),
      rotatePendingTokenWithTransaction: jest.fn(),
      updateExpiresAt: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) => callback(tx))
    };
    const mockOutboxRepo = {
      insert: jest.fn()
    };
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendInvitationHandler,
        { provide: InvitationRepository, useValue: mockInvitationRepo },
        { provide: OutboxRepository, useValue: mockOutboxRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MAIN_DB, useValue: db }
      ]
    }).compile();

    handler = module.get<ResendInvitationHandler>(ResendInvitationHandler);
    invitationRepo = module.get(InvitationRepository);
    outboxRepo = module.get(OutboxRepository);
    configService = module.get(ConfigService);
    invitationRepo.findById.mockResolvedValue({
      id: 77,
      organizationId: 1,
      emailHash: 'email-hash',
      emailEncrypted: 'ciphertext:key:iv:tag',
      tokenHash: 'old-hash',
      status: 'pending',
      role: 'tenant_user',
      invitedByUserId: 5,
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      acceptedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    } as never);
    invitationRepo.rotatePendingTokenWithTransaction.mockResolvedValue('rotated-token-123');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should rotate token and skip email dispatch when provider is not configured', async () => {
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77'
    });

    const result = await handler.execute(command);

    expect(result).toEqual({
      invitationId: '77',
      invitationToken: 'rotated-token-123',
      emailDispatched: false
    });
    expect(invitationRepo.rotatePendingTokenWithTransaction).toHaveBeenCalledWith(
      expect.anything(),
      1,
      77
    );
    expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'tenant.invitation.resent.audit',
        payload: expect.objectContaining({
          action: 'RESEND_INVITATION',
          actorId: '5',
          tenantId: '1',
          details: expect.objectContaining({
            invitationId: '77',
            emailDispatched: false
          })
        })
      })
    );
  });

  it('should skip email dispatch when provider is mock', async () => {
    configService.get.mockReturnValue('mock');
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77'
    });

    const result = await handler.execute(command);

    expect(result.emailDispatched).toBe(false);
    expect(result.invitationToken).toBe('rotated-token-123');
    expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'tenant.invitation.resent.audit',
        payload: expect.objectContaining({
          action: 'RESEND_INVITATION',
          actorId: '5',
          tenantId: '1',
          details: expect.objectContaining({
            invitationId: '77',
            emailDispatched: false
          })
        })
      })
    );
  });

  it('should rotate token and publish invite event when provider is active', async () => {
    configService.get.mockReturnValue('resend');
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77',
      correlationId: 'corr-123',
      causationId: 'cause-456'
    });

    const result = await handler.execute(command);

    expect(result.emailDispatched).toBe(true);
    expect(result.invitationToken).toBeUndefined();
    expect(invitationRepo.rotatePendingTokenWithTransaction).toHaveBeenCalledWith(
      expect.anything(),
      1,
      77
    );
    expect(outboxRepo.insert).toHaveBeenCalledTimes(2);
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'tenant.member.invited',
        aggregateId: '77',
        correlationId: 'corr-123',
        causationId: 'cause-456',
        schemaVersion: '3.0',
        payload: expect.not.objectContaining({
          invitationToken: expect.anything(),
          invitationTokenEncrypted: expect.anything()
        })
      })
    );
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'tenant.invitation.resent.audit',
        correlationId: 'corr-123',
        causationId: 'cause-456',
        payload: expect.objectContaining({
          action: 'RESEND_INVITATION',
          actorId: '5',
          tenantId: '1',
          details: expect.objectContaining({
            invitationId: '77',
            emailDispatched: true
          })
        })
      })
    );
  });

  it('should throw VAL_002 for invalid tenantId', async () => {
    const command = new ResendInvitationCommand({
      tenantId: 'invalid',
      actorId: '5',
      invitationId: '77'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({ code: 'VAL_002' });
  });

  it('should throw VAL_002 for invalid invitationId', async () => {
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: 'invalid'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({ code: 'VAL_002' });
  });

  it('should throw DB_004 when invitation is not found', async () => {
    invitationRepo.findById.mockResolvedValueOnce(null);
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({ code: 'DB_004' });
  });

  it('should throw DB_004 when invitation is not pending', async () => {
    invitationRepo.findById.mockResolvedValueOnce({
      id: 77,
      organizationId: 1,
      emailHash: 'email-hash',
      emailEncrypted: 'ciphertext:key:iv:tag',
      tokenHash: 'old-hash',
      status: 'accepted',
      role: 'tenant_user',
      invitedByUserId: 5,
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      acceptedAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z')
    } as never);
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({ code: 'DB_004' });
  });

  it('should throw DB_004 when token rotation fails', async () => {
    invitationRepo.rotatePendingTokenWithTransaction.mockResolvedValueOnce(null);
    const command = new ResendInvitationCommand({
      tenantId: '1',
      actorId: '5',
      invitationId: '77'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({ code: 'DB_004' });
  });
});

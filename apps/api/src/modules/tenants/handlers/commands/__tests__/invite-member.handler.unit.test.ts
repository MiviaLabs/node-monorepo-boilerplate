/**
 * Unit Tests for InviteMemberHandler
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { InviteMemberCommand } from '../../../commands/invite-member.command';
import { InvitationRepository } from '../../../repositories/invitation.repository';
import { UserTenantRepository } from '../../../repositories/user-tenant.repository';
import { InviteMemberHandler } from '../invite-member.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('InviteMemberHandler', () => {
  let handler: InviteMemberHandler;
  let userTenantRepo: jest.Mocked<UserTenantRepository>;
  let invitationRepo: jest.Mocked<InvitationRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockUser = {
    id: 123,
    organizationId: 1,
    emailHash: 'abc123',
    emailEncrypted: 'user@example.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

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

  function mockLookupSequence(userRows: unknown[]): void {
    (db as unknown as { limit: jest.Mock }).limit
      .mockResolvedValueOnce([mockOrganization] as never)
      .mockResolvedValueOnce(userRows as never);
  }

  beforeEach(async () => {
    dbTransaction = {} as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) => callback(dbTransaction))
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockUserTenantRepo = {
      findByUserAndTenant: jest.fn(),
      createMembershipWithTransaction: jest.fn()
    };

    const mockInvitationRepo = {
      createInvitationWithTransaction: jest.fn(),
      findPendingByEmailHash: jest.fn().mockResolvedValue(null),
      updatePendingInvitationWithTransaction: jest.fn(),
      rotatePendingTokenWithTransaction: jest.fn().mockResolvedValue('rotated-token-123')
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteMemberHandler,
        {
          provide: UserTenantRepository,
          useValue: mockUserTenantRepo
        },
        {
          provide: InvitationRepository,
          useValue: mockInvitationRepo
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<InviteMemberHandler>(InviteMemberHandler);
    userTenantRepo = module.get(UserTenantRepository);
    invitationRepo = module.get(InvitationRepository);
    outboxRepo = module.get(OutboxRepository);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw VAL_002 if tenantId is not a positive integer', async () => {
      const command = new InviteMemberCommand({
        tenantId: 'invalid',
        actorId: '5',
        invitation: {
          email: 'user@example.com',
          roles: ['tenant_user']
        }
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw DB_003 if user is already a member', async () => {
      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'user@example.com',
          roles: ['tenant_user']
        }
      });

      mockLookupSequence([mockUser]);

      userTenantRepo.findByUserAndTenant.mockResolvedValue({
        id: 1,
        userId: 123,
        tenantId: 101,
        role: 'tenant_user'
      } as never);

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'DB_003'
      });
    });
  });

  describe('success', () => {
    it('should create pending invitation for existing global user and publish sanitized event', async () => {
      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'user@example.com',
          roles: ['tenant_admin']
        }
      });

      mockLookupSequence([mockUser]);

      userTenantRepo.findByUserAndTenant.mockResolvedValue(null);
      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 987,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'user@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_admin',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      const result = await handler.execute(command);

      expect(result.userId).toBe(123);
      expect(result.invitationId).toBe(987);
      expect(result.invitationToken).toBe('raw-token-123');

      expect(invitationRepo.createInvitationWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organizationId: 1,
          email: 'user@example.com',
          invitedByUserId: 5,
          role: 'tenant_admin'
        })
      );

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited.audit',
          payload: expect.objectContaining({
            action: 'INVITE_MEMBER',
            actorId: '5',
            tenantId: '1',
            details: expect.objectContaining({
              invitationId: '987',
              userId: '123',
              targetType: 'existing_account_invitation'
            })
          })
        })
      );

      const payload = (outboxRepo.insert as jest.Mock).mock.calls[0]?.[1]?.payload as {
        email?: string;
        emailEncrypted?: string;
        invitationToken?: string;
        invitationTokenEncrypted?: string;
      };
      expect(payload.email).toBeUndefined();
      expect(payload.emailEncrypted).toBeUndefined();
      expect(payload.invitationToken).toBeUndefined();
      expect(payload.invitationTokenEncrypted).toBeUndefined();
      expect(userTenantRepo.createMembershipWithTransaction).not.toHaveBeenCalled();
    });

    it('should omit invitationId from existing-user invite events when email dispatch is active', async () => {
      configService.get.mockReturnValue('resend');

      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'user@example.com',
          roles: ['tenant_admin']
        },
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      mockLookupSequence([mockUser]);

      userTenantRepo.findByUserAndTenant.mockResolvedValue(null);
      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 987,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'user@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_admin',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      const result = await handler.execute(command);

      expect(result.userId).toBe(123);
      expect(result.invitationToken).toBeNull();
      expect(outboxRepo.insert).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited',
          payload: expect.objectContaining({
            tenantId: '1',
            userId: '123',
            role: 'tenant_admin',
            invitedBy: '5'
          })
        })
      );

      const eventPayload = (outboxRepo.insert as jest.Mock).mock.calls[0]?.[1]?.payload as {
        invitationId?: string;
        userId?: string;
      };
      expect(eventPayload.userId).toBe('123');
      expect(eventPayload.invitationId).toBeUndefined();
    });

    it('should create invitation record for non-existing user and return manual token when email dispatch is inactive', async () => {
      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'newuser@example.com',
          roles: ['tenant_user']
        }
      });

      mockLookupSequence([]);

      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 987,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'newuser@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_user',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      const result = await handler.execute(command);

      expect(result.userId).toBeNull();
      expect(result.invitationId).toBe(987);
      expect(result.invitationToken).toBe('raw-token-123');

      expect(invitationRepo.createInvitationWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organizationId: 1,
          email: 'newuser@example.com',
          invitedByUserId: 5,
          role: 'tenant_user'
        })
      );

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited.audit',
          payload: expect.objectContaining({
            action: 'INVITE_MEMBER',
            actorId: '5',
            tenantId: '1',
            details: expect.objectContaining({
              invitationId: '987'
            })
          })
        })
      );
      expect(userTenantRepo.createMembershipWithTransaction).not.toHaveBeenCalled();
    });

    it('should publish metadata-only invite event and suppress returned token when email dispatch is active', async () => {
      configService.get.mockReturnValue('resend');

      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'newuser@example.com',
          roles: ['tenant_user']
        },
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      mockLookupSequence([]);

      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 987,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'newuser@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_user',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      const result = await handler.execute(command);

      expect(result.userId).toBeNull();
      expect(result.invitationId).toBe(987);
      expect(result.invitationToken).toBeNull();
      expect(outboxRepo.insert).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited',
          aggregateId: '987',
          correlationId: 'corr-123',
          causationId: 'cause-123',
          schemaVersion: '3.0',
          payload: expect.objectContaining({
            tenantId: '1',
            invitationId: '987',
            role: 'tenant_user',
            invitedBy: '5',
            emailHash: expect.any(String)
          })
        })
      );

      const payload = (outboxRepo.insert as jest.Mock).mock.calls[0]?.[1]?.payload as {
        email?: string;
        invitationToken?: string;
        invitationTokenEncrypted?: string;
      };
      expect(payload.email).toBeUndefined();
      expect(payload.invitationToken).toBeUndefined();
      expect(payload.invitationTokenEncrypted).toBeUndefined();
      expect(userTenantRepo.createMembershipWithTransaction).not.toHaveBeenCalled();
    });

    it('should publish metadata-only invite event and still return manual token when provider is mock', async () => {
      configService.get.mockReturnValue('mock');

      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'newuser@example.com',
          roles: ['tenant_user']
        },
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      mockLookupSequence([]);

      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 987,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'newuser@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_user',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      const result = await handler.execute(command);

      expect(result.userId).toBeNull();
      expect(result.invitationId).toBe(987);
      expect(result.invitationToken).toBe('raw-token-123');
      expect(outboxRepo.insert).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited',
          aggregateId: '987',
          correlationId: 'corr-123',
          causationId: 'cause-123',
          schemaVersion: '3.0',
          payload: expect.objectContaining({
            tenantId: '1',
            invitationId: '987',
            role: 'tenant_user',
            invitedBy: '5',
            emailHash: expect.any(String)
          })
        })
      );
      expect(outboxRepo.insert).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.invited.audit'
        })
      );
    });

    it('should reuse pending invitation for same email and rotate token when email dispatch is inactive', async () => {
      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'newuser@example.com',
          roles: ['tenant_admin']
        }
      });

      mockLookupSequence([]);

      invitationRepo.findPendingByEmailHash.mockResolvedValue({
        id: 555,
        organizationId: 1,
        emailHash: 'h',
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 3,
        expiresAt: new Date('2026-12-30T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);
      invitationRepo.updatePendingInvitationWithTransaction.mockResolvedValue({
        id: 555,
        organizationId: 1,
        emailHash: 'h',
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_admin',
        invitedByUserId: 5,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z')
      } as never);
      invitationRepo.rotatePendingTokenWithTransaction.mockResolvedValue('rotated-token-xyz');

      const result = await handler.execute(command);

      expect(result.userId).toBeNull();
      expect(result.invitationId).toBe(555);
      expect(result.invitationToken).toBe('rotated-token-xyz');
      expect(invitationRepo.createInvitationWithTransaction).not.toHaveBeenCalled();
      expect(invitationRepo.rotatePendingTokenWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        1,
        555
      );
    });

    it('should reuse pending invitation without rotating token when email dispatch is active', async () => {
      configService.get.mockReturnValue('resend');

      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'newuser@example.com',
          roles: ['tenant_admin']
        }
      });

      mockLookupSequence([]);

      invitationRepo.findPendingByEmailHash.mockResolvedValue({
        id: 555,
        organizationId: 1,
        emailHash: 'h',
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 3,
        expiresAt: new Date('2026-12-30T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);
      invitationRepo.updatePendingInvitationWithTransaction.mockResolvedValue({
        id: 555,
        organizationId: 1,
        emailHash: 'h',
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_admin',
        invitedByUserId: 5,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z')
      } as never);
      invitationRepo.rotatePendingTokenWithTransaction.mockResolvedValue('rotated-token-xyz');

      const result = await handler.execute(command);

      expect(result.userId).toBeNull();
      expect(result.invitationId).toBe(555);
      expect(result.invitationToken).toBeNull();
      expect(invitationRepo.createInvitationWithTransaction).not.toHaveBeenCalled();
      expect(invitationRepo.rotatePendingTokenWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        1,
        555
      );
    });

    it('should default to tenant_user role if not specified', async () => {
      const command = new InviteMemberCommand({
        tenantId: '1',
        actorId: '5',
        invitation: {
          email: 'user@example.com'
        }
      });

      mockLookupSequence([mockUser]);

      userTenantRepo.findByUserAndTenant.mockResolvedValue(null);
      invitationRepo.createInvitationWithTransaction.mockResolvedValue({
        invitation: {
          id: 999,
          organizationId: 1,
          emailHash: 'h',
          emailEncrypted: 'user@example.com',
          tokenHash: 't',
          status: 'pending',
          role: 'tenant_user',
          invitedByUserId: 5,
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          acceptedAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        invitationToken: 'raw-token-123'
      } as never);

      await handler.execute(command);

      expect(invitationRepo.createInvitationWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'tenant_user'
        })
      );
    });
  });
});

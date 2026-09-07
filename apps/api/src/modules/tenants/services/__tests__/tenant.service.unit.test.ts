/**
 * Unit Tests for TenantService
 *
 * Tests tenant-scoped operations including:
 * - Getting current tenant settings
 * - Updating tenant settings
 * - Getting tenant members
 * - Inviting members
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MembersSortBy } from '../../queries/get-members.query';
import { InvitationRepository } from '../../repositories/invitation.repository';
import { TenantService } from '../tenant.service';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AvatarUrlResolverService } from '@/modules/auth/services';

describe('TenantService', () => {
  let service: TenantService;
  let mockDb: { select: jest.Mock; transaction: jest.Mock };
  type MockTransaction = {
    update: jest.Mock;
  };
  let mockInvitationRepository: {
    decryptEmail: jest.Mock;
    rotatePendingToken: jest.Mock;
    rotatePendingTokenWithTransaction: jest.Mock;
    markAsCancelled: jest.Mock;
    markAsCancelledWithTransaction: jest.Mock;
  };
  let mockOutboxRepo: { insert: jest.Mock };
  let mockAvatarUrlResolver: { resolvePhotoUrl: jest.Mock; resolvePhotoUrls: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      transaction: jest.fn(async (callback: (tx: MockTransaction) => Promise<unknown>) =>
        callback({
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([{ id: 77 }])
              })
            })
          })
        })
      )
    };
    mockInvitationRepository = {
      decryptEmail: jest.fn(),
      rotatePendingToken: jest.fn(),
      rotatePendingTokenWithTransaction: jest.fn(),
      markAsCancelled: jest.fn(),
      markAsCancelledWithTransaction: jest.fn().mockResolvedValue({ id: 77, status: 'cancelled' })
    };
    mockOutboxRepo = {
      insert: jest.fn().mockResolvedValue(undefined)
    };
    mockAvatarUrlResolver = {
      resolvePhotoUrl: jest.fn().mockResolvedValue(undefined),
      resolvePhotoUrls: jest.fn(
        async (_tenantId, users) =>
          new Map(
            users.map((user: { id: number; photoUrl: string | null }) => [
              user.id,
              user.photoUrl ?? null
            ])
          )
      )
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: InvitationRepository,
          useValue: mockInvitationRepository
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: AvatarUrlResolverService,
          useValue: mockAvatarUrlResolver
        }
      ]
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentTenant', () => {
    it('should throw when tenantId is missing', async () => {
      await expect(service.getCurrentTenant()).rejects.toMatchObject({
        code: 'API_008'
      });
    });

    it('should throw when tenantId is invalid', async () => {
      await expect(service.getCurrentTenant('not-a-number')).rejects.toThrow(
        'Invalid tenantId: not-a-number'
      );
    });

    it('should record an audit event after returning tenant settings', async () => {
      const limitOrganization = jest.fn().mockResolvedValue([
        {
          id: 1,
          tenantId: 10,
          name: 'Acme',
          displayName: 'Acme Org',
          slug: 'acme',
          createdAt: new Date('2025-01-01T00:00:00.000Z')
        }
      ]);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const limitTenant = jest.fn().mockResolvedValue([
        {
          id: 10,
          status: 'active',
          settings: { defaultRole: 'tenant_user' }
        }
      ]);
      const whereTenant = jest.fn().mockReturnValue({ limit: limitTenant });
      const fromTenant = jest.fn().mockReturnValue({ where: whereTenant });

      mockDb.select.mockReturnValueOnce({ from: fromOrganization }).mockReturnValueOnce({
        from: fromTenant
      });

      const result = (await service.getCurrentTenant(
        '1',
        '42',
        'req-123',
        'req-123',
        'req-123'
      )) as { id: number };

      expect(result.id).toBe(1);
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.settings.viewed.audit',
          payload: expect.objectContaining({
            action: 'VIEW_TENANT_SETTINGS',
            actorId: '42',
            tenantId: '1',
            requestId: 'req-123'
          }),
          correlationId: 'req-123',
          causationId: 'req-123'
        })
      );
    });
  });

  describe('updateSettings', () => {
    it('should update and return tenant settings', async () => {
      // Arrange
      const updateDto = {
        displayName: 'Updated Tenant',
        settings: {
          allowPublicRegistration: true
        }
      };

      // Act
      const result = (await service.updateSettings(updateDto)) as {
        id: number;
        displayName: string;
        updatedAt: string;
      };

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('updatedAt');
      expect(result.displayName).toBe('Updated Tenant');
    });

    it('should preserve existing settings when partially updating', async () => {
      // Arrange
      const partialUpdate = {
        displayName: 'Partial Update'
      };

      // Act
      const result = (await service.updateSettings(partialUpdate)) as {
        id: number;
        displayName: string;
      };

      // Assert
      expect(result.displayName).toBe('Partial Update');
    });
  });

  describe('getMembers', () => {
    it('should throw when tenantId is missing', async () => {
      await expect(service.getMembers({ page: 1, pageSize: 20 })).rejects.toMatchObject({
        code: 'API_008'
      });
    });

    it('should throw when tenantId is invalid', async () => {
      await expect(service.getMembers({ tenantId: 'not-a-number' })).rejects.toThrow(
        'Invalid tenantId: not-a-number'
      );
    });

    it('should return empty pagination payload when organization does not exist', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      mockDb.select.mockReturnValue({ from });

      const result = (await service.getMembers({
        tenantId: '999',
        page: 1,
        pageSize: 20
      })) as {
        data: unknown[];
        metadata: { pagination: { total: number; page: number; pageSize: number } };
      };

      expect(result.data).toEqual([]);
      expect(result.metadata.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 0
      });
    });

    it('should decrypt member emails before returning members payload', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const pendingInvitations: unknown[] = [];
      const rows = [
        {
          userId: 101,
          organizationId: 1,
          userDisplayName: 'Primary Identity User',
          userPhotoUrl: null,
          userAvatarFileId: 301,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userIsActive: true,
          userCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
          userUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
          membershipRole: 'tenant_user',
          membershipIsActive: true,
          membershipIsDefault: false,
          membershipCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
          membershipUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
          identityEmail: 'cipher:id-key:id-iv:id-tag',
          identityDisplayName: 'Identity Name'
        }
      ];

      const limit = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const orderByInvitations = jest.fn().mockResolvedValue(pendingInvitations);
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest.fn().mockResolvedValue(rows);
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('decrypted.member@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-456',
        correlationId: 'req-456',
        causationId: 'req-456',
        page: 1,
        pageSize: 20,
        sortBy: MembersSortBy.EMAIL
      })) as {
        data: Array<{ userId: string; email: string }>;
      };

      expect(mockInvitationRepository.decryptEmail).toHaveBeenCalledWith(
        'cipher:id-key:id-iv:id-tag'
      );
      expect(result.data[0]).toMatchObject({
        userId: '101',
        email: 'decrypted.member@example.com'
      });
      expect(mockAvatarUrlResolver.resolvePhotoUrls).toHaveBeenCalledWith('1', [
        {
          id: 101,
          avatarFileId: 301,
          photoUrl: null
        }
      ]);
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.members.listed.audit',
          payload: expect.objectContaining({
            action: 'LIST_TENANT_MEMBERS',
            tenantId: '1',
            requestId: 'req-456',
            details: expect.objectContaining({
              totalCount: 1,
              resultCount: 1
            })
          }),
          correlationId: 'req-456',
          causationId: 'req-456'
        })
      );
    });

    it('should include members whose home organization differs from the viewed organization', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const pendingInvitations: unknown[] = [];
      const rows = [
        {
          userId: 202,
          organizationId: 2,
          userDisplayName: 'Cross Org Member',
          userPhotoUrl: 'https://legacy.example.test/cross-org.png',
          userAvatarFileId: null,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userIsActive: true,
          userCreatedAt: new Date('2025-02-01T00:00:00.000Z'),
          userUpdatedAt: new Date('2025-02-01T00:00:00.000Z'),
          membershipRole: 'tenant_admin',
          membershipIsActive: true,
          membershipIsDefault: false,
          membershipCreatedAt: new Date('2025-02-01T00:00:00.000Z'),
          membershipUpdatedAt: new Date('2025-02-01T00:00:00.000Z'),
          identityEmail: null,
          identityDisplayName: null
        }
      ];

      const limitOrganization = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const orderByInvitations = jest.fn().mockResolvedValue(pendingInvitations);
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest.fn().mockResolvedValue(rows);
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('member@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-cross-org',
        correlationId: 'req-cross-org',
        causationId: 'req-cross-org',
        page: 1,
        pageSize: 20,
        sortBy: MembersSortBy.EMAIL
      })) as {
        data: Array<{ userId: string; tenantId: string; role: string; email: string }>;
      };

      expect(result.data).toContainEqual(
        expect.objectContaining({
          userId: '202',
          tenantId: '1',
          role: 'tenant_admin',
          email: 'member@example.com'
        })
      );
    });

    it('should normalize shaped member timestamps when joinedAt is returned as a string', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const memberCountRow = [{ count: 1 }];
      const invitationCountRow = [{ count: 0 }];
      const pendingInvitations: unknown[] = [];
      const rows = [
        {
          userId: 303,
          userDisplayName: 'Avatar Member',
          userPhotoUrl: 'https://legacy.example.test/avatar.png',
          userAvatarFileId: 501,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userUpdatedAt: new Date('2025-03-01T00:00:00.000Z'),
          membershipIsDefault: false,
          membershipUpdatedAt: new Date('2025-03-01T00:00:00.000Z'),
          identityEmail: null,
          identityDisplayName: null,
          membershipRole: 'tenant_owner',
          membershipStatus: 'active',
          membershipJoinedAt: '2025-03-01T00:00:00.000Z',
          membershipDisplayName: 'Avatar Member'
        }
      ];

      const limitOrganization = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const whereMemberCount = jest.fn().mockResolvedValue(memberCountRow);
      const leftJoinMemberCount = jest.fn().mockReturnValue({ where: whereMemberCount });
      const fromMemberCount = jest.fn().mockReturnValue({ leftJoin: leftJoinMemberCount });

      const whereInvitationCount = jest.fn().mockResolvedValue(invitationCountRow);
      const fromInvitationCount = jest.fn().mockReturnValue({ where: whereInvitationCount });

      const orderByInvitations = jest
        .fn()
        .mockReturnValue({ limit: jest.fn().mockResolvedValue(pendingInvitations) });
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(rows) });
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromMemberCount })
        .mockReturnValueOnce({ from: fromInvitationCount })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('avatar.member@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-shaped',
        correlationId: 'req-shaped',
        causationId: 'req-shaped',
        page: 1,
        pageSize: 20
      })) as {
        data: Array<{ userId: string; joinedAt: string; updatedAt: string; photoUrl?: string }>;
      };

      expect(result.data).toContainEqual(
        expect.objectContaining({
          userId: '303',
          joinedAt: '2025-03-01T00:00:00.000Z',
          updatedAt: '2025-03-01T00:00:00.000Z',
          photoUrl: 'https://legacy.example.test/avatar.png'
        })
      );
    });

    it('keeps display-name search on the page-shaped path', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const memberCountRow = [{ count: 1 }];
      const invitationCountRow = [{ count: 0 }];
      const pendingInvitations: unknown[] = [];
      const rows = [
        {
          userId: 404,
          userDisplayName: 'Casey Search',
          userPhotoUrl: null,
          userAvatarFileId: null,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userUpdatedAt: new Date('2025-04-01T00:00:00.000Z'),
          membershipIsDefault: false,
          membershipUpdatedAt: new Date('2025-04-01T00:00:00.000Z'),
          identityEmail: null,
          identityDisplayName: null,
          membershipRole: 'tenant_user',
          membershipStatus: 'active',
          membershipJoinedAt: new Date('2025-04-01T00:00:00.000Z'),
          membershipDisplayName: 'Casey Search'
        }
      ];

      const limitOrganization = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const whereMemberCount = jest.fn().mockResolvedValue(memberCountRow);
      const leftJoinMemberCount = jest.fn().mockReturnValue({ where: whereMemberCount });
      const fromMemberCount = jest.fn().mockReturnValue({ leftJoin: leftJoinMemberCount });

      const whereInvitationCount = jest.fn().mockResolvedValue(invitationCountRow);
      const fromInvitationCount = jest.fn().mockReturnValue({ where: whereInvitationCount });

      const orderByInvitations = jest
        .fn()
        .mockReturnValue({ limit: jest.fn().mockResolvedValue(pendingInvitations) });
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(rows) });
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromMemberCount })
        .mockReturnValueOnce({ from: fromInvitationCount })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('casey@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-display-search',
        correlationId: 'req-display-search',
        causationId: 'req-display-search',
        page: 1,
        pageSize: 20,
        search: 'casey'
      })) as {
        data: Array<{ userId: string; email: string; displayName?: string }>;
      };

      expect(result.data).toEqual([
        expect.objectContaining({
          userId: '404',
          email: 'casey@example.com',
          displayName: 'Casey Search'
        })
      ]);
      expect(mockDb.select).toHaveBeenCalledTimes(5);
      expect(mockInvitationRepository.decryptEmail).toHaveBeenCalledTimes(1);
    });

    it('keeps email-like search on the legacy path', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const pendingInvitations: unknown[] = [];
      const rows = [
        {
          userId: 505,
          organizationId: 1,
          userDisplayName: 'Email Search User',
          userPhotoUrl: null,
          userAvatarFileId: null,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userIsActive: true,
          userCreatedAt: new Date('2025-05-01T00:00:00.000Z'),
          userUpdatedAt: new Date('2025-05-01T00:00:00.000Z'),
          membershipRole: 'tenant_user',
          membershipIsActive: true,
          membershipIsDefault: false,
          membershipCreatedAt: new Date('2025-05-01T00:00:00.000Z'),
          membershipUpdatedAt: new Date('2025-05-01T00:00:00.000Z'),
          identityEmail: 'cipher:id-key:id-iv:id-tag',
          identityDisplayName: null
        }
      ];

      const limitOrganization = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const orderByInvitations = jest.fn().mockResolvedValue(pendingInvitations);
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest.fn().mockResolvedValue(rows);
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('member@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-email-search',
        correlationId: 'req-email-search',
        causationId: 'req-email-search',
        page: 1,
        pageSize: 20,
        search: 'member@example.com'
      })) as {
        data: Array<{ userId: string; email: string }>;
      };

      expect(result.data).toEqual([
        expect.objectContaining({
          userId: '505',
          email: 'member@example.com'
        })
      ]);
      expect(mockDb.select).toHaveBeenCalledTimes(3);
      expect(mockInvitationRepository.decryptEmail).toHaveBeenCalledTimes(1);
    });

    it('falls back to the legacy path when a common search has no page-shaped matches', async () => {
      const organization = [{ id: 1, tenantId: 10, ownerId: 99 }];
      const memberCountRow = [{ count: 0 }];
      const invitationCountRow = [{ count: 0 }];
      const pendingInvitations: unknown[] = [];
      const shapedRows: unknown[] = [];
      const legacyRows = [
        {
          userId: 606,
          organizationId: 1,
          userDisplayName: 'Fallback User',
          userPhotoUrl: null,
          userAvatarFileId: null,
          userEmail: 'cipher:user-key:user-iv:user-tag',
          userIsActive: true,
          userCreatedAt: new Date('2025-06-01T00:00:00.000Z'),
          userUpdatedAt: new Date('2025-06-01T00:00:00.000Z'),
          membershipRole: 'tenant_user',
          membershipIsActive: true,
          membershipIsDefault: false,
          membershipCreatedAt: new Date('2025-06-01T00:00:00.000Z'),
          membershipUpdatedAt: new Date('2025-06-01T00:00:00.000Z'),
          identityEmail: 'cipher:id-key:id-iv:id-tag',
          identityDisplayName: null
        }
      ];

      const limitOrganization = jest.fn().mockResolvedValue(organization);
      const whereOrganization = jest.fn().mockReturnValue({ limit: limitOrganization });
      const fromOrganization = jest.fn().mockReturnValue({ where: whereOrganization });

      const whereMemberCount = jest.fn().mockResolvedValue(memberCountRow);
      const leftJoinMemberCount = jest.fn().mockReturnValue({ where: whereMemberCount });
      const fromMemberCount = jest.fn().mockReturnValue({ leftJoin: leftJoinMemberCount });

      const whereInvitationCount = jest.fn().mockResolvedValue(invitationCountRow);
      const fromInvitationCount = jest.fn().mockReturnValue({ where: whereInvitationCount });

      const orderByInvitations = jest
        .fn()
        .mockReturnValue({ limit: jest.fn().mockResolvedValue(pendingInvitations) });
      const whereInvitations = jest.fn().mockReturnValue({ orderBy: orderByInvitations });
      const fromInvitations = jest.fn().mockReturnValue({ where: whereInvitations });

      const orderByRows = jest
        .fn()
        .mockReturnValue({ limit: jest.fn().mockResolvedValue(shapedRows) });
      const whereRows = jest.fn().mockReturnValue({ orderBy: orderByRows });
      const leftJoinSecond = jest.fn().mockReturnValue({ where: whereRows });
      const leftJoinFirst = jest.fn().mockReturnValue({ leftJoin: leftJoinSecond });
      const fromRows = jest.fn().mockReturnValue({ leftJoin: leftJoinFirst });

      const legacyOrderByInvitations = jest.fn().mockResolvedValue(pendingInvitations);
      const legacyWhereInvitations = jest
        .fn()
        .mockReturnValue({ orderBy: legacyOrderByInvitations });
      const legacyFromInvitations = jest.fn().mockReturnValue({ where: legacyWhereInvitations });

      const legacyOrderByRows = jest.fn().mockResolvedValue(legacyRows);
      const legacyWhereRows = jest.fn().mockReturnValue({ orderBy: legacyOrderByRows });
      const legacyLeftJoinSecond = jest.fn().mockReturnValue({ where: legacyWhereRows });
      const legacyLeftJoinFirst = jest.fn().mockReturnValue({ leftJoin: legacyLeftJoinSecond });
      const legacyFromRows = jest.fn().mockReturnValue({ leftJoin: legacyLeftJoinFirst });

      mockDb.select
        .mockReturnValueOnce({ from: fromOrganization })
        .mockReturnValueOnce({ from: fromMemberCount })
        .mockReturnValueOnce({ from: fromInvitationCount })
        .mockReturnValueOnce({ from: fromInvitations })
        .mockReturnValueOnce({ from: fromRows })
        .mockReturnValueOnce({ from: legacyFromInvitations })
        .mockReturnValueOnce({ from: legacyFromRows });

      mockInvitationRepository.decryptEmail.mockResolvedValueOnce('member@example.com');

      const result = (await service.getMembers({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-search-fallback',
        correlationId: 'req-search-fallback',
        causationId: 'req-search-fallback',
        page: 1,
        pageSize: 20,
        search: 'member'
      })) as {
        data: Array<{ userId: string; email: string }>;
      };

      expect(result.data).toEqual([
        expect.objectContaining({
          userId: '606',
          email: 'member@example.com'
        })
      ]);
      expect(mockDb.select).toHaveBeenCalledTimes(7);
      expect(mockInvitationRepository.decryptEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('inviteMember', () => {
    it('should reject direct service usage and require the command handler path', async () => {
      const inviteDto = {
        email: 'newuser@example.com'
      };

      await expect(service.inviteMember(inviteDto)).rejects.toThrow(
        'InviteMemberCommand must be used for tenant invitation workflows'
      );
    });
  });

  describe('invitation actions', () => {
    it('should generate invitation link token for pending invitation', async () => {
      mockInvitationRepository.rotatePendingTokenWithTransaction.mockResolvedValue('raw-token-123');

      const result = await service.generateInvitationLink({
        tenantId: '1',
        actorId: '42',
        requestId: 'req-789',
        correlationId: 'req-789',
        causationId: 'req-789',
        invitationId: '77'
      });

      expect(result).toEqual({
        invitationId: '77',
        invitationToken: 'raw-token-123'
      });
      expect(mockInvitationRepository.rotatePendingTokenWithTransaction).toHaveBeenCalled();
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.invitation.link.generated.audit',
          payload: expect.objectContaining({
            action: 'GENERATE_INVITATION_LINK',
            actorId: '42',
            tenantId: '1',
            requestId: 'req-789',
            details: expect.objectContaining({
              invitationId: '77'
            })
          }),
          correlationId: 'req-789',
          causationId: 'req-789'
        })
      );
    });

    it('should revoke pending invitation', async () => {
      await expect(
        service.revokeInvitation({
          tenantId: '1',
          actorId: '42',
          requestId: 'req-321',
          correlationId: 'req-321',
          causationId: 'req-321',
          invitationId: '77'
        })
      ).resolves.toBeUndefined();

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockInvitationRepository.markAsCancelledWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        1,
        77
      );
      expect(mockOutboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.invitation.revoked.audit',
          payload: expect.objectContaining({
            action: 'REVOKE_INVITATION',
            actorId: '42',
            tenantId: '1',
            requestId: 'req-321',
            details: expect.objectContaining({
              invitationId: '77'
            })
          }),
          correlationId: 'req-321',
          causationId: 'req-321'
        })
      );
    });

    it('should throw VAL_002 for invalid invitation action identifiers', async () => {
      await expect(
        service.generateInvitationLink({
          tenantId: 'nope',
          invitationId: '77'
        })
      ).rejects.toMatchObject({ code: 'VAL_002' });

      await expect(
        service.revokeInvitation({
          tenantId: '1',
          invitationId: 'bad-id'
        })
      ).rejects.toMatchObject({ code: 'VAL_002' });
    });
  });
});

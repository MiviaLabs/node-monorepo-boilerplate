import { Test } from '@nestjs/testing';

import { GetAdminAccessOverviewQuery } from '../../../queries';
import { GetAdminAccessOverviewHandler } from '../get-admin-access-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminAccessOverviewHandler', () => {
  let handler: GetAdminAccessOverviewHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              total_count: 1,
              active_count: 1,
              privileged_count: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 7,
              user_display_name: 'Ariana Moore',
              user_is_active: true,
              user_deleted_at: null,
              organization_id: 10,
              organization_name: 'Acme Operations',
              organization_display_name: 'Acme Ops',
              organization_slug: 'acme-ops',
              organization_is_active: true,
              organization_deleted_at: null,
              tenant_id: 20,
              tenant_type: 'organization',
              tenant_status: 'active',
              membership_role: 'tenant_admin',
              membership_is_default: true,
              membership_created_at: new Date('2026-03-10T10:00:00.000Z'),
              membership_updated_at: new Date('2026-03-12T10:00:00.000Z'),
              membership_status: 'active',
              is_privileged: true,
              total_count: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              active_count: 1,
              inactive_count: 0,
              total_count: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              invitation_id: 50,
              organization_id: 10,
              organization_name: 'Acme Operations',
              organization_display_name: 'Acme Ops',
              organization_slug: 'acme-ops',
              tenant_id: 20,
              tenant_type: 'organization',
              invitation_role: 'tenant_user',
              invitation_status: 'pending',
              invited_by_user_id: 7,
              invited_by_display_name: 'Ariana Moore',
              invitation_created_at: new Date('2026-03-13T09:00:00.000Z'),
              invitation_expires_at: new Date('2026-03-20T09:00:00.000Z'),
              is_privileged: false,
              total_count: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 7,
              system_role: 'system_admin'
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminAccessOverviewHandler,
        {
          provide: MAIN_DB,
          useValue: db
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        }
      ]
    }).compile();

    handler = module.get<GetAdminAccessOverviewHandler>(GetAdminAccessOverviewHandler);
  });

  it('maps memberships, active system roles, invitations, and summary metrics into the admin contract', async () => {
    const result = await handler.execute(
      new GetAdminAccessOverviewQuery({
        actorId: 'actor-access-1',
        tenantId: 0,
        requestId: 'req-access-1',
        correlationId: 'corr-access-1',
        causationId: 'cause-access-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(5);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.access.viewed.audit',
        correlationId: 'corr-access-1',
        causationId: 'cause-access-1',
        payload: expect.objectContaining({
          requestId: 'req-access-1',
          actorId: 'actor-access-1',
          details: expect.objectContaining({
            membershipResultCount: 1,
            invitationResultCount: 1,
            memberSearchApplied: false
          })
        })
      })
    );
    const auditPayload = JSON.stringify(auditOutbox.insert.mock.calls[0]?.[1]?.payload);
    expect(auditPayload).not.toContain('Ariana Moore');
    expect(auditPayload).not.toContain('Acme Operations');
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'members_total',
          value: 1,
          summary: '1 active memberships'
        }),
        expect.objectContaining({
          key: 'privileged_members_total',
          value: 1,
          summary: 'Requires review'
        }),
        expect.objectContaining({
          key: 'active_invitations_total',
          value: 1
        }),
        expect.objectContaining({
          key: 'expired_or_cancelled_invitations_total',
          value: 0
        })
      ])
    );
    expect(result.membershipsPagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    });
    expect(result.memberships).toEqual([
      {
        userId: 7,
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationDisplayName: 'Acme Ops',
        organizationSlug: 'acme-ops',
        tenantId: 20,
        tenantType: 'organization',
        tenantStatus: 'active',
        displayName: 'Ariana Moore',
        membershipRole: 'tenant_admin',
        status: 'active',
        userLifecycle: 'active',
        userActive: true,
        userDeletedAt: undefined,
        organizationActive: true,
        organizationDeletedAt: undefined,
        systemRoles: ['system_admin'],
        isPrivileged: true,
        isDefault: true,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z'
      }
    ]);
    expect(result.invitations).toEqual([
      {
        invitationId: 50,
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationDisplayName: 'Acme Ops',
        organizationSlug: 'acme-ops',
        tenantId: 20,
        tenantType: 'organization',
        role: 'tenant_user',
        status: 'pending',
        invitedByUserId: 7,
        invitedByDisplayName: 'Ariana Moore',
        isPrivileged: false,
        createdAt: '2026-03-13T09:00:00.000Z',
        expiresAt: '2026-03-20T09:00:00.000Z'
      }
    ]);
    expect(result.invitationsPagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    });
  });

  it('derives suspended, inactive, and expired posture without exposing decrypted contact fields', async () => {
    db.execute.mockReset();
    db.execute
      .mockResolvedValueOnce({
        rows: [
          {
            total_count: 2,
            active_count: 0,
            privileged_count: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 8,
            user_display_name: null,
            user_is_active: false,
            user_deleted_at: '2026-03-12T10:00:00.000Z',
            organization_id: 11,
            organization_name: 'Dormant Org',
            organization_display_name: null,
            organization_slug: 'dormant-org',
            organization_is_active: true,
            organization_deleted_at: null,
            tenant_id: 21,
            tenant_type: 'organization',
            tenant_status: 'active',
            membership_role: 'tenant_user',
            membership_is_default: false,
            membership_created_at: '2026-03-10T10:00:00.000Z',
            membership_updated_at: '2026-03-11T10:00:00.000Z',
            membership_status: 'inactive',
            is_privileged: false,
            total_count: 2
          },
          {
            user_id: 9,
            user_display_name: 'Suspended Owner',
            user_is_active: true,
            user_deleted_at: null,
            organization_id: 12,
            organization_name: 'Suspended Org',
            organization_display_name: 'Suspended Org',
            organization_slug: 'suspended-org',
            organization_is_active: false,
            organization_deleted_at: '2026-03-11T10:00:00.000Z',
            tenant_id: 22,
            tenant_type: 'organization',
            tenant_status: 'suspended',
            membership_role: 'tenant_owner',
            membership_is_default: false,
            membership_created_at: '2026-03-10T10:00:00.000Z',
            membership_updated_at: '2026-03-11T10:00:00.000Z',
            membership_status: 'suspended',
            is_privileged: true,
            total_count: 2
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            active_count: 0,
            inactive_count: 1,
            total_count: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            invitation_id: 51,
            organization_id: 11,
            organization_name: 'Dormant Org',
            organization_display_name: null,
            organization_slug: 'dormant-org',
            tenant_id: 21,
            tenant_type: 'organization',
            invitation_role: 'tenant_admin',
            invitation_status: 'pending',
            invited_by_user_id: null,
            invited_by_display_name: null,
            invitation_created_at: '2026-03-01T10:00:00.000Z',
            invitation_expires_at: '2026-03-02T10:00:00.000Z',
            is_privileged: true,
            total_count: 1
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const result = await handler.execute();

    expect(result.memberships.map((membership) => membership.status)).toEqual([
      'inactive',
      'suspended'
    ]);
    expect(result.memberships[0]).toEqual(
      expect.objectContaining({
        displayName: undefined,
        userLifecycle: 'deleted',
        userDeletedAt: '2026-03-12T10:00:00.000Z',
        systemRoles: [],
        isPrivileged: false
      })
    );
    expect(result.memberships[1]).toEqual(
      expect.objectContaining({
        organizationActive: false,
        organizationDeletedAt: '2026-03-11T10:00:00.000Z'
      })
    );
    expect(result.invitations[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        invitedByUserId: undefined,
        invitedByDisplayName: undefined,
        isPrivileged: true
      })
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'expired_or_cancelled_invitations_total', value: 1 }),
        expect.objectContaining({ key: 'active_invitations_total', value: 0 })
      ])
    );
    expect(result.membershipsPagination.total).toBe(2);
    expect(result.invitationsPagination.total).toBe(1);
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('accepts numeric-like membership and invitation searches while preserving the paged contract', async () => {
    const executeSpy = jest.spyOn(db, 'execute');

    const result = await handler.execute(
      new GetAdminAccessOverviewQuery({
        memberSearch: '7',
        invitationSearch: '50'
      })
    );

    expect(executeSpy).toHaveBeenCalledTimes(5);
    expect(result.membershipsPagination.total).toBe(1);
    expect(result.invitationsPagination.total).toBe(1);
    expect(result.memberships[0]?.userId).toBe(7);
    expect(result.invitations[0]?.invitationId).toBe(50);
  });

  it('captures tenant drilldown filters in the query object defaults', () => {
    const query = new GetAdminAccessOverviewQuery({
      memberRecordState: 'deleted',
      memberOrganizationId: 10,
      memberTenantId: 20
    });

    expect(query.memberRecordState).toBe('deleted');
    expect(query.memberOrganizationId).toBe(10);
    expect(query.memberTenantId).toBe(20);
    expect(query.memberPage).toBe(1);
    expect(query.memberPageSize).toBe(20);
  });
});

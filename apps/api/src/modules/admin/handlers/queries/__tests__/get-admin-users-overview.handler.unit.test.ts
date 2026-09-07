import { Test } from '@nestjs/testing';

import { GetAdminUsersOverviewQuery } from '../../../queries';
import { GetAdminUsersOverviewHandler } from '../get-admin-users-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminUsersOverviewHandler', () => {
  let handler: GetAdminUsersOverviewHandler;
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
              privileged_count: 1,
              without_identity_count: 0
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 7,
              organization_id: 10,
              user_display_name: 'Ariana Moore',
              user_photo_url: 'https://cdn.example.com/avatar.png',
              user_is_active: true,
              user_is_verified: true,
              user_deleted_at: null,
              user_created_at: new Date('2026-03-10T10:00:00.000Z'),
              user_updated_at: new Date('2026-03-13T10:00:00.000Z'),
              user_last_sign_in_at: new Date('2026-03-14T09:00:00.000Z'),
              organization_name: 'Acme Operations',
              organization_display_name: 'Acme Ops',
              organization_slug: 'acme-ops',
              primary_identity_provider: 'google.com',
              has_primary_identity: true,
              membership_count: 3,
              active_membership_count: 2,
              privileged_membership_count: 1,
              default_tenant_id: 20,
              default_tenant_status: 'active',
              is_privileged: true
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
        GetAdminUsersOverviewHandler,
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

    handler = module.get<GetAdminUsersOverviewHandler>(GetAdminUsersOverviewHandler);
  });

  it('maps global users inventory rows, metrics, pagination, and audit details', async () => {
    const result = await handler.execute(
      new GetAdminUsersOverviewQuery({
        actorId: 'actor-users-1',
        tenantId: 0,
        requestId: 'req-users-1',
        correlationId: 'corr-users-1',
        causationId: 'cause-users-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.users.viewed.audit',
        correlationId: 'corr-users-1',
        causationId: 'cause-users-1',
        payload: expect.objectContaining({
          requestId: 'req-users-1',
          actorId: 'actor-users-1',
          details: expect.objectContaining({
            resultCount: 1,
            searchApplied: false
          })
        })
      })
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'users_total', value: 1 }),
        expect.objectContaining({ key: 'privileged_users_total', value: 1 }),
        expect.objectContaining({ key: 'users_without_identity_total', value: 0 })
      ])
    );
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    });
    expect(result.users).toEqual([
      {
        userId: 7,
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationDisplayName: 'Acme Ops',
        organizationSlug: 'acme-ops',
        displayName: 'Ariana Moore',
        photoUrl: 'https://cdn.example.com/avatar.png',
        primaryIdentityProvider: 'google.com',
        hasPrimaryIdentity: true,
        defaultTenantId: 20,
        defaultTenantStatus: 'active',
        userLifecycle: 'active',
        userActive: true,
        userVerified: true,
        userDeletedAt: undefined,
        systemRoles: ['system_admin'],
        isPrivileged: true,
        membershipCount: 3,
        activeMembershipCount: 2,
        privilegedMembershipCount: 1,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z',
        lastSignInAt: '2026-03-14T09:00:00.000Z'
      }
    ]);
  });
});

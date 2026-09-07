import { Test } from '@nestjs/testing';

import { GetAdminUserDetailQuery } from '../../../queries';
import { GetAdminUserDetailHandler } from '../get-admin-user-detail.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminUserDetailHandler', () => {
  let handler: GetAdminUserDetailHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
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
              organization_is_active: true,
              organization_deleted_at: null,
              identity_provider: 'google.com',
              identity_display_name: 'Ariana Moore',
              identity_email_verified: true,
              identity_phone_verified: false
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              system_role: 'system_admin'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              organization_id: 10,
              organization_name: 'Acme Operations',
              organization_display_name: 'Acme Ops',
              organization_slug: 'acme-ops',
              tenant_id: 20,
              tenant_type: 'organization',
              tenant_status: 'active',
              membership_role: 'tenant_admin',
              membership_is_default: true,
              membership_created_at: new Date('2026-03-10T10:00:00.000Z'),
              membership_updated_at: new Date('2026-03-13T10:00:00.000Z'),
              membership_status: 'active',
              is_privileged: true
            },
            {
              organization_id: 11,
              organization_name: 'Beta Logistics',
              organization_display_name: null,
              organization_slug: 'beta-logistics',
              tenant_id: 21,
              tenant_type: 'organization',
              tenant_status: 'suspended',
              membership_role: 'tenant_viewer',
              membership_is_default: false,
              membership_created_at: new Date('2026-03-11T10:00:00.000Z'),
              membership_updated_at: new Date('2026-03-13T10:00:00.000Z'),
              membership_status: 'suspended',
              is_privileged: false
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ provider: 'google.com' }, { provider: 'password' }]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminUserDetailHandler,
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

    handler = module.get<GetAdminUserDetailHandler>(GetAdminUserDetailHandler);
  });

  it('maps global user detail, identities, memberships, and audit details', async () => {
    const result = await handler.execute(
      new GetAdminUserDetailQuery({
        userId: 7,
        actorId: 'actor-user-detail-1',
        tenantId: 0,
        requestId: 'req-user-detail-1',
        correlationId: 'corr-user-detail-1',
        causationId: 'cause-user-detail-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(4);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.user.detail.viewed.audit',
        correlationId: 'corr-user-detail-1',
        causationId: 'cause-user-detail-1'
      })
    );
    expect(result.userId).toBe(7);
    expect(result.identity).toEqual({
      provider: 'google.com',
      providerDisplayName: 'Ariana Moore',
      emailVerified: true,
      phoneVerified: false,
      hasPrimaryIdentity: true,
      providersInUse: ['google.com', 'password'],
      totalIdentities: 2
    });
    expect(result.membershipStats).toEqual({
      totalMemberships: 2,
      activeMemberships: 1,
      suspendedMemberships: 1,
      privilegedMemberships: 1
    });
    expect(result.memberships).toEqual([
      {
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationDisplayName: 'Acme Ops',
        organizationSlug: 'acme-ops',
        tenantId: 20,
        tenantType: 'organization',
        tenantStatus: 'active',
        membershipRole: 'tenant_admin',
        status: 'active',
        isPrivileged: true,
        isDefault: true,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z'
      },
      {
        organizationId: 11,
        organizationName: 'Beta Logistics',
        organizationDisplayName: undefined,
        organizationSlug: 'beta-logistics',
        tenantId: 21,
        tenantType: 'organization',
        tenantStatus: 'suspended',
        membershipRole: 'tenant_viewer',
        status: 'suspended',
        isPrivileged: false,
        isDefault: false,
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z'
      }
    ]);
  });
});

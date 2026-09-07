import { Test } from '@nestjs/testing';

import { GetAdminTenantsOverviewQuery } from '../../../queries';
import { GetAdminTenantsOverviewHandler } from '../get-admin-tenants-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminTenantsOverviewHandler', () => {
  let handler: GetAdminTenantsOverviewHandler;
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
              provisioning_gaps_count: 0,
              invite_backlog_count: 0,
              members_tracked_total: 12,
              tenant_admins_total: 2
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              organization_id: 10,
              public_id: '71bc9484-13df-4d91-b36f-f2c2b4e55e73',
              tenant_id: 20,
              name: 'Acme Platform',
              display_name: 'Acme',
              slug: 'acme',
              organization_active: true,
              organization_deleted_at: null,
              owner_user_id: 30,
              gcp_tenant_id: 'gcp-acme',
              created_at: new Date('2026-03-10T10:00:00.000Z'),
              updated_at: new Date('2026-03-12T11:00:00.000Z'),
              tenant_type: 'organization',
              tenant_status: 'active',
              tenant_settings: {
                features: {
                  sso: true,
                  apiAccess: true,
                  maxUsers: 75
                },
                branding: {
                  customDomain: 'app.acme.test',
                  customEmail: true
                },
                limits: {
                  apiRateLimit: 1200
                }
              },
              owner_display_name: 'Ariana Moore',
              owner_active: true,
              member_count: 12,
              admin_count: 2,
              pending_invitation_count: 0,
              onboarding_state: 'ready',
              total_count: 1
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminTenantsOverviewHandler,
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

    handler = module.get<GetAdminTenantsOverviewHandler>(GetAdminTenantsOverviewHandler);
  });

  it('maps the aggregate tenant inventory row into the admin contract', async () => {
    const result = await handler.execute(
      new GetAdminTenantsOverviewQuery({
        actorId: 'actor-tenants-1',
        tenantId: 0,
        requestId: 'req-tenants-1',
        correlationId: 'corr-tenants-1',
        causationId: 'cause-tenants-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.tenants.viewed.audit',
        correlationId: 'corr-tenants-1',
        causationId: 'cause-tenants-1',
        payload: expect.objectContaining({
          requestId: 'req-tenants-1',
          actorId: 'actor-tenants-1',
          details: expect.objectContaining({
            resultCount: 1,
            searchApplied: false
          })
        })
      })
    );
    const auditPayload = JSON.stringify(auditOutbox.insert.mock.calls[0]?.[1]?.payload);
    expect(auditPayload).not.toContain('Acme Platform');
    expect(auditPayload).not.toContain('app.acme.test');
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tenants_total', value: 1 }),
        expect.objectContaining({ key: 'members_tracked_total', value: 12 })
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
    expect(result.items).toEqual([
      {
        organizationId: 10,
        tenantId: 20,
        publicId: '71bc9484-13df-4d91-b36f-f2c2b4e55e73',
        name: 'Acme Platform',
        displayName: 'Acme',
        slug: 'acme',
        status: 'active',
        tenantType: 'organization',
        organizationActive: true,
        isDeleted: false,
        deletedAt: undefined,
        ownerUserId: 30,
        ownerDisplayName: 'Ariana Moore',
        ownerActive: true,
        hasOwner: true,
        memberCount: 12,
        adminCount: 2,
        pendingInvitationCount: 0,
        gcpTenantId: 'gcp-acme',
        hasProvisionedAuthTenant: true,
        onboardingState: 'ready',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-12T11:00:00.000Z',
        diagnostics: {
          ssoEnabled: true,
          apiAccessEnabled: true,
          hasCustomDomain: true,
          hasCustomEmail: true,
          maxUsers: 75,
          apiRateLimit: 1200
        }
      }
    ]);
  });

  it('derives setup, provisioning, invited, attention, and archived states from current row posture', async () => {
    db.execute.mockReset();
    db.execute.mockResolvedValueOnce({
      rows: [
        {
          total_count: 5,
          active_count: 1,
          provisioning_gaps_count: 2,
          invite_backlog_count: 1,
          members_tracked_total: 8,
          tenant_admins_total: 4
        }
      ]
    });
    db.execute.mockResolvedValueOnce({
      rows: [
        {
          organization_id: 11,
          public_id: 'public-setup',
          tenant_id: 21,
          name: 'Setup Tenant',
          display_name: null,
          slug: 'setup-tenant',
          organization_active: true,
          organization_deleted_at: null,
          owner_user_id: null,
          gcp_tenant_id: null,
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          tenant_type: 'organization',
          tenant_status: 'draft',
          tenant_settings: null,
          owner_display_name: null,
          owner_active: null,
          member_count: 0,
          admin_count: 0,
          pending_invitation_count: 0,
          onboarding_state: 'setup',
          total_count: 5
        },
        {
          organization_id: 12,
          public_id: 'public-provisioning',
          tenant_id: 22,
          name: 'Provisioning Tenant',
          display_name: 'Provisioning Tenant',
          slug: 'provisioning-tenant',
          organization_active: true,
          organization_deleted_at: null,
          owner_user_id: 32,
          gcp_tenant_id: null,
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          tenant_type: 'organization',
          tenant_status: 'trial',
          tenant_settings: { features: { apiAccess: false } },
          owner_display_name: 'Owner Two',
          owner_active: true,
          member_count: 1,
          admin_count: 1,
          pending_invitation_count: 0,
          onboarding_state: 'provisioning',
          total_count: 5
        },
        {
          organization_id: 13,
          public_id: 'public-invited',
          tenant_id: 23,
          name: 'Invited Tenant',
          display_name: 'Invited Tenant',
          slug: 'invited-tenant',
          organization_active: true,
          organization_deleted_at: null,
          owner_user_id: 33,
          gcp_tenant_id: 'gcp-invited',
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          tenant_type: 'organization',
          tenant_status: 'trial',
          tenant_settings: { features: { sso: false } },
          owner_display_name: 'Owner Three',
          owner_active: true,
          member_count: 1,
          admin_count: 1,
          pending_invitation_count: 2,
          onboarding_state: 'invited',
          total_count: 5
        },
        {
          organization_id: 14,
          public_id: 'public-attention',
          tenant_id: 24,
          name: 'Attention Tenant',
          display_name: 'Attention Tenant',
          slug: 'attention-tenant',
          organization_active: false,
          organization_deleted_at: null,
          owner_user_id: 34,
          gcp_tenant_id: 'gcp-attention',
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          tenant_type: 'organization',
          tenant_status: 'active',
          tenant_settings: {},
          owner_display_name: 'Owner Four',
          owner_active: false,
          member_count: 3,
          admin_count: 1,
          pending_invitation_count: 0,
          onboarding_state: 'attention',
          total_count: 5
        },
        {
          organization_id: 15,
          public_id: 'public-archived',
          tenant_id: 25,
          name: 'Archived Tenant',
          display_name: 'Archived Tenant',
          slug: 'archived-tenant',
          organization_active: false,
          organization_deleted_at: '2026-03-10T12:00:00.000Z',
          owner_user_id: 35,
          gcp_tenant_id: 'gcp-archived',
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
          tenant_type: 'organization',
          tenant_status: 'deleted',
          tenant_settings: {},
          owner_display_name: 'Owner Five',
          owner_active: false,
          member_count: 3,
          admin_count: 1,
          pending_invitation_count: 0,
          onboarding_state: 'archived',
          total_count: 5
        }
      ]
    });

    const result = await handler.execute();

    expect(result.items.map((item) => item.onboardingState)).toEqual([
      'setup',
      'provisioning',
      'invited',
      'attention',
      'archived'
    ]);
    expect(result.items.map((item) => item.isDeleted)).toEqual([false, false, false, false, true]);
    expect(result.items[4]?.deletedAt).toBe('2026-03-10T12:00:00.000Z');
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        displayName: undefined,
        ownerUserId: undefined,
        ownerDisplayName: undefined,
        ownerActive: undefined,
        hasOwner: false,
        hasProvisionedAuthTenant: false,
        diagnostics: {
          ssoEnabled: false,
          apiAccessEnabled: false,
          hasCustomDomain: false,
          hasCustomEmail: false,
          maxUsers: undefined,
          apiRateLimit: undefined
        }
      })
    );
  });

  it('captures tenant record-state filters in the query object defaults', () => {
    const query = new GetAdminTenantsOverviewQuery({
      recordState: 'deleted',
      status: 'deleted'
    });

    expect(query.recordState).toBe('deleted');
    expect(query.status).toBe('deleted');
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
  });

  it('defaults tenant recordState to deleted when status is deleted', () => {
    const query = new GetAdminTenantsOverviewQuery({
      status: 'deleted'
    });

    expect(query.recordState).toBe('deleted');
    expect(query.status).toBe('deleted');
  });
});

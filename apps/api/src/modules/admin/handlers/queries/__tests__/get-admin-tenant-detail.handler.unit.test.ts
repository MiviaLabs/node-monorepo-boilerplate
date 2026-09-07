import { Test } from '@nestjs/testing';

import { GetAdminTenantDetailQuery } from '../../../queries';
import { GetAdminTenantDetailHandler } from '../get-admin-tenant-detail.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminTenantDetailHandler', () => {
  let handler: GetAdminTenantDetailHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              organization_id: 10,
              public_id: '71bc9484-13df-4d91-b36f-f2c2b4e55e73',
              tenant_id: 20,
              tenant_public_id: '9d0a6298-5f30-44d4-8ec2-8123f38cb534',
              name: 'Acme Platform',
              display_name: 'Acme',
              slug: 'acme',
              organization_active: true,
              organization_deleted_at: null,
              owner_user_id: 30,
              gcp_tenant_id: 'gcp-acme',
              organization_created_at: new Date('2026-03-10T10:00:00.000Z'),
              organization_updated_at: new Date('2026-03-12T11:00:00.000Z'),
              tenant_type: 'organization',
              tenant_status: 'active',
              tenant_settings: {
                features: {
                  sso: true,
                  apiAccess: true,
                  maxUsers: 75,
                  maxProjects: 12
                },
                branding: {
                  customDomain: 'app.acme.test',
                  customEmail: true,
                  primaryColor: '#0f172a'
                },
                limits: {
                  apiRateLimit: 1200,
                  monthlyBudget: 500000
                },
                metadata: {
                  contractTier: 'enterprise'
                }
              },
              owner_display_name: 'Ariana Moore',
              member_count: 12,
              active_member_count: 10,
              inactive_member_count: 2,
              membership_owner_count: 2,
              admin_count: 3,
              elevated_access_count: 3,
              pending_invitation_count: 1,
              accepted_invitation_count: 4,
              expired_invitation_count: 2,
              cancelled_invitation_count: 1,
              onboarding_state: 'invited'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 30,
              display_name: 'Ariana Moore',
              user_active: true,
              user_deleted_at: null,
              membership_role: 'tenant_owner',
              membership_is_default: true,
              membership_created_at: new Date('2026-03-10T10:00:00.000Z'),
              membership_updated_at: new Date('2026-03-12T11:00:00.000Z'),
              identity_provider: 'google.com',
              identity_email_verified: true
            },
            {
              user_id: 31,
              display_name: 'Bruno Diaz',
              user_active: false,
              user_deleted_at: null,
              membership_role: 'tenant_owner',
              membership_is_default: false,
              membership_created_at: new Date('2026-03-11T10:00:00.000Z'),
              membership_updated_at: new Date('2026-03-12T12:00:00.000Z'),
              identity_provider: 'email_password',
              identity_email_verified: false
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { provider: 'email_password', provider_count: 7 },
            { provider: 'google.com', provider_count: 3 }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminTenantDetailHandler,
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

    handler = module.get<GetAdminTenantDetailHandler>(GetAdminTenantDetailHandler);
  });

  it('maps the organization detail row into the admin detail contract', async () => {
    const result = await handler.execute(
      new GetAdminTenantDetailQuery({
        organizationId: 10,
        tenantId: 0,
        actorId: 'actor-tenants-1',
        requestId: 'req-tenant-detail-1',
        correlationId: 'corr-tenant-detail-1',
        causationId: 'cause-tenant-detail-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.tenant.detail.viewed.audit',
        correlationId: 'corr-tenant-detail-1',
        causationId: 'cause-tenant-detail-1',
        payload: expect.objectContaining({
          requestId: 'req-tenant-detail-1',
          actorId: 'actor-tenants-1',
          details: expect.objectContaining({
            organizationId: 10,
            memberCount: 12
          })
        })
      })
    );
    const auditPayload = JSON.stringify(auditOutbox.insert.mock.calls[0]?.[1]?.payload);
    expect(auditPayload).not.toContain('Acme Platform');
    expect(auditPayload).not.toContain('app.acme.test');
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(result.organizationId).toBe(10);
    expect(result.tenantId).toBe(20);
    expect(result.tenantPublicId).toBe('9d0a6298-5f30-44d4-8ec2-8123f38cb534');
    expect(result.onboardingState).toBe('invited');
    expect(result.membership).toEqual({
      totalMembers: 12,
      activeMembers: 10,
      inactiveMembers: 2,
      ownerCount: 2,
      adminCount: 3,
      elevatedAccessCount: 3
    });
    expect(result.invitationStatusCounts).toEqual([
      { status: 'pending', count: 1 },
      { status: 'accepted', count: 4 },
      { status: 'expired', count: 2 },
      { status: 'cancelled', count: 1 }
    ]);
    expect(result.auth).toEqual({
      authProvider: 'Google Identity Platform',
      hasProvisionedAuthTenant: true,
      gcpTenantId: 'gcp-acme',
      ssoEnabled: true,
      apiAccessEnabled: true,
      providersInUse: [
        { provider: 'email_password', count: 7 },
        { provider: 'google.com', count: 3 }
      ]
    });
    expect(result.owners).toEqual([
      {
        userId: 30,
        displayName: 'Ariana Moore',
        membershipRole: 'tenant_owner',
        isActive: true,
        isDeleted: false,
        isDefault: true,
        isDesignatedOwner: true,
        primaryIdentityProvider: 'google.com',
        emailVerified: true,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-12T11:00:00.000Z'
      },
      {
        userId: 31,
        displayName: 'Bruno Diaz',
        membershipRole: 'tenant_owner',
        isActive: false,
        isDeleted: false,
        isDefault: false,
        isDesignatedOwner: false,
        primaryIdentityProvider: 'email_password',
        emailVerified: false,
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-12T12:00:00.000Z'
      }
    ]);
    expect(result.settings).toEqual({
      features: {
        sso: true,
        apiAccess: true,
        maxUsers: 75,
        maxProjects: 12
      },
      branding: {
        customDomain: 'app.acme.test',
        customEmail: true,
        primaryColor: '#0f172a'
      },
      limits: {
        apiRateLimit: 1200,
        monthlyBudget: 500000
      },
      metadata: {
        contractTier: 'enterprise'
      }
    });
  });
});

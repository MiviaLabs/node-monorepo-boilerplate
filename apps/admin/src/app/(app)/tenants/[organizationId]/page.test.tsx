import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import TenantDetailPage from './page';
import AuthenticatedLayout from '../../layout';

import { ApiClientError } from '~/lib/api-client';
import { getAdminTenantDetail } from '~/lib/admin';

vi.mock('~/lib/admin', () => ({
  getAdminTenantDetail: vi.fn(async () => ({
    generatedAt: '2026-03-15T12:00:00.000Z',
    organizationId: 10,
    tenantId: 20,
    publicId: 'org_pub_123',
    tenantPublicId: 'tenant_pub_123',
    name: 'Acme Operations',
    displayName: 'Acme Operations',
    slug: 'acme-ops',
    tenantType: 'organization',
    status: 'active',
    onboardingState: 'ready',
    organizationActive: true,
    isDeleted: false,
    ownerUserId: 55,
    ownerDisplayName: 'Ariana Moore',
    hasOwner: true,
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    diagnostics: {
      ssoEnabled: true,
      apiAccessEnabled: true,
      hasCustomDomain: true,
      hasCustomEmail: false,
      maxUsers: 50,
      apiRateLimit: 1200
    },
    membership: {
      totalMembers: 12,
      activeMembers: 10,
      inactiveMembers: 2,
      ownerCount: 2,
      adminCount: 3,
      elevatedAccessCount: 4
    },
    invitationStatusCounts: [
      { status: 'pending', count: 2 },
      { status: 'accepted', count: 3 },
      { status: 'expired', count: 1 },
      { status: 'cancelled', count: 0 }
    ],
    owners: [
      {
        userId: 55,
        displayName: 'Ariana Moore',
        membershipRole: 'tenant_owner',
        isActive: true,
        isDeleted: false,
        isDefault: true,
        isDesignatedOwner: true,
        primaryIdentityProvider: 'google.com',
        emailVerified: true,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z'
      }
    ],
    auth: {
      authProvider: 'Google Identity Platform',
      hasProvisionedAuthTenant: true,
      gcpTenantId: 'gcp-acme',
      ssoEnabled: true,
      apiAccessEnabled: true,
      providersInUse: [
        { provider: 'google.com', count: 8 },
        { provider: 'email_password', count: 4 }
      ]
    },
    settings: {
      features: {
        maxUsers: 50,
        maxProjects: 10,
        advancedAnalytics: true,
        apiAccess: true,
        customIntegrations: false,
        sso: true,
        auditLogRetention: 90
      },
      branding: {
        logo: 'https://cdn.example.com/logo.svg',
        primaryColor: '#0f172a',
        customDomain: 'app.acme.test',
        customEmail: false
      },
      limits: {
        monthlyBudget: 500000,
        storageQuota: 10737418240,
        apiRateLimit: 1200
      },
      metadata: {
        contractTier: 'enterprise',
        accountManager: 'Jane Doe'
      }
    }
  }))
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');

  return {
    ...actual,
    useRouter: () => ({
      refresh: vi.fn()
    }),
    notFound: vi.fn(() => {
      throw new Error('NOT_FOUND');
    })
  };
});

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: vi.fn(async () => ({
    accessToken: 'token',
    refreshToken: 'refresh',
    tenantId: 'tenant-1',
    user: {
      id: 'user_admin_admin',
      name: 'Ariana Moore',
      email: 'ariana.moore@mivialabs.test',
      role: 'System Owner',
      avatarFallback: 'AM',
      tenantId: 'tenant-1',
      permissions: ['system:tenants:update', 'system:tenants:read']
    }
  }))
}));

describe('TenantDetailPage', () => {
  it('renders the organization detail surface', async () => {
    const page = await TenantDetailPage({ params: Promise.resolve({ organizationId: '10' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Acme Operations');
    expect(html).toContain('Edit lifecycle');
    expect(html).toContain('Organization profile');
    expect(html).toContain('Ownership and membership');
    expect(html).toContain('Auth posture');
    expect(html).toContain('Owner records');
    expect(html).toContain('Google Identity Platform');
    expect(html).toContain('gcp-acme');
    expect(html).toContain('enterprise');
    expect(html).toContain('View memberships');
    expect(html).toContain('View invitations');
    expect(html).toContain('org_pub_123');
    expect(html).toContain('tenant_pub_123');
    expect(html).toContain('Ariana Moore');
  });

  it('renders a read-only lifecycle note without update permission', async () => {
    const { getAdminSession } = await import('~/lib/admin-auth');
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
      user: {
        id: 'user_admin_viewer',
        name: 'Nadia Reed',
        email: 'nadia.reed@mivialabs.test',
        role: 'Operator',
        avatarFallback: 'NR',
        tenantId: 'tenant-1',
        permissions: ['system:tenants:read']
      }
    } as never);

    const page = await TenantDetailPage({ params: Promise.resolve({ organizationId: '10' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).not.toContain('Edit lifecycle');
    expect(html).toContain('Lifecycle edits require the `system:tenants:update` permission.');
  });

  it('routes 404 detail responses to notFound', async () => {
    vi.mocked(getAdminTenantDetail).mockRejectedValueOnce(
      new ApiClientError('Backend request failed with status 404', 404)
    );

    await expect(
      TenantDetailPage({ params: Promise.resolve({ organizationId: '999' }) })
    ).rejects.toThrow('NOT_FOUND');
  });
});

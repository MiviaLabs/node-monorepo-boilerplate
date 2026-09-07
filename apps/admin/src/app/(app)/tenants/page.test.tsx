import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import TenantsPage from './page';

vi.mock('~/lib/admin', () => ({
  getAdminTenantsOverview: vi.fn(async () => ({
    generatedAt: '2026-03-13T12:00:00.000Z',
    metrics: [
      { key: 'tenants_total', label: 'Tenants', value: 2, summary: '1 active' },
      {
        key: 'provisioning_gaps_total',
        label: 'Provisioning gaps',
        value: 1,
        summary: 'Needs operator follow-up'
      },
      {
        key: 'invite_backlog_total',
        label: 'Invite backlog',
        value: 1,
        summary: 'Pending tenant onboarding'
      },
      {
        key: 'members_tracked_total',
        label: 'Members tracked',
        value: 13,
        summary: '4 tenant admins'
      }
    ],
    items: [
      {
        organizationId: 10,
        tenantId: 20,
        publicId: 'org_pub_123',
        name: 'Acme Operations',
        displayName: 'Acme Operations',
        slug: 'acme-ops',
        tenantType: 'organization',
        status: 'active',
        organizationActive: true,
        isDeleted: false,
        deletedAt: undefined,
        ownerUserId: 55,
        ownerDisplayName: 'Ariana Moore',
        ownerActive: true,
        hasOwner: true,
        memberCount: 12,
        adminCount: 3,
        pendingInvitationCount: 2,
        gcpTenantId: 'gcp-tenant-42',
        hasProvisionedAuthTenant: true,
        onboardingState: 'invited',
        diagnostics: {
          ssoEnabled: true,
          apiAccessEnabled: true,
          hasCustomDomain: true,
          hasCustomEmail: false,
          maxUsers: 50,
          apiRateLimit: 120
        },
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-13T12:00:00.000Z'
      },
      {
        organizationId: 11,
        tenantId: 21,
        name: 'Pending Provisioning',
        slug: 'pending-provisioning',
        tenantType: 'organization',
        status: 'deleted',
        organizationActive: false,
        isDeleted: true,
        deletedAt: '2026-03-13T11:00:00.000Z',
        hasOwner: false,
        memberCount: 1,
        adminCount: 1,
        pendingInvitationCount: 0,
        hasProvisionedAuthTenant: false,
        onboardingState: 'setup',
        diagnostics: {
          ssoEnabled: false,
          apiAccessEnabled: false,
          hasCustomDomain: false,
          hasCustomEmail: false
        },
        createdAt: '2026-03-12T10:00:00.000Z',
        updatedAt: '2026-03-13T12:00:00.000Z'
      }
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    }
  }))
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn()
  }),
  usePathname: () => '/tenants'
}));

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
      permissions: ['system:tenants:create', 'system:tenants:read']
    }
  }))
}));

describe('TenantsPage', () => {
  it('renders the tenants inventory surface', async () => {
    const page = await TenantsPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Tenants');
    expect(html).toContain('Tenant inventory');
    expect(html).toContain('Create tenant');
    expect(html).toContain('Apply');
    expect(html).toContain('Active records');
    expect(html).toContain('Acme Operations');
    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Owner not assigned');
    expect(html).toContain('Membership');
    expect(html).toContain('Actions');
    expect(html).toContain('Deleted');
    expect(html).toContain('Actions for Acme Operations');
    expect(html).toContain('Actions for Pending Provisioning');
  });

  it('hides tenant creation controls without create permission', async () => {
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

    const page = await TenantsPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).not.toContain('Create tenant');
  });
});

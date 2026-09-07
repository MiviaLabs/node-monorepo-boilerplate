import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import AccessPage from './page';

import { getAdminAccessOverview } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';

vi.mock('~/lib/admin', () => ({
  getAdminAccessOverview: vi.fn(async () => ({
    generatedAt: '2026-03-13T12:00:00.000Z',
    metrics: [
      { key: 'members_total', label: 'Members', value: 12, summary: '9 active memberships' },
      {
        key: 'privileged_members_total',
        label: 'Privileged members',
        value: 3,
        summary: 'Requires review'
      },
      {
        key: 'active_invitations_total',
        label: 'Active invitations',
        value: 2,
        summary: 'Pending acceptance'
      },
      {
        key: 'expired_or_cancelled_invitations_total',
        label: 'Inactive invitations',
        value: 1,
        summary: 'Historical posture'
      }
    ],
    memberships: [
      {
        userId: 123,
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationActive: true,
        organizationDeletedAt: undefined,
        tenantId: 20,
        tenantType: 'organization',
        tenantStatus: 'active',
        displayName: 'Ariana Moore',
        userActive: true,
        userDeletedAt: undefined,
        membershipRole: 'tenant_admin',
        status: 'active',
        isDefault: true,
        isPrivileged: true,
        systemRoles: ['system_admin'],
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-13T12:00:00.000Z'
      }
    ],
    membershipsPagination: {
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    },
    invitations: [
      {
        invitationId: 123,
        organizationId: 10,
        organizationName: 'Acme Operations',
        organizationSlug: 'acme-ops',
        tenantId: 20,
        tenantType: 'organization',
        role: 'tenant_admin',
        status: 'pending',
        invitedByUserId: 55,
        invitedByDisplayName: 'Ariana Moore',
        isPrivileged: true,
        createdAt: '2026-03-13T09:00:00.000Z',
        expiresAt: '2026-03-20T09:00:00.000Z'
      }
    ],
    invitationsPagination: {
      page: 1,
      pageSize: 10,
      total: 1,
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
  usePathname: () => '/memberships'
}));

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: vi.fn(async () => ({
    accessToken: 'token',
    refreshToken: 'refresh',
    tenantId: 'tenant-1',
    user: {
      userId: '999',
      actorId: '999',
      name: 'Ariana Moore',
      displayName: 'Ariana Moore',
      roles: ['system_owner'],
      permissions: ['system:read', 'system:write'],
      roleLabel: 'System Owner',
      email: 'ariana.moore@mivialabs.test',
      role: 'system_owner',
      avatarFallback: 'AM',
      tenantId: 'tenant-1'
    }
  }))
}));

describe('MembershipsPage', () => {
  it('renders the memberships-focused governance surface with invitations drilldown', async () => {
    const page = await AccessPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Memberships');
    expect(html).toContain('membership records');
    expect(html).toContain('Active invitations');
    expect(html).toContain('View invitations');
    expect(html).toContain('Apply membership filters');
    expect(html).toContain('Active records');
    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Acme Operations');
    expect(html).toContain('System Admin');
    expect(html).toContain('/users/123');
    expect(html).toContain('Default');
    expect(html).toContain('Actions');
    expect(html).toContain('Privileged');
    expect(html).not.toContain('Apply invitation filters');
    expect(html).not.toContain('@mivialabs.test');
  });

  it('disables the global delete action for the current operator row', async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      expiresAt: '2026-03-14T12:00:00.000Z',
      refreshExpiresAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-14T12:00:00.000Z',
      user: {
        userId: '123',
        actorId: '123',
        displayName: 'Ariana Moore',
        email: 'ariana.moore@mivialabs.test',
        name: 'Ariana Moore',
        role: 'system_owner',
        roleLabel: 'System Owner',
        roles: ['system_owner'],
        permissions: ['system:read', 'system:write'],
        tenantId: 'tenant-1',
        avatarFallback: 'AM'
      }
    });

    const page = await AccessPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Actions');
    expect(html).not.toContain('Delete Ariana Moore?');
  });

  it('renders deleted membership posture when the user is soft deleted', async () => {
    vi.mocked(getAdminAccessOverview).mockResolvedValueOnce({
      generatedAt: '2026-03-13T12:00:00.000Z',
      metrics: [
        { key: 'members_total', label: 'Members', value: 1, summary: '0 active memberships' },
        {
          key: 'privileged_members_total',
          label: 'Privileged members',
          value: 0,
          summary: 'No elevated posture'
        },
        {
          key: 'active_invitations_total',
          label: 'Active invitations',
          value: 0,
          summary: 'No open invites'
        },
        {
          key: 'expired_or_cancelled_invitations_total',
          label: 'Inactive invitations',
          value: 0,
          summary: 'No stale invites'
        }
      ],
      memberships: [
        {
          userId: 123,
          organizationId: 10,
          organizationName: 'Acme Operations',
          organizationDisplayName: 'Acme Ops',
          organizationSlug: 'acme-ops',
          organizationActive: false,
          organizationDeletedAt: '2026-03-13T11:00:00.000Z',
          tenantId: 20,
          tenantType: 'organization',
          tenantStatus: 'deleted',
          displayName: 'Ariana Moore',
          userActive: false,
          userDeletedAt: '2026-03-13T11:30:00.000Z',
          membershipRole: 'tenant_admin',
          status: 'inactive',
          isDefault: true,
          isPrivileged: true,
          systemRoles: ['system_admin'],
          createdAt: '2026-03-10T10:00:00.000Z',
          updatedAt: '2026-03-13T12:00:00.000Z'
        }
      ],
      membershipsPagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      },
      invitations: [],
      invitationsPagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      }
    });

    const page = await AccessPage({
      searchParams: Promise.resolve({
        memberRecordState: 'deleted'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Deleted');
    expect(html).not.toContain('Delete user');
  });

  it('preserves tenant drilldown scope when rendering filtered members', async () => {
    await AccessPage({
      searchParams: Promise.resolve({
        memberOrganizationId: '10',
        memberTenantId: '20',
        memberScopeLabel: 'Acme Operations'
      })
    });

    expect(getAdminAccessOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        memberOrganizationId: 10,
        memberTenantId: 20
      })
    );
  });
});

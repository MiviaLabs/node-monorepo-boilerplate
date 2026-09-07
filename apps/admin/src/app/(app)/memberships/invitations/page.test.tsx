import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AccessInvitationsPage from './page';
import AuthenticatedLayout from '../../layout';

import { getAdminAccessOverview } from '~/lib/admin';

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
    memberships: [],
    membershipsPagination: {
      page: 1,
      pageSize: 1,
      total: 0,
      totalPages: 0,
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
      tenantId: 'tenant-1'
    }
  }))
}));

describe('AccessInvitationsPage', () => {
  it('renders the invitations-focused access subpage', async () => {
    const page = await AccessInvitationsPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Invitations');
    expect(html).toContain('invitation records');
    expect(html).toContain('Apply invitation filters');
    expect(html).toContain('Invitation');
    expect(html).toContain('Organization');
    expect(html).toContain('Timeline');
    expect(html).toContain('Privileged invite');
    expect(html).toContain('/acme-ops');
    expect(html).not.toContain('Apply membership filters');
    expect(html).not.toContain('@mivialabs.test');
  });

  it('preserves organization scope in invitation list queries', async () => {
    await AccessInvitationsPage({
      searchParams: Promise.resolve({
        invitationOrganizationId: '10',
        invitationTenantId: '20',
        invitationScopeLabel: 'Acme Operations'
      })
    });

    expect(getAdminAccessOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationOrganizationId: 10,
        invitationTenantId: 20
      })
    );
  });
});

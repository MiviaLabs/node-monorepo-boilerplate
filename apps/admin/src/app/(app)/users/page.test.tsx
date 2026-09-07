import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import UsersPage from './page';

import { getAdminSession } from '~/lib/admin-auth';

vi.mock('~/lib/admin', () => ({
  getAdminUsersOverview: vi.fn(async () => ({
    generatedAt: '2026-03-16T12:00:00.000Z',
    metrics: [
      { key: 'users_total', label: 'Users', value: 12, summary: '10 active accounts' },
      {
        key: 'privileged_users_total',
        label: 'Privileged users',
        value: 3,
        summary: 'Elevated posture present'
      },
      {
        key: 'users_without_identity_total',
        label: 'Without identity',
        value: 1,
        summary: 'Needs auth review'
      }
    ],
    users: [
      {
        userId: 123,
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
        systemRoles: ['system_admin'],
        isPrivileged: true,
        membershipCount: 3,
        activeMembershipCount: 2,
        privilegedMembershipCount: 1,
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z',
        lastSignInAt: '2026-03-14T09:00:00.000Z'
      }
    ],
    pagination: {
      page: 1,
      pageSize: 20,
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
    user: { userId: '999' }
  }))
}));

describe('UsersPage', () => {
  it('renders the global users inventory', async () => {
    const page = await UsersPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Users');
    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Acme Ops');
    expect(html).toContain('google.com');
    expect(html).toContain('View memberships');
    expect(html).toContain('Apply user filters');
    expect(html).toContain('/users/123');
  });

  it('disables deleting the current operator row', async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      expiresAt: '2026-03-16T12:00:00.000Z',
      refreshExpiresAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-16T12:00:00.000Z',
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

    const page = await UsersPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).not.toContain('Delete Ariana Moore?');
  });
});

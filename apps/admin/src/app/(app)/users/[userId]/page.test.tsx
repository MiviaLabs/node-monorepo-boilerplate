import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import UserDetailPage from './page';
import AuthenticatedLayout from '../../layout';

import { ApiClientError } from '~/lib/api-client';
import { getAdminUserDetail } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';

vi.mock('~/lib/admin', () => ({
  getAdminUserDetail: vi.fn(async () => ({
    generatedAt: '2026-03-16T12:00:00.000Z',
    userId: 123,
    organizationId: 10,
    organizationName: 'Acme Operations',
    organizationDisplayName: 'Acme Ops',
    organizationSlug: 'acme-ops',
    organizationActive: true,
    displayName: 'Ariana Moore',
    photoUrl: 'https://cdn.example.com/avatar.png',
    userLifecycle: 'active',
    userActive: true,
    userVerified: true,
    systemRoles: ['system_admin'],
    isPrivileged: true,
    userCreatedAt: '2026-03-10T10:00:00.000Z',
    userUpdatedAt: '2026-03-14T10:00:00.000Z',
    lastSignInAt: '2026-03-15T08:00:00.000Z',
    identity: {
      provider: 'google.com',
      providerDisplayName: 'Ariana Moore',
      emailVerified: true,
      phoneVerified: false,
      hasPrimaryIdentity: true,
      providersInUse: ['google.com', 'password'],
      totalIdentities: 2
    },
    membershipStats: {
      totalMemberships: 2,
      activeMemberships: 1,
      suspendedMemberships: 1,
      privilegedMemberships: 1
    },
    memberships: [
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
        updatedAt: '2026-03-14T10:00:00.000Z'
      },
      {
        organizationId: 11,
        organizationName: 'Beta Logistics',
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
    ]
  }))
}));

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: vi.fn(async () => ({
    accessToken: 'token',
    refreshToken: 'refresh',
    tenantId: 'tenant-1',
    user: {
      userId: '999',
      actorId: '999',
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
  }))
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    notFound: vi.fn(() => {
      throw new Error('NOT_FOUND');
    })
  };
});

describe('UserDetailPage', () => {
  it('renders the global user detail surface', async () => {
    const page = await UserDetailPage({ params: Promise.resolve({ userId: '123' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Users');
    expect(html).toContain('User profile');
    expect(html).toContain('Identity and roles');
    expect(html).toContain('Memberships');
    expect(html).toContain('View organization');
    expect(html).toContain('View default membership');
    expect(html).toContain('Back to users');
    expect(html).toContain('/memberships/123?tenantId=20');
    expect(html).toContain('Exports are currently limited to the current operator account.');
  });

  it('routes 404 user detail responses to notFound', async () => {
    vi.mocked(getAdminUserDetail).mockRejectedValueOnce(
      new ApiClientError('Backend request failed with status 404', 404)
    );

    await expect(UserDetailPage({ params: Promise.resolve({ userId: '999' }) })).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('shows the export action when the operator is viewing their own detail page', async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
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
    } as never);

    const page = await UserDetailPage({ params: Promise.resolve({ userId: '123' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Download my account export');
    expect(html).toContain('/api/auth/account/123/export');
  });
});

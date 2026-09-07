import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import MemberDetailPage from './page';
import AuthenticatedLayout from '../../layout';

import { ApiClientError } from '~/lib/api-client';
import { getAdminMemberDetail } from '~/lib/admin';

vi.mock('~/lib/admin', () => ({
  getAdminMemberDetail: vi.fn(async () => ({
    generatedAt: '2026-03-15T12:00:00.000Z',
    userId: 123,
    organizationId: 10,
    organizationName: 'Acme Operations',
    organizationDisplayName: 'Acme Ops',
    organizationSlug: 'acme-ops',
    organizationActive: true,
    tenantId: 20,
    tenantType: 'organization',
    tenantStatus: 'active',
    displayName: 'Ariana Moore',
    photoUrl: 'https://cdn.example.com/avatar.png',
    membershipRole: 'tenant_admin',
    status: 'active',
    userLifecycle: 'active',
    userActive: true,
    userVerified: true,
    systemRoles: ['system_admin'],
    isPrivileged: true,
    isDefault: true,
    userCreatedAt: '2026-03-10T10:00:00.000Z',
    userUpdatedAt: '2026-03-14T10:00:00.000Z',
    lastSignInAt: '2026-03-15T08:00:00.000Z',
    membershipCreatedAt: '2026-03-10T10:00:00.000Z',
    membershipUpdatedAt: '2026-03-14T10:00:00.000Z',
    identity: {
      provider: 'google.com',
      providerDisplayName: 'Ariana Moore',
      emailVerified: true,
      phoneVerified: false,
      hasPrimaryIdentity: true
    },
    membershipStats: {
      totalMemberships: 2,
      activeMemberships: 1,
      suspendedMemberships: 1,
      privilegedMemberships: 1
    },
    otherMemberships: [
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
        isCurrent: true,
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
        isCurrent: false,
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z'
      }
    ]
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

describe('MembershipDetailPage', () => {
  it('renders the membership detail surface', async () => {
    const page = await MemberDetailPage({
      params: Promise.resolve({ userId: '123' }),
      searchParams: Promise.resolve({ tenantId: '20' })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Current membership');
    expect(html).toContain('User posture');
    expect(html).toContain('Identity and roles');
    expect(html).toContain('Other memberships');
    expect(html).toContain('View organization');
    expect(html).toContain('Back to memberships');
    expect(html).toContain('google.com');
    expect(html).toContain('Acme Ops');
    expect(html).toContain('Beta Logistics');
  });

  it('routes 404 membership detail responses to notFound', async () => {
    vi.mocked(getAdminMemberDetail).mockRejectedValueOnce(
      new ApiClientError('Backend request failed with status 404', 404)
    );

    await expect(
      MemberDetailPage({
        params: Promise.resolve({ userId: '999' }),
        searchParams: Promise.resolve({ tenantId: '20' })
      })
    ).rejects.toThrow('NOT_FOUND');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import ProfilePage from './page';

vi.mock('./profile-edit-form', () => ({
  ProfileEditForm: (props: {
    initialDisplayName: string;
    initialPhoneNumber: string;
    email: string;
    roleLabel: string;
    tenantDisplayName: string;
    tenantId: string;
  }) => (
    <div>
      <div>Profile edit form</div>
      <div>Display name</div>
      <div>{props.initialDisplayName}</div>
      <div>Email</div>
      <div>{props.email}</div>
      <div>Tenant</div>
      <div>{props.tenantDisplayName}</div>
      <div>{props.tenantId}</div>
      <div>Phone</div>
      <div>{props.initialPhoneNumber}</div>
      <div>Access</div>
      <div>{props.roleLabel}</div>
    </div>
  )
}));

vi.mock('~/components/admin/profile-session-panel', () => ({
  ProfileSessionPanel: (props: { sessions: Array<{ id: string }> }) => (
    <div>
      <div>Operator sessions</div>
      <div>{props.sessions[0]?.id}</div>
      <div>Revoke</div>
    </div>
  )
}));

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: vi.fn(async () => ({
    accessToken: 'token',
    refreshToken: 'refresh',
    tenantId: 'tenant-1',
    user: {
      userId: '501',
      actorId: 'actor_admin_admin',
      name: 'Ariana Moore',
      displayName: 'Ariana Moore',
      email: 'ariana.moore@mivialabs.test',
      phoneNumber: '+14155552671',
      role: 'System Owner',
      roles: ['system_owner'],
      permissions: ['operators:read'],
      avatarFallback: 'AM',
      tenantId: 'tenant-1',
      tenantDisplayName: 'Mivia Labs Control'
    }
  }))
}));

vi.mock('~/lib/admin', () => ({
  getAdminCurrentUserSessions: vi.fn(async () => [
    {
      id: 'session-1',
      userId: 501,
      tenantId: 'tenant-1',
      tokenId: 'token-1',
      createdAt: '2026-03-17T01:00:00.000Z',
      expiresAt: '2026-03-24T01:00:00.000Z',
      lastActivity: '2026-03-17T01:05:00.000Z',
      active: true
    }
  ])
}));

describe('ProfilePage', () => {
  it('renders the hydrated profile surface', async () => {
    const page = await ProfilePage();
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Profile edit form');
    expect(html).toContain('Profile details');
    expect(html).toContain('Identity');
    expect(html).toContain('Operator');
    expect(html).toContain('Email');
    expect(html).toContain('Phone');
    expect(html).toContain('Mivia Labs Control');
    expect(html).toContain('tenant-1');
    expect(html).toContain('Ariana Moore');
    expect(html).toContain('System Owner');
    expect(html).toContain('Download my account export');
    expect(html).toContain('/api/auth/account/501/export');
    expect(html).toContain('Data export');
    expect(html).toContain('Operator sessions');
    expect(html).toContain('session-1');
    expect(html).toContain('Revoke');
  });
});

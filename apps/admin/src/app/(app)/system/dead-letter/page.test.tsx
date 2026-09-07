import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import DeadLetterPage from './page';
import AuthenticatedLayout from '../../layout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn()
  }),
  usePathname: () => '/system/dead-letter'
}));

vi.mock('~/lib/admin', () => ({
  getAdminDeadLetterEvents: vi.fn(async () => [
    {
      eventId: 'evt-dead-1',
      eventType: 'user.deleted',
      aggregateId: 'user-123',
      tenantId: 'tenant-1',
      retryCount: 6,
      errorMessage: 'SMTP timeout',
      deadLetteredAt: '2026-03-16T12:00:00.000Z',
      reason: 'timeout'
    },
    {
      eventId: 'evt-dead-2',
      eventType: 'tenant.deleted',
      aggregateId: 'tenant-44',
      tenantId: 'tenant-2',
      retryCount: 3,
      errorMessage: 'Permission denied',
      deadLetteredAt: '2026-03-16T10:00:00.000Z',
      reason: 'permission'
    }
  ])
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
      permissions: ['system:system:monitor', 'system:system:settings'],
      avatarFallback: 'AM',
      tenantId: 'tenant-1'
    }
  }))
}));

describe('DeadLetterPage', () => {
  it('renders the dead-letter queue surface', async () => {
    const page = await DeadLetterPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Dead-letter queue');
    expect(html).toContain('Replay candidates');
    expect(html).toContain('SMTP timeout');
    expect(html).toContain('Permission denied');
    expect(html).toContain('user.deleted');
    expect(html).toContain('tenant.deleted');
    expect(html).toContain('Replay');
    expect(html).toContain('Delete');
  });

  it('hides replay and delete actions for monitor-only operators', async () => {
    const { getAdminSession } = await import('~/lib/admin-auth');
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
      user: {
        id: 'user_admin_admin',
        userId: 'user_admin_admin',
        actorId: 'actor-1',
        name: 'Ariana Moore',
        displayName: 'Ariana Moore',
        email: 'ariana.moore@mivialabs.test',
        role: 'system_owner',
        roleLabel: 'System Owner',
        roles: ['system_owner'],
        permissions: ['system:system:monitor'],
        avatarFallback: 'AM',
        tenantId: 'tenant-1'
      },
      expiresAt: '2026-03-17T00:00:00.000Z',
      refreshExpiresAt: '2026-03-18T00:00:00.000Z',
      sessionId: 'sess-1',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });

    const page = await DeadLetterPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).not.toContain('Replay event');
    expect(html).not.toContain('Delete record');
    expect(html).toContain('Requires system settings permission');
  });
});

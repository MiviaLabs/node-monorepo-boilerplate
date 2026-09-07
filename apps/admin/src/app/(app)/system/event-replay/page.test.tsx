import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, vi } from 'vitest';

import EventReplayPage from './page';
import AuthenticatedLayout from '../../layout';

const { getAdminEventReplayStatusMock, getAdminSessionMock } = vi.hoisted(() => ({
  getAdminEventReplayStatusMock: vi.fn(async () => ({
    replayId: 'replay-123',
    status: 'running',
    processedCount: 12,
    totalCount: 20,
    successCount: 11,
    failureCount: 1,
    startedAt: '2026-03-16T12:00:00.000Z',
    completedAt: undefined,
    error: undefined
  })),
  getAdminSessionMock: vi.fn(async () => ({
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
      permissions: ['system:system:monitor', 'system:system:settings'],
      avatarFallback: 'AM',
      tenantId: 'tenant-1'
    },
    expiresAt: '2026-03-17T00:00:00.000Z',
    refreshExpiresAt: '2026-03-18T00:00:00.000Z',
    sessionId: 'sess-1',
    updatedAt: '2026-03-16T00:00:00.000Z'
  }))
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  }),
  usePathname: () => '/system/event-replay'
}));

vi.mock('~/lib/admin', () => ({
  getAdminEventReplayStatus: getAdminEventReplayStatusMock
}));

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: getAdminSessionMock
}));

describe('EventReplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the replay workflow and selected session status', async () => {
    const page = await EventReplayPage({
      searchParams: Promise.resolve({ replayId: 'replay-123' })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Event replay');
    expect(html).toContain('Replay control plane');
    expect(html).toContain('Replay status');
    expect(html).toContain('replay-123');
    expect(html).toContain('12/20');
    expect(html).toContain('Cancel replay');
  });

  it('keeps status lookup read-only when the operator lacks monitor permission', async () => {
    getAdminSessionMock.mockResolvedValueOnce({
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
        permissions: ['system:system:settings'],
        avatarFallback: 'AM',
        tenantId: 'tenant-1'
      },
      expiresAt: '2026-03-17T00:00:00.000Z',
      refreshExpiresAt: '2026-03-18T00:00:00.000Z',
      sessionId: 'sess-1',
      updatedAt: '2026-03-16T00:00:00.000Z'
    });

    const page = await EventReplayPage({
      searchParams: Promise.resolve({ replayId: 'replay-123' })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(getAdminEventReplayStatusMock).not.toHaveBeenCalled();
    expect(html).toContain('Status unavailable');
    expect(html).toContain('Requires system monitoring permission to inspect replay sessions.');
    expect(html).toContain('Replay creation is available, but status lookup requires');
  });

  it('surfaces replay lookup failures instead of rendering an idle placeholder', async () => {
    getAdminEventReplayStatusMock.mockRejectedValueOnce(
      new Error('Backend request failed with status 404')
    );

    const page = await EventReplayPage({
      searchParams: Promise.resolve({ replayId: 'missing-replay' })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Backend request failed with status 404');
    expect(html).not.toContain('No replay error reported.');
    expect(html).toContain('No replay selected');
  });
});

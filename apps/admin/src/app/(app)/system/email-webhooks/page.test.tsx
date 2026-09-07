import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import EmailWebhooksPage from './page';
import AuthenticatedLayout from '../../layout';
import { getAdminEmailWebhookEvents } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn()
  }),
  usePathname: () => '/system/email-webhooks'
}));

vi.mock('~/lib/admin', () => ({
  getAdminEmailWebhookSummary: vi.fn(async () => ({
    generatedAt: '2026-03-17T12:00:00.000Z',
    totalEvents: 4,
    appliedEvents: 2,
    unmatchedEvents: 1,
    failedEvents: 1,
    pendingEvents: 0,
    retryableEvents: 2,
    latestReceivedAt: '2026-03-17T11:59:00.000Z'
  })),
  getAdminEmailWebhookEvents: vi.fn(async () => ({
    page: 1,
    pageSize: 20,
    total: 2,
    items: [
      {
        id: 11,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        processingStatus: 'applied',
        verificationStatus: 'verified',
        providerMessageId: 'msg-11',
        providerDeliveryId: 'delivery-11',
        providerEventId: 'event-11',
        organizationId: 7,
        organizationName: 'Acme Corp',
        emailMessageId: 18,
        emailProviderMessageId: 41,
        messageStatus: 'delivered',
        latestProviderStatus: 'delivered',
        referenceType: 'invitation',
        referenceId: 'invite-11',
        attemptCount: 1,
        receivedAt: '2026-03-17T10:00:01.000Z'
      },
      {
        id: 12,
        provider: 'resend',
        providerEventType: 'email.opened',
        normalizedEventType: 'opened',
        processingStatus: 'unmatched',
        verificationStatus: 'verified',
        attemptCount: 2,
        processingError: 'Lookup failed',
        receivedAt: '2026-03-17T10:05:01.000Z'
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

describe('EmailWebhooksPage', () => {
  it('renders the webhook operations surface', async () => {
    const page = await EmailWebhooksPage({
      searchParams: Promise.resolve({
        organizationId: '7',
        providerMessageId: 'msg-11'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Email webhooks');
    expect(html).toContain('Operational event list');
    expect(html).toContain('email.delivered');
    expect(html).toContain('email.opened');
    expect(html).toContain('Lookup failed');
    expect(html).toContain('Reprocess');
    expect(html).toContain('Organization: 7');
    expect(html).toContain('Message id: msg-11');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Open email inventory');
  });

  it('keeps persisted verified webhook rows reprocessable for operators with settings access', async () => {
    vi.mocked(getAdminEmailWebhookEvents).mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 19,
          provider: 'resend',
          providerEventType: 'email.delivered',
          normalizedEventType: 'delivered',
          processingStatus: 'persisted',
          verificationStatus: 'verified',
          providerMessageId: 'msg-19',
          attemptCount: 1,
          receivedAt: '2026-03-17T10:10:01.000Z'
        }
      ]
    } as never);

    const page = await EmailWebhooksPage({
      searchParams: Promise.resolve({
        processingStatus: 'persisted'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('email.delivered');
    expect(html).toContain('persisted');
    expect(html).toContain('Reprocess');
    expect(html).not.toContain('No action needed');
  });

  it('renders empty state and read-only actions without settings permission', async () => {
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      accessToken: 'token',
      refreshToken: 'refresh',
      tenantId: 'tenant-1',
      user: {
        id: 'user_admin_viewer',
        userId: 'user_admin_viewer',
        actorId: 'actor-2',
        name: 'Nadia Reed',
        displayName: 'Nadia Reed',
        email: 'nadia.reed@mivialabs.test',
        role: 'system_viewer',
        roleLabel: 'System Viewer',
        roles: ['system_viewer'],
        permissions: ['system:system:monitor'],
        avatarFallback: 'NR',
        tenantId: 'tenant-1'
      },
      expiresAt: '2026-03-17T00:00:00.000Z',
      refreshExpiresAt: '2026-03-18T00:00:00.000Z',
      sessionId: 'sess-2',
      updatedAt: '2026-03-16T00:00:00.000Z'
    } as never);
    vi.mocked(getAdminEmailWebhookEvents).mockResolvedValueOnce({
      page: 2,
      pageSize: 10,
      total: 0,
      items: []
    } as never);

    const page = await EmailWebhooksPage({
      searchParams: Promise.resolve({
        page: '2',
        pageSize: '10',
        processingStatus: 'unmatched',
        providerMessageId: 'msg-missing'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('No email webhook events matched the current filters.');
    expect(html).toContain('Clear filters');
    expect(html).toContain('/system/email-webhooks');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import EmailDetailPage from './page';
import AuthenticatedLayout from '../../../layout';

import { ApiClientError } from '~/lib/api-client';
import { getAdminEmailDetail } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';

vi.mock('~/lib/admin', () => ({
  getAdminEmailDetail: vi.fn(async () => ({
    generatedAt: '2026-03-17T12:00:00.000Z',
    item: {
      emailMessageId: 77,
      publicId: 'email-public-77',
      organizationId: 12,
      organizationName: 'Acme Corp',
      referenceType: 'invitation',
      referenceId: 'invite-77',
      subject: 'Invitation to Acme',
      messageStatus: 'delivered',
      provider: 'resend',
      attemptNumber: 1,
      providerMessageId: 'msg-77',
      providerDeliveryId: 'delivery-77',
      providerEventId: 'event-77',
      providerStatus: 'delivered',
      normalizedProviderStatus: 'delivered',
      acceptedAt: '2026-03-17T09:58:00.000Z',
      deliveredAt: '2026-03-17T09:59:00.000Z',
      lastWebhookAt: '2026-03-17T09:59:02.000Z',
      lastWebhookOccurredAt: '2026-03-17T09:59:01.000Z',
      failedWebhookCount: 1,
      unmatchedWebhookCount: 0,
      latestWebhookProcessingStatus: 'failed',
      webhookAttentionState: 'attention',
      correlationId: 'corr-77',
      safeMetadataSummary: {
        templateKey: 'tenant.invitation',
        tagCount: 2,
        headerKeys: ['x-request-id'],
        providerHintKeys: ['region']
      }
    },
    providerAttempts: [
      {
        id: 41,
        provider: 'resend',
        attemptNumber: 1,
        providerMessageId: 'msg-77',
        providerDeliveryId: 'delivery-77',
        providerEventId: 'event-77',
        providerStatus: 'delivered',
        normalizedProviderStatus: 'delivered',
        correlationId: 'corr-77',
        acceptedAt: '2026-03-17T09:58:00.000Z',
        lastWebhookOccurredAt: '2026-03-17T09:59:01.000Z',
        lastWebhookAt: '2026-03-17T09:59:02.000Z',
        createdAt: '2026-03-17T09:58:00.000Z',
        updatedAt: '2026-03-17T09:59:02.000Z'
      }
    ],
    relatedWebhookEvents: [
      {
        id: 88,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'unmatched',
        providerMessageId: 'msg-77',
        providerDeliveryId: 'delivery-77',
        providerEventId: 'event-77',
        emailProviderMessageId: 41,
        attemptCount: 1,
        occurredAt: '2026-03-17T09:59:01.000Z',
        receivedAt: '2026-03-17T09:59:02.000Z',
        processedAt: '2026-03-17T09:59:03.000Z'
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

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      refresh: vi.fn()
    }),
    usePathname: () => '/system/emails/77',
    notFound: vi.fn(() => {
      throw new Error('NOT_FOUND');
    })
  };
});

describe('EmailDetailPage', () => {
  it('renders the email detail surface', async () => {
    const page = await EmailDetailPage({ params: Promise.resolve({ emailMessageId: '77' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Invitation to Acme');
    expect(html).toContain('Email detail');
    expect(html).toContain('Provider attempts');
    expect(html).toContain('Related webhook events');
    expect(html).toContain('Safe metadata');
    expect(html).toContain('Open webhook investigation');
    expect(html).toContain('View tenant');
    expect(html).toContain('msg-77');
    expect(html).toContain('Reprocess');
  });

  it('routes 404 email detail responses to notFound', async () => {
    vi.mocked(getAdminEmailDetail).mockRejectedValueOnce(
      new ApiClientError('Backend request failed with status 404', 404)
    );

    await expect(
      EmailDetailPage({ params: Promise.resolve({ emailMessageId: '999' }) })
    ).rejects.toThrow('NOT_FOUND');
  });

  it('renders empty detail states when provider attempts and webhook events are absent', async () => {
    vi.mocked(getAdminEmailDetail).mockResolvedValueOnce({
      generatedAt: '2026-03-17T12:00:00.000Z',
      item: {
        emailMessageId: 78,
        publicId: 'email-public-78',
        organizationId: 14,
        organizationName: 'Gamma Corp',
        subject: 'No provider history',
        messageStatus: 'pending',
        failedWebhookCount: 0,
        unmatchedWebhookCount: 0,
        webhookAttentionState: 'clear'
      },
      providerAttempts: [],
      relatedWebhookEvents: []
    } as never);

    const page = await EmailDetailPage({ params: Promise.resolve({ emailMessageId: '78' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('No provider attempts were recorded.');
    expect(html).toContain('No correlated webhook events were recorded.');
    expect(html).toContain('No safe metadata summary is available.');
    expect(html).not.toContain('Reprocess');
  });

  it('renders read-only webhook actions when the operator lacks settings permission', async () => {
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

    const page = await EmailDetailPage({ params: Promise.resolve({ emailMessageId: '77' }) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Requires system settings permission');
    expect(html).not.toContain('Reprocess');
  });
});

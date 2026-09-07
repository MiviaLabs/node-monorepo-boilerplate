import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import EmailsPage from './page';
import AuthenticatedLayout from '../../layout';
import { getAdminEmailsOverview } from '~/lib/admin';

vi.mock('~/lib/admin', () => ({
  getAdminEmailsOverview: vi.fn(async () => ({
    generatedAt: '2026-03-17T12:00:00.000Z',
    metrics: [
      { key: 'emails_total', label: 'Tracked emails', value: 4, summary: '2 delivered' },
      {
        key: 'emails_pending',
        label: 'Pending',
        value: 1,
        summary: 'Waiting for provider or webhook progress'
      },
      { key: 'emails_accepted', label: 'Accepted', value: 1, summary: 'Accepted by the provider' },
      {
        key: 'emails_failed_delivery',
        label: 'Failed delivery',
        value: 1,
        summary: 'Failed, bounced, or complained'
      }
    ],
    summary: {
      total: 4,
      pending: 1,
      accepted: 1,
      delivered: 2,
      failedOrBouncedOrComplained: 1,
      webhookAttention: 1
    },
    items: [
      {
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
        failedWebhookCount: 1,
        unmatchedWebhookCount: 0,
        latestWebhookProcessingStatus: 'failed',
        webhookAttentionState: 'attention',
        correlationId: 'corr-77',
        safeMetadataSummary: {
          templateKey: 'tenant.invitation',
          tagCount: 2,
          headerKeys: ['x-request-id']
        }
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

describe('EmailsPage', () => {
  it('renders the tracked email inventory surface', async () => {
    const page = await EmailsPage({
      searchParams: Promise.resolve({
        organizationId: '12',
        providerStatus: 'delivered',
        referenceType: 'invitation'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Emails');
    expect(html).toContain('Email inventory');
    expect(html).toContain('Invitation to Acme');
    expect(html).toContain('webhook attention');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Open webhook operations');
    expect(html).toContain('Open webhook investigation');
    expect(html).toContain('Open email detail');
    expect(html).toContain('Organization: 12');
    expect(html).toContain('Provider status: delivered');
    expect(html).toContain('Reference type: invitation');
    expect(html).toContain('Template: tenant.invitation');
  });

  it('renders empty state and preserves pagination filters in links', async () => {
    vi.mocked(getAdminEmailsOverview).mockResolvedValueOnce({
      generatedAt: '2026-03-17T12:30:00.000Z',
      metrics: [],
      summary: {
        total: 0,
        pending: 0,
        accepted: 0,
        delivered: 0,
        failedOrBouncedOrComplained: 0,
        webhookAttention: 0
      },
      items: [],
      pagination: {
        page: 2,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: true
      }
    } as never);

    const page = await EmailsPage({
      searchParams: Promise.resolve({
        page: '2',
        pageSize: '10',
        search: 'msg-77',
        organizationId: '12',
        provider: 'resend'
      })
    });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('No tracked emails available');
    expect(html).toContain('/system/emails?sortBy=createdAt&amp;sortOrder=desc');
    expect(html).toContain('Clear filters');
  });
});

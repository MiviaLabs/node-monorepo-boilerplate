import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../../layout';
import OutboxPage from './page';

vi.mock('~/lib/admin', () => ({
  getAdminOutboxOverview: vi.fn(async () => ({
    generatedAt: '2026-03-16T12:00:00.000Z',
    metrics: [
      { key: 'pending', label: 'Pending', value: 8, summary: 'Queued and waiting for delivery' },
      { key: 'processing', label: 'Processing', value: 2, summary: 'Workers actively handling' },
      { key: 'retryable', label: 'Retryable', value: 3, summary: 'Failed but scheduled again' },
      { key: 'dead_lettered', label: 'Dead-lettered', value: 1, summary: 'Needs operator review' }
    ],
    summary: {
      total: 2,
      pending: 8,
      processing: 2,
      published: 0,
      failed: 2,
      retryable: 3,
      deadLettered: 1
    },
    items: [
      {
        eventId: 'evt-123',
        eventType: 'user.deleted',
        aggregateId: '123',
        tenantId: 'tenant-1',
        status: 'failed',
        retryCount: 3,
        isRetryable: true,
        isDeadLettered: false,
        ageSeconds: 5400,
        createdAt: '2026-03-16T09:00:00.000Z',
        lastRetryAt: '2026-03-16T09:15:00.000Z',
        nextRetryAt: '2026-03-16T09:30:00.000Z',
        errorSummary: 'SMTP timeout',
        payloadKeys: ['userId', 'source'],
        payloadSizeBytes: 37,
        correlationId: 'corr-1',
        causationId: 'cause-1'
      },
      {
        eventId: 'evt-456',
        eventType: 'tenant.deleted',
        aggregateId: '456',
        tenantId: 'tenant-2',
        status: 'failed',
        retryCount: 10,
        isRetryable: false,
        isDeadLettered: true,
        ageSeconds: 172800,
        createdAt: '2026-03-15T08:00:00.000Z',
        deadLetteredAt: '2026-03-15T09:30:00.000Z',
        deadLetterReason: 'max_retries',
        errorSummary: 'Dead-letter threshold reached',
        payloadKeys: ['tenantId'],
        payloadSizeBytes: 18
      }
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 2,
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

describe('OutboxPage', () => {
  it('renders the outbox monitoring surface', async () => {
    const page = await OutboxPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Outbox monitor');
    expect(html).toContain('Delivery backlog');
    expect(html).toContain('Queue posture');
    expect(html).toContain('user.deleted');
    expect(html).toContain('tenant.deleted');
    expect(html).toContain('SMTP timeout');
    expect(html).toContain('View details');
    expect(html).toContain('dead-lettered');
    expect(html).toContain('Payload keys:');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import StatisticsPage from './page';

import { getAdminStatisticsOverview } from '~/lib/admin';

vi.mock('~/lib/admin', () => ({
  getAdminStatisticsOverview: vi.fn(async () => ({
    generatedAt: '2026-03-13T12:00:00.000Z',
    metrics: [
      { key: 'tenants_total', label: 'Tenants', value: 12, summary: '10 active tenants' },
      { key: 'users_total', label: 'Users', value: 140, summary: '133 active users' },
      {
        key: 'invitations_pending',
        label: 'Pending invitations',
        value: 4,
        summary: 'Awaiting acceptance'
      },
      {
        key: 'dead_letter_events',
        label: 'Dead-letter events',
        value: 2,
        summary: 'Require replay review'
      },
      {
        key: 'published_events',
        label: 'Published events',
        value: 48,
        summary: 'Persisted successful deliveries'
      }
    ],
    eventDeliverySeries: [
      { label: 'Mar 07', published: 7, retries: 0, deadLetters: 0 },
      { label: 'Mar 08', published: 6, retries: 1, deadLetters: 0 },
      { label: 'Mar 09', published: 8, retries: 2, deadLetters: 0 },
      { label: 'Mar 10', published: 0, retries: 1, deadLetters: 1 },
      { label: 'Mar 11', published: 9, retries: 0, deadLetters: 0 },
      { label: 'Mar 12', published: 10, retries: 3, deadLetters: 1 },
      { label: 'Mar 13', published: 8, retries: 2, deadLetters: 0 }
    ],
    volumeBreakdown: [
      { key: 'active_tenants', label: 'Active tenants', value: 10 },
      { key: 'suspended_tenants', label: 'Suspended tenants', value: 2 },
      { key: 'active_users', label: 'Active users', value: 133 },
      { key: 'inactive_users', label: 'Inactive users', value: 7 },
      { key: 'pending_invitations', label: 'Pending invitations', value: 4 },
      { key: 'retryable_events', label: 'Retryable events', value: 4 }
    ],
    deliveryStateRollup: [
      { status: 'Published', value: 48, fill: 'hsl(var(--chart-2))' },
      { status: 'Pending', value: 6, fill: 'hsl(var(--chart-4))' },
      { status: 'Failed', value: 5, fill: 'hsl(var(--chart-5))' },
      { status: 'Processing', value: 1, fill: 'hsl(var(--chart-1))' }
    ],
    summaryRows: [
      {
        group: 'Invitations',
        total: 18,
        detail: '4 pending, 10 accepted, 4 inactive',
        source: 'Main DB invitations table'
      }
    ],
    deletionSummary: {
      totalPending: 6,
      pendingUsers: 4,
      pendingOrganizations: 2,
      dueWithin7Days: 2,
      overdueCount: 1,
      retentionDays: 90
    },
    outboxSummary: {
      pending: 6,
      processing: 2,
      published: 48,
      failed: 3,
      retryable: 3,
      deadLettered: 1,
      highlights: {
        oldestPendingAgeMinutes: 48,
        nextRetryAt: '2026-03-13T12:15:00.000Z',
        retryableNow: 3
      }
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

describe('StatisticsPage', () => {
  it('renders the live statistics surface from admin data', async () => {
    const page = await StatisticsPage();
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Statistics');
    expect(html).toContain('Published deliveries, retries, and dead letters');
    expect(html).toContain('Platform volume');
    expect(html).toContain('Delivery state distribution');
    expect(html).toContain('Pending invitations');
    expect(html).toContain('Dead-letter events');
    expect(html).toContain('Published events');
    expect(html).toContain('Main DB invitations table');
    expect(html).toContain('Deletion queue');
    expect(html).toContain('Open deletion queue');
    expect(html).toContain('Retention policy: 90 days');
    expect(html).toContain('Outbox queue');
    expect(html).toContain('Open outbox monitor');
    expect(html).toContain('oldest pending 48 min');
    expect(getAdminStatisticsOverview).toHaveBeenCalled();
  });
});

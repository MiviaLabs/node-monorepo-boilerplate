import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../../layout';
import DeletionsPage from './page';

vi.mock('~/lib/admin', () => ({
  getAdminDeletionQueueOverview: vi.fn(async () => ({
    generatedAt: '2026-03-16T12:00:00.000Z',
    retentionDays: 90,
    purgeCron: '0 2 * * *',
    dryRun: false,
    metrics: [
      {
        key: 'pending_total',
        label: 'Waiting total',
        value: 6,
        summary: '4 users, 2 organizations'
      },
      { key: 'pending_users', label: 'Users', value: 4, summary: 'Account purge backlog' },
      {
        key: 'due_soon',
        label: 'Due within 7 days',
        value: 2,
        summary: 'Needs review before next purge window'
      },
      { key: 'overdue', label: 'Overdue', value: 1, summary: 'Past purge due date' }
    ],
    summary: {
      totalPending: 6,
      pendingUsers: 4,
      pendingOrganizations: 2,
      dueWithin7Days: 2,
      overdueCount: 1,
      retentionDays: 90
    },
    ageBuckets: [
      { key: '0_7', label: '0-7 days', value: 1 },
      { key: '8_30', label: '8-30 days', value: 2 },
      { key: '31_60', label: '31-60 days', value: 1 },
      { key: '61_90', label: '61-90 days', value: 1 },
      { key: 'overdue', label: 'Overdue', value: 1 }
    ],
    items: [
      {
        entityType: 'user',
        entityId: 123,
        organizationId: 10,
        displayLabel: 'Ariana Moore',
        secondaryLabel: 'Acme Ops',
        deletedAt: '2026-03-01T10:00:00.000Z',
        purgeDueAt: '2026-05-30T10:00:00.000Z',
        daysUntilPurge: 75,
        isOverdue: false,
        providerCleanupState: 'pending',
        providerContext: 'Provider user will be deleted during purge',
        detailHref: '/users/123'
      },
      {
        entityType: 'organization',
        entityId: 456,
        displayLabel: 'Northwind Labs',
        secondaryLabel: 'Organization record',
        deletedAt: '2025-11-01T10:00:00.000Z',
        purgeDueAt: '2026-01-30T10:00:00.000Z',
        daysUntilPurge: -14,
        isOverdue: true,
        providerCleanupState: 'not_applicable',
        providerContext: 'No provider tenant linked',
        detailHref: '/tenants/456'
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

describe('DeletionsPage', () => {
  it('renders the deletion queue surface', async () => {
    const page = await DeletionsPage({ searchParams: Promise.resolve({}) });
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Deletion queue');
    expect(html).toContain('Pending deletions');
    expect(html).toContain('Purge policy');
    expect(html).toContain('Age buckets');
    expect(html).toContain('Ariana Moore');
    expect(html).toContain('Northwind Labs');
    expect(html).toContain('/users/123');
    expect(html).toContain('/tenants/456');
  });
});

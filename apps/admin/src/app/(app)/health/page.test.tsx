import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import HealthPage from './page';

vi.mock('~/lib/admin', () => ({
  getAdminHealthOverview: vi.fn(async () => ({
    generatedAt: '2026-03-13T12:00:00.000Z',
    overallStatus: 'degraded',
    metrics: [
      { key: 'tenants_total', label: 'Tenants', value: 3, summary: '2 active' },
      { key: 'users_total', label: 'Users', value: 9, summary: '7 active' },
      { key: 'outbox_pending', label: 'Outbox pending', value: 11, summary: '3 failed events' },
      { key: 'dead_letter_total', label: 'Dead-letter events', value: 1, summary: 'Needs review' }
    ],
    services: [
      { key: 'database', label: 'Database', status: 'ok', summary: 'Reachable' },
      { key: 'redis', label: 'Redis', status: 'ok', summary: 'Cache connected' },
      { key: 'outbox', label: 'Outbox', status: 'degraded', summary: '3 failed events' }
    ],
    incidents: [
      {
        id: 'dead-letter-open',
        kind: 'dead_letter_events',
        priority: 'high',
        summary: '1 dead-letter event requires replay review',
        state: 'open',
        occurredAt: '2026-03-13T11:55:00.000Z'
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
      name: 'Ariana Moore',
      email: 'ariana.moore@mivialabs.test',
      role: 'System Owner',
      avatarFallback: 'AM',
      tenantId: 'tenant-1'
    }
  }))
}));

describe('HealthPage', () => {
  it('renders the health surface', async () => {
    const page = await HealthPage();
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Health');
    expect(html).toContain('Tenants');
    expect(html).toContain('Outbox pending');
    expect(html).toContain('Current service table');
    expect(html).toContain('Recent incident queue');
    expect(html).toContain('Database');
    expect(html).toContain('1 dead-letter event requires replay review');
  });
});

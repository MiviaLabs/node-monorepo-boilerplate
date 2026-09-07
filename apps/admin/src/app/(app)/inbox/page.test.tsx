import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import InboxPage from './page';

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

describe('InboxPage', () => {
  it('renders the authenticated inbox shell', async () => {
    const page = await InboxPage();
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('All inbox');
    expect(html).toContain('Search messages, issues, or tasks');
    expect(html).toContain('Mark done');
    expect(html).toContain('Hide details');
    expect(html).toContain('Policy bundle approval required');
  });
});

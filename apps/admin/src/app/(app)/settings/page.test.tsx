import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import AuthenticatedLayout from '../layout';
import SettingsPage from './page';

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

describe('SettingsPage', () => {
  it('renders the system settings surface', async () => {
    const page = await SettingsPage();
    const layout = await AuthenticatedLayout({ children: page });
    const html = renderToStaticMarkup(layout);

    expect(html).toContain('Settings');
    expect(html).toContain('Platform contract');
    expect(html).toContain('Account access');
    expect(html).toContain('Password policy');
    expect(html).toContain('Contract status');
    expect(html).toContain('Follow-up backend modeling');
    expect(html).not.toContain('Current defaults');
    expect(html).not.toContain('Primary rule');
    expect(html).not.toContain('Save changes');
  });
});

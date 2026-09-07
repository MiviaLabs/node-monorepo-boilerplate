import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserNav } from './user-nav';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    theme: 'light',
    setTheme: vi.fn()
  })
}));

vi.mock('~/components/ui/sidebar', () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSidebar: () => ({
    isMobile: false,
    state: 'expanded'
  })
}));

describe('UserNav', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a closed account trigger by default', () => {
    const html = renderToStaticMarkup(
      <UserNav
        user={{
          id: 'user-1',
          name: 'Ariana Moore',
          email: 'ariana.moore@mivialabs.test',
          role: 'System Owner',
          avatarFallback: 'AM',
          tenantId: 'tenant-1'
        }}
      />
    );

    expect(html).toContain('Ariana Moore');
    expect(html).toContain('System Owner');
    expect(html).not.toContain('href="/profile"');
    expect(html).not.toContain('href="/settings"');
    expect(html).not.toContain('href="/logout"');
  });
});

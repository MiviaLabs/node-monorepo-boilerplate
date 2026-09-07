import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from './layout';

const { redirectMock, getAdminSessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getAdminSessionMock: vi.fn(async () => null)
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('~/components/app-shell/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('~/lib/admin-auth', () => ({
  getAdminSession: getAdminSessionMock
}));

describe('AuthenticatedLayout', () => {
  afterEach(() => {
    redirectMock.mockReset();
    getAdminSessionMock.mockReset();
    getAdminSessionMock.mockResolvedValue(null);
  });

  it('redirects to the login screen when there is no recoverable session', async () => {
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });

    await expect(AuthenticatedLayout({ children: <div>Secure area</div> })).rejects.toThrow(
      'NEXT_REDIRECT'
    );

    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('renders protected content when a session is available', async () => {
    getAdminSessionMock.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      tenantId: '42',
      user: {
        id: 'user-1',
        name: 'Bootstrap Owner',
        email: 'owner@example.com',
        role: 'System Owner',
        avatarFallback: 'BO',
        tenantId: '42'
      }
    });

    const html = renderToStaticMarkup(
      await AuthenticatedLayout({ children: <div>Secure area</div> })
    );

    expect(html).toContain('Secure area');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

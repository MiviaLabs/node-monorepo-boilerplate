import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomePage from './page';

const { redirectMock, getBootstrapStatusMock, getAdminSessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getBootstrapStatusMock: vi.fn(async () => ({
    initialized: true,
    installAllowed: false,
    systemOwnerExists: true
  })),
  getAdminSessionMock: vi.fn(async () => null)
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('~/lib/admin-auth', () => ({
  getBootstrapStatus: getBootstrapStatusMock,
  getAdminSession: getAdminSessionMock
}));

describe('HomePage', () => {
  afterEach(() => {
    redirectMock.mockReset();
    getBootstrapStatusMock.mockReset();
    getAdminSessionMock.mockReset();
    getBootstrapStatusMock.mockResolvedValue({
      initialized: true,
      installAllowed: false,
      systemOwnerExists: true
    });
    getAdminSessionMock.mockResolvedValue(null);
  });

  it('renders the login surface when bootstrap is complete and there is no session', async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('Enter the management console.');
    expect(html).toContain('Authenticate');
    expect(html).toContain('Administrative identity checkpoint');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects to /install when bootstrap is incomplete', async () => {
    getBootstrapStatusMock.mockResolvedValue({
      initialized: false,
      installAllowed: true,
      systemOwnerExists: false
    });

    await HomePage();

    expect(redirectMock).toHaveBeenCalledWith('/install');
  });

  it('redirects to /dashboard when a session already exists', async () => {
    getAdminSessionMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
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

    await HomePage();

    expect(redirectMock).toHaveBeenCalledWith('/inbox');
  });
});

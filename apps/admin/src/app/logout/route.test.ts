import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesMock = vi.fn();
const logoutAdminSessionMock = vi.fn();
const clearSessionCookiesMock = vi.fn();
const getStoredSessionMock = vi.fn();
const deleteStoredSessionMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: cookiesMock
}));

vi.mock('../../lib/admin-auth', () => ({
  SESSION_COOKIE_NAME: 'bo_session',
  logoutAdminSession: logoutAdminSessionMock,
  clearSessionCookies: clearSessionCookiesMock
}));

vi.mock('../../lib/auth/session-store', () => ({
  getStoredSession: getStoredSessionMock,
  deleteStoredSession: deleteStoredSessionMock
}));

vi.mock('../../lib/admin-auth-core', () => ({
  ACCESS_TOKEN_COOKIE_NAME: 'admin_access_token',
  REFRESH_TOKEN_COOKIE_NAME: 'admin_refresh_token',
  TENANT_ID_COOKIE_NAME: 'admin_tenant_id'
}));

describe('/logout route', () => {
  const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterAll(() => {
    if (originalPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
    }
  });

  it('logs out server-side, deletes the redis-backed session, clears cookies, and redirects', async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === 'bo_session' ? { value: 'session-123' } : undefined)
    });
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: '42'
    });

    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost:3002/logout'));

    expect(getStoredSessionMock).toHaveBeenCalledWith('session-123');
    expect(logoutAdminSessionMock).toHaveBeenCalledWith({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: '42'
    });
    expect(deleteStoredSessionMock).toHaveBeenCalledWith('session-123');
    expect(clearSessionCookiesMock).toHaveBeenCalledWith(response);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/');
  });

  it('redirects to NEXT_PUBLIC_APP_URL when configured', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://admin.example.test';

    cookiesMock.mockResolvedValue({
      get: () => undefined
    });

    const { GET } = await import('./route');

    const response = await GET(new Request('http://0.0.0.0:3000/logout'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://admin.example.test/');
  });

  it('falls back to legacy token cookies when no redis-backed session exists', async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        (
          ({
            admin_access_token: { value: 'legacy-access-token' },
            admin_refresh_token: { value: 'legacy-refresh-token' },
            admin_tenant_id: { value: 'tenant-123' }
          }) as Record<string, { value: string }>
        )[name]
    });

    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost:3002/logout'));

    expect(logoutAdminSessionMock).toHaveBeenCalledWith({
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      tenantId: 'tenant-123'
    });
    expect(deleteStoredSessionMock).not.toHaveBeenCalled();
    expect(clearSessionCookiesMock).toHaveBeenCalledWith(response);
  });
});

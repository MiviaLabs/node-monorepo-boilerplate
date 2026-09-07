import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';

const clearPersistedWebSessionMock = vi.fn(async (response: Response) => {
  response.headers.append('set-cookie', 'web_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
});
const buildAuthenticatedProxyHeadersMock = vi.fn(async () => ({
  authorization: 'Bearer header-token',
  'x-tenant-id': 'tenant-123'
}));
const resolveRequestWebSessionMock = vi.fn();
const clearLegacyWebAuthCookiesMock = vi.fn((response: Response) => {
  response.headers.append('set-cookie', 'sessionId=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
});

vi.mock('../proxy-headers', () => ({
  buildAuthenticatedProxyHeaders: buildAuthenticatedProxyHeadersMock
}));

vi.mock('~/lib/auth/server-session', () => ({
  clearPersistedWebSession: clearPersistedWebSessionMock,
  resolveRequestWebSession: resolveRequestWebSessionMock
}));

vi.mock('~/lib/auth/cookies', async () => {
  const actual = await vi.importActual<typeof import('~/lib/auth/cookies')>('~/lib/auth/cookies');
  return {
    ...actual,
    clearLegacyWebAuthCookies: clearLegacyWebAuthCookiesMock
  };
});

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest(
  headers: Record<string, string | undefined> = {},
  cookies: Record<string, string | undefined> = {},
  body: Record<string, unknown> = {}
): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    },
    json: vi.fn(async () => body),
    nextUrl: {
      pathname: '/api/auth/logout'
    }
  } as unknown as NextRequest;
}

describe('POST /api/auth/logout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('uses the stored server session when available and clears cookies', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Logged out successfully' })
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': 'ignored-tenant'
        },
        {
          web_session: 'session-123'
        },
        {
          refreshToken: 'body-refresh-token'
        }
      )
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/sessions/close',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer stored-access-token',
          'x-tenant-id': 'tenant-123'
        }),
        body: JSON.stringify({
          refreshToken: 'stored-refresh-token'
        })
      })
    );
    expect(clearPersistedWebSessionMock).toHaveBeenCalledWith(expect.any(Response), 'session-123');
    expect(clearLegacyWebAuthCookiesMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('set-cookie')).toContain('web_session=; Max-Age=0');
  });

  it('clears the server cookie even when upstream logout fails', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Upstream failed' })
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': 'tenant-123'
        },
        { web_session: 'session-123' }
      )
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toContain('web_session=; Max-Age=0');
  });

  it('clears persisted auth cookies when the proxy throws before receiving a response', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': 'tenant-123'
        },
        { web_session: 'session-123' }
      )
    );

    expect(response.status).toBe(500);
    expect(clearPersistedWebSessionMock).toHaveBeenCalledWith(expect.any(Response), 'session-123');
    expect(clearLegacyWebAuthCookiesMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('set-cookie')).toContain('web_session=; Max-Age=0');
  });
});

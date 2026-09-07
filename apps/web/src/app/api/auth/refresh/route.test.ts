import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';

const buildAuthenticatedProxyHeadersMock = vi.fn();
const applyPersistedWebSessionMock = vi.fn(async (response: Response) => {
  response.headers.append(
    'set-cookie',
    'web_session=session-123; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax'
  );
  return {
    sessionId: 'session-123'
  };
});
const applyLegacyWebAuthCookiesMock = vi.fn((response: Response, auth: { accessToken: string }) => {
  response.headers.append(
    'set-cookie',
    `accessToken=${auth.accessToken}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax`
  );
  response.headers.append(
    'set-cookie',
    'tenantId=tenant-123; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax'
  );
});
const clearLegacyWebAuthCookiesMock = vi.fn((response: Response) => {
  response.headers.append('set-cookie', 'accessToken=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  response.headers.append('set-cookie', 'tenantId=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
});
const clearPersistedWebSessionMock = vi.fn(async (response: Response) => {
  response.headers.append('set-cookie', 'web_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
});
const resolveRequestWebSessionMock = vi.fn();

vi.mock('../proxy-headers', () => ({
  buildProxyHeaders: vi.fn(),
  buildAuthenticatedProxyHeaders: buildAuthenticatedProxyHeadersMock
}));

vi.mock('~/lib/auth/server-session', () => ({
  applyPersistedWebSession: applyPersistedWebSessionMock,
  clearPersistedWebSession: clearPersistedWebSessionMock,
  extractAuthResponseData: vi.fn((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return null;
    }

    return (payload as { data: unknown }).data;
  }),
  resolveRequestWebSession: resolveRequestWebSessionMock
}));

vi.mock('../../../../lib/auth/cookies', () => ({
  applyLegacyWebAuthCookies: applyLegacyWebAuthCookiesMock,
  clearLegacyWebAuthCookies: clearLegacyWebAuthCookiesMock
}));

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
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('POST /api/auth/refresh route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    buildAuthenticatedProxyHeadersMock.mockImplementation(
      async (
        req: NextRequest,
        options?: {
          includeTenant?: boolean;
        }
      ) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        const requestId = req.headers.get('x-request-id');
        const correlationId = req.headers.get('x-correlation-id');
        const causationId = req.headers.get('x-causation-id');
        const tenantId = req.headers.get('x-tenant-id');

        if (requestId) headers['x-request-id'] = requestId;
        if (correlationId) headers['x-correlation-id'] = correlationId;
        if (causationId) headers['x-causation-id'] = causationId;
        if (options?.includeTenant && tenantId) headers['x-tenant-id'] = tenantId;

        return headers;
      }
    );
  });

  it('prefers the stored server session when the opaque cookie exists', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    buildAuthenticatedProxyHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
      'x-request-id': 'req-123',
      'x-correlation-id': 'corr-123',
      'x-causation-id': 'cause-123',
      'x-tenant-id': 'tenant-123'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
          refreshExpiresIn: 604800,
          user: {
            tenantId: 'tenant-123'
          },
          isNewUser: false
        }
      })
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {
          'x-request-id': 'req-123',
          'x-correlation-id': 'corr-123',
          'x-causation-id': 'cause-123'
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
      'http://localhost:3001/api/v1/iam/sessions/refresh',
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: 'stored-refresh-token'
        }),
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123',
          'x-causation-id': 'cause-123'
        })
      })
    );
    expect(applyPersistedWebSessionMock).toHaveBeenCalledWith(
      expect.any(Response),
      expect.objectContaining({
        accessToken: 'new-access-token'
      }),
      'session-123'
    );
    expect(response.headers.get('set-cookie')).toContain('accessToken=new-access-token');
    expect(response.headers.get('set-cookie')).toContain('tenantId=tenant-123');
  });

  it('falls back to the request body when no stored session exists', async () => {
    resolveRequestWebSessionMock.mockResolvedValue(null);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
          refreshExpiresIn: 604800,
          user: {
            tenantId: 'tenant-456'
          },
          isNewUser: false
        }
      })
    });

    const { POST } = await import('./route');
    await POST(
      createMockRequest(
        {
          'x-tenant-id': 'tenant-456'
        },
        {},
        {
          refreshToken: 'body-refresh-token'
        }
      )
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/sessions/refresh',
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: 'body-refresh-token'
        }),
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-456'
        })
      })
    );
    expect(applyPersistedWebSessionMock).toHaveBeenCalledWith(
      expect.any(Response),
      expect.objectContaining({
        refreshToken: 'new-refresh-token'
      }),
      undefined
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy auth cookies when refreshed server session persistence fails', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    applyPersistedWebSessionMock.mockRejectedValueOnce(new Error('redis unavailable'));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
          refreshExpiresIn: 604800,
          user: {
            tenantId: 'tenant-123'
          },
          isNewUser: false
        }
      })
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest({}, { web_session: 'session-123' }, { refreshToken: 'body-refresh-token' })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('accessToken=new-access-token');
    expect(response.headers.get('set-cookie')).toContain('tenantId=tenant-123');
  });

  it('resolves the tenant header even when the local stored session lookup misses', async () => {
    resolveRequestWebSessionMock.mockResolvedValue(null);
    buildAuthenticatedProxyHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
      'x-tenant-id': 'tenant-from-session'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'id-token',
          expiresIn: 3600,
          refreshExpiresIn: 604800,
          user: {
            tenantId: 'tenant-from-session'
          },
          isNewUser: false
        }
      })
    });

    const { POST } = await import('./route');
    await POST(
      createMockRequest(
        {},
        {
          web_session: 'session-123'
        },
        {
          refreshToken: 'body-refresh-token'
        }
      )
    );

    expect(buildAuthenticatedProxyHeadersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cookies: expect.any(Object)
      }),
      { includeTenant: true }
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/sessions/refresh',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-from-session'
        })
      })
    );
  });

  it('clears the server session on explicit auth failure only', async () => {
    resolveRequestWebSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      refreshToken: 'stored-refresh-token',
      tenantId: 'tenant-123'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Refresh token invalid' })
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {},
        {
          web_session: 'session-123'
        },
        {
          refreshToken: 'body-refresh-token'
        }
      )
    );

    expect(clearPersistedWebSessionMock).toHaveBeenCalledWith(expect.any(Response), 'session-123');
    expect(response.headers.get('set-cookie')).toContain('accessToken=;');
    expect(response.status).toBe(401);
  });

  it('fails fast without calling the API when no refresh token is available', async () => {
    resolveRequestWebSessionMock.mockResolvedValue(null);
    buildAuthenticatedProxyHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json'
    });

    const { POST } = await import('./route');
    const response = await POST(
      createMockRequest(
        {},
        {
          web_session: 'session-123'
        },
        {}
      )
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(clearPersistedWebSessionMock).toHaveBeenCalledWith(expect.any(Response), undefined);
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain('accessToken=;');
    await expect(response.json()).resolves.toEqual({
      message: 'Session refresh unavailable',
      error: 'Missing refresh token'
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';

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

vi.mock('~/lib/auth/server-session', () => ({
  applyPersistedWebSession: applyPersistedWebSessionMock,
  extractAuthResponseData: vi.fn((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return null;
    }

    return (payload as { data: unknown }).data;
  })
}));

vi.mock('../../../../lib/auth/cookies', () => ({
  applyLegacyWebAuthCookies: applyLegacyWebAuthCookiesMock
}));

vi.mock('../proxy-headers', () => ({
  buildProxyHeaders: vi.fn((req: NextRequest) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    for (const name of [
      'x-tenant-id',
      'x-request-id',
      'x-correlation-id',
      'x-causation-id'
    ] as const) {
      const value = req.headers.get(name);
      if (value) {
        headers[name] = value;
      }
    }

    return headers;
  })
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
  body: Record<string, unknown> = {}
): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('POST /api/auth/login route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('persists a server-owned session and preserves the auth payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
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
          'x-tenant-id': 'tenant-123',
          'x-request-id': 'req-123',
          'x-correlation-id': 'corr-123',
          'x-causation-id': 'cause-123'
        },
        {
          email: 'owner@example.com',
          password: 'Password123!'
        }
      )
    );

    expect(applyPersistedWebSessionMock).toHaveBeenCalledWith(
      expect.any(Response),
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      })
    );
    expect(response.headers.get('set-cookie')).toContain('accessToken=access-token');
    expect(response.headers.get('set-cookie')).toContain('tenantId=tenant-123');
    expect(await response.json()).toEqual({
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 604800,
        user: {
          tenantId: 'tenant-123'
        },
        isNewUser: false
      }
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123',
          'x-request-id': 'req-123',
          'x-correlation-id': 'corr-123',
          'x-causation-id': 'cause-123'
        })
      })
    );
  });

  it('falls back to legacy auth cookies when server session persistence fails', async () => {
    applyPersistedWebSessionMock.mockRejectedValueOnce(new Error('redis unavailable'));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
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
      createMockRequest({}, { email: 'owner@example.com', password: 'Password123!' })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('accessToken=access-token');
    expect(response.headers.get('set-cookie')).toContain('tenantId=tenant-123');
    expect(response.headers.get('set-cookie')).not.toContain('web_session=session-123');
    expect(await response.json()).toEqual({
      data: expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      })
    });
  });
});

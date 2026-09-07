import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStoredSessionMock = vi.fn();
const deleteStoredSessionMock = vi.fn();
const getStoredSessionMock = vi.fn();
const hasStoredSessionChangedMock = vi.fn();
const normalizeRefreshSessionTtlMock = vi.fn((ttl?: number) => ttl ?? 604800);
const validateSessionMock = vi.fn();

vi.mock('./session-store', () => ({
  createStoredSession: createStoredSessionMock,
  deleteStoredSession: deleteStoredSessionMock,
  getStoredSession: getStoredSessionMock,
  hasStoredSessionChanged: hasStoredSessionChangedMock,
  normalizeRefreshSessionTtl: normalizeRefreshSessionTtlMock
}));

vi.mock('./server-auth', () => ({
  validateSession: validateSessionMock
}));

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

describe('server-session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasStoredSessionChangedMock.mockResolvedValue(false);
    global.fetch = vi.fn();
  });

  it('persists the server session and applies the opaque cookie to the response', async () => {
    createStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      user: {
        tenantId: 'tenant-123'
      },
      refreshExpiresAt: '2099-03-29T00:00:00.000Z'
    });

    const { applyPersistedWebSession } = await import('./server-session');
    const response = NextResponse.json({ ok: true });

    await applyPersistedWebSession(
      response,
      {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 604800,
        user: {
          tenantId: 'tenant-123'
        },
        isNewUser: false
      },
      'session-123'
    );

    expect(createStoredSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-123',
        tenantId: 'tenant-123'
      })
    );
    expect(response.headers.get('set-cookie')).toContain('web_session=session-123');
  });

  it('deletes sessions whose refresh ttl is already dead', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      user: {
        tenantId: 'tenant-123'
      },
      expiresAt: '2026-03-29T00:00:00.000Z',
      refreshExpiresAt: '2000-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    });

    const { resolveWebSessionById } = await import('./server-session');
    const result = await resolveWebSessionById('session-123');

    expect(deleteStoredSessionMock).toHaveBeenCalledWith('session-123');
    expect(result).toEqual({
      session: null,
      refreshed: false
    });
  });

  it('rotates the stored session when validation fails and refresh succeeds', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      user: {
        tenantId: 'tenant-123'
      },
      expiresAt: '2026-03-29T00:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    });
    validateSessionMock.mockResolvedValue({
      valid: false
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );
    createStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      tenantId: 'tenant-123',
      user: {
        tenantId: 'tenant-123'
      },
      expiresAt: '2026-03-29T01:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:10:00.000Z'
    });

    const { resolveWebSessionById } = await import('./server-session');
    const result = await resolveWebSessionById('session-123');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/sessions/refresh',
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: 'refresh-token'
        })
      })
    );
    expect(createStoredSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-123',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      })
    );
    expect(result).toEqual({
      session: expect.objectContaining({
        accessToken: 'new-access-token'
      }),
      refreshed: true
    });
  });

  it('retries once when another request already rotated the stored session', async () => {
    getStoredSessionMock
      .mockResolvedValueOnce({
        sessionId: 'session-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tenantId: 'tenant-123',
        user: {
          tenantId: 'tenant-123'
        },
        expiresAt: '2026-03-29T00:00:00.000Z',
        refreshExpiresAt: '2099-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z'
      })
      .mockResolvedValueOnce({
        sessionId: 'session-123',
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        tenantId: 'tenant-123',
        user: {
          tenantId: 'tenant-123'
        },
        expiresAt: '2026-03-29T01:00:00.000Z',
        refreshExpiresAt: '2099-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:05:00.000Z'
      });
    validateSessionMock
      .mockResolvedValueOnce({
        valid: false
      })
      .mockResolvedValueOnce({
        valid: true
      });
    hasStoredSessionChangedMock.mockResolvedValue(true);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Refresh token invalid' }), {
        status: 401,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const { resolveWebSessionById } = await import('./server-session');
    const result = await resolveWebSessionById('session-123');

    expect(hasStoredSessionChangedMock).toHaveBeenCalledWith(
      'session-123',
      '2026-03-29T00:00:00.000Z'
    );
    expect(result).toEqual({
      session: expect.objectContaining({
        accessToken: 'fresh-access-token'
      }),
      refreshed: false
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStoredSessionMock = vi.fn();
const deleteStoredSessionMock = vi.fn();
const getStoredSessionMock = vi.fn();
const hasStoredSessionChangedMock = vi.fn();

vi.mock('./session-store', () => ({
  createStoredSession: createStoredSessionMock,
  deleteStoredSession: deleteStoredSessionMock,
  getStoredSession: getStoredSessionMock,
  hasStoredSessionChanged: hasStoredSessionChangedMock
}));

describe('resolveServerSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasStoredSessionChangedMock.mockResolvedValue(false);
    process.env.API_URL = 'http://api.internal';
    global.fetch = vi.fn();
  });

  it('returns a valid request session when the access token validates', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            valid: true,
            user: {
              userId: '7',
              email: 'user@example.com',
              tenantId: '42'
            }
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { resolveServerSession } = await import('./server-auth');
    const result = await resolveServerSession({
      accessToken: 'access-token',
      tenantId: '42'
    });

    expect(result).toEqual({
      status: 'valid',
      accessToken: 'access-token',
      tenantId: '42',
      sessionId: undefined,
      user: {
        userId: '7',
        email: 'user@example.com',
        tenantId: '42'
      }
    });
    expect(getStoredSessionMock).not.toHaveBeenCalled();
  });

  it('refreshes the stored session once and revalidates when the request token is expired', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'web-session-id',
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
      tenantId: '42',
      user: {
        tenantId: '42'
      },
      expiresAt: '2026-03-29T00:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    });
    createStoredSessionMock.mockResolvedValue({
      sessionId: 'web-session-id',
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      tenantId: '42',
      user: {
        tenantId: '42'
      },
      expiresAt: '2026-03-29T01:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:10:00.000Z'
    });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { valid: false } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accessToken: 'fresh-access-token',
              refreshToken: 'fresh-refresh-token',
              idToken: 'id-token',
              expiresIn: 3600,
              refreshExpiresIn: 604800,
              user: {
                userId: '7',
                email: 'user@example.com',
                tenantId: '42',
                roles: [],
                permissions: [],
                emailVerified: true
              },
              isNewUser: false
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              valid: true,
              user: {
                userId: '7',
                email: 'user@example.com',
                tenantId: '42'
              }
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      );

    const { resolveServerSession } = await import('./server-auth');
    const result = await resolveServerSession({
      accessToken: 'expired-access-token',
      tenantId: '42',
      webSessionId: 'web-session-id'
    });

    expect(createStoredSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'web-session-id',
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token'
      })
    );
    expect(result).toEqual({
      status: 'refreshed',
      accessToken: 'fresh-access-token',
      tenantId: '42',
      sessionId: 'web-session-id',
      user: {
        userId: '7',
        email: 'user@example.com',
        tenantId: '42'
      }
    });
  });

  it('deletes the stored session when refresh fails with auth-invalid status', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'web-session-id',
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
      tenantId: '42',
      user: {
        tenantId: '42'
      },
      expiresAt: '2026-03-29T00:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { valid: false } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Refresh token invalid' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      );

    const { resolveServerSession } = await import('./server-auth');
    const result = await resolveServerSession({
      accessToken: 'expired-access-token',
      tenantId: '42',
      webSessionId: 'web-session-id'
    });

    expect(deleteStoredSessionMock).toHaveBeenCalledWith('web-session-id');
    expect(result).toEqual({
      status: 'auth_invalid'
    });
  });

  it('returns transient failure without deleting the stored session on non-auth validate failures', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'web-session-id',
      accessToken: 'stored-access-token',
      refreshToken: 'refresh-token',
      tenantId: '42',
      user: {
        tenantId: '42'
      },
      expiresAt: '2026-03-29T00:00:00.000Z',
      refreshExpiresAt: '2099-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('upstream unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' }
      })
    );

    const { resolveServerSession } = await import('./server-auth');
    const result = await resolveServerSession({
      webSessionId: 'web-session-id'
    });

    expect(result).toEqual({
      status: 'transient_failure',
      accessToken: 'stored-access-token',
      tenantId: '42',
      sessionId: 'web-session-id'
    });
    expect(deleteStoredSessionMock).not.toHaveBeenCalled();
  });
});

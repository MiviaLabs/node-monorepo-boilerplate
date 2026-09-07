import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminResolvedSessionMock = vi.fn();

vi.mock('./auth/server-session', () => ({
  getAdminResolvedSession: getAdminResolvedSessionMock
}));

describe('admin-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.API_URL = 'http://localhost:3000';
  });

  it('unwraps the API envelope for bootstrap status responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            initialized: false,
            installAllowed: true,
            systemOwnerExists: false
          }
        })
      }))
    );

    const { getBootstrapStatus } = await import('./admin-auth');

    await expect(getBootstrapStatus()).resolves.toEqual({
      initialized: false,
      installAllowed: true,
      systemOwnerExists: false
    });
  });

  it('normalizes API_URL values that already include /api', async () => {
    process.env.API_URL = 'https://api.example.test/api';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: {
          initialized: false,
          installAllowed: true,
          systemOwnerExists: false
        }
      })
    }));

    vi.stubGlobal('fetch', fetchMock);

    const { getBootstrapStatus } = await import('./admin-auth');

    await getBootstrapStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/setup/status',
      expect.objectContaining({
        cache: 'no-store'
      })
    );
  });

  it('normalizes API_URL values that already include /api/v1', async () => {
    process.env.API_URL = 'https://api.example.test/api/v1';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: {
          initialized: false,
          installAllowed: true,
          systemOwnerExists: false
        }
      })
    }));

    vi.stubGlobal('fetch', fetchMock);

    const { getBootstrapStatus } = await import('./admin-auth');

    await getBootstrapStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/setup/status',
      expect.objectContaining({
        cache: 'no-store'
      })
    );
  });

  it('unwraps the API envelope for login responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            user: {
              email: 'owner@example.com',
              roles: ['system_owner'],
              tenantId: '42',
              userId: 'user-1',
              username: 'bootstrap owner'
            }
          }
        })
      }))
    );

    const { loginWithPassword } = await import('./admin-auth');

    await expect(
      loginWithPassword({
        email: 'owner@example.com',
        password: 'Password123!'
      })
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: '42',
      expiresIn: 3600,
      refreshExpiresIn: 604800,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        tenantId: '42',
        role: 'System Owner'
      }
    });
  });

  it('delegates current-session lookup to the redis-backed server session resolver', async () => {
    getAdminResolvedSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: '42',
      expiresAt: '2026-03-13T00:00:00.000Z',
      refreshExpiresAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
      user: {
        userId: 'user-1',
        actorId: 'actor-1',
        email: 'owner@example.com',
        name: 'Bootstrap Owner',
        displayName: 'Bootstrap Owner',
        role: 'system_owner',
        roleLabel: 'System Owner',
        roles: ['system_owner'],
        permissions: ['operators:read'],
        tenantId: '42',
        avatarFallback: 'BO'
      }
    });

    const { getAdminSession } = await import('./admin-auth');

    await expect(getAdminSession()).resolves.toMatchObject({
      sessionId: 'session-123',
      accessToken: 'access-token',
      tenantId: '42',
      user: {
        userId: 'user-1',
        email: 'owner@example.com',
        roleLabel: 'System Owner'
      }
    });
    expect(getAdminResolvedSessionMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to default cookie lifetimes when refresh expiry values are zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 0,
            refreshExpiresIn: 0,
            user: {
              email: 'owner@example.com',
              roles: ['system_owner'],
              tenantId: '42',
              userId: 'user-1',
              username: 'bootstrap owner'
            }
          }
        })
      }))
    );

    const { loginWithPassword } = await import('./admin-auth');

    await expect(
      loginWithPassword({
        email: 'owner@example.com',
        password: 'Password123!'
      })
    ).resolves.toMatchObject({
      expiresIn: 3600,
      refreshExpiresIn: 604800
    });
  });
});

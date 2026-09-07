import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authRouter } from './auth';

describe('admin authRouter', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it('uses the configured app origin instead of forwarded host headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ data: { success: true } })
      }))
    );

    const caller = authRouter.createCaller({
      headers: new Headers({
        host: 'attacker.example',
        'x-forwarded-host': 'evil.example',
        cookie: 'bo_session=session-123'
      }),
      resHeaders: new Headers()
    });

    await caller.logout();

    expect(fetch).toHaveBeenCalledWith('http://localhost:3002/api/auth/logout', expect.anything());
  });

  it('updates the current operator profile through the admin proxy route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: {
            userId: 'user-123',
            actorId: 'actor-123',
            email: 'owner@example.com',
            name: 'Updated Owner',
            displayName: 'Updated Owner',
            phoneNumber: '+14155552671',
            role: 'system_owner',
            roleLabel: 'System Owner',
            roles: ['system_owner'],
            permissions: ['operators:read'],
            tenantId: 'tenant-123',
            avatarFallback: 'UO'
          }
        })
      }))
    );

    const caller = authRouter.createCaller({
      headers: new Headers({
        host: 'localhost:3002',
        cookie: 'bo_session=session-123'
      }),
      resHeaders: new Headers()
    });

    const result = await caller.updateMyProfile({
      displayName: 'Updated Owner',
      phoneNumber: '+14155552671'
    });

    expect(result.displayName).toBe('Updated Owner');
    expect(result.phoneNumber).toBe('+14155552671');
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/auth/me', {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'bo_session=session-123'
      },
      body: JSON.stringify({
        displayName: 'Updated Owner',
        phoneNumber: '+14155552671'
      })
    });
  });

  it('preserves unauthorized failures from the profile proxy route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          message: 'Authentication required'
        })
      }))
    );

    const caller = authRouter.createCaller({
      headers: new Headers({
        host: 'localhost:3002'
      }),
      resHeaders: new Headers()
    });

    await expect(
      caller.updateMyProfile({
        displayName: 'Updated Owner',
        phoneNumber: ''
      })
    ).rejects.toThrow('Authentication required');
  });
});

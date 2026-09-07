import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from './route';

import type { NextRequest } from 'next/server';

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

describe('PATCH /api/auth/me/password route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards auth headers and password payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid password payload' })
    });

    const req = createMockRequest(
      {
        authorization: 'Bearer header-token',
        'x-tenant-id': '123'
      },
      {},
      {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!'
      }
    );

    const res = await PATCH(req);
    const json = (await res.json()) as { message: string };

    expect(json.message).toBe('Invalid password payload');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/identity/credentials',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!'
        })
      })
    );
  });

  it('returns 204 when backend returns no content', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204
    });

    const req = createMockRequest(
      {},
      {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!'
      }
    );

    const res = await PATCH(req);
    expect(res.status).toBe(204);
  });
});

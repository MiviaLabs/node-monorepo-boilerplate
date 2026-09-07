import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from './route';

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
  cookies: Record<string, string | undefined> = {}
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
    }
  } as unknown as NextRequest;
}

describe('PATCH /api/auth/me/avatar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards auth headers and fileId body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { photoUrl: 'https://signed.example.test/avatar.png' } })
    });

    const req = {
      ...createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        },
        {}
      ),
      json: vi.fn(async () => ({ fileId: 301 }))
    } as unknown as NextRequest;

    const res = await PATCH(req);
    const json = (await res.json()) as { data: { photoUrl: string } };

    expect(json.data.photoUrl).toBe('https://signed.example.test/avatar.png');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/identity/avatar',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ fileId: 301 })
      })
    );
  });
});

describe('DELETE /api/auth/me/avatar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards auth headers to remove the current avatar', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          avatarFileId: null,
          photoUrl: null
        }
      })
    });

    const req = createMockRequest(
      {
        authorization: 'Bearer header-token',
        'x-tenant-id': '123'
      },
      {}
    );

    const res = await DELETE(req);
    const json = (await res.json()) as { data: { avatarFileId: null; photoUrl: null } };

    expect(json.data.avatarFileId).toBeNull();
    expect(json.data.photoUrl).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/identity/avatar',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        })
      })
    );
  });
});

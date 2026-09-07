import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from './route';

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

describe('GET /api/tenants/current route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards authorization and tenant headers from request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 1, name: 'System Name', displayName: 'Org Name' } })
    });

    const req = createMockRequest({
      authorization: 'Bearer header-token',
      'x-tenant-id': '123'
    });

    const res = await GET(req);
    const json = (await res.json()) as { data: { id: number } };

    expect(json.data.id).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/workspaces/current',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        })
      })
    );
  });
});

describe('PATCH /api/tenants/current route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards auth/tenant headers and request body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { displayName: 'Updated Org' } })
    });

    const req = {
      ...createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        },
        {}
      ),
      json: vi.fn(async () => ({ displayName: 'Updated Org' }))
    } as unknown as NextRequest;

    const res = await PATCH(req);
    const json = (await res.json()) as { data: { displayName: string } };

    expect(json.data.displayName).toBe('Updated Org');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/workspaces/current',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ displayName: 'Updated Org' })
      })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest({
  headers = {},
  cookies = {},
  body
}: {
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  body?: unknown;
} = {}): NextRequest {
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

describe('issue item proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards PATCH requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 7, status: 'done' } })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      body: {
        status: 'done',
        priority: 'high'
      }
    });

    await PATCH(req, { params: Promise.resolve({ id: '7' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/7',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        }),
        body: JSON.stringify({
          status: 'done',
          priority: 'high'
        })
      })
    );
  });

  it('forwards GET requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 7, title: 'Issue 7' } })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      }
    });

    await GET(req, { params: Promise.resolve({ id: '7' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/7',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        })
      })
    );
  });

  it('forwards DELETE requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      }
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: '7' }) });

    expect(res.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/7',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        })
      })
    );
  });
});

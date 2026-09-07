import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

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
  search = '',
  body
}: {
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  search?: string;
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
    nextUrl: new URL(`http://localhost:3000/api/issues${search}`),
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('issues proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards GET requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 1 }] })
    });

    const req = createMockRequest({
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': '123'
      },
      search: '?page=2'
    });

    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets?page=2',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'x-tenant-id': '123'
        })
      })
    );
  });

  it('forwards POST requests with cookie-derived auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 8 } })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      body: {
        title: 'Untitled issue',
        projectId: 3
      }
    });

    await POST(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        }),
        body: JSON.stringify({
          title: 'Untitled issue',
          projectId: 3
        })
      })
    );
  });
});

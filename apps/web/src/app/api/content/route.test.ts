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
    nextUrl: new URL(`http://localhost:3000/api/content${search}`),
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('content proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards list queries and auth headers in GET requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 1, slug: 'alpha' }] })
    });

    const req = createMockRequest({
      headers: {
        authorization: 'Bearer header-token',
        'x-tenant-id': '123'
      },
      search: '?projectId=42'
    });

    const res = await GET(req);
    const json = (await res.json()) as { data: Array<{ id: number; slug: string }> };

    expect(json.data[0]?.slug).toBe('alpha');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages?projectId=42',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        })
      })
    );
  });

  it('forwards content creation body and cookie-derived auth in POST requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 9, slug: 'untitled-9' } })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      body: {
        title: 'Untitled',
        contentMarkdown: '# Untitled',
        projectId: 42,
        parentId: 7
      }
    });

    const res = await POST(req);
    const json = (await res.json()) as { data: { id: number; slug: string } };

    expect(json.data.id).toBe(9);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        }),
        body: JSON.stringify({
          title: 'Untitled',
          contentMarkdown: '# Untitled',
          projectId: 42,
          parentId: 7
        })
      })
    );
  });
});

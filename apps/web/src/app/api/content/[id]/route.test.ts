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

describe('content item proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards slug-aware PATCH payloads with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 5, slug: 'launch-plan', title: 'Launch Plan' }
      })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      body: {
        baseRevision: '2026-03-21T01:00:00.000Z',
        title: 'Launch Plan',
        contentMarkdown: '# Launch Plan',
        slug: 'launch-plan',
        position: 2
      }
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '5' }) });
    const json = (await res.json()) as { data: { id: number; slug: string } };

    expect(json.data.slug).toBe('launch-plan');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/5',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        }),
        body: JSON.stringify({
          baseRevision: '2026-03-21T01:00:00.000Z',
          title: 'Launch Plan',
          contentMarkdown: '# Launch Plan',
          slug: 'launch-plan',
          position: 2
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

    const res = await DELETE(req, { params: Promise.resolve({ id: '5' }) });

    expect(res.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/5',
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

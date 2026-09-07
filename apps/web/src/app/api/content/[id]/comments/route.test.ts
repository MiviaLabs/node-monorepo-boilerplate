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

describe('content comments proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards GET requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 91,
          contentEntryId: 123,
          bodyMarkdown: 'Looks good.'
        }
      ]
    });

    const response = await GET(
      createMockRequest({
        cookies: {
          accessToken: 'cookie-token',
          tenantId: '456'
        }
      }),
      { params: Promise.resolve({ id: '123' }) }
    );

    const json = (await response.json()) as Array<{ id: number; bodyMarkdown: string }>;
    expect(json[0]?.id).toBe(91);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/123/comments',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        })
      })
    );
  });

  it('forwards POST requests with body markdown and auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 92,
          contentEntryId: 123,
          bodyMarkdown: 'New comment',
          canDelete: true
        }
      })
    });

    const response = await POST(
      createMockRequest({
        headers: {
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        },
        body: {
          bodyMarkdown: 'New comment'
        }
      }),
      { params: Promise.resolve({ id: '123' }) }
    );

    const json = (await response.json()) as { data: { id: number; bodyMarkdown: string } };
    expect(json.data.id).toBe(92);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/123/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ bodyMarkdown: 'New comment' })
      })
    );
  });
});

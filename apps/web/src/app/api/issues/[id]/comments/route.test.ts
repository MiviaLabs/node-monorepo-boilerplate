import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

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

describe('issue comments proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards POST comment requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 7, comments: [] } })
    });

    const req = createMockRequest({
      cookies: {
        accessToken: 'cookie-token',
        tenantId: '456'
      },
      body: {
        bodyMarkdown: 'Looks good.'
      }
    });

    await POST(req, { params: Promise.resolve({ id: '7' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/7/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        }),
        body: JSON.stringify({
          bodyMarkdown: 'Looks good.'
        })
      })
    );
  });
});

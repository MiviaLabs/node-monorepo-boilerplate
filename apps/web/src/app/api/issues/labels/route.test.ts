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
  cookies = {},
  body
}: {
  cookies?: Record<string, string | undefined>;
  body?: unknown;
} = {}): NextRequest {
  return {
    headers: { get: () => null },
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    },
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('issue labels proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards GET requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 3 }] })
    });

    await GET(
      createMockRequest({
        cookies: {
          accessToken: 'cookie-token',
          tenantId: '456'
        }
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/labels',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        })
      })
    );
  });

  it('forwards POST requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 3 } })
    });

    await POST(
      createMockRequest({
        cookies: {
          accessToken: 'cookie-token',
          tenantId: '456'
        },
        body: { name: 'Frontend', color: '#38bdf8' }
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/labels',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Frontend', color: '#38bdf8' })
      })
    );
  });
});

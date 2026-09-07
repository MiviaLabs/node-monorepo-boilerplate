import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest(headers: Record<string, string | undefined> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    cookies: {
      get: () => undefined
    }
  } as unknown as NextRequest;
}

describe('GET /api/storage/files/[id]/download-url route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards download-url requests with auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { url: 'https://signed.example.test/design-spec.pdf', method: 'GET' }
      })
    });

    const req = createMockRequest({
      authorization: 'Bearer header-token',
      'x-tenant-id': '123'
    });

    await GET(req, {
      params: Promise.resolve({ id: '301' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/objects/301/download-url',
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

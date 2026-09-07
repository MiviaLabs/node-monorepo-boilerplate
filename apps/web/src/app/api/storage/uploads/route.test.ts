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

describe('POST /api/storage/uploads route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards reservation payload and auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          file: { id: 301 },
          upload: { url: '/v1/objects/uploads/301/content' }
        }
      })
    });

    const req = {
      ...createMockRequest(
        {
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        },
        {}
      ),
      json: vi.fn(async () => ({
        purpose: 'user_avatar',
        originalFilename: 'avatar.png',
        mimeType: 'image/png',
        byteSize: 1024,
        transport: 'api_proxy'
      }))
    } as unknown as NextRequest;

    await POST(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/objects/uploads',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({
          purpose: 'user_avatar',
          originalFilename: 'avatar.png',
          mimeType: 'image/png',
          byteSize: 1024,
          transport: 'api_proxy'
        })
      })
    );
  });
});

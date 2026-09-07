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

function createMockRequest(cookies: Record<string, string | undefined> = {}): NextRequest {
  return {
    headers: {
      get: () => null
    },
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    }
  } as unknown as NextRequest;
}

describe('issue attachment content proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards GET attachment content requests with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: new ReadableStream(),
      headers: {
        get: (name: string) => {
          const headers = {
            'content-type': 'application/pdf',
            'content-disposition': 'attachment; filename="design-spec.pdf"'
          } as const;

          return headers[name as keyof typeof headers] ?? null;
        }
      }
    });

    const response = await GET(
      createMockRequest({
        accessToken: 'cookie-token',
        tenantId: '456'
      }),
      { params: Promise.resolve({ id: '7', attachmentId: '51' }) }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/7/attachments/51/content',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer cookie-token',
          'x-tenant-id': '456'
        })
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
  });
});

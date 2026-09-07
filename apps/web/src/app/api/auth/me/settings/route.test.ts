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

describe('GET /api/auth/me/settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards authorization and tenant headers from request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          sidebarSectionOrder: ['organization', 'yourWork'],
          dashboardDefaultView: 'projects'
        }
      })
    });

    const req = createMockRequest({
      authorization: 'Bearer header-token',
      'x-tenant-id': '123'
    });

    const res = await GET(req);
    const json = (await res.json()) as {
      data: { sidebarSectionOrder: string[]; dashboardDefaultView: string };
    };

    expect(json.data.sidebarSectionOrder).toEqual(['organization', 'yourWork']);
    expect(json.data.dashboardDefaultView).toBe('projects');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/iam/identity/preferences',
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

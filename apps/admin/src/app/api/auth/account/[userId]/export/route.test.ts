import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminRequestHeadersMock = vi.fn();
const getVersionedApiBaseUrlMock = vi.fn(() => 'http://api.test/v2');
const fetchMock = vi.fn();

vi.mock('~/lib/admin', () => ({
  getAdminRequestHeaders: getAdminRequestHeadersMock
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: getVersionedApiBaseUrlMock
}));

describe('GET /api/auth/account/[userId]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns 401 when no operator session headers are available', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/auth/account/42/export') as never,
      { params: Promise.resolve({ userId: '42' }) }
    );

    expect(response.status).toBe(401);
  });

  it('proxies export requests and returns a downloadable JSON response', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({
        authorization: 'Bearer token',
        'x-tenant-id': 'tenant-1'
      })
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { user: { id: '42' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      })
    );

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/auth/account/42/export') as never,
      { params: Promise.resolve({ userId: '42' }) }
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/iam/account/42/export', {
      method: 'GET',
      headers: expect.any(Headers),
      cache: 'no-store'
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="user-42-export.json"'
    );
    await expect(response.text()).resolves.toContain('"id":"42"');
  });
});

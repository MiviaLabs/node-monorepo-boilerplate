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

describe('DELETE /api/auth/sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns 401 when no operator session headers are available', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request('http://localhost/api/auth/sessions/sess-1') as never,
      {
        params: Promise.resolve({ sessionId: 'sess-1' })
      }
    );

    expect(response.status).toBe(401);
  });

  it('proxies revoke requests and returns 204 on success', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({
        authorization: 'Bearer token',
        'x-tenant-id': 'tenant-1'
      })
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request('http://localhost/api/auth/sessions/sess-1') as never,
      {
        params: Promise.resolve({ sessionId: 'sess-1' })
      }
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/iam/sessions/sess-1', {
      method: 'DELETE',
      headers: expect.any(Headers),
      cache: 'no-store'
    });
    expect(response.status).toBe(204);
  });
});

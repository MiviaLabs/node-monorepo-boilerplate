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

describe('PATCH /api/system/tenants/[tenantId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns 401 when no operator session headers are available', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request('http://localhost/api/system/tenants/42', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ tenantId: '42' }) }
    );

    expect(response.status).toBe(401);
  });

  it('forwards tenant update requests to the backend system endpoint', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: 42, name: 'Acme Updated', slug: 'acme-updated', status: 'suspended' }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request('http://localhost/api/system/tenants/42', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme Updated', status: 'suspended' })
      }) as never,
      { params: Promise.resolve({ tenantId: '42' }) }
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/platform/workspaces/42', {
      method: 'PATCH',
      headers: expect.any(Headers),
      cache: 'no-store',
      body: JSON.stringify({ name: 'Acme Updated', status: 'suspended' })
    });
    expect(response.status).toBe(200);
  });
});

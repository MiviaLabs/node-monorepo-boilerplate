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

describe('POST /api/system/tenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns 401 when no operator session headers are available', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/system/tenants', { method: 'POST' }) as never
    );

    expect(response.status).toBe(401);
  });

  it('forwards tenant creation requests to the backend system endpoint', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: 77, name: 'Acme', slug: 'acme', status: 'active' } }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/system/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', slug: 'acme' })
      }) as never
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/platform/workspaces', {
      method: 'POST',
      headers: expect.any(Headers),
      cache: 'no-store',
      body: JSON.stringify({ name: 'Acme', slug: 'acme' })
    });
    expect(response.status).toBe(201);
  });
});

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

describe('POST /api/system/event-replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('forwards replay start requests to the backend replay endpoint', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { replayId: 'replay-123', status: 'running' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/system/event-replay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: 'tenant-1', maxEvents: 10 })
    });

    const response = await POST(request as never);

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/platform/event-replay', {
      method: 'POST',
      headers: expect.any(Headers),
      cache: 'no-store',
      body: JSON.stringify({ tenantId: 'tenant-1', maxEvents: 10 })
    });
    expect(response.status).toBe(201);
  });
});

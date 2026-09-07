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

describe('DELETE /api/system/dead-letter/[eventId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('forwards delete requests to the backend dead-letter endpoint', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { DELETE } = await import('./route');

    const response = await DELETE(new Request('http://localhost') as never, {
      params: Promise.resolve({ eventId: 'evt-123' })
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/console/queues/dead-letters/evt-123', {
      method: 'DELETE',
      headers: expect.any(Headers),
      cache: 'no-store'
    });
    expect(response.status).toBe(204);
  });

  it('returns 401 when the operator session is missing', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost') as never, {
      params: Promise.resolve({ eventId: 'evt-123' })
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Authentication required' });
  });
});

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

describe('POST /api/system/event-replay/[replayId]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('forwards cancel requests to the backend replay endpoint', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { success: true, message: 'Replay cancelled successfully' } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }) as never, {
      params: Promise.resolve({ replayId: 'replay-123' })
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v2/platform/event-replay/replay-123/cancel', {
      method: 'POST',
      headers: expect.any(Headers),
      cache: 'no-store'
    });
    expect(response.status).toBe(200);
  });
});

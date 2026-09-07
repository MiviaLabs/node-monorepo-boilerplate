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

describe('POST /api/system/dead-letter/[eventId]/replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('forwards replay requests and preserves false-success payloads', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(
      new Headers({ authorization: 'Bearer token' })
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            eventId: 'evt-123',
            success: false,
            message: 'Failed to queue event for replay'
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }) as never, {
      params: Promise.resolve({ eventId: 'evt-123' })
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v2/console/queues/dead-letters/evt-123/replay',
      {
        method: 'POST',
        headers: expect.any(Headers),
        cache: 'no-store'
      }
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        eventId: 'evt-123',
        success: false,
        message: 'Failed to queue event for replay'
      }
    });
  });
});

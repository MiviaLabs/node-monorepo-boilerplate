import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { getAdminRequestHeadersMock, getVersionedApiBaseUrlMock } = vi.hoisted(() => ({
  getAdminRequestHeadersMock: vi.fn(),
  getVersionedApiBaseUrlMock: vi.fn()
}));

vi.mock('~/lib/admin', () => ({
  getAdminRequestHeaders: getAdminRequestHeadersMock
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: getVersionedApiBaseUrlMock
}));

describe('email webhook reprocess proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    getVersionedApiBaseUrlMock.mockReturnValue('https://api.mivia.test/v2');
  });

  it('returns 401 when admin auth headers are missing', async () => {
    getAdminRequestHeadersMock.mockResolvedValue(undefined);

    const response = await POST({} as never, {
      params: Promise.resolve({ eventId: '77' })
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Authentication required'
    });
  });

  it('forwards the reprocess request to the versioned api', async () => {
    const headers = new Headers({
      authorization: 'Bearer token',
      'x-tenant-id': 'tenant-1'
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({
        data: {
          webhookEventId: 77,
          reprocessed: true
        }
      }))
    });

    getAdminRequestHeadersMock.mockResolvedValue(headers);
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST({} as never, {
      params: Promise.resolve({ eventId: '77' })
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mivia.test/v2/console/inbound-mail/77/reprocess',
      expect.objectContaining({
        method: 'POST',
        headers,
        cache: 'no-store'
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        webhookEventId: 77,
        reprocessed: true
      }
    });
  });

  it('propagates backend failure status', async () => {
    const headers = new Headers({
      authorization: 'Bearer token',
      'x-tenant-id': 'tenant-1'
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409
    });

    getAdminRequestHeadersMock.mockResolvedValue(headers);
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST({} as never, {
      params: Promise.resolve({ eventId: '77' })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to reprocess email webhook (409)'
    });
  });
});

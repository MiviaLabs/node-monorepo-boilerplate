import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const getAdminSessionMock = vi.fn();

vi.mock('../admin-auth', () => ({
  getAdminSession: getAdminSessionMock
}));

vi.mock('../api-client', () => ({
  apiFetch: apiFetchMock
}));

describe('admin api client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards access token and tenant context for server-side admin reads', async () => {
    getAdminSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      tenantId: 'tenant-123',
      user: {
        userId: 'user-123'
      }
    });
    apiFetchMock.mockResolvedValue({
      data: {
        generatedAt: '2026-03-13T00:00:00.000Z',
        overallStatus: 'ok',
        metrics: [],
        services: [],
        incidents: []
      }
    });

    const { getAdminHealthOverview } = await import('./api');
    const result = await getAdminHealthOverview();

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/console/health',
      credentials: 'include',
      headers: expect.any(Headers)
    });

    const requestHeaders = apiFetchMock.mock.calls[0]?.[0]?.headers as Headers;
    expect(requestHeaders.get('authorization')).toBe('Bearer access-token');
    expect(requestHeaders.get('x-tenant-id')).toBe('tenant-123');
    expect(result.overallStatus).toBe('ok');
  });

  it('serializes admin email webhook query params', async () => {
    getAdminSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      tenantId: 'tenant-123',
      user: {
        userId: 'user-123'
      }
    });
    apiFetchMock.mockResolvedValue({
      data: {
        page: 1,
        pageSize: 20,
        total: 0,
        items: []
      }
    });

    const { getAdminEmailWebhookEvents } = await import('./api');
    await getAdminEmailWebhookEvents({
      organizationId: 12,
      providerMessageId: 'msg-77',
      dateFrom: '2026-03-17T00:00:00.000Z'
    });

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/console/inbound-mail?organizationId=12&providerMessageId=msg-77&dateFrom=2026-03-17T00%3A00%3A00.000Z',
      credentials: 'include',
      headers: expect.any(Headers)
    });
  });

  it('builds the admin email detail path', async () => {
    getAdminSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      tenantId: 'tenant-123',
      user: {
        userId: 'user-123'
      }
    });
    apiFetchMock.mockResolvedValue({
      data: {
        generatedAt: '2026-03-17T00:00:00.000Z',
        item: {
          emailMessageId: 77
        },
        providerAttempts: [],
        relatedWebhookEvents: []
      }
    });

    const { getAdminEmailDetail } = await import('./api');
    await getAdminEmailDetail(77);

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/console/mail/77',
      credentials: 'include',
      headers: expect.any(Headers)
    });
  });
});

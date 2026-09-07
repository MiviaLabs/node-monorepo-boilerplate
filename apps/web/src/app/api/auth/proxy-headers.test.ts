import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthenticatedProxyHeaders, buildProxyHeaders } from './proxy-headers';
import { resolveServerSession } from '../../../lib/auth/server-auth';

vi.mock('../../../lib/auth/server-auth', () => ({
  resolveServerSession: vi.fn(),
  ServerSessionResolutionStatus: {
    Valid: 'valid',
    Refreshed: 'refreshed',
    AuthInvalid: 'auth_invalid',
    TransientFailure: 'transient_failure',
    Missing: 'missing'
  }
}));

import type { NextRequest } from 'next/server';

function createMockRequest(
  headers: Record<string, string | undefined> = {},
  cookies: Record<string, string | undefined> = {}
): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    },
    nextUrl: {
      pathname: '/api/auth/me'
    }
  } as unknown as NextRequest;
}

describe('buildProxyHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses request headers when present', () => {
    const req = createMockRequest({
      authorization: 'Bearer header-token',
      'x-tenant-id': '123',
      'x-request-id': 'req-1',
      'x-correlation-id': 'corr-1',
      'x-causation-id': 'cause-1'
    });

    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    expect(headers.authorization).toBe('Bearer header-token');
    expect(headers['x-tenant-id']).toBe('123');
    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['x-correlation-id']).toBe('corr-1');
    expect(headers['x-causation-id']).toBe('cause-1');
  });

  it('falls back to cookies for protected auth context', () => {
    const req = createMockRequest(
      {},
      {
        accessToken: 'cookie-token',
        tenantId: '456'
      }
    );

    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    expect(headers.authorization).toBe('Bearer cookie-token');
    expect(headers['x-tenant-id']).toBe('456');
  });

  it('resolves auth headers from the server-owned session when legacy cookies are missing', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      status: 'refreshed' as never,
      accessToken: 'resolved-token',
      tenantId: 'tenant-from-session'
    });

    const req = createMockRequest(
      {
        'x-request-id': 'req-1'
      },
      {
        web_session: 'opaque-session-id'
      }
    );

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    expect(resolveServerSession).toHaveBeenCalledWith(
      {
        accessToken: undefined,
        tenantId: undefined,
        webSessionId: 'opaque-session-id'
      },
      expect.objectContaining({
        source: 'web_auth_proxy_route',
        route: '/api/auth/me',
        requestId: 'req-1'
      })
    );
    expect(headers.authorization).toBe('Bearer resolved-token');
    expect(headers['x-tenant-id']).toBe('tenant-from-session');
  });

  it('prefers the resolved server session over stale legacy auth cookies', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      status: 'refreshed' as never,
      accessToken: 'fresh-token',
      tenantId: 'fresh-tenant'
    });

    const req = createMockRequest(
      {},
      {
        accessToken: 'stale-cookie-token',
        tenantId: 'stale-tenant',
        web_session: 'opaque-session-id'
      }
    );

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    expect(resolveServerSession).toHaveBeenCalledWith(
      {
        accessToken: 'stale-cookie-token',
        tenantId: 'stale-tenant',
        webSessionId: 'opaque-session-id'
      },
      expect.objectContaining({
        source: 'web_auth_proxy_route',
        route: '/api/auth/me'
      })
    );
    expect(headers.authorization).toBe('Bearer fresh-token');
    expect(headers['x-tenant-id']).toBe('fresh-tenant');
  });

  it('resolves tenant context from an explicit bearer token when tenant header is missing', async () => {
    vi.mocked(resolveServerSession).mockResolvedValue({
      status: 'valid' as never,
      accessToken: 'header-token',
      tenantId: 'tenant-from-token'
    });

    const req = createMockRequest({
      authorization: 'Bearer header-token'
    });

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    expect(resolveServerSession).toHaveBeenCalledWith(
      {
        accessToken: 'header-token',
        tenantId: undefined,
        webSessionId: undefined
      },
      expect.objectContaining({
        source: 'web_auth_proxy_route',
        route: '/api/auth/me'
      })
    );
    expect(headers.authorization).toBe('Bearer header-token');
    expect(headers['x-tenant-id']).toBe('tenant-from-token');
  });
});

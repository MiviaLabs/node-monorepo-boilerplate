import { describe, expect, it, vi, beforeEach } from 'vitest';

const { resolveServerSession, ensurePhase0Trace } = vi.hoisted(() => ({
  resolveServerSession: vi.fn(),
  ensurePhase0Trace: vi.fn(() => ({
    requestId: 'req-phase0',
    correlationId: 'corr-phase0',
    causationId: 'cause-phase0'
  }))
}));

vi.mock('~/lib/auth/server-auth', () => ({
  resolveServerSession,
  ServerSessionResolutionStatus: {
    Valid: 'valid',
    Refreshed: 'refreshed',
    AuthInvalid: 'auth_invalid',
    TransientFailure: 'transient_failure',
    Missing: 'missing'
  }
}));

vi.mock('~/lib/diagnostics/phase-zero-diagnostics', () => ({
  ensurePhase0Trace,
  getPhase0RouteBudgetAttributes: vi.fn(() => ({
    routeBudgetPath: '/dashboard',
    routeBudgetValidationCalls: 1
  })),
  getPhase0TraceHeaderMap: vi.fn(() => ({
    'x-request-id': 'req-phase0',
    'x-correlation-id': 'corr-phase0',
    'x-causation-id': 'cause-phase0'
  })),
  measurePhase0: async <T>(
    _stage: string,
    _attributes: Record<string, unknown>,
    operation: () => Promise<T>
  ) => operation()
}));

import { config, proxy } from './proxy';

import type { NextRequest } from 'next/server';

function createRequest(
  pathname: string,
  cookies: Record<string, string | undefined> = {}
): NextRequest {
  const url = `http://localhost:3000${pathname}`;

  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    }
  } as unknown as NextRequest;
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates protected routes once in proxy and forwards the SSR validation headers', async () => {
    resolveServerSession.mockResolvedValue({
      status: 'valid',
      accessToken: 'token',
      user: {
        tenantId: '42'
      },
      tenantId: '42'
    });

    const response = await proxy(
      createRequest('/dashboard', {
        accessToken: 'token',
        tenantId: '7'
      })
    );

    expect(resolveServerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'token',
        tenantId: '7'
      }),
      expect.objectContaining({
        source: 'web_proxy_protected_route',
        route: '/dashboard',
        requestId: 'req-phase0',
        correlationId: 'corr-phase0',
        causationId: 'cause-phase0'
      })
    );
    expect(ensurePhase0Trace).toHaveBeenCalled();
    expect(response.headers.get('x-middleware-request-x-mivialabs-protected-pathname')).toBe(
      '/dashboard'
    );
    expect(response.headers.get('x-middleware-request-x-mivialabs-resolved-access-token')).toBe(
      'token'
    );
    expect(response.headers.get('x-middleware-request-x-mivialabs-session-validated')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-mivialabs-validated-tenant-id')).toBe('42');
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe('req-phase0');
    expect(response.headers.get('x-middleware-request-x-correlation-id')).toBe('corr-phase0');
    expect(response.headers.get('x-middleware-request-x-causation-id')).toBe('cause-phase0');
    expect(response.status).toBe(200);
  });

  it('still validates auth routes before redirecting away from login', async () => {
    resolveServerSession.mockResolvedValue({
      status: 'valid',
      accessToken: 'token',
      tenantId: '7'
    });

    const response = await proxy(
      createRequest('/login', {
        accessToken: 'token',
        tenantId: '7'
      })
    );

    expect(resolveServerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'token',
        tenantId: '7'
      }),
      expect.objectContaining({
        source: 'web_proxy_auth_route',
        route: '/login'
      })
    );
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('matches all top-level protected app routes used by the authenticated layout', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/content/:path*', '/issues/:path*', '/projects/:path*'])
    );
  });

  it('keeps protected routes accessible when refresh state exists and the access token is expired', async () => {
    resolveServerSession.mockResolvedValue({
      status: 'refreshed',
      accessToken: 'refreshed-token',
      tenantId: '7',
      user: {
        tenantId: '7'
      },
      sessionId: 'web-session-id'
    });

    const response = await proxy(
      createRequest('/dashboard', {
        accessToken: 'expired-token',
        tenantId: '7',
        web_session: 'web-session-id'
      })
    );

    expect(resolveServerSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-mivialabs-resolved-access-token')).toBe(
      'refreshed-token'
    );
    expect(response.headers.get('x-middleware-request-x-mivialabs-session-validated')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-mivialabs-validated-tenant-id')).toBe('7');
  });
});

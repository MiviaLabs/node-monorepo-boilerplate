import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cookiesMock,
  headersMock,
  redirectMock,
  resolveServerSessionMock,
  recordPhase0NoteMock,
  ensurePhase0TraceMock
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  resolveServerSessionMock: vi.fn(),
  recordPhase0NoteMock: vi.fn(),
  ensurePhase0TraceMock: vi.fn(() => ({
    requestId: 'req-phase0',
    correlationId: 'corr-phase0',
    causationId: 'cause-phase0'
  }))
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
  headers: headersMock
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn(() => 'http://api.internal/api/v1')
}));

vi.mock('~/lib/diagnostics/phase-zero-diagnostics', () => ({
  ensurePhase0Trace: ensurePhase0TraceMock,
  getPhase0ApiTargetAttributes: vi.fn(() => ({
    apiTargetOrigin: 'http://api.internal',
    apiTargetHost: 'api.internal'
  })),
  getPhase0RouteBudgetAttributes: vi.fn(() => ({
    routeBudgetPath: '/dashboard'
  })),
  getPhase0TraceAttributes: vi.fn(() => ({
    requestId: 'req-phase0',
    correlationId: 'corr-phase0',
    causationId: 'cause-phase0'
  })),
  getPhase0TraceHeaderMap: vi.fn(() => ({
    'x-request-id': 'req-phase0',
    'x-correlation-id': 'corr-phase0',
    'x-causation-id': 'cause-phase0'
  })),
  measurePhase0: vi.fn(async (_stage: string, _meta: unknown, callback: () => Promise<unknown>) =>
    callback()
  ),
  recordPhase0Note: recordPhase0NoteMock
}));

vi.mock('./server-auth', () => ({
  resolveServerSession: resolveServerSessionMock,
  ServerSessionResolutionStatus: {
    Valid: 'valid',
    Refreshed: 'refreshed',
    AuthInvalid: 'auth_invalid',
    TransientFailure: 'transient_failure',
    Missing: 'missing'
  }
}));

type CookieValue = { value: string };

function createCookieStore(values: Record<string, string | undefined>) {
  return {
    get(name: string): CookieValue | undefined {
      const value = values[name];
      return value ? { value } : undefined;
    }
  };
}

describe('getUserSession', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses the proxy-validated tenant context for bootstrap when the tenant cookie is missing', async () => {
    cookiesMock.mockResolvedValue(
      createCookieStore({
        accessToken: 'access-token',
        sessionId: 'session-id'
      })
    );
    headersMock.mockResolvedValue(
      new Headers({
        'x-mivialabs-protected-pathname': '/dashboard',
        'x-mivialabs-session-validated': '1',
        'x-mivialabs-validated-tenant-id': '42'
      })
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/iam/identity/boot')) {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '42',
          'x-request-id': 'req-phase0',
          'x-correlation-id': 'corr-phase0',
          'x-causation-id': 'cause-phase0'
        });

        return new Response(
          JSON.stringify({
            data: {
              user: {
                userId: '7',
                tenantId: '42',
                actorId: '7',
                email: 'user@example.com',
                displayName: 'User Example',
                emailVerified: true,
                roles: ['tenant_user'],
                permissions: ['tenant:projects:read']
              },
              organizations: [
                {
                  organizationId: '42',
                  tenantId: '99',
                  name: 'Acme Corp',
                  displayName: 'Acme',
                  slug: 'acme',
                  role: 'tenant_user',
                  isDefault: true,
                  isActive: true
                }
              ],
              currentOrganizationId: '42',
              currentUserSettings: {
                sidebarSectionOrder: ['yourWork', 'projects', 'members', 'settings'],
                dashboardDefaultView: 'projects',
                workspaceActiveProjectId: null
              },
              tenantName: 'Acme Corp',
              tenantDisplayName: 'Acme',
              tenantSlug: 'acme'
            }
          }),
          { status: 200 }
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { getUserSession } = await import('./get-user-session');
    const session = await getUserSession();

    expect(session.user.tenantId).toBe('42');
    expect(session.tenantId).toBe('42');
    expect(session.currentOrganizationId).toBe('42');
    expect(session.tenantSlug).toBe('acme');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolveServerSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(recordPhase0NoteMock).toHaveBeenCalledWith(
      'web.get_user_session.path',
      expect.objectContaining({
        mode: 'bootstrap',
        route: '/dashboard',
        correlationId: 'corr-phase0'
      })
    );
  });

  it('recovers with legacy fallback without a second validation when bootstrap fails after proxy validation', async () => {
    cookiesMock.mockResolvedValue(
      createCookieStore({
        accessToken: 'access-token',
        sessionId: 'session-id'
      })
    );
    headersMock.mockResolvedValue(
      new Headers({
        'x-mivialabs-protected-pathname': '/members',
        'x-mivialabs-session-validated': '1',
        'x-mivialabs-validated-tenant-id': '42'
      })
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url.endsWith('/iam/identity/boot')) {
        expect(init?.headers).toMatchObject({
          'x-tenant-id': '42',
          'x-request-id': 'req-phase0',
          'x-correlation-id': 'corr-phase0',
          'x-causation-id': 'cause-phase0'
        });
        return new Response('bootstrap unavailable', { status: 503 });
      }

      if (url.endsWith('/iam/identity')) {
        return new Response(
          JSON.stringify({
            data: {
              userId: '7',
              tenantId: '42',
              actorId: '7',
              email: 'user@example.com',
              displayName: 'Profile User',
              emailVerified: true,
              roles: ['tenant_user'],
              permissions: ['tenant:members:read']
            }
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/workspaces/current')) {
        expect(init?.headers).toMatchObject({
          'x-tenant-id': '42'
        });
        return new Response(
          JSON.stringify({
            data: {
              name: 'Acme Corp',
              displayName: 'Acme',
              slug: 'acme'
            }
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/iam/identity/orgs')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                organizationId: '42',
                tenantId: '99',
                name: 'Acme Corp',
                displayName: 'Acme',
                slug: 'acme',
                role: 'tenant_user',
                isDefault: true,
                isActive: true
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/iam/identity/preferences')) {
        return new Response(
          JSON.stringify({
            data: {
              sidebarSectionOrder: ['yourWork', 'projects', 'members', 'settings'],
              dashboardDefaultView: 'members',
              workspaceActiveProjectId: null
            }
          }),
          { status: 200 }
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { getUserSession } = await import('./get-user-session');
    const session = await getUserSession();

    expect(session.user.displayName).toBe('Profile User');
    expect(session.user.tenantId).toBe('42');
    expect(session.tenantId).toBe('42');
    expect(session.currentOrganizationId).toBe('42');
    expect(session.tenantName).toBe('Acme Corp');
    expect(session.currentUserSettings.dashboardDefaultView).toBe('members');
    expect(resolveServerSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(recordPhase0NoteMock).toHaveBeenCalledWith(
      'web.get_user_session.path',
      expect.objectContaining({
        mode: 'fallback_enabled',
        degradedMode: true,
        fallbackReason: 'http',
        route: '/members',
        requestId: 'req-phase0'
      })
    );
  });

  it('normalizes proxy-validated bootstrap sessions to the resolved organization context', async () => {
    cookiesMock.mockResolvedValue(
      createCookieStore({
        accessToken: 'access-token',
        sessionId: 'session-id'
      })
    );
    headersMock.mockResolvedValue(
      new Headers({
        'x-mivialabs-protected-pathname': '/dashboard',
        'x-mivialabs-session-validated': '1',
        'x-mivialabs-validated-tenant-id': '42'
      })
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.endsWith('/iam/identity/boot')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                userId: '7',
                tenantId: '7',
                actorId: '7',
                email: 'user@example.com',
                displayName: 'User Example',
                emailVerified: true,
                roles: ['tenant_user'],
                permissions: ['tenant:projects:read']
              },
              organizations: [
                {
                  organizationId: '42',
                  tenantId: '42',
                  name: 'Fallback Org',
                  displayName: 'Fallback Org',
                  slug: 'fallback-org',
                  role: 'tenant_user',
                  isDefault: true,
                  isActive: true
                }
              ],
              currentOrganizationId: '42',
              currentUserSettings: {
                sidebarSectionOrder: ['yourWork', 'projects', 'members', 'settings'],
                dashboardDefaultView: 'projects',
                workspaceActiveProjectId: null
              },
              tenantName: 'Fallback Org',
              tenantDisplayName: 'Fallback Org',
              tenantSlug: 'fallback-org'
            }
          }),
          { status: 200 }
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { getUserSession } = await import('./get-user-session');
    const session = await getUserSession();

    expect(resolveServerSessionMock).not.toHaveBeenCalled();
    expect(session.user.tenantId).toBe('42');
    expect(session.tenantId).toBe('42');
    expect(session.currentOrganizationId).toBe('42');
    expect(session.tenantSlug).toBe('fallback-org');
  });

  it('recovers an expired access token during SSR bootstrap when refresh state exists', async () => {
    cookiesMock.mockResolvedValue(
      createCookieStore({
        accessToken: 'expired-token',
        web_session: 'web-session-id',
        sessionId: 'session-id',
        tenantId: '42'
      })
    );
    headersMock.mockResolvedValue(
      new Headers({
        'x-mivialabs-protected-pathname': '/dashboard/profile'
      })
    );

    resolveServerSessionMock.mockResolvedValue({
      status: 'refreshed',
      accessToken: 'refreshed-token',
      tenantId: '42',
      sessionId: 'session-id',
      user: {
        userId: '7',
        tenantId: '42',
        actorId: '7',
        email: 'user@example.com',
        displayName: 'Recovered User',
        emailVerified: true,
        roles: ['tenant_user'],
        permissions: ['tenant:profile:read']
      }
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.endsWith('/iam/identity/boot')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                userId: '7',
                tenantId: '42',
                actorId: '7',
                email: 'user@example.com',
                displayName: 'Recovered User',
                emailVerified: true,
                roles: ['tenant_user'],
                permissions: ['tenant:profile:read']
              },
              organizations: [
                {
                  organizationId: '42',
                  tenantId: '42',
                  name: 'Acme Corp',
                  displayName: 'Acme',
                  slug: 'acme',
                  role: 'tenant_user',
                  isDefault: true,
                  isActive: true
                }
              ],
              currentOrganizationId: '42',
              currentUserSettings: {
                sidebarSectionOrder: ['yourWork', 'projects', 'members', 'settings'],
                dashboardDefaultView: 'projects',
                workspaceActiveProjectId: null
              },
              tenantName: 'Acme Corp',
              tenantDisplayName: 'Acme',
              tenantSlug: 'acme'
            }
          }),
          { status: 200 }
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { getUserSession } = await import('./get-user-session');

    await expect(getUserSession()).resolves.toMatchObject({
      sessionId: 'session-id',
      tenantId: '42',
      currentOrganizationId: '42',
      tenantSlug: 'acme',
      user: expect.objectContaining({
        tenantId: '42',
        displayName: 'Recovered User'
      })
    });
    expect(resolveServerSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'expired-token',
        tenantId: '42',
        webSessionId: 'web-session-id'
      }),
      expect.objectContaining({
        source: 'web_get_user_session',
        route: '/dashboard/profile'
      })
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

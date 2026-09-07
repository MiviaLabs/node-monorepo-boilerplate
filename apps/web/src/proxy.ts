/**
 * Proxy
 *
 * Server-side route protection with session validation
 *
 * This proxy validates sessions by calling the backend API.
 * It runs on protected routes only and validates authenticated sessions.
 */

import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

import { WEB_SESSION_COOKIE } from '~/lib/auth/cookies';
import { resolveServerSession, ServerSessionResolutionStatus } from '~/lib/auth/server-auth';
import {
  PROTECTED_PATHNAME_HEADER,
  RESOLVED_ACCESS_TOKEN_HEADER,
  SESSION_VALIDATED_HEADER,
  VALIDATED_TENANT_ID_HEADER
} from '~/lib/auth/session-validation-headers';
import {
  ensurePhase0Trace,
  getPhase0RouteBudgetAttributes,
  getPhase0TraceHeaderMap,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';

// ============================================================================
// ROUTE CONFIGURATION
// ============================================================================

/**
 * Protected routes that require authentication
 * All routes starting with these paths will require a valid session
 */
const PROTECTED_ROUTES = [
  '/content',
  '/dashboard',
  '/issues',
  '/my',
  '/projects',
  '/members',
  '/profile',
  '/settings',
  '/account'
];

/**
 * Public routes that should redirect to dashboard if authenticated
 */
const AUTH_ROUTES = ['/login', '/register'];

// ============================================================================
// COOKIE NAMES
// ============================================================================

const SESSION_COOKIE_NAME = 'sessionId';
const TENANT_COOKIE_NAME = 'tenantId';
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
// ============================================================================
// PROXY FUNCTION
// ============================================================================

/**
 * Proxy function
 *
 * Validates protected routes once before SSR bootstrap.
 * Redirects unauthenticated users to login.
 * Redirects authenticated users away from login/register pages.
 *
 * @param request - Next.js request object
 * @returns Next.js response (redirect or next)
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const phase0Trace = ensurePhase0Trace(request.headers);

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Get session and tenant cookies
  const accessTokenCookie = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME);
  const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME);
  const webSessionCookie = request.cookies.get(WEB_SESSION_COOKIE);
  const accessToken = accessTokenCookie?.value;
  const tenantId = tenantCookie?.value;
  const webSessionId = webSessionCookie?.value;

  // Handle protected routes
  if (isProtectedRoute) {
    if (!accessToken && !webSessionId) {
      // No session cookie - redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const resolvedSession = await measurePhase0(
      'web.proxy.resolve_session',
      {
        pathname,
        source: 'protected_route',
        ...getPhase0RouteBudgetAttributes(pathname)
      },
      () =>
        resolveServerSession(
          {
            accessToken,
            tenantId,
            webSessionId
          },
          {
            source: 'web_proxy_protected_route',
            route: pathname,
            ...phase0Trace
          }
        )
    );

    if (
      resolvedSession.status === ServerSessionResolutionStatus.AuthInvalid ||
      resolvedSession.status === ServerSessionResolutionStatus.Missing
    ) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);

      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(WEB_SESSION_COOKIE);
      response.cookies.delete(SESSION_COOKIE_NAME);
      response.cookies.delete(TENANT_COOKIE_NAME);
      response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(PROTECTED_PATHNAME_HEADER, pathname);
    if (resolvedSession.accessToken) {
      requestHeaders.set(RESOLVED_ACCESS_TOKEN_HEADER, resolvedSession.accessToken);
    }
    if (resolvedSession.status !== ServerSessionResolutionStatus.TransientFailure) {
      requestHeaders.set(SESSION_VALIDATED_HEADER, '1');
      if (resolvedSession.tenantId) {
        requestHeaders.set(VALIDATED_TENANT_ID_HEADER, resolvedSession.tenantId);
      }
    }
    for (const [headerName, value] of Object.entries(getPhase0TraceHeaderMap(phase0Trace))) {
      requestHeaders.set(headerName, value);
    }
    return measurePhase0(
      'web.proxy.protected_route_pass_through',
      {
        pathname,
        tenantIdPresent: Boolean(tenantId),
        sessionResolution: resolvedSession.status,
        ...getPhase0RouteBudgetAttributes(pathname)
      },
      async () =>
        NextResponse.next({
          request: {
            headers: requestHeaders
          }
        })
    );
  }

  // Handle auth routes (login/register)
  if (isAuthRoute && (accessToken || webSessionId)) {
    const resolvedSession = await measurePhase0(
      'web.proxy.resolve_session',
      {
        pathname,
        source: 'auth_route'
      },
      () =>
        resolveServerSession(
          {
            accessToken,
            tenantId,
            webSessionId
          },
          {
            source: 'web_proxy_auth_route',
            route: pathname,
            ...phase0Trace
          }
        )
    );

    if (
      resolvedSession.status === ServerSessionResolutionStatus.Valid ||
      resolvedSession.status === ServerSessionResolutionStatus.Refreshed
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (resolvedSession.status === ServerSessionResolutionStatus.TransientFailure) {
      return NextResponse.next();
    }

    // Invalid session - clear cookies and allow access to login/register
    const response = NextResponse.next();
    response.cookies.delete(WEB_SESSION_COOKIE);
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(TENANT_COOKIE_NAME);
    response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
    return response;
  }

  // Public route - allow access
  return NextResponse.next();
}

// ============================================================================
// ROUTE MATCHER CONFIGURATION
// ============================================================================

/**
 * Configure which routes the proxy should run on
 *
 * Uses a whitelist approach for security:
 * - Only matches protected routes and auth routes
 * - Excludes static assets, images, and Next.js internals
 */
export const config = {
  matcher: [
    // Protected routes that require authentication
    '/content/:path*',
    '/dashboard/:path*',
    '/issues/:path*',
    '/my/:path*',
    '/projects/:path*',
    '/members/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/account/:path*',
    // Auth routes that redirect if already authenticated
    '/login',
    '/register'
  ]
};

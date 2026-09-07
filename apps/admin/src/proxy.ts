import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE, clearAdminSessionCookies } from './lib/auth/cookies';
import { getAppUrl, getTrustedAppUrl } from './lib/runtime-config';

import type { NextRequest } from 'next/server';

const PROTECTED_PATH_PREFIXES = [
  '/inbox',
  '/statistics',
  '/tenants',
  '/memberships',
  '/users',
  '/access',
  '/settings',
  '/health',
  '/profile',
  '/dashboard',
  '/preferences'
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function redirectToLogin(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', getAppUrl(request.url)));
  clearAdminSessionCookies(response);
  return response;
}

function hasLegacySessionCookies(request: NextRequest): boolean {
  return [
    'admin_access_token',
    'admin_refresh_token',
    'admin_tenant_id',
    'bo_access_token',
    'bo_refresh_token',
    'bo_tenant_id'
  ].some((name) => request.cookies.has(name));
}

function appendSetCookies(response: NextResponse, values: string[]): void {
  for (const value of values) {
    response.headers.append('set-cookie', value);
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  return typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter((value): value is string => Boolean(value));
}

async function validateSession(request: NextRequest): Promise<{
  valid: boolean;
  transientError: boolean;
  setCookies: string[];
}> {
  try {
    const response = await fetch(`${getTrustedAppUrl()}/api/auth/validate`, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') ?? ''
      },
      cache: 'no-store'
    });

    const setCookies = getSetCookieHeaders(response.headers);
    if (!response.ok) {
      return {
        valid: false,
        transientError: response.status >= 500,
        setCookies
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: { valid?: boolean };
    } | null;

    return {
      valid: payload?.data?.valid === true,
      transientError: false,
      setCookies
    };
  } catch {
    return { valid: false, transientError: true, setCookies: [] };
  }
}

function redirectToCurrentPath(request: NextRequest, setCookies: string[]) {
  const response = NextResponse.redirect(
    new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, getAppUrl(request.url))
  );
  appendSetCookies(response, setCookies);
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPath = isProtectedPath(pathname);
  const sessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!sessionId && !hasLegacySessionCookies(request)) {
    return protectedPath ? redirectToLogin(request) : NextResponse.next();
  }

  const validation = await validateSession(request);
  if (validation.valid) {
    if (validation.setCookies.length === 0) {
      return NextResponse.next();
    }

    if (protectedPath) {
      return redirectToCurrentPath(request, validation.setCookies);
    }

    const response = NextResponse.next();
    appendSetCookies(response, validation.setCookies);
    return response;
  }

  if (validation.transientError) {
    return NextResponse.next();
  }

  if (protectedPath) {
    const response = redirectToLogin(request);
    appendSetCookies(response, validation.setCookies);
    return response;
  }

  const response = NextResponse.next();
  if (validation.setCookies.length > 0) {
    appendSetCookies(response, validation.setCookies);
  } else {
    clearAdminSessionCookies(response);
  }
  return response;
}

export const config = {
  matcher: [
    '/',
    '/inbox/:path*',
    '/statistics/:path*',
    '/tenants/:path*',
    '/memberships/:path*',
    '/users/:path*',
    '/access/:path*',
    '/settings/:path*',
    '/health/:path*',
    '/profile/:path*',
    '/dashboard/:path*',
    '/preferences/:path*'
  ]
};

import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

import { invalidateSessionCache } from '~/lib/auth/server-auth';
import { WEB_SESSION_COOKIE } from '~/lib/auth/server-session';

const SESSION_COOKIE_NAME = 'sessionId';
const TENANT_COOKIE_NAME = 'tenantId';
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
const LOGOUT_SYNC_COOKIE_NAME = 'authLogoutSync';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (accessToken) {
    await invalidateSessionCache(accessToken).catch(() => undefined);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = appUrl && appUrl.length > 0 ? appUrl : request.url;
  const loginUrl = new URL('/login', baseUrl);
  const redirectTarget = request.nextUrl.searchParams.get('redirect');
  if (redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')) {
    loginUrl.searchParams.set('redirect', redirectTarget);
  }
  const response = NextResponse.redirect(loginUrl);

  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(TENANT_COOKIE_NAME);
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(WEB_SESSION_COOKIE);
  response.cookies.set(LOGOUT_SYNC_COOKIE_NAME, '1', {
    path: '/',
    maxAge: 10,
    sameSite: 'lax'
  });

  return response;
}

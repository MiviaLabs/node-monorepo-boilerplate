import type { NextResponse } from 'next/server';
import type { AuthResponse } from '~/types/auth.types';

export const WEB_SESSION_COOKIE = 'web_session';
export const LEGACY_SESSION_COOKIE = 'sessionId';
export const LEGACY_TENANT_COOKIE = 'tenantId';
export const LEGACY_ACCESS_TOKEN_COOKIE = 'accessToken';

const COOKIE_PATH = '/';

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production';
}

function buildCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    maxAge
  };
}

function expireCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, '', buildCookieOptions(0));
}

export function applyWebSessionCookie(
  response: NextResponse,
  sessionId: string,
  maxAge: number
): void {
  response.cookies.set(WEB_SESSION_COOKIE, sessionId, buildCookieOptions(maxAge));
}

export function applyLegacyWebAuthCookies(
  response: NextResponse,
  auth: AuthResponse,
  sessionId?: string
): void {
  const user = auth.user as Record<string, unknown>;
  const tenantId = typeof user.tenantId === 'string' ? user.tenantId : undefined;
  const maxAge = auth.expiresIn > 0 ? auth.expiresIn : 0;

  if (sessionId) {
    response.cookies.set(LEGACY_SESSION_COOKIE, sessionId, buildCookieOptions(maxAge));
  }

  response.cookies.set(LEGACY_ACCESS_TOKEN_COOKIE, auth.accessToken, buildCookieOptions(maxAge));

  if (tenantId) {
    response.cookies.set(LEGACY_TENANT_COOKIE, tenantId, buildCookieOptions(maxAge));
  }
}

export function clearWebSessionCookie(response: NextResponse): void {
  expireCookie(response, WEB_SESSION_COOKIE);
}

export function clearLegacyWebAuthCookies(response: NextResponse): void {
  expireCookie(response, LEGACY_SESSION_COOKIE);
  expireCookie(response, LEGACY_TENANT_COOKIE);
  expireCookie(response, LEGACY_ACCESS_TOKEN_COOKIE);
}

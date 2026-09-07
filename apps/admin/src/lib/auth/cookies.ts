import type { NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'bo_session';
export const LEGACY_ADMIN_ACCESS_TOKEN_COOKIE = 'admin_access_token';
export const LEGACY_ADMIN_REFRESH_TOKEN_COOKIE = 'admin_refresh_token';
export const LEGACY_ADMIN_TENANT_COOKIE = 'admin_tenant_id';
export const LEGACY_ALT_ADMIN_ACCESS_TOKEN_COOKIE = 'bo_access_token';
export const LEGACY_ALT_ADMIN_REFRESH_TOKEN_COOKIE = 'bo_refresh_token';
export const LEGACY_ALT_ADMIN_TENANT_COOKIE = 'bo_tenant_id';

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

export function applyAdminSessionCookie(
  response: NextResponse,
  sessionId: string,
  maxAge: number
): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionId, buildCookieOptions(maxAge));
}

function expireCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, '', buildCookieOptions(0));
}

export function clearLegacyAdminSessionCookies(response: NextResponse): void {
  expireCookie(response, LEGACY_ADMIN_ACCESS_TOKEN_COOKIE);
  expireCookie(response, LEGACY_ADMIN_REFRESH_TOKEN_COOKIE);
  expireCookie(response, LEGACY_ADMIN_TENANT_COOKIE);
  expireCookie(response, LEGACY_ALT_ADMIN_ACCESS_TOKEN_COOKIE);
  expireCookie(response, LEGACY_ALT_ADMIN_REFRESH_TOKEN_COOKIE);
  expireCookie(response, LEGACY_ALT_ADMIN_TENANT_COOKIE);
}

export function clearAdminSessionCookies(response: NextResponse): void {
  expireCookie(response, ADMIN_SESSION_COOKIE);
  clearLegacyAdminSessionCookies(response);
}

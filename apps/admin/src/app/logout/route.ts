import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { deleteStoredSession, getStoredSession } from '../../lib/auth/session-store';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookies,
  logoutAdminSession
} from '../../lib/admin-auth';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  TENANT_ID_COOKIE_NAME
} from '../../lib/admin-auth-core';
import { getAppUrl } from '../../lib/runtime-config';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionId ? await getStoredSession(sessionId) : null;
  const accessToken = session?.accessToken ?? cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = session?.refreshToken ?? cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const tenantId = session?.tenantId ?? cookieStore.get(TENANT_ID_COOKIE_NAME)?.value;

  await logoutAdminSession({
    accessToken,
    refreshToken,
    tenantId
  });

  if (sessionId) {
    await deleteStoredSession(sessionId);
  }

  const response = NextResponse.redirect(new URL('/', getAppUrl(request.url)));
  clearSessionCookies(response);
  return response;
}

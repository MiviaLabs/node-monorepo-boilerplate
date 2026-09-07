import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../proxy-headers';

import { clearLegacyWebAuthCookies } from '~/lib/auth/cookies';
import { clearPersistedWebSession, resolveRequestWebSession } from '~/lib/auth/server-session';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * POST /api/auth/logout
 *
 * Next.js API route handler for user logout.
 * Proxies requests to the backend NestJS API.
 */
export async function POST(req: NextRequest) {
  const storedSession = await resolveRequestWebSession(req).catch(() => null);

  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as {
      refreshToken?: string;
    };

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/sessions/close`;

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });
    if (storedSession) {
      headers.authorization = `Bearer ${storedSession.accessToken}`;
      headers['x-tenant-id'] = storedSession.tenantId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        refreshToken: storedSession?.refreshToken ?? body.refreshToken
      }),
      credentials: 'include'
    });

    const data = await response.json().catch(() => null);
    const nextResponse =
      response.status === 204
        ? new NextResponse(null, { status: 204 })
        : NextResponse.json(data ?? { message: 'Logged out successfully' }, {
            status: response.status
          });

    await clearPersistedWebSession(nextResponse, storedSession?.sessionId);
    clearLegacyWebAuthCookies(nextResponse);

    if (!response.ok) {
      return nextResponse;
    }

    return nextResponse;
  } catch (error) {
    console.error('Logout proxy error:', error);
    const nextResponse = NextResponse.json(
      { error: 'Internal server error', message: 'Failed to logout' },
      { status: 500 }
    );
    await clearPersistedWebSession(nextResponse, storedSession?.sessionId);
    clearLegacyWebAuthCookies(nextResponse);
    return nextResponse;
  }
}

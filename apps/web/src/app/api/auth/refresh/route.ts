import { NextRequest, NextResponse } from 'next/server';

import { applyLegacyWebAuthCookies, clearLegacyWebAuthCookies } from '../../../../lib/auth/cookies';
import { buildAuthenticatedProxyHeaders } from '../proxy-headers';

import {
  applyPersistedWebSession,
  clearPersistedWebSession,
  extractAuthResponseData,
  resolveRequestWebSession
} from '~/lib/auth/server-session';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * POST /api/auth/refresh
 *
 * Next.js API route handler for token refresh.
 * Proxies requests to the backend NestJS API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as {
      refreshToken?: string;
    };

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/sessions/refresh`;
    const storedSession = await resolveRequestWebSession(req);
    const refreshToken = storedSession?.refreshToken ?? body.refreshToken;
    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeTenant: true
    });

    if (!refreshToken) {
      const nextResponse = NextResponse.json(
        { message: 'Session refresh unavailable', error: 'Missing refresh token' },
        { status: 401 }
      );
      await clearPersistedWebSession(nextResponse, storedSession?.sessionId);
      clearLegacyWebAuthCookies(nextResponse);
      return nextResponse;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        refreshToken
      }),
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      const nextResponse = NextResponse.json(data, { status: response.status });
      if (storedSession && [400, 401, 403].includes(response.status)) {
        await clearPersistedWebSession(nextResponse, storedSession.sessionId);
        clearLegacyWebAuthCookies(nextResponse);
      }
      return nextResponse;
    }

    const auth = extractAuthResponseData(data);
    if (!auth) {
      console.error('Refresh proxy returned unexpected auth payload shape');
      return NextResponse.json(
        { error: 'Internal server error', message: 'Failed to persist refreshed session' },
        { status: 500 }
      );
    }

    const nextResponse = NextResponse.json(data);

    try {
      const persistedSession = await applyPersistedWebSession(
        nextResponse,
        auth,
        storedSession?.sessionId
      );
      applyLegacyWebAuthCookies(nextResponse, auth, persistedSession.sessionId);
    } catch (sessionError) {
      console.error(
        'Refresh proxy session persistence failed, falling back to legacy cookies',
        sessionError
      );
      applyLegacyWebAuthCookies(nextResponse, auth, storedSession?.sessionId);
    }

    return nextResponse;
  } catch (error) {
    console.error('Refresh token proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}

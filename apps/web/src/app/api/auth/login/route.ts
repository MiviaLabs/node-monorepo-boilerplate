import { NextRequest, NextResponse } from 'next/server';

import { applyLegacyWebAuthCookies } from '../../../../lib/auth/cookies';
import { buildProxyHeaders } from '../proxy-headers';

import { applyPersistedWebSession, extractAuthResponseData } from '~/lib/auth/server-session';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * POST /api/auth/login
 *
 * Next.js API route handler for user login.
 * Proxies requests to the backend NestJS API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/sessions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: buildProxyHeaders(req, {
        includeTenant: true
      }),
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const auth = extractAuthResponseData(data);
    if (!auth) {
      console.error('Login proxy returned unexpected auth payload shape');
      return NextResponse.json(
        { error: 'Internal server error', message: 'Failed to establish server session' },
        { status: 500 }
      );
    }

    const nextResponse = NextResponse.json(data);

    try {
      const persistedSession = await applyPersistedWebSession(nextResponse, auth);
      applyLegacyWebAuthCookies(nextResponse, auth, persistedSession.sessionId);
    } catch (sessionError) {
      console.error(
        'Login proxy session persistence failed, falling back to legacy cookies',
        sessionError
      );
      applyLegacyWebAuthCookies(nextResponse, auth);
    }

    return nextResponse;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to login' },
      { status: 500 }
    );
  }
}

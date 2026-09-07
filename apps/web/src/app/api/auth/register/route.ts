import { NextRequest, NextResponse } from 'next/server';

import { applyLegacyWebAuthCookies } from '../../../../lib/auth/cookies';

import { applyPersistedWebSession, extractAuthResponseData } from '~/lib/auth/server-session';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * POST /api/auth/register
 *
 * Next.js API route handler for user registration.
 * Proxies requests to the backend NestJS API.
 *
 * This ensures all backend calls go through Next.js API routes,
 * not directly from tRPC handlers.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/enroll`;

    // Build headers object with forwarding
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Forward trace headers if present
    const requestId = req.headers.get('x-request-id');
    if (requestId) {
      headers['x-request-id'] = requestId;
    }
    const correlationId = req.headers.get('x-correlation-id');
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }
    // CRITICAL: Forward x-tenant-id header if present for multi-tenancy
    const tenantId = req.headers.get('x-tenant-id');
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Forward cookies for session handling
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const auth = extractAuthResponseData(data);
    if (!auth) {
      console.error('Register proxy returned unexpected auth payload shape');
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
        'Register proxy session persistence failed, falling back to legacy cookies',
        sessionError
      );
      applyLegacyWebAuthCookies(nextResponse, auth);
    }

    return nextResponse;
  } catch (error) {
    console.error('Registration proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to register user' },
      { status: 500 }
    );
  }
}

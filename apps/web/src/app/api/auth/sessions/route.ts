import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * GET /api/auth/sessions
 *
 * Next.js API route handler for getting user sessions.
 * Proxies requests to the backend NestJS API.
 */
export async function GET(req: NextRequest) {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/sessions`;

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Get user sessions proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get user sessions' },
      { status: 500 }
    );
  }
}

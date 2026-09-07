import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * GET /api/auth/roles
 *
 * Next.js API route handler for getting user roles.
 * Proxies requests to the backend NestJS API.
 */
export async function GET(req: NextRequest) {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/roles`;

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
    console.error('Get user roles proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get user roles' },
      { status: 500 }
    );
  }
}

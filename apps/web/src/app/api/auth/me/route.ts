import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * GET /api/auth/me
 *
 * Next.js API route handler for getting current user profile.
 * Proxies requests to the backend NestJS API.
 */
export async function GET(req: NextRequest) {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity`;

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
    console.error('Get user profile proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get user profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/me
 *
 * Next.js API route handler for updating current user profile.
 * Proxies requests to the backend NestJS API.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { displayName?: string; phoneNumber?: string };
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity`;

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Update user profile proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}

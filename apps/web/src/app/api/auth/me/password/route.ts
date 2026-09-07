import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * PATCH /api/auth/me/password
 *
 * Proxies password-change requests to the backend NestJS API.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity/credentials`;

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

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Change password proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to change password' },
      { status: 500 }
    );
  }
}

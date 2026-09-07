import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * DELETE /api/auth/account/[userId]
 *
 * Next.js API route handler for deleting user account.
 * Proxies requests to the backend NestJS API.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const reason = searchParams.get('reason');
    const queryParams = reason ? `?reason=${encodeURIComponent(reason)}` : '';

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/account/${userId}${queryParams}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: await buildAuthenticatedProxyHeaders(req, {
        includeAuthorization: true,
        includeTenant: true
      }),
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
    console.error('Delete account proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

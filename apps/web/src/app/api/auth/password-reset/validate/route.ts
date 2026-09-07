import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim();

    if (!token) {
      return NextResponse.json({ message: 'Token parameter is required' }, { status: 400 });
    }

    const query = new URLSearchParams({ token }).toString();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/credentials/verify?${query}`;

    const headers = buildProxyHeaders(req);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store'
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    // Sanitized logging - no token or URL details
    console.error(
      'Password reset validate proxy error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to validate reset token' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest) {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity/preferences`;
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
    console.error('Get current user settings proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get current user settings' },
      { status: 500 }
    );
  }
}

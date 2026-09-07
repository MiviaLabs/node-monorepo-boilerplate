import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/objects/uploads`;

    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'POST',
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
    console.error('Create upload reservation proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to reserve upload' },
      { status: 500 }
    );
  }
}

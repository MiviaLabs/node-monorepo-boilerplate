import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.toString();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets${query ? `?${query}` : ''}`;
    const headers = buildProxyHeaders(req, {
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
    console.error('List issues proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to list issues' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets`;
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
    console.error('Create issue proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create issue' },
      { status: 500 }
    );
  }
}

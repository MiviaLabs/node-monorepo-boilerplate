import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const query = req.nextUrl.searchParams.toString();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/pages/by-slug/${slug}${query ? `?${query}` : ''}`;
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
    console.error('Get content by slug proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get content entry by slug' },
      { status: 500 }
    );
  }
}

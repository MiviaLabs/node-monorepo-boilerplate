import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/credentials/restore`;

    const headers = buildProxyHeaders(req);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(
      'Password reset completion proxy error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to reset password' },
      { status: 500 }
    );
  }
}

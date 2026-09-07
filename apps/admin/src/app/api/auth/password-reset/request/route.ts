import { NextRequest, NextResponse } from 'next/server';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/credentials/recovery`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to request password reset' },
      { status: 500 }
    );
  }
}

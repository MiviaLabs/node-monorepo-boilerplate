import { NextRequest, NextResponse } from 'next/server';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim();
    const tenantId = req.nextUrl.searchParams.get('tenantId')?.trim();

    if (!token || !tenantId) {
      return NextResponse.json(
        { message: 'token and tenantId are required', status: 'invalid' },
        { status: 400 }
      );
    }

    const query = new URLSearchParams({ token, tenantId }).toString();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/invitations/preview?${query}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    const data = await response.json().catch(() => ({ message: 'Invitation preview unavailable' }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: 'Failed to load invitation preview', status: 'invalid' },
      { status: 500 }
    );
  }
}

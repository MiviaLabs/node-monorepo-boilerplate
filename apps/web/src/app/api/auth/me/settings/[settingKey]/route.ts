import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function PUT(req: NextRequest, context: { params: Promise<{ settingKey: string }> }) {
  try {
    const { settingKey } = await context.params;
    const body = (await req.json()) as { value?: unknown };
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity/preferences/${encodeURIComponent(settingKey)}`;
    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'PUT',
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
    console.error('Update current user setting proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update current user setting' },
      { status: 500 }
    );
  }
}

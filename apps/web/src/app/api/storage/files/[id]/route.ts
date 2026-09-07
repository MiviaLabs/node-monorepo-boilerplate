import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/objects/${id}`;

    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Delete file proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete file' },
      { status: 500 }
    );
  }
}

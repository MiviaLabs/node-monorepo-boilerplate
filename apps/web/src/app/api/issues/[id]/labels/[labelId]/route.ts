import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const { id, labelId } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}/labels/${labelId}`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Remove issue label proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to remove issue label' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/pages/${id}/comments/${commentId}`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Delete content comment proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete content comment' },
      { status: 500 }
    );
  }
}

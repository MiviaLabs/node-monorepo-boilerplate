import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}/attachments/${attachmentId}/content`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const proxiedHeaders = new Headers();
    for (const headerName of [
      'content-type',
      'content-length',
      'content-disposition',
      'etag',
      'last-modified'
    ]) {
      const value = response.headers.get(headerName);
      if (value) {
        proxiedHeaders.set(headerName, value);
      }
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: proxiedHeaders
    });
  } catch (error) {
    console.error('Get issue attachment content proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get issue attachment content' },
      { status: 500 }
    );
  }
}

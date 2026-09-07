import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}/attachments/${attachmentId}`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    }

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Delete issue attachment proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete issue attachment' },
      { status: 500 }
    );
  }
}

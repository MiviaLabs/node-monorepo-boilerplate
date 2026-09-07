import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';
export const runtime = 'nodejs';

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/objects/uploads/${id}/content`;

    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    delete headers['Content-Type'];

    const contentType = req.headers.get('content-type');
    if (contentType) {
      headers['content-type'] = contentType;
    }

    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      headers['content-length'] = contentLength;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: req.body,
      duplex: 'half',
      credentials: 'include'
    } as RequestInit & { duplex: 'half' });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload file content proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to upload file content' },
      { status: 500 }
    );
  }
}

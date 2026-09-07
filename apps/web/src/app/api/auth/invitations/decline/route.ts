import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/invitations/decline`;

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const tenantId =
      req.headers.get('x-tenant-id') ??
      (typeof body?.tenantId === 'string' ? body.tenantId.trim() : '');
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json().catch(() => ({ message: 'Failed to decline invitation' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Invitation decline proxy error:', error);
    return NextResponse.json({ message: 'Failed to decline invitation' }, { status: 500 });
  }
}

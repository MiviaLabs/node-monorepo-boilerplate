import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';
const enum AvatarRequestMethod {
  Patch = 'PATCH',
  Delete = 'DELETE'
}

async function proxyAvatarRequest(
  req: NextRequest,
  method: AvatarRequestMethod
): Promise<NextResponse> {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/identity/avatar`;

    const headers = await buildAuthenticatedProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const init: RequestInit = {
      method,
      headers,
      credentials: 'include'
    };

    if (method === AvatarRequestMethod.Patch) {
      const body = (await req.json()) as { fileId?: number };
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Avatar proxy error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message:
          method === AvatarRequestMethod.Delete
            ? 'Failed to remove user avatar'
            : 'Failed to update user avatar'
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return proxyAvatarRequest(req, AvatarRequestMethod.Patch);
}

export async function DELETE(req: NextRequest) {
  return proxyAvatarRequest(req, AvatarRequestMethod.Delete);
}

import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function POST(request: NextRequest) {
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const response = await fetch(`${getVersionedApiBaseUrl()}/platform/event-replay`, {
    method: 'POST',
    headers: new Headers({
      ...Object.fromEntries(new Headers(headers).entries()),
      'content-type': 'application/json'
    }),
    cache: 'no-store',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { message: errorPayload?.message ?? `Failed to start replay (${response.status})` },
      { status: response.status }
    );
  }

  const responsePayload = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(responsePayload, { status: response.status });
}

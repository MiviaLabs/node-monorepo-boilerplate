import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params;
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const response = await fetch(`${getVersionedApiBaseUrl()}/platform/workspaces/${tenantId}`, {
    method: 'PATCH',
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
      { message: errorPayload?.message ?? `Failed to update tenant (${response.status})` },
      { status: response.status }
    );
  }

  const responsePayload = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(responsePayload, { status: response.status });
}

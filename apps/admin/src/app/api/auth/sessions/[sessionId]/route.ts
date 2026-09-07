import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const response = await fetch(
    `${getVersionedApiBaseUrl()}/iam/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { message: errorPayload?.message ?? `Failed to revoke session (${response.status})` },
      { status: response.status }
    );
  }

  return new NextResponse(null, { status: 204 });
}

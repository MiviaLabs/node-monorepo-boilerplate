import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const response = await fetch(
    `${getVersionedApiBaseUrl()}/console/queues/dead-letters/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: `Failed to delete dead-letter event (${response.status})` },
      { status: response.status }
    );
  }

  return new NextResponse(null, { status: 204 });
}

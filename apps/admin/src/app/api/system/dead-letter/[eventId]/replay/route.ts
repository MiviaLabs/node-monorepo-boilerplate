import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const response = await fetch(
    `${getVersionedApiBaseUrl()}/console/queues/dead-letters/${encodeURIComponent(eventId)}/replay`,
    {
      method: 'POST',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: `Failed to replay dead-letter event (${response.status})` },
      { status: response.status }
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(payload);
}

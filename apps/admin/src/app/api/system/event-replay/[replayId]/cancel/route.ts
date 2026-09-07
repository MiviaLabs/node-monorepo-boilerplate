import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ replayId: string }> }
) {
  const { replayId } = await context.params;
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const response = await fetch(
    `${getVersionedApiBaseUrl()}/platform/event-replay/${encodeURIComponent(replayId)}/cancel`,
    {
      method: 'POST',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { message: errorPayload?.message ?? `Failed to cancel replay (${response.status})` },
      { status: response.status }
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(payload);
}

import { NextResponse, type NextRequest } from 'next/server';

import { getAdminRequestHeaders } from '~/lib/admin';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const headers = await getAdminRequestHeaders();

  if (!headers) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  if (!organizationId) {
    return NextResponse.json({ message: 'organizationId is required' }, { status: 400 });
  }

  const response = await fetch(
    `${getVersionedApiBaseUrl()}/console/users/${userId}?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: `Failed to delete user (${response.status})` },
      { status: response.status }
    );
  }

  return new NextResponse(null, { status: 204 });
}

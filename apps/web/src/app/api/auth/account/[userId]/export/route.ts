import { NextRequest, NextResponse } from 'next/server';

import { buildAuthenticatedProxyHeaders } from '../../../proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * GET /api/auth/account/[userId]/export
 *
 * Next.js API route handler for exporting user data (GDPR Article 15).
 * Proxies requests to the backend NestJS API.
 *
 * Security:
 * - Requires Authorization header (JWT)
 * - Requires x-tenant-id header
 * - Backend validates user can only export their own data
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;

    const apiBaseUrl = getVersionedApiBaseUrl(API_VERSION);
    const url = apiBaseUrl + '/auth/account/' + userId + '/export';

    const response = await fetch(url, {
      method: 'GET',
      headers: await buildAuthenticatedProxyHeaders(req, {
        includeAuthorization: true,
        includeTenant: true
      }),
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    // Log error without PII
    console.error('Export user data proxy error:', error instanceof Error ? error.name : 'Unknown');
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to export user data' },
      { status: 500 }
    );
  }
}

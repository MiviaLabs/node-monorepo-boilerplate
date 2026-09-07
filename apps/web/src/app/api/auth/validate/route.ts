import { NextRequest, NextResponse } from 'next/server';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * POST /api/auth/validate
 *
 * Next.js API route handler for validating access tokens.
 * Proxies requests to the backend NestJS API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const url = `${getVersionedApiBaseUrl(API_VERSION)}/iam/tokens/verify`;

    // Build headers object with forwarding
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Forward trace headers if present
    const requestId = req.headers.get('x-request-id');
    if (requestId) {
      headers['x-request-id'] = requestId;
    }
    const correlationId = req.headers.get('x-correlation-id');
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }
    // CRITICAL: Forward x-tenant-id header if present for multi-tenancy
    const tenantId = req.headers.get('x-tenant-id');
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Validate token proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to validate token' },
      { status: 500 }
    );
  }
}

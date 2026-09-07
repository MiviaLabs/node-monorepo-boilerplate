import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

/**
 * GET /api/tenants/current
 *
 * Proxies tenant current settings read to backend API.
 */
export async function GET(req: NextRequest) {
  try {
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/workspaces/current`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Get current tenant proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get current tenant' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tenants/current
 *
 * Proxies tenant current settings update to backend API.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      displayName?: string;
      isActive?: boolean;
      settings?: Record<string, unknown>;
    };
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/workspaces/current`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      // Backward-compatibility: older API contracts expect `name` instead of
      // `displayName` and reject unknown fields via whitelist validation.
      const errorMessages = Array.isArray(
        (data as { metadata?: { error?: { errors?: unknown } } })?.metadata?.error?.errors
      )
        ? (((data as { metadata?: { error?: { errors?: unknown[] } } }).metadata?.error?.errors ??
            []) as unknown[])
        : [];
      const displayNameRejected = errorMessages.some(
        (entry) =>
          typeof entry === 'string' && entry.includes('property displayName should not exist')
      );

      if (displayNameRejected && typeof body.displayName === 'string') {
        const legacyBody = {
          name: body.displayName,
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.settings ? { settings: body.settings } : {})
        };

        const legacyResponse = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(legacyBody),
          credentials: 'include'
        });

        const legacyData = await legacyResponse.json();
        if (!legacyResponse.ok) {
          return NextResponse.json(legacyData, { status: legacyResponse.status });
        }

        return NextResponse.json(legacyData);
      }

      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Update current tenant proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update current tenant' },
      { status: 500 }
    );
  }
}

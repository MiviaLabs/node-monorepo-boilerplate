import { WEB_SESSION_COOKIE } from '../../../lib/auth/cookies';
import { resolveServerSession, ServerSessionResolutionStatus } from '../../../lib/auth/server-auth';

import type { NextRequest } from 'next/server';

interface BuildProxyHeadersOptions {
  includeAuthorization?: boolean;
  includeTenant?: boolean;
}

function extractBearerToken(headerValue: string | null): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : undefined;
}

/**
 * Build proxy headers for auth API routes with consistent forwarding behavior.
 *
 * For protected endpoints, authorization and tenant can come from either:
 * - Incoming request headers
 * - Session cookies (`accessToken`, `tenantId`) as fallback
 *
 * @param req Incoming Next.js request containing headers and auth cookies.
 * @param options Controls whether auth and tenant headers are forwarded.
 * @returns Headers to use when proxying auth route calls to the API.
 */
export function buildProxyHeaders(
  req: NextRequest,
  options: BuildProxyHeadersOptions = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const requestId = req.headers.get('x-request-id');
  if (requestId) {
    headers['x-request-id'] = requestId;
  }

  const correlationId = req.headers.get('x-correlation-id');
  if (correlationId) {
    headers['x-correlation-id'] = correlationId;
  }

  const causationId = req.headers.get('x-causation-id');
  if (causationId) {
    headers['x-causation-id'] = causationId;
  }

  if (options.includeAuthorization) {
    const accessToken = req.cookies.get('accessToken')?.value;
    const authorization =
      req.headers.get('authorization') ?? (accessToken ? `Bearer ${accessToken}` : undefined);
    if (authorization) {
      headers.authorization = authorization;
    }
  }

  if (options.includeTenant) {
    const tenantId = req.headers.get('x-tenant-id') ?? req.cookies.get('tenantId')?.value;
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }
  }

  return headers;
}

export async function buildAuthenticatedProxyHeaders(
  req: NextRequest,
  options: BuildProxyHeadersOptions = {}
): Promise<Record<string, string>> {
  const headers = buildProxyHeaders(req, options);
  const headerAccessToken = extractBearerToken(req.headers.get('authorization'));
  const hasExplicitAuthorizationHeader = Boolean(req.headers.get('authorization'));
  const hasExplicitTenantHeader = Boolean(req.headers.get('x-tenant-id'));
  const hasWebSession = Boolean(req.cookies.get(WEB_SESSION_COOKIE)?.value);

  const needsAuthorization =
    Boolean(options.includeAuthorization) &&
    (!headers.authorization || (hasWebSession && !hasExplicitAuthorizationHeader));
  const needsTenant =
    Boolean(options.includeTenant) &&
    (!headers['x-tenant-id'] || (hasWebSession && !hasExplicitTenantHeader));

  if (!needsAuthorization && !needsTenant) {
    return headers;
  }

  const resolved = await resolveServerSession(
    {
      accessToken: headerAccessToken ?? req.cookies.get('accessToken')?.value,
      tenantId: req.cookies.get('tenantId')?.value,
      webSessionId: req.cookies.get(WEB_SESSION_COOKIE)?.value
    },
    {
      source: 'web_auth_proxy_route',
      route: req.nextUrl.pathname,
      requestId: req.headers.get('x-request-id') ?? undefined,
      correlationId: req.headers.get('x-correlation-id') ?? undefined,
      causationId: req.headers.get('x-causation-id') ?? undefined
    }
  );

  if (
    resolved.status === ServerSessionResolutionStatus.Valid ||
    resolved.status === ServerSessionResolutionStatus.Refreshed
  ) {
    if (needsAuthorization && resolved.accessToken) {
      headers.authorization = `Bearer ${resolved.accessToken}`;
    }

    if (needsTenant && resolved.tenantId) {
      headers['x-tenant-id'] = resolved.tenantId;
    }
  }

  return headers;
}

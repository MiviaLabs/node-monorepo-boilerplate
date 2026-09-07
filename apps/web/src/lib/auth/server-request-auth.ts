import { headers } from 'next/headers';

import { WEB_SESSION_COOKIE } from './cookies';
import { resolveServerSession, ServerSessionResolutionStatus } from './server-auth';
import {
  RESOLVED_ACCESS_TOKEN_HEADER,
  SESSION_VALIDATED_HEADER,
  VALIDATED_TENANT_ID_HEADER
} from './session-validation-headers';

export interface ServerRequestAuthContext {
  accessToken: string;
  tenantId: string;
}

const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
const TENANT_COOKIE_NAME = 'tenantId';

function getCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(';');
  for (const entry of cookies) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return undefined;
}

export async function resolveServerRequestAuthContextFromHeaders(
  requestHeaders: Headers,
  input: {
    source: string;
    route: string;
  }
): Promise<ServerRequestAuthContext | null> {
  const cookieHeader = requestHeaders.get('cookie');

  const validatedAccessToken = requestHeaders.get(RESOLVED_ACCESS_TOKEN_HEADER)?.trim();
  const validatedTenantId = requestHeaders.get(VALIDATED_TENANT_ID_HEADER)?.trim();
  const sessionValidated = requestHeaders.get(SESSION_VALIDATED_HEADER) === '1';

  if (sessionValidated && validatedAccessToken && validatedTenantId) {
    return {
      accessToken: validatedAccessToken,
      tenantId: validatedTenantId
    };
  }

  const accessToken = getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);
  const tenantId = getCookieValue(cookieHeader, TENANT_COOKIE_NAME);
  const webSessionId = getCookieValue(cookieHeader, WEB_SESSION_COOKIE);

  if (!accessToken && !webSessionId) {
    return null;
  }

  const resolved = await resolveServerSession(
    {
      accessToken,
      tenantId,
      webSessionId
    },
    {
      source: input.source,
      route: input.route,
      requestId: requestHeaders.get('x-request-id') ?? undefined,
      correlationId: requestHeaders.get('x-correlation-id') ?? undefined,
      causationId: requestHeaders.get('x-causation-id') ?? undefined
    }
  );

  if (
    (resolved.status === ServerSessionResolutionStatus.Valid ||
      resolved.status === ServerSessionResolutionStatus.Refreshed) &&
    resolved.accessToken &&
    resolved.tenantId
  ) {
    return {
      accessToken: resolved.accessToken,
      tenantId: resolved.tenantId
    };
  }

  return null;
}

export async function resolveServerRequestAuthContext(input: {
  source: string;
  route: string;
}): Promise<ServerRequestAuthContext | null> {
  const requestHeaders = await headers();
  return resolveServerRequestAuthContextFromHeaders(requestHeaders, input);
}

import { WEB_SESSION_COOKIE, applyWebSessionCookie, clearWebSessionCookie } from './cookies';
import { validateSession } from './server-auth';
import {
  createStoredSession,
  deleteStoredSession,
  getStoredSession,
  hasStoredSessionChanged,
  normalizeRefreshSessionTtl,
  type WebStoredSession
} from './session-store';

import type { NextRequest, NextResponse } from 'next/server';
import type { AuthResponse } from '~/types/auth.types';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

function isAuthResponse(payload: unknown): payload is AuthResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresIn === 'number' &&
    typeof candidate.refreshExpiresIn === 'number' &&
    typeof candidate.user === 'object' &&
    candidate.user !== null
  );
}

function unwrapApiData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if ('data' in payload) {
    return (payload as { data?: T }).data ?? null;
  }

  return payload as T;
}

function extractTenantId(auth: AuthResponse): string {
  const user = auth.user as Record<string, unknown>;
  const tenantId = user.tenantId;

  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('Auth response is missing tenantId');
  }

  return tenantId;
}

function isRefreshAuthFailure(status: number): boolean {
  return [400, 401, 403].includes(status);
}

async function refreshStoredSession(session: WebStoredSession): Promise<AuthResponse> {
  const response = await fetch(`${getVersionedApiBaseUrl(API_VERSION)}/iam/sessions/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': session.tenantId
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken
    }),
    credentials: 'include'
  });

  const payload = await response.json().catch(() => null);
  const auth = unwrapApiData<AuthResponse>(payload);

  if (!response.ok || !isAuthResponse(auth)) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? 'Failed to refresh session')
        : 'Failed to refresh session';
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return auth;
}

export function extractAuthResponseData(payload: unknown): AuthResponse | null {
  const auth = unwrapApiData<AuthResponse>(payload);
  return isAuthResponse(auth) ? auth : null;
}

export async function resolveWebSessionById(
  sessionId: string,
  allowRetry = true
): Promise<{ session: WebStoredSession | null; refreshed: boolean }> {
  const session = await getStoredSession(sessionId);
  if (!session) {
    return { session: null, refreshed: false };
  }

  if (Date.parse(session.refreshExpiresAt) <= Date.now()) {
    await deleteStoredSession(session.sessionId);
    return { session: null, refreshed: false };
  }

  const validated = await validateSession(session.accessToken, session.tenantId, {
    source: 'web.server_session',
    route: 'resolveWebSessionById'
  });

  if (validated.valid) {
    return { session, refreshed: false };
  }

  try {
    const refreshed = await refreshStoredSession(session);
    const nextSession = await createStoredSession({
      sessionId: session.sessionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tenantId: extractTenantId(refreshed),
      user: refreshed.user as Record<string, unknown>,
      expiresIn: refreshed.expiresIn,
      refreshExpiresIn: refreshed.refreshExpiresIn
    });
    return { session: nextSession, refreshed: true };
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : null;

    if (status !== null && isRefreshAuthFailure(status)) {
      if (allowRetry && (await hasStoredSessionChanged(session.sessionId, session.updatedAt))) {
        return resolveWebSessionById(session.sessionId, false);
      }

      await deleteStoredSession(session.sessionId);
      return { session: null, refreshed: false };
    }

    return { session, refreshed: false };
  }
}

export async function persistWebAuthSession(
  auth: AuthResponse,
  existingSessionId?: string
): Promise<WebStoredSession> {
  const tenantId = extractTenantId(auth);

  const nextSession = await createStoredSession({
    sessionId: existingSessionId,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    tenantId,
    user: auth.user as Record<string, unknown>,
    expiresIn: auth.expiresIn,
    refreshExpiresIn: auth.refreshExpiresIn
  });

  return nextSession;
}

export async function applyPersistedWebSession(
  response: NextResponse,
  auth: AuthResponse,
  existingSessionId?: string
): Promise<WebStoredSession> {
  const session = await persistWebAuthSession(auth, existingSessionId);
  applyWebSessionCookie(
    response,
    session.sessionId,
    normalizeRefreshSessionTtl(auth.refreshExpiresIn)
  );
  return session;
}

export async function resolveRequestWebSession(
  req: Pick<NextRequest, 'cookies'>
): Promise<WebStoredSession | null> {
  const sessionId = req.cookies.get(WEB_SESSION_COOKIE)?.value;
  if (!sessionId) {
    return null;
  }

  return getStoredSession(sessionId);
}

export async function clearPersistedWebSession(
  response: NextResponse,
  sessionId?: string | null
): Promise<void> {
  if (sessionId) {
    await deleteStoredSession(sessionId);
  }

  clearWebSessionCookie(response);
}

export { WEB_SESSION_COOKIE };

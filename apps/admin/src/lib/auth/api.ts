import { NextRequest, NextResponse } from 'next/server';

import {
  applyAdminSessionCookie,
  ADMIN_SESSION_COOKIE,
  clearLegacyAdminSessionCookies,
  clearAdminSessionCookies
} from './cookies';
import { resolveAdminSessionById } from './server-session';
import {
  createStoredSession,
  deleteStoredSession,
  getStoredSession,
  normalizeAccessSessionTtl,
  normalizeRefreshSessionTtl,
  saveStoredSession
} from './session-store';
import {
  normalizeAdminOperatorUser,
  type AdminOperatorUser,
  type AdminResolvedSession,
  type AdminSessionPayload
} from './types';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  hydrateAdminSession,
  isSessionAuthFailure,
  REFRESH_TOKEN_COOKIE_NAME,
  refreshSession,
  TENANT_ID_COOKIE_NAME,
  validateAccessToken,
  type AdminSession
} from '../admin-auth-core';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

interface BackendAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: Record<string, unknown>;
}

interface SessionResolutionResult {
  session: AdminResolvedSession | null;
  refreshed: boolean;
  migrated: boolean;
}

function getBackendUrl(endpoint: string): string {
  return `${getVersionedApiBaseUrl(API_VERSION)}${endpoint}`;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function unwrapData<T>(payload: T | { data?: T } | null): T | null {
  if (!payload) return null;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return ((payload as { data?: T }).data ?? null) as T | null;
  }
  return payload as T;
}

function buildAuthHeaders(session: AdminResolvedSession): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    authorization: `Bearer ${session.accessToken}`,
    'x-tenant-id': session.tenantId
  });
}

function getSessionCookieMaxAge(
  session: Pick<AdminResolvedSession, 'refreshExpiresAt'>
): number {
  return Math.max(1, Math.ceil((Date.parse(session.refreshExpiresAt) - Date.now()) / 1000));
}

function buildSessionPayload(session: AdminResolvedSession): AdminSessionPayload {
  return {
    user: session.user,
    expiresAt: session.expiresAt
  };
}

function toStoredSessionPayload(session: AdminSession): {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: AdminOperatorUser;
  expiresIn: number;
  refreshExpiresIn: number;
} | null {
  const operator = normalizeAdminOperatorUser({
    userId: session.user.id,
    actorId: session.user.actorId,
    email: session.user.email,
    name: session.user.name,
    displayName: session.user.displayName,
    phoneNumber: session.user.phoneNumber,
    roles: session.user.roles ?? [session.user.role],
    permissions: session.user.permissions,
    tenantId: session.user.tenantId,
    tenantName: session.user.tenantName,
    tenantDisplayName: session.user.tenantDisplayName
  });

  if (!operator) {
    return null;
  }

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tenantId: session.tenantId,
    user: operator,
    expiresIn: session.expiresIn,
    refreshExpiresIn: session.refreshExpiresIn
  };
}

async function migrateLegacySession(req: NextRequest): Promise<AdminResolvedSession | null> {
  const accessToken =
    req.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? req.cookies.get('bo_access_token')?.value;
  const refreshToken =
    req.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? req.cookies.get('bo_refresh_token')?.value;
  const tenantId =
    req.cookies.get(TENANT_ID_COOKIE_NAME)?.value ?? req.cookies.get('bo_tenant_id')?.value;

  if (!tenantId || (!accessToken && !refreshToken)) {
    return null;
  }

  try {
    let legacySession: AdminSession | null = null;

    if (accessToken) {
      legacySession = await validateAccessToken(tenantId, accessToken, refreshToken);
      if (legacySession) {
        legacySession = await hydrateAdminSession(legacySession);
      }
    }
    if (!legacySession && refreshToken) {
      legacySession = await hydrateAdminSession(await refreshSession(tenantId, refreshToken));
    }

    if (!legacySession) {
      return null;
    }

    const payload = toStoredSessionPayload(legacySession);
    if (!payload) {
      return null;
    }

    return createStoredSession(payload);
  } catch (error) {
    if (!isSessionAuthFailure(error)) {
      throw error;
    }

    return null;
  }
}

async function resolveRequestSession(req: NextRequest): Promise<SessionResolutionResult> {
  const sessionId = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionId) {
    const { session, refreshed } = await resolveAdminSessionById(sessionId);
    return { session, refreshed, migrated: false };
  }

  const migratedSession = await migrateLegacySession(req);
  return {
    session: migratedSession,
    refreshed: false,
    migrated: migratedSession !== null
  };
}

function forbiddenOperatorResponse(): NextResponse {
  const response = NextResponse.json(
    {
      message: 'Admin access is restricted to system operators'
    },
    { status: 403 }
  );
  clearAdminSessionCookies(response);
  return response;
}

async function persistAuthSession(
  auth: BackendAuthResponse,
  existingSessionId?: string
): Promise<AdminResolvedSession | null> {
  const operator = normalizeAdminOperatorUser(auth.user);
  if (!operator) {
    return null;
  }

  const expiresIn = normalizeAccessSessionTtl(auth.expiresIn);
  const refreshExpiresIn = normalizeRefreshSessionTtl(auth.refreshExpiresIn);
  const stored =
    existingSessionId !== undefined
      ? {
          sessionId: existingSessionId,
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          tenantId: operator.tenantId,
          user: operator,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      : await createStoredSession({
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          tenantId: operator.tenantId,
          user: operator,
          expiresIn,
          refreshExpiresIn
        });

  if (existingSessionId !== undefined) {
    await saveStoredSession(stored, refreshExpiresIn);
  }

  return stored;
}

async function fetchOperatorProfile(session: AdminResolvedSession): Promise<{
  operator: AdminOperatorUser | null;
  upstreamStatus: number;
}> {
  const response = await fetch(getBackendUrl('/iam/identity'), {
    method: 'GET',
    headers: buildAuthHeaders(session),
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    return {
      operator: null,
      upstreamStatus: response.status
    };
  }

  const payload = await parseJson<Record<string, unknown> | { data?: Record<string, unknown> }>(
    response
  );
  const user = unwrapData(payload);

  return {
    operator: user ? normalizeAdminOperatorUser(user) : null,
    upstreamStatus: response.status
  };
}

export async function handleAdminLogin(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const response = await fetch(getBackendUrl('/iam/sessions'), {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(body),
      credentials: 'include',
      cache: 'no-store'
    });

    const payload = await parseJson<BackendAuthResponse | { message?: string }>(response);
    if (!response.ok) {
      return NextResponse.json(payload ?? { message: 'Failed to login' }, {
        status: response.status
      });
    }

    const auth = unwrapData(payload as BackendAuthResponse | { data?: BackendAuthResponse });
    if (!auth) {
      return NextResponse.json({ message: 'Invalid authentication response' }, { status: 502 });
    }

    const session = await persistAuthSession(auth);
    if (!session) {
      return forbiddenOperatorResponse();
    }

    const nextResponse = NextResponse.json({
      data: buildSessionPayload(session),
      message: `Signed in as ${session.user.email}. Redirect target: /inbox`,
      redirectTo: '/inbox'
    });
    clearLegacyAdminSessionCookies(nextResponse);
    applyAdminSessionCookie(nextResponse, session.sessionId, getSessionCookieMaxAge(session));
    return nextResponse;
  } catch {
    return NextResponse.json({ message: 'Failed to login' }, { status: 500 });
  }
}

export async function handleAdminLogout(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const stored = sessionId ? await getStoredSession(sessionId) : null;

  if (stored) {
    try {
      await fetch(getBackendUrl('/iam/sessions/close'), {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          authorization: `Bearer ${stored.accessToken}`,
          'x-tenant-id': stored.tenantId
        }),
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
        credentials: 'include',
        cache: 'no-store'
      });
    } catch {
      // Ignore upstream logout failures; local session must still be cleared.
    }

    await deleteStoredSession(stored.sessionId);
  }

  const response = NextResponse.json({ data: { success: true } });
  clearAdminSessionCookies(response);
  return response;
}

export async function handleAdminRefresh(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!sessionId) {
    const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    clearAdminSessionCookies(response);
    return response;
  }

  const session = await getStoredSession(sessionId);
  if (!session) {
    const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    clearAdminSessionCookies(response);
    return response;
  }

  try {
    const response = await fetch(getBackendUrl('/iam/sessions/refresh'), {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-tenant-id': session.tenantId
      }),
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      credentials: 'include',
      cache: 'no-store'
    });

    const payload = await parseJson<BackendAuthResponse | { message?: string }>(response);
    if (!response.ok) {
      const nextResponse = NextResponse.json(payload ?? { message: 'Unable to refresh session' }, {
        status: response.status
      });
      clearAdminSessionCookies(nextResponse);
      await deleteStoredSession(sessionId);
      return nextResponse;
    }

    const auth = unwrapData(payload as BackendAuthResponse | { data?: BackendAuthResponse });
    if (!auth) {
      const nextResponse = NextResponse.json(
        { message: 'Invalid authentication response' },
        { status: 502 }
      );
      clearAdminSessionCookies(nextResponse);
      await deleteStoredSession(sessionId);
      return nextResponse;
    }

    const refreshed = await persistAuthSession(auth, sessionId);
    if (!refreshed) {
      await deleteStoredSession(sessionId);
      return forbiddenOperatorResponse();
    }

    const nextResponse = NextResponse.json({
      data: buildSessionPayload(refreshed)
    });
    clearLegacyAdminSessionCookies(nextResponse);
    applyAdminSessionCookie(
      nextResponse,
      refreshed.sessionId,
      getSessionCookieMaxAge(refreshed)
    );
    return nextResponse;
  } catch {
    const response = NextResponse.json({ message: 'Unable to refresh session' }, { status: 500 });
    clearAdminSessionCookies(response);
    return response;
  }
}

export async function handleAdminMe(_req: NextRequest): Promise<NextResponse> {
  try {
    const { session, refreshed, migrated } = await resolveRequestSession(_req);
    if (!session) {
      const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
      clearAdminSessionCookies(response);
      return response;
    }

    const { operator, upstreamStatus } = await fetchOperatorProfile(session);
    if (!operator) {
      const response = NextResponse.json(
        {
          message: upstreamStatus === 401 ? 'Authentication required' : 'Admin access denied'
        },
        { status: upstreamStatus === 401 ? 401 : 403 }
      );
      clearAdminSessionCookies(response);
      await deleteStoredSession(session.sessionId);
      return response;
    }

    const nextSession: AdminResolvedSession = {
      ...session,
      user: operator,
      updatedAt: new Date().toISOString()
    };
    await saveStoredSession(nextSession);

    const response = NextResponse.json({ data: operator });
    if (refreshed || migrated) {
      clearLegacyAdminSessionCookies(response);
      applyAdminSessionCookie(
        response,
        session.sessionId,
        getSessionCookieMaxAge(nextSession)
      );
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'Failed to load operator profile' }, { status: 500 });
  }
}

export async function handleAdminValidate(req: NextRequest): Promise<NextResponse> {
  try {
    const { session, refreshed, migrated } = await resolveRequestSession(req);
    if (!session) {
      const response = NextResponse.json({ data: { valid: false } }, { status: 401 });
      clearAdminSessionCookies(response);
      return response;
    }

    const response = NextResponse.json({ data: { valid: true, user: session.user } });
    if (refreshed || migrated) {
      clearLegacyAdminSessionCookies(response);
      applyAdminSessionCookie(response, session.sessionId, getSessionCookieMaxAge(session));
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'Failed to validate session' }, { status: 500 });
  }
}

export async function handleAdminUpdateMe(req: NextRequest): Promise<NextResponse> {
  try {
    const { session, refreshed, migrated } = await resolveRequestSession(req);
    if (!session) {
      const response = NextResponse.json({ message: 'Authentication required' }, { status: 401 });
      clearAdminSessionCookies(response);
      return response;
    }

    const body = await req.json();
    const response = await fetch(getBackendUrl('/iam/identity'), {
      method: 'PATCH',
      headers: buildAuthHeaders(session),
      body: JSON.stringify(body),
      credentials: 'include',
      cache: 'no-store'
    });

    const payload = await parseJson<Record<string, unknown> | { data?: Record<string, unknown> }>(
      response
    );

    if (!response.ok) {
      return NextResponse.json(payload ?? { message: 'Failed to update operator profile' }, {
        status: response.status
      });
    }

    const user = unwrapData(payload);
    const operator = user ? normalizeAdminOperatorUser(user) : null;

    if (!operator) {
      const nextResponse = NextResponse.json(
        { message: 'Admin access denied' },
        { status: 403 }
      );
      clearAdminSessionCookies(nextResponse);
      await deleteStoredSession(session.sessionId);
      return nextResponse;
    }

    await saveStoredSession({
      ...session,
      user: operator,
      updatedAt: new Date().toISOString()
    });

    const nextResponse = NextResponse.json({ data: operator });
    if (refreshed || migrated) {
      clearLegacyAdminSessionCookies(nextResponse);
      applyAdminSessionCookie(
        nextResponse,
        session.sessionId,
        getSessionCookieMaxAge(session)
      );
    }
    return nextResponse;
  } catch {
    return NextResponse.json({ message: 'Failed to update operator profile' }, { status: 500 });
  }
}

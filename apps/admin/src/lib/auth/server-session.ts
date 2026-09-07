import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ADMIN_SESSION_COOKIE } from './cookies';
import {
  deleteStoredSession,
  getStoredSession,
  hasStoredSessionChanged,
  saveStoredSession,
  type AdminStoredSession
} from './session-store';
import {
  normalizeAdminOperatorUser,
  type AdminOperatorUser,
  type AdminResolvedSession
} from './types';
import {
  type AdminSessionUser,
  hydrateAdminSession,
  isSessionAuthFailure,
  refreshSession,
  validateAccessToken
} from '../admin-auth-core';

function toOperatorUser(
  user: AdminSessionUser,
  fallback: AdminOperatorUser
): AdminOperatorUser {
  return (
    normalizeAdminOperatorUser({
      userId: user.id,
      actorId: user.actorId,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber ?? fallback.phoneNumber,
      roles: (user.roles?.length ?? 0) > 0 ? user.roles : fallback.roles,
      permissions: (user.permissions?.length ?? 0) > 0 ? user.permissions : fallback.permissions,
      tenantId: user.tenantId,
      tenantName: user.tenantName ?? fallback.tenantName,
      tenantDisplayName: user.tenantDisplayName ?? fallback.tenantDisplayName
    }) ?? fallback
  );
}

async function resolveStoredSession(
  session: AdminStoredSession,
  allowRetry = true
): Promise<{ session: AdminResolvedSession | null; refreshed: boolean }> {
  if (Date.parse(session.refreshExpiresAt) <= Date.now()) {
    await deleteStoredSession(session.sessionId);
    return { session: null, refreshed: false };
  }

  try {
    const validated = await validateAccessToken(
      session.tenantId,
      session.accessToken,
      session.refreshToken
    );

    if (validated) {
      const hydrated = await hydrateAdminSession(validated);
      const nextSession: AdminResolvedSession = {
        sessionId: session.sessionId,
        accessToken: hydrated.accessToken,
        refreshToken: hydrated.refreshToken,
        tenantId: hydrated.tenantId,
        user: toOperatorUser(hydrated.user, session.user),
        expiresAt: new Date(Date.now() + hydrated.expiresIn * 1000).toISOString(),
        refreshExpiresAt: session.refreshExpiresAt,
        updatedAt: new Date().toISOString()
      };
      await saveStoredSession(nextSession);
      return { session: nextSession, refreshed: false };
    }
  } catch (error) {
    if (!isSessionAuthFailure(error)) {
      throw error;
    }
  }

  try {
    const refreshed = await hydrateAdminSession(
      await refreshSession(session.tenantId, session.refreshToken)
    );
    const nextSession: AdminResolvedSession = {
      sessionId: session.sessionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tenantId: refreshed.tenantId,
      user: toOperatorUser(refreshed.user, session.user),
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + refreshed.refreshExpiresIn * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveStoredSession(nextSession, refreshed.refreshExpiresIn);
    return { session: nextSession, refreshed: true };
  } catch (error) {
    if (!isSessionAuthFailure(error)) {
      throw error;
    }

    if (allowRetry && (await hasStoredSessionChanged(session.sessionId, session.updatedAt))) {
      const latest = await getStoredSession(session.sessionId);
      if (latest) {
        return resolveStoredSession(latest, false);
      }
    }

    await deleteStoredSession(session.sessionId);
    return { session: null, refreshed: false };
  }
}

export async function getAdminServerSession(): Promise<AdminOperatorUser | null> {
  const session = await getAdminResolvedSession();
  return session?.user ?? null;
}

export async function resolveAdminSessionById(
  sessionId: string
): Promise<{ session: AdminResolvedSession | null; refreshed: boolean }> {
  const session = await getStoredSession(sessionId);
  if (!session) {
    return { session: null, refreshed: false };
  }

  return resolveStoredSession(session);
}

export async function getAdminResolvedSession(): Promise<AdminResolvedSession | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!sessionId) {
    return null;
  }

  return (await resolveAdminSessionById(sessionId)).session;
}

export async function requireAdminServerSession(): Promise<AdminOperatorUser> {
  const session = await getAdminServerSession();
  if (!session) {
    redirect('/');
  }
  return session;
}

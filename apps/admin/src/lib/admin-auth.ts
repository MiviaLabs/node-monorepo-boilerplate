import { ZodError } from 'zod';

import {
  applyAdminSessionCookie,
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookies
} from './auth/cookies';
import { getAdminResolvedSession } from './auth/server-session';
import {
  type BootstrapInstallPayload,
  type BootstrapStatus,
  BackendRequestError,
  getBootstrapStatus,
  installBootstrap,
  loginWithPassword,
  logoutAdminSession
} from './admin-auth-core';

import type { AdminOperatorUser, AdminResolvedSession } from './auth/types';

export {
  type BootstrapInstallPayload,
  type BootstrapStatus,
  getBootstrapStatus,
  installBootstrap,
  loginWithPassword,
  logoutAdminSession,
  ADMIN_SESSION_COOKIE as SESSION_COOKIE_NAME,
  applyAdminSessionCookie as applySessionCookie,
  clearAdminSessionCookies as clearSessionCookies
};
export type { LoginPayload } from './admin-auth-core';
export type AdminSession = AdminResolvedSession;
export type AdminSessionUser = AdminOperatorUser;

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BackendRequestError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function getErrorStatus(error: unknown, fallback: number): number {
  if (error instanceof BackendRequestError) {
    return error.status;
  }

  if (error instanceof ZodError) {
    return 400;
  }

  return fallback;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  return getAdminResolvedSession();
}

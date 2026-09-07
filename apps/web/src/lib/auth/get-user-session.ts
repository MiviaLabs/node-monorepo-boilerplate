/**
 * Server-Side User Session Fetching
 *
 * Utility for fetching authenticated user data in Server Components
 *
 * IMPORTANT: This runs in Next.js Server Components (not Edge runtime).
 * Can access headers() from next/headers to read cookies.
 * Used for server-side rendering with user data.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { WEB_SESSION_COOKIE } from './cookies';
import { resolveServerSession, ServerSessionResolutionStatus } from './server-auth';
import {
  PROTECTED_PATHNAME_HEADER,
  RESOLVED_ACCESS_TOKEN_HEADER,
  SESSION_VALIDATED_HEADER,
  VALIDATED_TENANT_ID_HEADER
} from './session-validation-headers';
import { mergeUserProfile } from './user-profile-merge';

import {
  ensurePhase0Trace,
  getPhase0ApiTargetAttributes,
  getPhase0RouteBudgetAttributes,
  getPhase0TraceAttributes,
  getPhase0TraceHeaderMap,
  measurePhase0,
  recordPhase0Note
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import {
  normalizeCurrentUserSettings,
  type CurrentUserSettings
} from '~/lib/user-settings/current-user-settings';
import {
  normalizeUser,
  type IAuthBootstrapResponse,
  type User,
  type UserOrganization
} from '~/types/auth.types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cookie name for session ID */
const SESSION_COOKIE_NAME = 'sessionId';

/** Cookie name for tenant ID */
const TENANT_COOKIE_NAME = 'tenantId';

/** Cookie name for access token */
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';

/** Login redirect path */
const LOGIN_PATH = '/login';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Server-side session data
 * Contains only what's available server-side (no tokens)
 */
export interface ServerSessionData {
  user: User;
  sessionId: string;
  tenantId: string;
  currentOrganizationId: string | null;
  organizations: UserOrganization[];
  currentUserSettings: CurrentUserSettings;
  tenantName: string | null;
  tenantDisplayName: string | null;
  tenantSlug: string | null;
  session: {
    authenticated: boolean;
    createdAt: Date | null;
    expiresAt: Date | null;
  };
}

const enum JwtClaim {
  Iat = 'iat',
  Exp = 'exp'
}

interface TenantInfoLike {
  name?: string;
  displayName?: string;
  slug?: string;
}

interface UserOrganizationListPayload {
  data?: UserOrganization[];
}

interface CurrentUserSettingsPayload {
  data?: {
    sidebarSectionOrder?: unknown;
    dashboardDefaultView?: unknown;
    workspaceActiveProjectId?: unknown;
  };
  sidebarSectionOrder?: unknown;
  dashboardDefaultView?: unknown;
  workspaceActiveProjectId?: unknown;
}

interface AuthBootstrapFetchResult {
  data: IAuthBootstrapResponse | null;
  statusCode: number | null;
  failureReason: 'network' | 'http' | 'invalid_payload' | null;
}

const enum SessionPathMode {
  Bootstrap = 'bootstrap',
  FallbackEnabled = 'fallback_enabled'
}

function getFirstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return '';
}

function getProtectedPathname(requestHeaders: Headers): string | null {
  const pathname = requestHeaders.get(PROTECTED_PATHNAME_HEADER);
  if (!pathname) {
    return null;
  }

  return pathname.startsWith('/') ? pathname : null;
}

function buildLoginRedirectPath(pathname: string | null): string {
  if (!pathname) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?${new URLSearchParams({ redirect: pathname }).toString()}`;
}

function buildAuthedRequestHeaders(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...traceHeaders,
    ...(tenantId ? { 'x-tenant-id': tenantId } : {})
  };
}

async function fetchAuthResource(
  pathname: string,
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>,
  noteStage: string
): Promise<Response | null> {
  try {
    const apiBaseUrl = getVersionedApiBaseUrl('v1');
    const url = `${apiBaseUrl}${pathname}`;

    recordPhase0Note(noteStage, {
      pathname,
      tenantIdPresent: Boolean(tenantId),
      ...getPhase0ApiTargetAttributes(apiBaseUrl),
      ...traceAttributes
    });

    return await fetch(url, {
      method: 'GET',
      headers: buildAuthedRequestHeaders(accessToken, tenantId, traceHeaders),
      cache: 'no-store'
    });
  } catch {
    return null;
  }
}

/**
 * Extract date claim from JWT payload.
 *
 * Returns null when token is malformed or claim is missing.
 */
function getJwtDateClaim(token: string, claim: JwtClaim): Date | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const json = JSON.parse(decoded) as Record<string, unknown>;
    const value = json[claim];

    if (typeof value !== 'number') {
      return null;
    }

    return new Date(value * 1000);
  } catch {
    return null;
  }
}

async function fetchSessionBootstrap(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<AuthBootstrapFetchResult> {
  try {
    const response = await fetchAuthResource(
      '/iam/identity/boot',
      accessToken,
      tenantId,
      traceHeaders,
      traceAttributes,
      'web.get_user_session.fetch_bootstrap.target'
    );
    if (!response) {
      return {
        data: null,
        statusCode: null,
        failureReason: 'network'
      };
    }

    if (!response.ok) {
      return {
        data: null,
        statusCode: response.status,
        failureReason: 'http'
      };
    }

    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === 'object' && 'data' in payload) {
      const data = (payload as { data?: IAuthBootstrapResponse }).data ?? null;
      return {
        data,
        statusCode: response.status,
        failureReason: data ? null : 'invalid_payload'
      };
    }

    const data = payload as IAuthBootstrapResponse;
    return {
      data,
      statusCode: response.status,
      failureReason: data ? null : 'invalid_payload'
    };
  } catch {
    return {
      data: null,
      statusCode: null,
      failureReason: 'network'
    };
  }
}

async function fetchUserProfile(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<IAuthBootstrapResponse['user'] | null> {
  try {
    const response = await fetchAuthResource(
      '/iam/identity',
      accessToken,
      tenantId,
      traceHeaders,
      traceAttributes,
      'web.get_user_session.fetch_profile.target'
    );
    if (!response?.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return (payload as { data?: IAuthBootstrapResponse['user'] }).data ?? null;
    }

    return payload as IAuthBootstrapResponse['user'];
  } catch {
    return null;
  }
}

async function fetchTenantInfo(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<TenantInfoLike | null> {
  try {
    const response = await fetchAuthResource(
      '/workspaces/current',
      accessToken,
      tenantId,
      traceHeaders,
      traceAttributes,
      'web.get_user_session.fetch_tenant_info.target'
    );
    if (!response?.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const data =
      payload && typeof payload === 'object' && 'data' in payload
        ? ((payload as { data?: unknown }).data ?? null)
        : payload;

    if (!data || typeof data !== 'object') {
      return null;
    }

    return data as TenantInfoLike;
  } catch {
    return null;
  }
}

async function fetchUserOrganizations(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<UserOrganization[]> {
  try {
    const response = await fetchAuthResource(
      '/iam/identity/orgs',
      accessToken,
      tenantId,
      traceHeaders,
      traceAttributes,
      'web.get_user_session.fetch_organizations.target'
    );
    if (!response?.ok) {
      return [];
    }

    const payload = (await response.json()) as UserOrganizationListPayload | UserOrganization[];
    const rawOrganizations = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : [];

    return rawOrganizations.filter((organization) => organization.isActive);
  } catch {
    return [];
  }
}

async function fetchCurrentUserSettings(
  accessToken: string,
  tenantId: string | undefined,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<CurrentUserSettings> {
  try {
    const response = await fetchAuthResource(
      '/iam/identity/preferences',
      accessToken,
      tenantId,
      traceHeaders,
      traceAttributes,
      'web.get_user_session.fetch_user_settings.target'
    );
    if (!response?.ok) {
      return normalizeCurrentUserSettings(undefined);
    }

    const payload = (await response.json()) as CurrentUserSettingsPayload;
    return normalizeCurrentUserSettings(payload.data ?? payload);
  } catch {
    return normalizeCurrentUserSettings(undefined);
  }
}

async function fetchTenantInfoWithFallback(
  accessToken: string,
  tenantIds: Array<string | undefined>,
  traceHeaders: Record<string, string>,
  traceAttributes: Record<string, string>
): Promise<{ tenantInfo: TenantInfoLike | null; resolvedTenantId: string | null }> {
  const candidates = Array.from(
    new Set(tenantIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))
  );

  for (const candidate of candidates) {
    const tenantInfo = await fetchTenantInfo(accessToken, candidate, traceHeaders, traceAttributes);
    if (tenantInfo) {
      return { tenantInfo, resolvedTenantId: candidate };
    }
  }

  return { tenantInfo: null, resolvedTenantId: candidates[0] ?? null };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get authenticated user session for server-side rendering
 *
 * This function is designed to be called from Server Components.
 * It validates the session server-side and returns user data.
 *
 * Features:
 * - Reads access token and tenantId from cookies
 * - Validates session with backend API
 * - Redirects to login if unauthenticated
 * - Returns user data for server-side rendering
 *
 * @returns Server-side session data with user information
 * @throws Redirects to /login if session is invalid
 *
 * @example
 * ```typescript
 * // In a Server Component
 * export default async function DashboardPage() {
 *   const { user } = await getUserSession();
 *
 *   return <div>Welcome {user.displayName}</div>;
 * }
 * ```
 */
const getUserSessionCached = cache(async (): Promise<ServerSessionData> => {
  const requestHeaders = await headers();
  const protectedPathname = getProtectedPathname(requestHeaders);
  const phase0Trace = ensurePhase0Trace(requestHeaders);
  const phase0TraceAttributes = getPhase0TraceAttributes(phase0Trace);
  const phase0TraceHeaders = getPhase0TraceHeaderMap(phase0Trace);

  return measurePhase0(
    'web.get_user_session.bootstrap',
    {
      loginPath: LOGIN_PATH,
      ...getPhase0RouteBudgetAttributes(protectedPathname),
      ...phase0TraceAttributes
    },
    async () => {
      const cookieStore = await cookies();
      const cookieAccessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
      let accessToken = requestHeaders.get(RESOLVED_ACCESS_TOKEN_HEADER) ?? cookieAccessToken;
      const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      const tenantId = cookieStore.get(TENANT_COOKIE_NAME)?.value;
      const webSessionId = cookieStore.get(WEB_SESSION_COOKIE)?.value;
      const validatedTenantIdHeader = requestHeaders.get(VALIDATED_TENANT_ID_HEADER);

      if (!accessToken && !webSessionId) {
        redirect(buildLoginRedirectPath(protectedPathname));
      }

      const alreadyValidated = requestHeaders.get(SESSION_VALIDATED_HEADER) === '1';
      let validatedUser: User | undefined;
      let resolvedTenantId = getFirstNonEmpty(validatedTenantIdHeader, tenantId);
      let resolvedSessionId = sessionId ?? webSessionId ?? '';
      let sessionResolutionStatus: ServerSessionResolutionStatus | null = alreadyValidated
        ? ServerSessionResolutionStatus.Valid
        : null;

      if (!alreadyValidated) {
        const resolvedSession = await measurePhase0(
          'web.get_user_session.resolve_session',
          {
            tenantIdPresent: Boolean(tenantId),
            ...phase0TraceAttributes
          },
          () =>
            resolveServerSession(
              {
                accessToken,
                tenantId,
                webSessionId
              },
              {
                source: 'web_get_user_session',
                route: protectedPathname ?? LOGIN_PATH,
                ...phase0Trace
              }
            )
        );

        if (
          resolvedSession.status === ServerSessionResolutionStatus.AuthInvalid ||
          resolvedSession.status === ServerSessionResolutionStatus.Missing
        ) {
          redirect(buildLoginRedirectPath(protectedPathname));
        }

        accessToken = resolvedSession.accessToken ?? accessToken;
        validatedUser = resolvedSession.user;
        resolvedTenantId = getFirstNonEmpty(
          resolvedSession.tenantId,
          validatedTenantIdHeader,
          tenantId
        );
        resolvedSessionId = resolvedSession.sessionId ?? resolvedSessionId;
        sessionResolutionStatus = resolvedSession.status;

        if (!accessToken) {
          redirect(buildLoginRedirectPath(protectedPathname));
        }
      }

      if (!accessToken) {
        redirect(buildLoginRedirectPath(protectedPathname));
      }

      const bootstrapResult = await measurePhase0(
        'web.get_user_session.fetch_bootstrap',
        {
          tenantIdPresent: Boolean(resolvedTenantId),
          alreadyValidated,
          sessionResolutionStatus: sessionResolutionStatus ?? undefined,
          ...phase0TraceAttributes
        },
        () =>
          fetchSessionBootstrap(
            accessToken,
            resolvedTenantId,
            phase0TraceHeaders,
            phase0TraceAttributes
          )
      );
      const bootstrap = bootstrapResult.data;
      const bootstrapStatusCode = bootstrapResult.statusCode;
      const bootstrapFailureReason = bootstrapResult.failureReason;

      if (bootstrap) {
        recordPhase0Note('web.get_user_session.path', {
          mode: SessionPathMode.Bootstrap,
          alreadyValidated,
          sessionResolutionStatus: sessionResolutionStatus ?? undefined,
          route: protectedPathname ?? LOGIN_PATH,
          ...phase0TraceAttributes
        });
        const bootstrapUser = normalizeUser(bootstrap.user as unknown as Record<string, unknown>);
        const tenantContextId = getFirstNonEmpty(
          bootstrap.currentOrganizationId,
          bootstrapUser.tenantId,
          validatedUser?.tenantId,
          resolvedTenantId
        );
        const user = validatedUser
          ? {
              ...validatedUser,
              ...bootstrapUser,
              tenantId: tenantContextId
            }
          : {
              ...bootstrapUser,
              tenantId: tenantContextId
            };
        const organizations = bootstrap.organizations.filter(
          (organization) => organization.isActive
        );

        return {
          user,
          sessionId: resolvedSessionId,
          tenantId: tenantContextId,
          currentOrganizationId: bootstrap.currentOrganizationId,
          organizations,
          currentUserSettings: normalizeCurrentUserSettings(bootstrap.currentUserSettings),
          tenantName: bootstrap.tenantName,
          tenantDisplayName: bootstrap.tenantDisplayName,
          tenantSlug: bootstrap.tenantSlug,
          session: {
            authenticated: true,
            createdAt: getJwtDateClaim(accessToken, JwtClaim.Iat),
            expiresAt: getJwtDateClaim(accessToken, JwtClaim.Exp)
          }
        };
      }

      recordPhase0Note('web.get_user_session.path', {
        mode: SessionPathMode.FallbackEnabled,
        degradedMode: true,
        alreadyValidated,
        bootstrapStatusCode: bootstrapStatusCode ?? undefined,
        fallbackReason: bootstrapFailureReason ?? 'unknown',
        route: protectedPathname ?? LOGIN_PATH,
        sessionResolutionStatus: sessionResolutionStatus ?? undefined,
        ...phase0TraceAttributes
      });

      const profile = await measurePhase0(
        'web.get_user_session.fetch_profile_fallback',
        {
          tenantContextPresent: Boolean(resolvedTenantId),
          ...phase0TraceAttributes
        },
        () =>
          fetchUserProfile(accessToken, resolvedTenantId, phase0TraceHeaders, phase0TraceAttributes)
      );
      const fallbackSeedUser =
        validatedUser ??
        (profile ? normalizeUser(profile as unknown as Record<string, unknown>) : null);

      if (!fallbackSeedUser) {
        redirect(buildLoginRedirectPath(protectedPathname));
      }

      const { tenantInfo, resolvedTenantId: fallbackTenantId } = await measurePhase0(
        'web.get_user_session.fetch_tenant_info_fallback',
        {
          tenantContextPresent: Boolean(resolvedTenantId),
          ...phase0TraceAttributes
        },
        () =>
          fetchTenantInfoWithFallback(
            accessToken,
            [resolvedTenantId, profile?.tenantId, validatedUser?.tenantId, tenantId],
            phase0TraceHeaders,
            phase0TraceAttributes
          )
      );
      const user = mergeUserProfile(fallbackSeedUser, profile);
      const tenantContextId = getFirstNonEmpty(
        fallbackTenantId,
        user.tenantId,
        resolvedTenantId,
        tenantId
      );
      const organizations = await measurePhase0(
        'web.get_user_session.fetch_organizations_fallback',
        {
          tenantContextPresent: Boolean(tenantContextId),
          ...phase0TraceAttributes
        },
        () =>
          fetchUserOrganizations(
            accessToken,
            tenantContextId,
            phase0TraceHeaders,
            phase0TraceAttributes
          )
      );
      const currentOrganizationId =
        organizations.find((organization) => organization.organizationId === tenantContextId)
          ?.organizationId ??
        organizations.find((organization) => organization.isDefault)?.organizationId ??
        organizations[0]?.organizationId ??
        null;
      const currentOrganization = organizations.find(
        (organization) => organization.organizationId === currentOrganizationId
      );
      const currentUserSettings = await measurePhase0(
        'web.get_user_session.fetch_user_settings_fallback',
        {
          tenantContextPresent: Boolean(tenantContextId),
          currentOrganizationPresent: Boolean(currentOrganizationId),
          ...phase0TraceAttributes
        },
        () =>
          fetchCurrentUserSettings(
            accessToken,
            currentOrganizationId ?? tenantContextId,
            phase0TraceHeaders,
            phase0TraceAttributes
          )
      );

      return {
        user,
        sessionId: resolvedSessionId,
        tenantId: tenantContextId,
        currentOrganizationId,
        organizations,
        currentUserSettings,
        tenantName: tenantInfo?.name ?? currentOrganization?.name ?? null,
        tenantDisplayName:
          tenantInfo?.displayName ??
          currentOrganization?.displayName ??
          currentOrganization?.name ??
          null,
        tenantSlug: tenantInfo?.slug ?? currentOrganization?.slug ?? null,
        session: {
          authenticated: true,
          createdAt: getJwtDateClaim(accessToken, JwtClaim.Iat),
          expiresAt: getJwtDateClaim(accessToken, JwtClaim.Exp)
        }
      };
    }
  );
});

export async function getUserSession(): Promise<ServerSessionData> {
  return getUserSessionCached();
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================

export { SESSION_COOKIE_NAME, TENANT_COOKIE_NAME, LOGIN_PATH };

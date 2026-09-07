export const ACCESS_TOKEN_COOKIE_NAME = 'admin_access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'admin_refresh_token';
export const TENANT_ID_COOKIE_NAME = 'admin_tenant_id';

export const DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;
export const DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface BootstrapStatus {
  initialized: boolean;
  installAllowed: boolean;
  systemOwnerExists: boolean;
}

export interface AdminSessionUser {
  id: string;
  actorId?: string;
  name: string;
  displayName?: string;
  email: string;
  phoneNumber?: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  avatarFallback: string;
  tenantId: string;
  tenantName?: string;
  tenantDisplayName?: string;
}

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: AdminSessionUser;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LogoutPayload {
  accessToken?: string;
  refreshToken?: string;
  tenantId?: string;
}

export interface BootstrapInstallPayload {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  organizationSlug: string;
  firstName?: string;
  lastName?: string;
}

type BackendAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  user: {
    email: string;
    roles: string[];
    tenantId: string;
    userId: string;
    username: string;
  };
};

type ValidateTokenResponse = {
  valid: boolean;
  user?: {
    email?: string;
    roles?: string[];
    tenantId?: string;
    userId?: string;
    username?: string;
  };
};

type BackendUserProfileResponse = {
  userId: string;
  tenantId: string;
  actorId: string;
  email?: string;
  name?: string;
  displayName?: string;
  phoneNumber?: string;
  roles?: string[];
  permissions?: string[];
};

type BackendTenantInfoResponse = {
  name?: string;
  displayName?: string;
};

type ApiEnvelope<T> = {
  data: T;
};

type BackendErrorBody = {
  message?: string | string[];
  data?: {
    message?: string | string[];
  };
};

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
  }
}

export function isSessionAuthFailure(error: unknown): boolean {
  return error instanceof BackendRequestError && [400, 401, 403].includes(error.status);
}

function getBackendBaseUrl(): string {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!apiUrl) {
    throw new Error('API_URL environment variable is not set for server-side backend calls.');
  }

  const trimmed = apiUrl.replace(/\/+$/, '');
  const normalizedOrigin = trimmed.replace(/\/api(?:\/v\d+)?$/, '');

  return `${normalizedOrigin}/api/v1`;
}

function getBackendUrl(path: `/${string}`): string {
  return `${getBackendBaseUrl()}${path}`;
}

function isApiEnvelope<T>(body: unknown): body is ApiEnvelope<T> {
  return typeof body === 'object' && body !== null && 'data' in body;
}

function unwrapApiData<T>(body: T | ApiEnvelope<T>): T {
  return isApiEnvelope<T>(body) ? body.data : body;
}

function extractErrorMessage(message: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(message)) {
    const normalized = message.filter(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
    return normalized.length > 0 ? normalized.join(', ') : fallback;
  }

  return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
}

function normalizeRole(role: string | undefined): string {
  if (!role) {
    return 'Authenticated User';
  }

  return role
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function deriveName(username: string | undefined, email: string | undefined): string {
  const source = username?.trim() || email?.trim() || 'Admin User';
  const localPart = source.includes('@') ? (source.split('@')[0] ?? 'Admin User') : source;
  return localPart
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function deriveAvatarFallback(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join('') || 'BU'
  );
}

function toAdminSessionUser(
  user: BackendAuthResponse['user'] | NonNullable<ValidateTokenResponse['user']> | undefined
): AdminSessionUser | null {
  if (!user?.userId || !user.tenantId) {
    return null;
  }

  const name = deriveName(user.username, user.email);

  return {
    id: user.userId,
    actorId: user.userId,
    name,
    displayName: name,
    email: user.email ?? '',
    phoneNumber: undefined,
    role: normalizeRole(user.roles?.[0]),
    roles: user.roles ?? [],
    permissions: [],
    avatarFallback: deriveAvatarFallback(name),
    tenantId: user.tenantId,
    tenantName: undefined,
    tenantDisplayName: undefined
  };
}

function mergeHydratedUser(
  user: AdminSessionUser,
  profile: BackendUserProfileResponse | null,
  tenantInfo: BackendTenantInfoResponse | null
): AdminSessionUser {
  const resolvedDisplayName =
    profile?.displayName?.trim() || profile?.name?.trim() || user.displayName || user.name;
  const resolvedRoles =
    profile?.roles?.filter((role) => role.trim().length > 0) ??
    user.roles?.filter((role) => role.trim().length > 0) ??
    [];
  const resolvedPrimaryRole = resolvedRoles[0];
  const resolvedTenantDisplayName =
    tenantInfo?.displayName?.trim() || tenantInfo?.name?.trim() || user.tenantDisplayName;
  const resolvedTenantName = tenantInfo?.name?.trim() || user.tenantName;

  return {
    ...user,
    id: profile?.userId ?? user.id,
    actorId: profile?.actorId ?? user.actorId,
    name: resolvedDisplayName,
    displayName: resolvedDisplayName,
    email: profile?.email ?? user.email,
    phoneNumber: profile?.phoneNumber ?? user.phoneNumber,
    role: resolvedPrimaryRole ? normalizeRole(resolvedPrimaryRole) : user.role,
    roles: resolvedRoles,
    permissions: profile?.permissions ?? user.permissions ?? [],
    avatarFallback: deriveAvatarFallback(resolvedDisplayName),
    tenantId: profile?.tenantId ?? user.tenantId,
    tenantName: resolvedTenantName,
    tenantDisplayName: resolvedTenantDisplayName
  };
}

export function buildCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds
  };
}

export function applySessionCookies(
  response: {
    cookies: {
      set: (name: string, value: string, options: ReturnType<typeof buildCookieOptions>) => void;
    };
  },
  session: AdminSession
): void {
  response.cookies.set(
    ACCESS_TOKEN_COOKIE_NAME,
    session.accessToken,
    buildCookieOptions(session.expiresIn)
  );
  response.cookies.set(
    REFRESH_TOKEN_COOKIE_NAME,
    session.refreshToken,
    buildCookieOptions(session.refreshExpiresIn)
  );
  response.cookies.set(
    TENANT_ID_COOKIE_NAME,
    session.tenantId,
    buildCookieOptions(session.refreshExpiresIn)
  );
}

export function clearSessionCookies(response: {
  cookies: {
    set: (name: string, value: string, options: ReturnType<typeof buildCookieOptions>) => void;
  };
}): void {
  const expired = buildCookieOptions(0);
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, '', expired);
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, '', expired);
  response.cookies.set(TENANT_ID_COOKIE_NAME, '', expired);
}

async function requestBackend<T>(
  path: `/${string}`,
  init: RequestInit = {},
  headers?: HeadersInit
): Promise<T> {
  const response = await fetch(getBackendUrl(path), {
    ...init,
    headers: {
      ...(headers ?? {}),
      ...(init.body ? { 'content-type': 'application/json' } : {})
    },
    cache: 'no-store'
  });

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const body = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const payload = (body ?? undefined) as BackendErrorBody | undefined;
    const message = extractErrorMessage(
      payload?.message ?? payload?.data?.message,
      `Backend request failed with status ${response.status}`
    );
    throw new BackendRequestError(message, response.status, body);
  }

  return body as T;
}

function toAdminSession(response: BackendAuthResponse): AdminSession {
  const user = toAdminSessionUser(response.user);
  if (!user) {
    throw new Error('Authentication response is missing user session data.');
  }

  const expiresIn =
    response.expiresIn && response.expiresIn > 0
      ? response.expiresIn
      : DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS;
  const refreshExpiresIn =
    response.refreshExpiresIn && response.refreshExpiresIn > 0
      ? response.refreshExpiresIn
      : DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS;

  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    tenantId: response.user.tenantId,
    user,
    expiresIn,
    refreshExpiresIn
  };
}

async function fetchCurrentUserProfile(
  accessToken: string,
  tenantId: string
): Promise<BackendUserProfileResponse | null> {
  const response = await requestBackend<
    ApiEnvelope<BackendUserProfileResponse> | BackendUserProfileResponse
  >(
    '/iam/identity',
    {
      method: 'GET'
    },
    {
      Authorization: `Bearer ${accessToken}`,
      'x-tenant-id': tenantId
    }
  );

  return unwrapApiData(response);
}

async function fetchTenantInfo(
  accessToken: string,
  tenantId: string
): Promise<BackendTenantInfoResponse | null> {
  const response = await fetch(getBackendUrl('/workspaces/current'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-tenant-id': tenantId,
      'content-type': 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as
    | ApiEnvelope<BackendTenantInfoResponse>
    | BackendTenantInfoResponse;

  return unwrapApiData(body);
}

export async function hydrateAdminSession(
  session: AdminSession
): Promise<AdminSession> {
  try {
    const profile = await fetchCurrentUserProfile(session.accessToken, session.tenantId);
    const resolvedTenantId = profile?.tenantId ?? session.tenantId;
    const tenantInfo = resolvedTenantId
      ? await fetchTenantInfo(session.accessToken, resolvedTenantId)
      : null;

    return {
      ...session,
      tenantId: resolvedTenantId,
      user: mergeHydratedUser(session.user, profile, tenantInfo)
    };
  } catch {
    return session;
  }
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const response = await requestBackend<ApiEnvelope<BootstrapStatus> | BootstrapStatus>(
    '/setup/status'
  );
  return unwrapApiData(response);
}

export async function installBootstrap(payload: BootstrapInstallPayload): Promise<void> {
  await requestBackend('/setup/install', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function loginWithPassword(payload: LoginPayload): Promise<AdminSession> {
  const response = unwrapApiData(
    await requestBackend<ApiEnvelope<BackendAuthResponse> | BackendAuthResponse>('/iam/sessions', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  );

  return toAdminSession(response);
}

export async function validateAccessToken(
  tenantId: string,
  accessToken: string,
  refreshToken?: string
): Promise<AdminSession | null> {
  const response = unwrapApiData(
    await requestBackend<ApiEnvelope<ValidateTokenResponse> | ValidateTokenResponse>(
      '/iam/tokens/verify',
      {
        method: 'POST',
        body: JSON.stringify({ token: accessToken })
      },
      {
        'x-tenant-id': tenantId
      }
    )
  );

  if (!response.valid) {
    return null;
  }

  const user = toAdminSessionUser(response.user);
  if (!user) {
    return null;
  }

  return {
    accessToken,
    refreshToken: refreshToken ?? '',
    tenantId,
    user,
    expiresIn: DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
    refreshExpiresIn: DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS
  };
}

export async function refreshSession(
  tenantId: string,
  refreshToken: string
): Promise<AdminSession> {
  const response = unwrapApiData(
    await requestBackend<ApiEnvelope<BackendAuthResponse> | BackendAuthResponse>(
      '/iam/sessions/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      },
      {
        'x-tenant-id': tenantId
      }
    )
  );

  return toAdminSession(response);
}

export async function logoutAdminSession(payload: LogoutPayload): Promise<void> {
  const { accessToken, refreshToken, tenantId } = payload;

  if (!accessToken || !refreshToken) {
    return;
  }

  try {
    await requestBackend(
      '/iam/sessions/close',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      },
      {
        authorization: `Bearer ${accessToken}`,
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      }
    );
  } catch {
    // Ignore backend logout failures; cookie clearing is the primary logout guarantee.
  }
}

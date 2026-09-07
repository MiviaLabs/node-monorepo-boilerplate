export const ADMIN_ALLOWED_SYSTEM_ROLES = ['system_owner', 'system_admin'] as const;

export type AdminAllowedSystemRole = (typeof ADMIN_ALLOWED_SYSTEM_ROLES)[number];

export interface AdminOperatorUser {
  userId: string;
  actorId: string;
  email: string;
  name: string;
  displayName: string;
  phoneNumber?: string;
  role: AdminAllowedSystemRole;
  roleLabel: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  tenantName?: string;
  tenantDisplayName?: string;
  avatarFallback: string;
}

export interface AdminSessionPayload {
  user: AdminOperatorUser;
  expiresAt: string;
}

export interface AdminResolvedSession extends AdminSessionPayload {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  refreshExpiresAt: string;
  updatedAt: string;
}

interface RawAuthUser {
  userId?: unknown;
  actorId?: unknown;
  email?: unknown;
  name?: unknown;
  displayName?: unknown;
  phoneNumber?: unknown;
  roles?: unknown;
  permissions?: unknown;
  tenantId?: unknown;
  tenantName?: unknown;
  tenantDisplayName?: unknown;
}

function getAvatarFallback(name: string, email: string): string {
  const source = name.trim().length > 0 ? name : email;
  const parts = source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }

  const fallback = source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2);
  return (fallback || 'BO').toUpperCase();
}

function toRoleLabel(role: AdminAllowedSystemRole): string {
  return role === 'system_owner' ? 'System Owner' : 'System Administrator';
}

export function getAllowedAdminRole(
  roles: readonly string[]
): AdminAllowedSystemRole | null {
  for (const role of roles) {
    if (
      role === ADMIN_ALLOWED_SYSTEM_ROLES[0] ||
      role === ADMIN_ALLOWED_SYSTEM_ROLES[1]
    ) {
      return role;
    }
  }

  return null;
}

export function isAdminOperatorRole(role: string): role is AdminAllowedSystemRole {
  return getAllowedAdminRole([role]) !== null;
}

export function normalizeAdminOperatorUser(raw: RawAuthUser): AdminOperatorUser | null {
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter((value): value is string => typeof value === 'string')
    : [];
  const role = getAllowedAdminRole(roles);

  if (!role) {
    return null;
  }

  const userId = typeof raw.userId === 'string' ? raw.userId : '';
  const actorId = typeof raw.actorId === 'string' ? raw.actorId : userId;
  const email = typeof raw.email === 'string' ? raw.email : '';
  const name =
    (typeof raw.displayName === 'string' && raw.displayName.trim()) ||
    (typeof raw.name === 'string' && raw.name.trim()) ||
    email;
  const tenantId = typeof raw.tenantId === 'string' ? raw.tenantId : '';

  if (!userId || !actorId || !email) {
    return null;
  }

  return {
    userId,
    actorId,
    email,
    name,
    displayName: name,
    phoneNumber: typeof raw.phoneNumber === 'string' ? raw.phoneNumber : undefined,
    role,
    roleLabel: toRoleLabel(role),
    roles,
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((value): value is string => typeof value === 'string')
      : [],
    tenantId,
    tenantName: typeof raw.tenantName === 'string' ? raw.tenantName : undefined,
    tenantDisplayName:
      typeof raw.tenantDisplayName === 'string'
        ? raw.tenantDisplayName
        : typeof raw.tenantName === 'string'
          ? raw.tenantName
          : undefined,
    avatarFallback: getAvatarFallback(name, email)
  };
}

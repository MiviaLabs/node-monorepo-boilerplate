import { TENANT_ROLES, type TenantRole } from '~/types/tenant.types';

interface DashboardAccessInput {
  roles?: string[];
  permissions?: string[];
}

interface DashboardRouteAccess {
  canManageOrganization: boolean;
  canViewMembers: boolean;
  canViewProjects: boolean;
  canCreateProjects: boolean;
  canUpdateProjects: boolean;
  canDeleteProjects: boolean;
  canViewContent: boolean;
  canCreateContent: boolean;
  canUpdateContent: boolean;
  canDeleteContent: boolean;
  canViewIssues: boolean;
  canCreateIssues: boolean;
  canUpdateIssues: boolean;
  canDeleteIssues: boolean;
  orgRole: TenantRole | null;
}

/**
 * Computes dashboard navigation access flags from user roles.
 * @param access - Role and permission identifiers from the authenticated user context.
 * @returns Route access capabilities and resolved organization role.
 */
export function getDashboardRouteAccess(access: DashboardAccessInput): DashboardRouteAccess {
  const orgRole = resolveOrganizationRole(access.roles);
  const canManageOrganization = orgRole === TENANT_ROLES.OWNER || orgRole === TENANT_ROLES.ADMIN;
  const canViewMembers = orgRole !== null;
  const permissions = new Set(access.permissions ?? []);
  const canViewProjects =
    permissions.has('tenant:projects:read') ||
    permissions.has('tenant:projects:create') ||
    permissions.has('tenant:projects:update') ||
    permissions.has('tenant:projects:delete');
  const canViewContent = permissions.has('tenant:content:read');
  const canViewIssues = permissions.has('tenant:issues:read');

  return {
    canManageOrganization,
    canViewMembers,
    canViewProjects,
    canCreateProjects: permissions.has('tenant:projects:create'),
    canUpdateProjects: permissions.has('tenant:projects:update'),
    canDeleteProjects: permissions.has('tenant:projects:delete'),
    canViewContent,
    canCreateContent: permissions.has('tenant:content:create'),
    canUpdateContent: permissions.has('tenant:content:update'),
    canDeleteContent: permissions.has('tenant:content:delete'),
    canViewIssues,
    canCreateIssues: permissions.has('tenant:issues:create'),
    canUpdateIssues: permissions.has('tenant:issues:update'),
    canDeleteIssues: permissions.has('tenant:issues:delete'),
    orgRole
  };
}

function resolveOrganizationRole(userRoles?: string[]): TenantRole | null {
  if (!userRoles || userRoles.length === 0) {
    return null;
  }

  const tenantRoles = new Set<TenantRole>(Object.values(TENANT_ROLES));
  const matched = userRoles.find((role): role is TenantRole => tenantRoles.has(role as TenantRole));

  return matched ?? null;
}

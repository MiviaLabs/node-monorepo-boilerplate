import { describe, expect, it } from 'vitest';

import { getDashboardRouteAccess } from './route-access';

import { TENANT_ROLES } from '~/types/tenant.types';

describe('getDashboardRouteAccess', () => {
  it('grants admin-level organization management from owner/admin roles', () => {
    const access = getDashboardRouteAccess({
      roles: [TENANT_ROLES.ADMIN],
      permissions: []
    });

    expect(access.canManageOrganization).toBe(true);
    expect(access.canViewMembers).toBe(true);
    expect(access.orgRole).toBe(TENANT_ROLES.ADMIN);
  });

  it('grants project visibility from project read permission', () => {
    const access = getDashboardRouteAccess({
      roles: [TENANT_ROLES.VIEWER],
      permissions: ['tenant:projects:read']
    });

    expect(access.canViewProjects).toBe(true);
    expect(access.canCreateProjects).toBe(false);
    expect(access.canUpdateProjects).toBe(false);
    expect(access.canDeleteProjects).toBe(false);
  });

  it('grants create/update flags independently from organization admin role', () => {
    const access = getDashboardRouteAccess({
      roles: [TENANT_ROLES.USER],
      permissions: ['tenant:projects:create', 'tenant:projects:update']
    });

    expect(access.canManageOrganization).toBe(false);
    expect(access.canViewProjects).toBe(true);
    expect(access.canCreateProjects).toBe(true);
    expect(access.canUpdateProjects).toBe(true);
    expect(access.canDeleteProjects).toBe(false);
  });

  it('derives content access flags from content permissions', () => {
    const access = getDashboardRouteAccess({
      roles: [TENANT_ROLES.USER],
      permissions: ['tenant:content:read', 'tenant:content:create', 'tenant:content:update']
    });

    expect(access.canViewContent).toBe(true);
    expect(access.canCreateContent).toBe(true);
    expect(access.canUpdateContent).toBe(true);
    expect(access.canDeleteContent).toBe(false);
  });

  it('does not expose content navigation without read permission', () => {
    const access = getDashboardRouteAccess({
      roles: [TENANT_ROLES.USER],
      permissions: ['tenant:content:create', 'tenant:content:update']
    });

    expect(access.canViewContent).toBe(false);
    expect(access.canCreateContent).toBe(true);
    expect(access.canUpdateContent).toBe(true);
  });
});

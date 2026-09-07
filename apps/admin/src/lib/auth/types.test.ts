import { getAllowedAdminRole, normalizeAdminOperatorUser } from './types';

describe('admin auth role helpers', () => {
  it('accepts system_admin as a valid admin role', () => {
    expect(getAllowedAdminRole(['tenant_admin', 'system_admin'])).toBe('system_admin');
  });

  it('rejects tenant-only users', () => {
    expect(getAllowedAdminRole(['tenant_owner'])).toBeNull();
  });

  it('normalizes a valid operator user', () => {
    expect(
      normalizeAdminOperatorUser({
        userId: 'user-1',
        actorId: 'actor-1',
        email: 'ops@example.com',
        name: 'System Operator',
        roles: ['system_admin'],
        permissions: ['system:tenants:read'],
        tenantId: 'org-1'
      })
    ).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        actorId: 'actor-1',
        role: 'system_admin',
        roleLabel: 'System Administrator',
        avatarFallback: 'SO'
      })
    );
  });

  it('returns null for non-operator auth users', () => {
    expect(
      normalizeAdminOperatorUser({
        userId: 'user-1',
        actorId: 'actor-1',
        email: 'tenant@example.com',
        roles: ['tenant_admin'],
        permissions: []
      })
    ).toBeNull();
  });
});

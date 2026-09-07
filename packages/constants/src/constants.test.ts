import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SYSTEM_PERMISSIONS,
  TENANT_PERMISSIONS,
  SYSTEM_ROLE,
  TENANT_ROLE,
  ROLE_PERMISSIONS,
  getPermissionsForRole
} from './index';

import type { TenantRole } from './domain/tenant-roles';

// ── Immutability ────────────────────────────────────────────────────────

test('ROLE_PERMISSIONS object is frozen', () => {
  assert.ok(Object.isFrozen(ROLE_PERMISSIONS));
});

test('ROLE_PERMISSIONS inner arrays are frozen', () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    assert.ok(Object.isFrozen(perms), `${role} permissions array is not frozen`);
  }
});

test('getPermissionsForRole returns a frozen array for known roles', () => {
  const perms = getPermissionsForRole(SYSTEM_ROLE.OWNER);
  assert.ok(Object.isFrozen(perms));
  assert.ok(perms.length > 0);
});

test('getPermissionsForRole returns an empty frozen array for unknown roles', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing runtime behavior with invalid input
  const perms = getPermissionsForRole('nonexistent_role' as any);
  assert.deepStrictEqual([...perms], []);
  assert.ok(Object.isFrozen(perms));
});

// ── Permission format ───────────────────────────────────────────────────

test('all permission values follow {scope}:{resource}:{action} format', () => {
  const format = /^(system|tenant):\w+:\w+$/;
  const all = [...Object.values(SYSTEM_PERMISSIONS), ...Object.values(TENANT_PERMISSIONS)];
  for (const perm of all) {
    assert.match(perm, format, `Invalid permission format: ${perm}`);
  }
});

// ── Role completeness ───────────────────────────────────────────────────

test('every system role has a ROLE_PERMISSIONS entry', () => {
  for (const role of Object.values(SYSTEM_ROLE)) {
    assert.ok(ROLE_PERMISSIONS[role], `Missing entry for system role: ${role}`);
  }
});

test('every tenant role has a ROLE_PERMISSIONS entry', () => {
  for (const role of Object.values(TENANT_ROLE)) {
    assert.ok(ROLE_PERMISSIONS[role], `Missing entry for tenant role: ${role}`);
  }
});

// ── Hierarchy invariants ────────────────────────────────────────────────

test('system_owner has all system permissions', () => {
  const ownerPerms = new Set(ROLE_PERMISSIONS[SYSTEM_ROLE.OWNER]);
  for (const perm of Object.values(SYSTEM_PERMISSIONS)) {
    assert.ok(ownerPerms.has(perm), `system_owner missing: ${perm}`);
  }
});

test('tenant_owner has all tenant permissions', () => {
  const ownerPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.OWNER]);
  for (const perm of Object.values(TENANT_PERMISSIONS)) {
    assert.ok(ownerPerms.has(perm), `tenant_owner missing: ${perm}`);
  }
});

test('tenant role hierarchy: each higher role includes all lower role permissions', () => {
  const hierarchy: string[] = [
    TENANT_ROLE.VIEWER,
    TENANT_ROLE.USER,
    TENANT_ROLE.ADMIN,
    TENANT_ROLE.OWNER
  ];
  for (let i = 1; i < hierarchy.length; i++) {
    const higherRole = hierarchy[i] as TenantRole;
    const lowerRole = hierarchy[i - 1] as TenantRole;
    if (higherRole && lowerRole) {
      const higherPerms = new Set(ROLE_PERMISSIONS[higherRole]);
      const lowerPerms = ROLE_PERMISSIONS[lowerRole];
      if (lowerPerms) {
        for (const perm of lowerPerms) {
          assert.ok(
            higherPerms.has(perm),
            `${higherRole} missing permission from ${lowerRole}: ${perm}`
          );
        }
      }
    }
  }
});

test('content permissions are assigned to tenant roles intentionally', () => {
  const viewerPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.VIEWER]);
  const userPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.USER]);
  const adminPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.ADMIN]);

  assert.ok(viewerPerms.has(TENANT_PERMISSIONS.CONTENT_READ));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.CONTENT_CREATE));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.CONTENT_UPDATE));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.CONTENT_DELETE));

  assert.ok(userPerms.has(TENANT_PERMISSIONS.CONTENT_READ));
  assert.ok(userPerms.has(TENANT_PERMISSIONS.CONTENT_CREATE));
  assert.ok(userPerms.has(TENANT_PERMISSIONS.CONTENT_UPDATE));
  assert.ok(!userPerms.has(TENANT_PERMISSIONS.CONTENT_DELETE));

  assert.ok(adminPerms.has(TENANT_PERMISSIONS.CONTENT_READ));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.CONTENT_CREATE));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.CONTENT_UPDATE));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.CONTENT_DELETE));
});

test('issues permissions are assigned to tenant roles intentionally', () => {
  const viewerPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.VIEWER]);
  const userPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.USER]);
  const adminPerms = new Set(ROLE_PERMISSIONS[TENANT_ROLE.ADMIN]);

  assert.ok(viewerPerms.has(TENANT_PERMISSIONS.ISSUES_READ));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.ISSUES_CREATE));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.ISSUES_UPDATE));
  assert.ok(!viewerPerms.has(TENANT_PERMISSIONS.ISSUES_DELETE));

  assert.ok(userPerms.has(TENANT_PERMISSIONS.ISSUES_READ));
  assert.ok(userPerms.has(TENANT_PERMISSIONS.ISSUES_CREATE));
  assert.ok(userPerms.has(TENANT_PERMISSIONS.ISSUES_UPDATE));
  assert.ok(!userPerms.has(TENANT_PERMISSIONS.ISSUES_DELETE));

  assert.ok(adminPerms.has(TENANT_PERMISSIONS.ISSUES_READ));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.ISSUES_CREATE));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.ISSUES_UPDATE));
  assert.ok(adminPerms.has(TENANT_PERMISSIONS.ISSUES_DELETE));
});

// ── No duplicates ───────────────────────────────────────────────────────

test('no duplicate permissions within any role', () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const unique = new Set(perms);
    assert.strictEqual(perms.length, unique.size, `Duplicate permissions in role: ${role}`);
  }
});

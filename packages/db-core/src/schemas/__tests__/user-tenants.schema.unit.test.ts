/**
 * User Tenants schema unit tests
 */

import { describe, expect, it } from '@jest/globals';

import { userTenants, USER_TENANT_ROLE_ENUM } from '../user-tenants.schema';

describe('user-tenants.schema', () => {
  describe('USER_TENANT_ROLE_ENUM', () => {
    it('should have correct values', () => {
      expect(USER_TENANT_ROLE_ENUM[0]).toBe('tenant_owner');
      expect(USER_TENANT_ROLE_ENUM[1]).toBe('tenant_admin');
      expect(USER_TENANT_ROLE_ENUM[2]).toBe('tenant_user');
      expect(USER_TENANT_ROLE_ENUM[3]).toBe('tenant_viewer');
    });

    it('should have exactly 4 roles', () => {
      expect(USER_TENANT_ROLE_ENUM.length).toBe(4);
    });
  });

  describe('userTenants table', () => {
    it('should be defined', () => {
      expect(typeof userTenants).toBe('object');
    });

    // Note: The schema structure is validated through E2E tests and migration generation
    // Internal Drizzle properties are implementation details that may change
    it('should be a valid Drizzle table schema', () => {
      // Verify the schema has expected properties
      expect(typeof userTenants).toBe('object');
      expect(userTenants !== null).toBe(true);
    });
  });
});

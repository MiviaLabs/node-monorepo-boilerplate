/**
 * Tenant Test Fixtures
 *
 * Factory functions and test data builders for tenant module tests.
 * Follows existing fixture patterns in the codebase.
 *
 * Provides:
 * - Factory functions for creating mock tenants and memberships
 * - Test data builders with sensible defaults
 * - Test data constants for common scenarios
 */

import { TENANT_ROLE } from '@package/constants';

import type { TenantType, TenantStatus, UserTenantRole, UserTenant } from '@package/db-core';

/**
 * Mock Tenant interface
 */
export interface MockTenant {
  id: number;
  type: TenantType;
  status: TenantStatus;
  settings: Record<string, unknown>;
  publicId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mock User Tenant Membership interface
 */
export interface MockUserTenant {
  id: number;
  userId: number;
  tenantId: number;
  role: UserTenantRole;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default values for tenant fixtures
 */
const DEFAULT_TENANT_VALUES: Omit<MockTenant, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'organization',
  status: 'active',
  settings: {},
  publicId: 'tenant-abc123'
};

/**
 * Default values for user tenant membership fixtures
 */
const DEFAULT_USER_TENANT_VALUES: Omit<MockUserTenant, 'id' | 'createdAt' | 'updatedAt'> = {
  userId: 123,
  tenantId: 1,
  role: 'tenant_user',
  isActive: true,
  isDefault: false
};

/**
 * Factory function to create a mock tenant
 *
 * @param overrides - Partial tenant data to override defaults
 * @returns Mock tenant object
 *
 * @example
 * ```typescript
 * const mockTenant = createMockTenant({
 *   id: 1,
 *   status: 'active',
 * });
 * ```
 */
export function createMockTenant(overrides: Partial<MockTenant> = {}): MockTenant {
  const now = new Date('2024-01-01T00:00:00.000Z');

  return {
    id: 1,
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_TENANT_VALUES,
    ...overrides
  };
}

/**
 * Factory function to create a mock user tenant membership
 *
 * @param overrides - Partial membership data to override defaults
 * @returns Mock user tenant membership object
 *
 * @example
 * ```typescript
 * const mockMembership = createMockUserTenant({
 *   userId: 123,
 *   tenantId: 1,
 *   role: 'tenant_admin',
 * });
 * ```
 */
export function createMockUserTenant(overrides: Partial<MockUserTenant> = {}): MockUserTenant {
  const now = new Date('2024-01-01T00:00:00.000Z');

  return {
    id: 1,
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_USER_TENANT_VALUES,
    ...overrides
  };
}

/**
 * Create multiple mock user tenant memberships
 *
 * @param count - Number of memberships to create
 * @param overrides - Partial data to apply to all memberships
 * @returns Array of mock user tenant memberships
 */
export function createMockUserTenants(
  count: number,
  overrides: Partial<MockUserTenant> = {}
): MockUserTenant[] {
  const memberships: MockUserTenant[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    memberships.push({
      id: i + 1,
      userId: 100 + i,
      tenantId: overrides.tenantId ?? 1,
      role: 'tenant_user',
      isActive: true,
      isDefault: i === 0,
      createdAt: new Date(now.getTime() - i * 1000),
      updatedAt: new Date(now.getTime() - i * 1000),
      ...overrides
    });
  }

  return memberships;
}

/**
 * Create a mock owner membership
 */
export function createMockOwnerMembership(overrides: Partial<MockUserTenant> = {}): MockUserTenant {
  return createMockUserTenant({
    role: 'tenant_owner',
    isDefault: true,
    ...overrides
  });
}

/**
 * Create a mock admin membership
 */
export function createMockAdminMembership(overrides: Partial<MockUserTenant> = {}): MockUserTenant {
  return createMockUserTenant({
    role: 'tenant_admin',
    ...overrides
  });
}

/**
 * Create a mock inactive membership
 */
export function createMockInactiveMembership(
  overrides: Partial<MockUserTenant> = {}
): MockUserTenant {
  return createMockUserTenant({
    isActive: false,
    ...overrides
  });
}

/**
 * Test data constants for common tenant scenarios
 */
export const TENANT_TEST_DATA = {
  /**
   * Standard active organization tenant
   */
  ACTIVE_ORG: {
    type: 'organization' satisfies TenantType,
    status: 'active' satisfies TenantStatus,
    settings: {
      allowPublicRegistration: false,
      defaultRole: TENANT_ROLE.USER,
      maxUsers: 100
    }
  },

  /**
   * Individual tenant
   */
  INDIVIDUAL: {
    type: 'individual' satisfies TenantType,
    status: 'active' satisfies TenantStatus,
    settings: {}
  },

  /**
   * Suspended tenant
   */
  SUSPENDED: {
    type: 'organization' satisfies TenantType,
    status: 'suspended' satisfies TenantStatus,
    settings: {}
  }
} as const;

/**
 * Test data constants for user tenant membership scenarios
 */
export const MEMBERSHIP_TEST_DATA = {
  /**
   * Owner membership
   */
  OWNER: {
    role: TENANT_ROLE.OWNER,
    isActive: true,
    isDefault: true
  },

  /**
   * Admin membership
   */
  ADMIN: {
    role: TENANT_ROLE.ADMIN,
    isActive: true,
    isDefault: false
  },

  /**
   * Regular user membership
   */
  USER: {
    role: TENANT_ROLE.USER,
    isActive: true,
    isDefault: false
  },

  /**
   * Viewer membership
   */
  VIEWER: {
    role: TENANT_ROLE.VIEWER,
    isActive: true,
    isDefault: false
  },

  /**
   * Inactive membership
   */
  INACTIVE: {
    role: TENANT_ROLE.USER,
    isActive: false,
    isDefault: false
  }
} as const;

/**
 * Mock user for handler tests
 */
export const MOCK_USER = {
  id: 123,
  organizationId: 1,
  emailHash: 'abc123',
  emailEncrypted: 'encrypted',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z')
};

/**
 * Create a mock from membership test data constant
 */
export function createMockFromMembershipTestData(
  testDataConstant: (typeof MEMBERSHIP_TEST_DATA)[keyof typeof MEMBERSHIP_TEST_DATA],
  overrides: Partial<MockUserTenant> = {}
): MockUserTenant {
  return createMockUserTenant({
    role: testDataConstant.role,
    isActive: testDataConstant.isActive,
    isDefault: testDataConstant.isDefault,
    ...overrides
  });
}

/**
 * Type guard for UserTenant from db
 */
export function isUserTenant(obj: unknown): obj is UserTenant {
  return (
    typeof obj === 'object' && obj !== null && 'userId' in obj && 'tenantId' in obj && 'role' in obj
  );
}

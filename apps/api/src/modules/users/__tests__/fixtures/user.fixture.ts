/**
 * User Test Fixtures
 *
 * Factory functions and test data builders for user tests.
 * Follows existing fixture patterns from api-keys and encrypted-store modules.
 *
 * Provides:
 * - Factory functions for creating mock users
 * - Test data builders with sensible defaults
 * - Test data constants for common scenarios
 */

/**
 * Mock User interface
 *
 * Represents the structure of a user record in the database.
 * Matches the User type from @package/db-core.
 */
export interface MockUser {
  id: number;
  organizationId: number;
  emailHash: string | null;
  emailEncrypted: string | null;
  firstNameEncrypted: string | null;
  lastNameEncrypted: string | null;
  displayName: string | null;
  phoneNumberEncrypted: string | null;
  photoUrl: string | null;
  avatarFileId: number | null;
  isActive: boolean;
  isVerified: boolean;
  encryptionKeyVersion: string;
  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date | null;
  deletedAt: Date | null;
}

/**
 * Create User data interface
 *
 * Represents the data required to create a new user via DTO.
 */
export interface CreateUserData {
  organizationId: number;
  isActive?: boolean;
  isVerified?: boolean;
}

/**
 * Default values for user fixtures
 */
const DEFAULT_USER_VALUES = {
  emailHash: 'abc123def456',
  emailEncrypted: 'encrypted-email-data',
  firstNameEncrypted: 'encrypted-first-name',
  lastNameEncrypted: 'encrypted-last-name',
  displayName: 'Test User',
  phoneNumberEncrypted: null,
  photoUrl: null,
  avatarFileId: null,
  isActive: true,
  isVerified: false,
  encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1',
  lastSignInAt: null,
  deletedAt: null
};

/**
 * Factory function to create a mock user
 *
 * @param overrides - Partial user data to override defaults
 * @returns Mock user object
 *
 * @example
 * ```typescript
 * const mockUser = createMockUser({
 *   id: 1,
 *   organizationId: 123,
 *   isActive: false,
 * });
 * ```
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const now = new Date();

  return {
    id: 1,
    organizationId: 123,
    createdAt: now,
    updatedAt: now,
    ...DEFAULT_USER_VALUES,
    ...overrides
  };
}

/**
 * Factory function to create user creation data
 *
 * @param overrides - Partial data to override defaults
 * @returns User creation data for DTO
 *
 * @example
 * ```typescript
 * const createData = createUserData({
 *   organizationId: 456,
 *   isActive: true,
 * });
 * ```
 */
export function createUserData(overrides: Partial<CreateUserData> = {}): CreateUserData {
  return {
    organizationId: 123,
    isActive: true,
    isVerified: false,
    ...overrides
  };
}

/**
 * Create multiple mock users
 *
 * @param count - Number of users to create
 * @param overrides - Partial data to apply to all users
 * @returns Array of mock users
 *
 * @example
 * ```typescript
 * const mockUsers = createMockUsers(5, {
 *   organizationId: 123,
 *   isActive: true,
 * });
 * ```
 */
export function createMockUsers(count: number, overrides: Partial<MockUser> = {}): MockUser[] {
  const users: MockUser[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    users.push({
      id: i + 1,
      organizationId: 123,
      createdAt: new Date(now.getTime() - i * 1000),
      updatedAt: new Date(now.getTime() - i * 1000),
      ...DEFAULT_USER_VALUES,
      ...overrides
    });
  }

  return users;
}

/**
 * Create a mock inactive user
 *
 * @param overrides - Additional overrides
 * @returns Mock inactive user
 */
export function createMockInactiveUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    isActive: false,
    ...overrides
  });
}

/**
 * Create a mock verified user
 *
 * @param overrides - Additional overrides
 * @returns Mock verified user
 */
export function createMockVerifiedUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    isVerified: true,
    ...overrides
  });
}

/**
 * Create a mock deleted user (soft delete)
 *
 * @param overrides - Additional overrides
 * @returns Mock deleted user
 */
export function createMockDeletedUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    deletedAt: new Date(),
    isActive: false,
    ...overrides
  });
}

/**
 * Create a mock user with recent sign-in
 *
 * @param overrides - Additional overrides
 * @returns Mock user with lastSignInAt set
 */
export function createMockUserWithSignIn(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    lastSignInAt: new Date(),
    ...overrides
  });
}

/**
 * Test data constants for common user scenarios
 */
export const USER_TEST_DATA = {
  /**
   * Standard active user
   */
  ACTIVE: {
    isActive: true,
    isVerified: false
  } as const,

  /**
   * Inactive user
   */
  INACTIVE: {
    isActive: false,
    isVerified: false
  } as const,

  /**
   * Verified user
   */
  VERIFIED: {
    isActive: true,
    isVerified: true
  } as const,

  /**
   * Inactive verified user
   */
  INACTIVE_VERIFIED: {
    isActive: false,
    isVerified: true
  } as const,

  /**
   * Phone-only user (no email)
   */
  PHONE_ONLY: {
    emailHash: null,
    emailEncrypted: null,
    phoneNumberEncrypted: 'encrypted-phone',
    isActive: true,
    isVerified: false
  } as const
} as const;

/**
 * Create a mock user from test data constant
 *
 * @param testDataConstant - Test data constant from USER_TEST_DATA
 * @param overrides - Additional overrides
 * @returns Mock user
 *
 * @example
 * ```typescript
 * const verifiedUser = createMockFromTestDataConstant(
 *   USER_TEST_DATA.VERIFIED,
 *   { organizationId: 456 }
 * );
 * ```
 */
export function createMockFromTestDataConstant(
  testDataConstant: (typeof USER_TEST_DATA)[keyof typeof USER_TEST_DATA],
  overrides: Partial<MockUser> = {}
): MockUser {
  return createMockUser({
    ...testDataConstant,
    ...overrides
  });
}

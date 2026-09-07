/**
 * Auth Module Test Fixtures
 *
 * Shared mock objects for auth module unit tests.
 * Based on @package/db-core schema definitions.
 */

import type { Organization, User, UserIdentity } from '@package/db-core';

/**
 * Mock User
 *
 * Complete mock user matching users.schema.ts
 */
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 456,
  organizationId: 123,
  emailHash: 'hashed-email',
  emailEncrypted: 'encrypted-email@example.com',
  displayName: 'Test User',
  firstNameEncrypted: 'encrypted-first-name',
  lastNameEncrypted: 'encrypted-last-name',
  phoneNumberEncrypted: null,
  encryptionKeyVersion: 'primary-encryption-key/1',
  photoUrl: null,
  avatarFileId: null,
  isVerified: true,
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-15T00:00:00.000Z'),
  lastSignInAt: new Date('2024-01-20T00:00:00.000Z'),
  deletedAt: null,
  ...overrides
});

/**
 * Mock Organization
 *
 * Complete mock organization matching organizations.schema.ts
 */
export const createMockOrganization = (overrides: Partial<Organization> = {}): Organization => ({
  id: 123,
  tenantId: 1,
  ownerId: 100,
  publicId: 'pub-123-uuid',
  name: 'Test Organization',
  displayName: 'Test Organization',
  slug: 'test-org',
  gcpTenantId: 'gcp-tenant-123',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
  ...overrides
});

/**
 * Mock User Identity
 *
 * Complete mock user identity matching user-identities.schema.ts
 */
export const createMockUserIdentity = (overrides: Partial<UserIdentity> = {}): UserIdentity => ({
  id: 1,
  userId: 456,
  provider: 'google.com',
  providerUid: 'google-uid-123',
  providerEmailHash: 'provider-email-hash',
  providerEmailEncrypted: null,
  phoneNumberEncrypted: null,
  encryptionKeyVersion: 'primary-encryption-key/1',
  displayName: 'Test User Google',
  photoUrl: null,
  emailVerified: true,
  phoneVerified: false,
  isPrimary: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  lastSignInAt: null,
  ...overrides
});

/**
 * Default mock user (pre-created for convenience)
 */
export const mockUser = createMockUser();

/**
 * Default mock organization (pre-created for convenience)
 */
export const mockOrganization = createMockOrganization();

/**
 * Default mock identity (pre-created for convenience)
 */
export const mockIdentity = createMockUserIdentity();

/**
 * Create mock identities array
 */
export const createMockIdentities = (count: number = 1): UserIdentity[] => {
  const providers = ['google.com', 'github.com', 'microsoft.com', 'phone'];
  return Array.from({ length: count }, (_, index) =>
    createMockUserIdentity({
      id: index + 1,
      provider: providers[index % providers.length] ?? 'google.com',
      providerUid: `provider-uid-${index + 1}`,
      isPrimary: index === 0
    })
  );
};

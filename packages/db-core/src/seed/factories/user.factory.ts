/**
 * User seed data factory
 *
 * Functional factory for creating test user data following existing fixture patterns.
 * Uses clearly identifiable test data to avoid confusion with production data.
 *
 * Security features:
 * - Uses [SEED-TEST] prefix for easy identification
 * - Uses @dev.local domain (reserved for testing per RFC 2606)
 * - Email hashing with SHA-256 for PII protection
 *
 * @module seed/factories/user.factory
 */

import { createHash, randomUUID } from 'node:crypto';

import type { NewUser } from '../../schemas';

/**
 * Default values for user seed data
 *
 * These defaults ensure all seed users are:
 * - Clearly identifiable with [SEED-TEST] prefix
 * - Using reserved test domain (@dev.local)
 * - Active but unverified (typical test state)
 */
const DEFAULT_USER_VALUES = {
  isActive: true,
  isVerified: false
} as const;

/**
 * Create a test user for seed data
 *
 * Generates a user with clearly identifiable test data. The email uses
 * a reserved test domain (@dev.local) and [SEED-TEST] prefix to prevent
 * confusion with production data. Email is hashed using SHA-256 for PII protection.
 *
 * @param overrides - Partial user data to override defaults. Callers typically
 *                     need to provide at least `organizationId`.
 * @returns NewUser object for database insertion
 *
 * @example
 * ```typescript
 * import { createTestUser } from '@package/db-core/seed/factories';
 *
 * const user = createTestUser({
 *   organizationId: 1,
 *   displayName: 'Test User',
 * });
 * ```
 */
export function createTestUser(overrides: Partial<NewUser> = {}): NewUser {
  const organizationId = overrides.organizationId ?? 1;
  const { organizationId: _ignoredOrganizationId, ...restOverrides } = overrides;

  // Use clearly identifiable test domain to avoid confusion
  // @dev.local is a reserved TLD for testing (RFC 2606)
  const testEmail = `[SEED-TEST]-${randomUUID()}@dev.local`;

  return {
    // Email hash for PII protection (matches existing pattern in pii-encrypted-store)
    emailHash: createHash('sha256').update(testEmail).digest('hex'),
    // Store test email directly (safe because: @dev.local domain is reserved per RFC 2606,
    // [SEED-TEST] prefix makes it clearly identifiable, and this is NEVER used in production)
    // In production, emailEncrypted would contain encrypted-store-encrypted data
    emailEncrypted: testEmail,
    // Default display name using UUID suffix for uniqueness
    displayName: `[SEED-TEST] User ${randomUUID().slice(0, 8)}`,
    // Other profile fields (null by default, will be set by encrypted-store if needed)
    photoUrl: null,
    phoneNumberEncrypted: null,
    firstNameEncrypted: null,
    lastNameEncrypted: null,
    // Start with default status values
    ...DEFAULT_USER_VALUES,
    // Then apply overrides so caller can override any defaults
    ...restOverrides,
    // users.organization_id is non-null; keep seed data compatible by default
    organizationId,
    // encryptionKeyVersion is required - use override if provided, otherwise default
    encryptionKeyVersion:
      restOverrides.encryptionKeyVersion ?? 'primary-encryption-key/cryptoKeyVersions/1'
  };
}

/**
 * Create multiple test users
 *
 * Generates an array of test users. Each user will have a unique email
 * and display name due to random UUID generation.
 *
 * @param count - Number of users to create
 * @param overrides - Partial user data to apply to all users. Typically
 *                     includes `organizationId` to assign all users to
 *                     the same tenant.
 * @returns Array of NewUser objects for database insertion
 *
 * @example
 * ```typescript
 * import { createTestUsers } from '@package/db-core/seed/factories';
 *
 * const users = createTestUsers(10, {
 *   organizationId: 1,
 *   isActive: true,
 * });
 * ```
 */
export function createTestUsers(count: number, overrides: Partial<NewUser> = {}): NewUser[] {
  return Array.from({ length: count }, () => createTestUser(overrides));
}

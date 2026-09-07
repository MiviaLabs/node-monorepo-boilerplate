import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { users } from '@package/db-core';

import type { ITestDatabase } from '../utils/database';

/**
 * Options for creating a user fixture.
 *
 * @property organizationId - The organization to associate the user with (defaults to 1)
 * @property emailHash - Pre-computed SHA-256 hash of the email; if not provided,
 *                       a unique hash is generated from a timestamp-based email
 */
export interface ICreateUserFixtureOptions {
  organizationId?: number;
  emailHash?: string;
}

/**
 * Hashes an email address using SHA-256 for secure storage and lookup.
 *
 * The email is normalized (lowercase, trimmed) before hashing to ensure
 * consistent results regardless of input formatting.
 *
 * @param email - The email address to hash
 * @returns A hexadecimal SHA-256 hash of the normalized email
 *
 * @example
 * ```typescript
 * const hash = hashEmail('User@Example.COM');
 * // Returns SHA-256 hash of 'user@example.com'
 * ```
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Creates a user fixture in the database for testing purposes.
 *
 * This function inserts a new user record with a hashed email and organization
 * association. The email hash is computed using SHA-256, ensuring PII is never
 * stored in plain text even in test environments.
 *
 * @param db - The Drizzle database instance from ITestDatabase
 * @param options - Configuration options for the user fixture
 * @param options.organizationId - The organization ID for multi-tenant scoping (defaults to 1)
 * @param options.emailHash - Optional pre-computed email hash; auto-generated if not provided
 * @returns The created user record with all database fields
 *
 * @example Basic user creation
 * ```typescript
 * const { db } = await setupTestDatabase();
 * const user = await createUserFixture(db);
 * console.log(user.id, user.organizationId); // 1, 1
 * ```
 *
 * @example Multi-tenant fixture with specific organization
 * ```typescript
 * const { db } = await setupTestDatabase();
 *
 * // Create users for different tenants
 * const orgAUser = await createUserFixture(db, { organizationId: 100 });
 * const orgBUser = await createUserFixture(db, { organizationId: 200 });
 *
 * // Verify tenant isolation in queries
 * expect(orgAUser.organizationId).toBe(100);
 * expect(orgBUser.organizationId).toBe(200);
 * ```
 *
 * @example Using TestDataHelper for unique emails
 * ```typescript
 * import { TestDataHelper } from './data-helper';
 *
 * const { db } = await setupTestDatabase();
 * const email = TestDataHelper.uniqueEmail();
 * const emailHash = createHash('sha256')
 *   .update(email.toLowerCase().trim())
 *   .digest('hex');
 *
 * const user = await createUserFixture(db, { emailHash });
 * ```
 */
export async function createUserFixture(
  db: ITestDatabase['db'],
  options: ICreateUserFixtureOptions = {}
) {
  const emailHash = options.emailHash || hashEmail(`test-${Date.now()}@example.com`);
  const organizationId = options.organizationId ?? 1;
  const encryptionKeyVersion = 'primary-encryption-key/cryptoKeyVersions/1';

  const [user] = await db
    .insert(users)
    .values({
      emailHash,
      organizationId,
      encryptionKeyVersion
    })
    .returning();

  return user;
}

/**
 * Deletes a user fixture from the database by user ID only.
 *
 * **WARNING: Test-only function - DO NOT copy to production code.**
 * This function deletes by userId without tenant/organization scoping,
 * which is safe only in isolated test environments where each test has
 * exclusive database access. For multi-tenant test scenarios requiring
 * tenant isolation, use {@link deleteUserFixtureByOrg} instead.
 *
 * Use this function for cleanup after tests to ensure test isolation.
 * Should be called in afterEach or afterAll hooks to remove test data.
 *
 * @deprecated Use {@link deleteUserFixtureByOrg} for tenant-scoped deletion.
 *             This function lacks organization scoping which is required
 *             for proper multi-tenant isolation in tests.
 * @param db - The Drizzle database instance from ITestDatabase
 * @param userId - The ID of the user to delete
 * @returns A promise that resolves when the user is deleted
 *
 * @example Cleanup in test teardown
 * ```typescript
 * let testUser: User;
 *
 * beforeEach(async () => {
 *   testUser = await createUserFixture(db);
 * });
 *
 * afterEach(async () => {
 *   await deleteUserFixture(db, testUser.id);
 * });
 *
 * it('should process user data', async () => {
 *   // Test using testUser
 * });
 * ```
 */
export async function deleteUserFixture(db: ITestDatabase['db'], userId: number): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Deletes a user fixture from the database with tenant/organization scoping.
 *
 * This function enforces multi-tenant isolation by requiring both userId
 * and organizationId, ensuring that deletions are scoped to the correct
 * tenant. Use this for multi-tenant test scenarios where tenant isolation
 * must be verified.
 *
 * @param db - The Drizzle database instance from ITestDatabase
 * @param userId - The ID of the user to delete
 * @param organizationId - The organization ID for tenant scoping
 * @returns A promise that resolves when the user is deleted
 *
 * @example Multi-tenant cleanup with tenant scoping
 * ```typescript
 * const users: User[] = [];
 *
 * // Create fixtures for different organizations
 * users.push(await createUserFixture(db, { organizationId: 100 }));
 * users.push(await createUserFixture(db, { organizationId: 200 }));
 *
 * // Cleanup with tenant scoping - ensures correct tenant isolation
 * for (const user of users) {
 *   await deleteUserFixtureByOrg(db, user.id, user.organizationId);
 * }
 * ```
 *
 * @example Verifying tenant isolation in tests
 * ```typescript
 * const orgAUser = await createUserFixture(db, { organizationId: 1 });
 * const orgBUser = await createUserFixture(db, { organizationId: 2 });
 *
 * // This will only delete if both userId AND organizationId match
 * await deleteUserFixtureByOrg(db, orgAUser.id, 1); // Succeeds
 * await deleteUserFixtureByOrg(db, orgBUser.id, 1); // No-op (wrong org)
 * ```
 */
export async function deleteUserFixtureByOrg(
  db: ITestDatabase['db'],
  userId: number,
  organizationId: number
): Promise<void> {
  await db.delete(users).where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
}

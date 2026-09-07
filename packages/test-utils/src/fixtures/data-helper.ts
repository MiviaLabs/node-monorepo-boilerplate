/**
 * Utility class for generating unique test data across test suites.
 *
 * TestDataHelper uses a combination of timestamp and incremental counter to
 * generate unique identifiers, emails, and names. This ensures no collisions
 * between tests running in parallel or sequentially.
 *
 * **Important:** Call `resetCounter()` at the start of each test file to ensure
 * predictable counter values and proper isolation between test suites.
 *
 * @example Basic usage in a test file
 * ```typescript
 * // Jest globals are available without import
 * import { TestDataHelper } from '@package/test-utils';
 *
 * describe('UserService', () => {
 *   beforeEach(() => {
 *     TestDataHelper.resetCounter();
 *   });
 *
 *   it('should create user with unique email', () => {
 *     const email = TestDataHelper.uniqueEmail();
 *     // email: 'test_user_1708012345678_1@example.com'
 *   });
 * });
 * ```
 *
 * @example Multi-tenant fixture setup
 * ```typescript
 * import { TestDataHelper } from '@package/test-utils';
 * import { createUserFixture } from './user.fixture';
 *
 * async function setupMultiTenantFixtures(db: ITestDatabase['db']) {
 *   TestDataHelper.resetCounter();
 *
 *   // Organization A fixtures
 *   const orgAUsers = await Promise.all([
 *     createUserFixture(db, { organizationId: 100 }),
 *     createUserFixture(db, { organizationId: 100 }),
 *   ]);
 *
 *   // Organization B fixtures
 *   const orgBUsers = await Promise.all([
 *     createUserFixture(db, { organizationId: 200 }),
 *     createUserFixture(db, { organizationId: 200 }),
 *   ]);
 *
 *   return { orgAUsers, orgBUsers };
 * }
 * ```
 */
export class TestDataHelper {
  private static counter = 0;

  /**
   * Generates a unique identifier with the given prefix.
   *
   * Combines the prefix, current timestamp, and an auto-incrementing counter
   * to produce identifiers guaranteed to be unique within a test run.
   *
   * @param prefix - A descriptive prefix for the identifier
   * @returns A unique string in the format `{prefix}_{timestamp}_{counter}`
   *
   * @example
   * ```typescript
   * const id1 = TestDataHelper.uniqueId('order');
   * // Result: 'order_1708012345678_1'
   *
   * const id2 = TestDataHelper.uniqueId('order');
   * // Result: 'order_1708012345678_2'
   *
   * const productId = TestDataHelper.uniqueId('product');
   * // Result: 'product_1708012345678_3'
   * ```
   */
  static uniqueId(prefix: string): string {
    this.counter++;
    return `${prefix}_${Date.now()}_${this.counter}`;
  }

  /**
   * Generates a unique email address for test users.
   *
   * Creates an email using the uniqueId pattern with the 'user' prefix,
   * ensuring no email collisions across tests.
   *
   * @returns A unique email string in the format `test_user_{timestamp}_{counter}@example.com`
   *
   * @example
   * ```typescript
   * const email1 = TestDataHelper.uniqueEmail();
   * // Result: 'test_user_1708012345678_1@example.com'
   *
   * const email2 = TestDataHelper.uniqueEmail();
   * // Result: 'test_user_1708012345678_2@example.com'
   * ```
   *
   * @example Using with user fixtures
   * ```typescript
   * import { createHash } from 'node:crypto';
   *
   * const email = TestDataHelper.uniqueEmail();
   * const emailHash = createHash('sha256')
   *   .update(email.toLowerCase())
   *   .digest('hex');
   *
   * const user = await createUserFixture(db, { emailHash });
   * ```
   */
  static uniqueEmail(): string {
    return `test_${this.uniqueId('user')}@example.com`;
  }

  /**
   * Generates a unique display name with the given prefix.
   *
   * Creates human-readable names suitable for user display names,
   * organization names, or other entities requiring readable identifiers.
   *
   * @param prefix - A descriptive prefix for the name (e.g., 'User', 'Organization')
   * @returns A unique string in the format `Test {prefix} name_{timestamp}_{counter}`
   *
   * @example
   * ```typescript
   * const userName = TestDataHelper.uniqueName('User');
   * // Result: 'Test User name_1708012345678_1'
   *
   * const orgName = TestDataHelper.uniqueName('Organization');
   * // Result: 'Test Organization name_1708012345678_2'
   * ```
   *
   * @example Creating multiple named entities
   * ```typescript
   * const users = [
   *   { name: TestDataHelper.uniqueName('Admin'), role: 'admin' },
   *   { name: TestDataHelper.uniqueName('Member'), role: 'member' },
   *   { name: TestDataHelper.uniqueName('Guest'), role: 'guest' },
   * ];
   * ```
   */
  static uniqueName(prefix: string): string {
    return `Test ${prefix} ${this.uniqueId('name')}`;
  }

  /**
   * Resets the internal counter to zero.
   *
   * **Important:** Call this method in `beforeEach` or at the start of each test
   * file to ensure counter values are predictable and tests are properly isolated.
   * Without resetting, counter values accumulate across test runs, which can lead
   * to inconsistent test data when tests run in different orders.
   *
   * @returns void
   *
   * @example Resetting in beforeEach hook
   * ```typescript
   * // Jest globals are available without import
   * import { TestDataHelper } from '@package/test-utils';
   *
   * describe('OrderService', () => {
   *   beforeEach(() => {
   *     // Reset counter for predictable IDs in each test
   *     TestDataHelper.resetCounter();
   *   });
   *
   *   it('should create order with unique ID', () => {
   *     const orderId = TestDataHelper.uniqueId('order');
   *     // First call after reset always produces counter=1
   *   });
   * });
   * ```
   *
   * @example Test file isolation pattern
   * ```typescript
   * // user.spec.ts
   * beforeEach(() => TestDataHelper.resetCounter());
   *
   * // organization.spec.ts
   * beforeEach(() => TestDataHelper.resetCounter());
   *
   * // Both files start with counter=0, ensuring isolation
   * ```
   */
  static resetCounter(): void {
    this.counter = 0;
  }
}

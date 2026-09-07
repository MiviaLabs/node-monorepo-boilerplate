/**
 * User status constants
 *
 * User status represents the current lifecycle state of a user account.
 * Status controls authentication eligibility, feature access, and data retention.
 *
 * **Status Lifecycle:**
 * ```
 * [New User] ──► ACTIVE ──► INACTIVE ──► DELETED
 *                  │            ▲
 *                  ▼            │
 *              SUSPENDED ───────┘
 * ```
 *
 * **Database Mapping:**
 * The database uses boolean flags (`isActive`, `isVerified`, `deletedAt`) which
 * map to these conceptual statuses:
 * - ACTIVE: `isActive = true` AND `deletedAt IS NULL`
 * - INACTIVE: `isActive = false` AND `deletedAt IS NULL`
 * - SUSPENDED: `isActive = false` AND `suspendedAt IS NOT NULL`
 * - DELETED: `deletedAt IS NOT NULL` (soft delete)
 *
 * **Access Control Implications:**
 * - ACTIVE: Full system access based on role permissions
 * - INACTIVE: Cannot authenticate; data preserved for reactivation
 * - SUSPENDED: Cannot authenticate; administrative review required
 * - DELETED: Cannot authenticate; data retained for compliance (soft delete)
 *
 * @see apps/api/src/modules/users/handlers/commands/update-user.handler.ts - Status transitions
 * @see apps/api/src/modules/auth/services/auth.service.ts - Status validation during login
 * @see packages/db-core/src/schemas/users.schema.ts - Database schema with boolean flags
 *
 * @example Validating user status during authentication
 * ```typescript
 * import { USER_STATUS } from '@package/constants/domain';
 * import { Errors } from '@package/errors';
 *
 * async function validateUserCanLogin(user: User): Promise<void> {
 *   switch (user.status) {
 *     case USER_STATUS.ACTIVE:
 *       return; // User can proceed
 *
 *     case USER_STATUS.INACTIVE:
 *       throw Errors.useruserAccountIs006({});
 *
 *     case USER_STATUS.SUSPENDED:
 *       throw Errors.useruserAccountIs007({});
 *
 *     case USER_STATUS.DELETED:
 *       // Return generic error to avoid account enumeration
 *       throw Errors.authinvalidEmailOr001({});
 *   }
 * }
 * ```
 *
 * @example User status management in admin dashboard
 * ```typescript
 * import { USER_STATUS, UserStatus } from '@package/constants/domain';
 *
 * @CommandHandler(UpdateUserStatusCommand)
 * export class UpdateUserStatusHandler {
 *   async execute(command: UpdateUserStatusCommand) {
 *     const { userId, newStatus, actorId, reason } = command;
 *     const user = await this.userRepository.findById(userId);
 *
 *     // Validate status transition
 *     this.validateStatusTransition(user.status, newStatus);
 *
 *     // Update status
 *     await this.userRepository.update(userId, { status: newStatus });
 *
 *     // Emit event for audit trail
 *     await this.eventBus.publish(new UserStatusChangedEvent({
 *       userId,
 *       previousStatus: user.status,
 *       newStatus,
 *       changedBy: actorId,
 *       reason
 *     }));
 *   }
 *
 *   private validateStatusTransition(current: UserStatus, next: UserStatus): void {
 *     // DELETED is terminal - cannot transition from it
 *     if (current === USER_STATUS.DELETED) {
 *       throw Errors.bizInvalidStateTransition008({
 *         from: current,
 *         to: next
 *       });
 *     }
 *   }
 * }
 * ```
 *
 * @example Filtering users by status in queries (with tenant isolation)
 * ```typescript
 * import { USER_STATUS } from '@package/constants/domain';
 * import { eq, and, ne } from 'drizzle-orm';
 *
 * // Query active users only within tenant (most common)
 * const activeUsers = await db
 *   .select()
 *   .from(users)
 *   .where(and(
 *     eq(users.organizationId, organizationId),
 *     eq(users.status, USER_STATUS.ACTIVE)
 *   ));
 *
 * // Query all users except deleted within tenant (admin view)
 * const visibleUsers = await db
 *   .select()
 *   .from(users)
 *   .where(and(
 *     eq(users.organizationId, organizationId),
 *     ne(users.status, USER_STATUS.DELETED)
 *   ));
 *
 * // Query suspended users within tenant for review
 * const pendingReview = await db
 *   .select()
 *   .from(users)
 *   .where(and(
 *     eq(users.organizationId, organizationId),
 *     eq(users.status, USER_STATUS.SUSPENDED)
 *   ));
 * ```
 */

export const USER_STATUS = {
  // ──────────────────────────────────────────────────────────────────────────
  // Active states - user can access the system
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Active user status
   *
   * User has full access to the system based on their role permissions.
   * This is the default status after successful registration and email verification.
   *
   * **Transitions from:** INACTIVE (reactivation), SUSPENDED (admin lift)
   * **Transitions to:** INACTIVE (user request), SUSPENDED (admin action), DELETED (account deletion)
   * **Can authenticate:** Yes
   */
  ACTIVE: 'active',

  // ──────────────────────────────────────────────────────────────────────────
  // Inactive states - user cannot access the system
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Inactive user status
   *
   * User account is deactivated, typically by user request or inactivity policy.
   * Data is preserved for potential reactivation. User cannot authenticate.
   *
   * **Transitions from:** ACTIVE (user request or inactivity)
   * **Transitions to:** ACTIVE (reactivation), DELETED (account deletion)
   * **Can authenticate:** No
   *
   * Common reasons: User requested deactivation, inactivity timeout,
   * pending email verification
   */
  INACTIVE: 'inactive',

  /**
   * Suspended user status
   *
   * User account is suspended by administrator due to policy violation,
   * security concern, or pending investigation. Requires admin action to lift.
   *
   * **Transitions from:** ACTIVE (admin action)
   * **Transitions to:** ACTIVE (admin lift), INACTIVE (downgrade), DELETED (ban)
   * **Can authenticate:** No
   *
   * Common reasons: Terms of service violation, suspicious activity,
   * payment dispute, compliance investigation
   */
  SUSPENDED: 'suspended',

  /**
   * Deleted user status (soft delete)
   *
   * User account is marked as deleted but data is retained for compliance
   * and audit purposes. This is a terminal state - reactivation requires
   * creating a new account.
   *
   * **Transitions from:** ACTIVE, INACTIVE, SUSPENDED
   * **Transitions to:** None (terminal state)
   * **Can authenticate:** No
   *
   * Data retention: Account data retained per data retention policy
   * (typically 30-90 days for GDPR compliance before hard deletion)
   */
  DELETED: 'deleted'
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

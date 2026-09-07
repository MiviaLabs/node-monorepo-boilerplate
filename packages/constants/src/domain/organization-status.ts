/**
 * Organization status constants
 *
 * Organization status represents the current lifecycle state of a tenant
 * (organization) in the multi-tenant system. Status controls whether
 * tenant members can access the platform and perform operations.
 *
 * **Tenant Lifecycle:**
 * ```
 * [New Org] ──► ACTIVE ◄──► INACTIVE
 *                 │
 *                 ▼
 *             SUSPENDED
 * ```
 *
 * **Database Relationship:**
 * The database `tenants` table uses a more granular status enum with additional
 * states for billing and onboarding workflows:
 * - `draft` - Tenant created but not yet activated (onboarding)
 * - `trial` - Free trial period active
 * - `active` - Maps to ORGANIZATION_STATUS.ACTIVE
 * - `suspended` - Maps to ORGANIZATION_STATUS.SUSPENDED
 * - `deleted` - Soft deleted (not in this constant set)
 *
 * These simplified constants are used for high-level status checks,
 * while the database enum handles the full billing lifecycle.
 *
 * **Access Control:**
 * Tenant middleware validates organization status on every request:
 * - ACTIVE: Full access for all tenant members
 * - INACTIVE: Members cannot authenticate to this tenant
 * - SUSPENDED: Members cannot authenticate; requires admin resolution
 *
 * **Business Implications:**
 * - ACTIVE: Billing active, features enabled per subscription tier
 * - INACTIVE: Billing paused, data preserved, can reactivate
 * - SUSPENDED: Payment failure, terms violation, or admin action
 *
 * @see packages/db-core/src/schemas/tenants.schema.ts - Database tenant status enum
 * @see apps/api/src/common/middleware/tenant.middleware.ts - Status validation
 * @see apps/api/src/modules/system/handlers/commands/create-tenant.handler.ts - Tenant creation
 *
 * @example
 * ```typescript
 * import { ORGANIZATION_STATUS } from '@package/constants/domain';
 *
 * // Check if tenant is accessible
 * if (tenant.status !== ORGANIZATION_STATUS.ACTIVE) {
 *   throw ApiException.tenantContextInvalid();
 * }
 *
 * // Query active organizations
 * const activeOrgs = await db
 *   .select()
 *   .from(tenants)
 *   .where(eq(tenants.status, ORGANIZATION_STATUS.ACTIVE));
 * ```
 */

export const ORGANIZATION_STATUS = {
  // ──────────────────────────────────────────────────────────────────────────
  // Operational states - tenant is accessible
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Active organization status
   *
   * Organization is fully operational. All members with appropriate roles
   * can access the tenant and perform operations based on their permissions.
   *
   * **Transitions from:** INACTIVE (reactivation), trial (subscription start)
   * **Transitions to:** INACTIVE (deactivation), SUSPENDED (policy violation)
   * **Member access:** Full access based on tenant role
   *
   * This is the normal operational state after:
   * - Successful subscription activation
   * - Trial period with payment method added
   * - Admin reactivation of inactive tenant
   */
  ACTIVE: 'active',

  // ──────────────────────────────────────────────────────────────────────────
  // Non-operational states - tenant access restricted
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Inactive organization status
   *
   * Organization is deactivated, typically due to subscription cancellation
   * or voluntary deactivation. Data is preserved for potential reactivation.
   *
   * **Transitions from:** ACTIVE (subscription cancelled, voluntary deactivation)
   * **Transitions to:** ACTIVE (reactivation with new subscription)
   * **Member access:** No access; authentication to tenant blocked
   *
   * Common reasons:
   * - Subscription cancelled by owner
   * - Organization requested deactivation
   * - Inactivity timeout (configurable)
   *
   * Data retention: Full data preserved per retention policy
   */
  INACTIVE: 'inactive',

  /**
   * Suspended organization status
   *
   * Organization is suspended due to policy violation, payment failure,
   * or administrative action. Requires intervention to resolve.
   *
   * **Transitions from:** ACTIVE (payment failure, terms violation)
   * **Transitions to:** ACTIVE (issue resolved), deletion (unresolved)
   * **Member access:** No access; authentication to tenant blocked
   *
   * Common reasons:
   * - Payment failure (grace period expired)
   * - Terms of service violation
   * - Security concern (suspicious activity)
   * - Compliance investigation
   * - Manual admin suspension
   *
   * Resolution: Contact support or resolve payment issue
   */
  SUSPENDED: 'suspended'
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

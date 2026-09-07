/**
 * Tenant isolation level constants
 *
 * Defines the strategy for isolating tenant data in a multi-tenant system.
 * The choice affects security, performance, and operational complexity.
 *
 * **Isolation Strategy Comparison:**
 * ```
 * ┌──────────────┬───────────────┬─────────────┬──────────────┐
 * │ Isolation    │ Security      │ Cost        │ Complexity   │
 * ├──────────────┼───────────────┼─────────────┼──────────────┤
 * │ DATABASE     │ Highest       │ Highest     │ Highest      │
 * │ SCHEMA       │ High          │ Moderate    │ Moderate     │
 * │ ROW          │ Moderate      │ Lowest      │ Lowest       │
 * └──────────────┴───────────────┴─────────────┴──────────────┘
 * ```
 *
 * **Compliance Requirements:**
 * - PCI DSS often requires DATABASE-level isolation
 * - Most SaaS applications use ROW-level isolation
 * - Healthcare (HIPAA) may require SCHEMA or DATABASE level
 *
 * @see packages/types/src/multitenancy/tenant.types.ts - TenantScoped interface
 * @see apps/api/src/common/middleware/tenant.middleware.ts - Tenant context setup
 *
 * @example
 * ```typescript
 * import { TENANT_ISOLATION_LEVEL, TenantIsolationLevel } from '@package/constants/domain';
 *
 * // Configure tenant isolation at application startup
 * const config = {
 *   multitenancy: {
 *     isolationLevel: TENANT_ISOLATION_LEVEL.ROW,
 *     enableCrosstenantQueries: false,
 *   },
 * };
 *
 * // Choose isolation strategy
 * switch (config.multitenancy.isolationLevel) {
 *   case TENANT_ISOLATION_LEVEL.DATABASE:
 *     // Each tenant has a separate database
 *     return createDatabaseConnection(tenant.databaseUrl);
 *
 *   case TENANT_ISOLATION_LEVEL.SCHEMA:
 *     // Each tenant has a separate schema in shared database
 *     return connection.withSchema(tenant.schemaName);
 *
 *   case TENANT_ISOLATION_LEVEL.ROW:
 *     // All tenants share tables with tenantId column
 *     return connection.withTenantFilter(tenant.id);
 * }
 *
 * // Validate isolation level matches compliance requirements
 * function validateCompliance(level: TenantIsolationLevel, requiresPCIDSS: boolean) {
 *   if (requiresPCIDSS && level !== TENANT_ISOLATION_LEVEL.DATABASE) {
 *     throw new ConfigurationError('PCI DSS requires database-level isolation');
 *   }
 * }
 * ```
 */

export const TENANT_ISOLATION_LEVEL = {
  // ──────────────────────────────────────────────────────────────────────────
  // Isolation strategies - ordered by isolation level (highest to lowest)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Separate database per tenant - highest isolation and security
   *
   * Each tenant has their own dedicated database instance. Provides the
   * strongest data isolation and allows for tenant-specific configurations,
   * backups, and scaling.
   *
   * **Pros:**
   * - Complete data isolation
   * - Tenant-specific database configuration
   * - Independent backup and restore
   * - Meets strictest compliance requirements
   *
   * **Cons:**
   * - Highest operational cost
   * - Connection pool per tenant
   * - Complex cross-tenant operations
   * - Schema migrations must run per tenant
   *
   * **Use when:**
   * - PCI DSS or strict compliance required
   * - Tenants require dedicated resources
   * - Data sovereignty requirements exist
   */
  DATABASE: 'database',

  /**
   * Separate schema per tenant in shared database - balanced approach
   *
   * All tenants share a database instance but each has their own schema.
   * Provides good isolation with moderate operational overhead.
   *
   * **Pros:**
   * - Strong logical isolation
   * - Shared database infrastructure
   * - Schema-level access control
   * - Moderate operational complexity
   *
   * **Cons:**
   * - Single database is potential bottleneck
   * - Schema per tenant can be many objects
   * - Migrations more complex than row-level
   * - Cross-tenant queries still possible
   *
   * **Use when:**
   * - Good isolation needed without full database separation
   * - Moderate number of tenants
   * - Tenants may need schema customization
   */
  SCHEMA: 'schema',

  /**
   * Shared tables with tenant ID column - most efficient, requires careful filtering
   *
   * All tenants share the same tables with a tenant_id column for filtering.
   * Most cost-effective but requires careful implementation to prevent
   * cross-tenant data access.
   *
   * **Pros:**
   * - Lowest operational cost
   * - Simple schema management
   * - Easy cross-tenant analytics
   * - Single connection pool
   *
   * **Cons:**
   * - Requires tenant filtering on all queries
   * - Risk of data leakage if filters missed
   * - Shared indexes may not be optimal
   * - Noisy neighbor potential
   *
   * **Use when:**
   * - Cost efficiency is priority
   * - Large number of tenants
   * - Standard SaaS application
   * - Cross-tenant analytics needed
   */
  ROW: 'row'
} as const;

/**
 * Type representing valid tenant isolation level values.
 *
 * Use this type for function parameters and configuration options
 * that accept isolation level values.
 *
 * @example
 * ```typescript
 * function configureIsolation(level: TenantIsolationLevel): void {
 *   // Implementation
 * }
 *
 * // Valid usage
 * configureIsolation(TENANT_ISOLATION_LEVEL.ROW);
 * configureIsolation('database'); // Also valid
 *
 * // Type error
 * configureIsolation('invalid'); // Error: not assignable
 * ```
 */
export type TenantIsolationLevel =
  (typeof TENANT_ISOLATION_LEVEL)[keyof typeof TENANT_ISOLATION_LEVEL];

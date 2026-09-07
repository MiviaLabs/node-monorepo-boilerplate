/**
 * Multi-tenancy types
 *
 * This module provides types for implementing multi-tenant architectures,
 * supporting tenant isolation at database, schema, or row level. These types
 * ensure proper tenant context propagation and data isolation across the
 * application layers.
 *
 * @module multitenancy/tenant.types
 * @see {@link TENANT_ISOLATION_LEVEL} from '@package/constants' for isolation level constants
 * @see {@link TenantIsolationLevel} from '@package/constants' for the isolation level type
 */

/**
 * Brand symbol for TenantId type safety.
 * This is a unique symbol used to create nominal typing for TenantId.
 * @internal
 */
declare const TenantIdBrand: unique symbol;

/**
 * Branded type for TenantId to provide compile-time safety.
 * @internal
 */
type TenantIdBrand = typeof TenantIdBrand;

/**
 * Unique identifier for a tenant.
 *
 * A branded string type representing a tenant's unique identifier. Used
 * throughout the system to establish tenant context and ensure data isolation.
 *
 * The branded type ensures compile-time safety, preventing accidental use of
 * arbitrary strings where a TenantId is expected. Use {@link asTenantId} to
 * convert a validated string to TenantId.
 *
 * @example
 * ```typescript
 * // In entity definitions
 * interface UserEntity {
 *   id: string;
 *   tenantId: TenantId;
 *   email: string;
 * }
 *
 * // In repository methods
 * async findByEmail(tenantId: TenantId, email: string): Promise<User | null> {
 *   return this.db.query.users.findFirst({
 *     where: and(eq(users.tenantId, tenantId), eq(users.email, email)),
 *   });
 * }
 *
 * // Extract from request context (already typed as TenantId)
 * const tenantId: TenantId = request.tenantContext.tenantId;
 *
 * // Convert a validated string to TenantId
 * const tenantId = asTenantId('tenant-123');
 * ```
 *
 * @see {@link asTenantId} for creating TenantId from validated strings
 * @see {@link ITenant} for the tenant entity containing this ID
 * @see {@link ITenantContext} for request-scoped tenant information
 * @see {@link ITenantScoped} for tenant-aware entity interface
 */
export type TenantId = string & { readonly [TenantIdBrand]: TenantIdBrand };

/**
 * Converts a validated string to a TenantId.
 *
 * Use this function to create TenantId values from strings that have been
 * validated (e.g., from database, validated input, or trusted sources).
 * This function performs a type cast with no runtime overhead.
 *
 * @param id - The string to convert to TenantId
 * @returns The input string typed as TenantId
 *
 * @example
 * ```typescript
 * // From validated database result
 * const tenantId = asTenantId(dbRow.organization_id);
 *
 * // From validated request header
 * const tenantId = asTenantId(request.headers['x-tenant-id'] as string);
 *
 * // In middleware after validation
 * if (isValidUuid(headerTenantId)) {
 *   const tenantId = asTenantId(headerTenantId);
 *   // tenantId is now properly typed
 * }
 * ```
 *
 * @see {@link TenantId} for the branded type definition
 */
export function asTenantId(id: string): TenantId {
  return id as TenantId;
}

/**
 * Tenant entity representing an organization or account in a multi-tenant system.
 *
 * Contains the core tenant information including identification, status, and
 * timestamps. Each tenant represents an isolated boundary for data and operations.
 *
 * @example
 * ```typescript
 * // Create a new tenant
 * const tenant: ITenant = {
 *   id: asTenantId('tenant_01HXYZ123ABC'),
 *   name: 'Acme Corporation',
 *   slug: 'acme-corp',
 *   isActive: true,
 *   createdAt: new Date('2024-01-15T10:00:00Z'),
 *   updatedAt: new Date('2024-01-15T10:00:00Z'),
 * };
 *
 * // Query tenant by slug
 * async function findTenantBySlug(slug: string): Promise<ITenant | null> {
 *   return this.db.query.tenants.findFirst({
 *     where: eq(tenants.slug, slug),
 *   });
 * }
 *
 * // Check tenant status before processing
 * if (!tenant.isActive) {
 *   // Handle suspended tenant (e.g., throw authorization error)
 *   throw new Error('Tenant account is suspended');
 * }
 * ```
 *
 * @see {@link TenantId} for the tenant identifier type
 * @see {@link ITenantContext} for request-scoped tenant context
 * @see {@link BaseEntity} for base entity timestamp pattern
 */
export interface ITenant {
  /** Unique identifier for the tenant */
  readonly id: TenantId;
  /** Human-readable name of the tenant organization */
  readonly name: string;
  /** URL-friendly slug for tenant identification in URLs and APIs */
  readonly slug: string;
  /** Whether the tenant account is active and allowed to operate */
  readonly isActive: boolean;
  /** Timestamp when the tenant was created */
  readonly createdAt: Date;
  /** Timestamp when the tenant was last updated */
  readonly updatedAt: Date;
}

/**
 * Request-scoped context containing tenant and user information.
 *
 * Propagated through the request lifecycle to provide tenant isolation and
 * user context for authorization, audit logging, and data access control.
 * Typically injected via NestJS request-scoped providers or middleware.
 *
 * @example
 * ```typescript
 * // Set context in middleware
 * @Injectable()
 * export class TenantMiddleware implements NestMiddleware {
 *   async use(req: Request, res: Response, next: NextFunction) {
 *     const tenant = await this.tenantService.findBySlug(req.headers['x-tenant-slug']);
 *     req.tenantContext = {
 *       tenantId: tenant.id,
 *       tenantSlug: tenant.slug,
 *       userId: req.user?.id,
 *       userRoles: req.user?.roles,
 *     };
 *     next();
 *   }
 * }
 *
 * // Access in repository
 * @Injectable({ scope: Scope.REQUEST })
 * export class UserRepository {
 *   constructor(
 *     @Inject(TENANT_CONTEXT) private readonly context: ITenantContext,
 *   ) {}
 *
 *   async findAll(): Promise<User[]> {
 *     return this.db.query.users.findMany({
 *       where: eq(users.tenantId, this.context.tenantId),
 *     });
 *   }
 * }
 *
 * // Use for audit logging
 * function logAuditEvent(context: ITenantContext, action: string) {
 *   return {
 *     tenantId: context.tenantId,
 *     userId: context.userId,
 *     action,
 *     timestamp: new Date(),
 *   };
 * }
 * ```
 *
 * @see {@link ITenant} for the tenant entity
 * @see {@link ITenantScoped} for tenant-aware entities
 * @see {@link TenantId} for the tenant identifier type
 */
export interface ITenantContext {
  /** The current tenant's unique identifier */
  readonly tenantId: TenantId;
  /** The current tenant's URL-friendly slug */
  readonly tenantSlug: string;
  /** The current user's identifier (if authenticated) */
  readonly userId?: string;
  /** The current user's roles for authorization checks */
  readonly userRoles?: readonly string[];
}

/**
 * Interface for entities that are scoped to a specific tenant.
 *
 * Implement this interface on entities that require tenant isolation.
 * All queries for these entities should filter by tenantId to prevent
 * cross-tenant data access.
 *
 * @example
 * ```typescript
 * // Define tenant-scoped entity
 * interface UserEntity extends ITenantScoped {
 *   id: string;
 *   email: string;
 *   name: string;
 *   createdAt: Date;
 * }
 *
 * // Repository with automatic tenant filtering
 * class TenantScopedRepository<T extends ITenantScoped> {
 *   constructor(
 *     private readonly db: Database,
 *     private readonly context: ITenantContext,
 *   ) {}
 *
 *   protected getTenantCondition() {
 *     return eq(this.table.tenantId, this.context.tenantId);
 *   }
 *
 *   async findById(id: string): Promise<T | null> {
 *     return this.db.query.findFirst({
 *       where: and(
 *         eq(this.table.id, id),
 *         this.getTenantCondition() // Always filter by tenant
 *       ),
 *     });
 *   }
 * }
 *
 * // Validate tenant boundary
 * function ensureTenantBoundary(entity: ITenantScoped, context: ITenantContext): void {
 *   if (entity.tenantId !== context.tenantId) {
 *     // Handle cross-tenant access violation (e.g., throw authorization error)
 *     throw new Error('Cross-tenant access denied');
 *   }
 * }
 * ```
 *
 * @see {@link TenantEntity} for full tenant entity interface
 * @see {@link ITenantRepository} for tenant-aware repository pattern
 * @see {@link ITenantContext} for request-scoped tenant context
 */
export interface ITenantScoped {
  /** The tenant ID this entity belongs to */
  readonly tenantId: TenantId;
}

/**
 * Note: Tenant isolation level types have been moved to @package/constants.
 *
 * @see {@link TENANT_ISOLATION_LEVEL} from '@package/constants' for isolation level constants
 * @see {@link TenantIsolationLevel} from '@package/constants' for the isolation level type
 */

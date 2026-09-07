/**
 * OPA Authorization Types
 *
 * Type definitions for Open Policy Agent authorization requests and responses.
 * These types define the contract between NestJS and OPA, ensuring type safety
 * across the authorization boundary.
 *
 * ## Type Hierarchy
 *
 * - {@link IAuthzRequest} - Input to OPA (sent as `input` document)
 * - {@link IAuthzResponse} - Output from OPA (policy evaluation result)
 * - {@link IOpaModuleOptions} - Configuration for OPA connection
 * - {@link IOpaModuleAsyncOptions} - Async factory configuration
 *
 * @module @package/opa
 */

/**
 * Authorization request sent to OPA as the `input` document.
 *
 * This interface defines the structure that Rego policies expect when
 * evaluating authorization decisions. It contains three main components:
 * - **User**: Who is making the request
 * - **Resource**: What they're trying to access
 * - **Action**: What they're trying to do
 *
 * ## Role Structure (from @package/constants)
 *
 * **System Roles** (cross-tenant):
 * - `system_owner` - Full system access
 * - `system_admin` - System administration
 *
 * **Tenant Roles** (organization-scoped):
 * - `tenant_owner` - Organization owner
 * - `tenant_admin` - Organization administrator
 * - `tenant_user` - Standard user
 * - `tenant_viewer` - Read-only access
 *
 * ## Permission Format
 *
 * Permissions follow the format: `scope:resource:action`
 * - `scope`: `system` or `tenant` (or custom scopes)
 * - `resource`: Resource type (e.g., `tenants`, `users`, `organizations`)
 * - `action`: Action type (e.g., `read`, `create`, `update`, `delete`)
 *
 * Examples:
 * - `system:tenants:read` - Read tenants across system
 * - `tenant:users:create` - Create users in tenant
 * - `organizations:update` - Legacy format (backward compatible)
 *
 * @example Rego policy accessing request data
 * ```rego
 * package authz
 *
 * default allow = false
 *
 * # Allow system admins to do anything
 * allow {
 *   "system_admin" in input.user.system_roles
 * }
 *
 * # Allow users to read their own organization's resources
 * allow {
 *   input.action == "read"
 *   input.user.organization_id == input.resource.organization_id
 * }
 *
 * # Allow resource owners to update their resources
 * allow {
 *   input.action == "update"
 *   input.user.id == input.resource.owner_id
 * }
 * ```
 *
 * @see {@link IAuthzResponse} for the expected response format
 */
export interface IAuthzRequest {
  /**
   * The authenticated user making the request.
   *
   * Contains identity, roles, and attributes needed for authorization decisions.
   */
  readonly user: {
    /**
     * Unique identifier for the user (typically UUID).
     *
     * Used for ownership checks and audit logging.
     *
     * @example "user-123e4567-e89b-12d3-a456-426614174000"
     */
    readonly id: string;

    /**
     * System-level roles that apply across all tenants/organizations.
     *
     * These roles grant broad, cross-cutting permissions.
     *
     * @example ["system_owner"]
     * @example ["system_admin"]
     * @example [] // Regular user with no system roles
     */
    readonly system_roles: readonly string[]; // system_owner, system_admin

    /**
     * Tenant-level roles scoped to the user's organization.
     *
     * These roles determine what the user can do within their organization.
     *
     * @example ["tenant_owner", "tenant_admin"]
     * @example ["tenant_user"]
     * @example ["tenant_viewer"]
     */
    readonly tenant_roles: readonly string[]; // tenant_owner, tenant_admin, tenant_user, tenant_viewer

    /**
     * The organization the user currently belongs to (or null if none).
     *
     * Used for multi-tenancy isolation to ensure users can only access
     * resources within their organization.
     *
     * @example "org-123e4567-e89b-12d3-a456-426614174000"
     * @example null // User not associated with an organization
     */
    readonly organization_id: string | null;

    /**
     * Fine-grained permission strings for direct permission checks.
     *
     * Format: `scope:resource:action` or legacy `resource:action`
     *
     * @example ["system:tenants:read", "tenant:users:create"]
     * @example ["organizations:update", "documents:write"]
     * @example undefined // No explicit permissions, rely on roles
     */
    readonly permissions?: readonly string[];

    /**
     * Additional user attributes for attribute-based access control (ABAC).
     *
     * Optional. Use for context-aware authorization decisions.
     *
     * @example { department: "engineering", clearance: "secret", location: "us-east" }
     * @example undefined // No additional attributes
     */
    readonly attributes?: Readonly<Record<string, unknown>>;
  };

  /**
   * The resource being accessed.
   *
   * Contains type, identity, ownership, and scope information about the target resource.
   */
  readonly resource: {
    /**
     * The type/category of resource being accessed.
     *
     * Should match the resource type defined in your Rego policies.
     *
     * @example "organization"
     * @example "document"
     * @example "user"
     * @example "project"
     */
    readonly type: string;

    /**
     * Scope of the resource (system, tenant, or custom scope).
     *
     * Used for permission matching in the `scope:resource:action` format.
     * If not specified, defaults to "tenant" for organization-scoped resources.
     *
     * @example "system" - System-level resource (tenants, system settings)
     * @example "tenant" - Tenant-scoped resource (users, projects within org)
     * @example undefined - Defaults to tenant scope
     */
    readonly scope?: string;

    /**
     * Unique identifier of the specific resource (if applicable).
     *
     * Optional. Undefined for collection-level operations like "list" or "create".
     *
     * @example "doc-123e4567-e89b-12d3-a456-426614174000"
     * @example undefined // Creating a new resource
     */
    readonly id?: string;

    /**
     * The user ID of the resource owner (if applicable).
     *
     * Used for ownership-based authorization rules.
     *
     * @example "user-987fcdeb-51a2-34b5-c678-901234567890"
     * @example undefined // Resource has no owner concept
     */
    readonly owner_id?: string;

    /**
     * The organization that owns this resource (for multi-tenancy).
     *
     * Used to enforce tenant isolation in authorization rules.
     *
     * @example "org-123e4567-e89b-12d3-a456-426614174000"
     * @example undefined // Resource is not organization-scoped
     */
    readonly organization_id?: string;

    /**
     * Additional resource attributes for ABAC-style authorization.
     *
     * Optional. Used when authorization depends on resource state that is
     * not captured by the generic type/id/owner fields alone.
     */
    readonly attributes?: Readonly<Record<string, unknown>>;
  };

  /**
   * The action being performed on the resource.
   *
   * Standard CRUD actions: `create`, `read`, `list`, `update`, `delete`
   * Domain-specific: `publish`, `approve`, `transfer`, `archive`, etc.
   *
   * @example "read"
   * @example "update"
   * @example "publish"
   */
  readonly action: string;
}

/**
 * @deprecated Use {@link IAuthzRequest} instead. This alias is maintained for backward compatibility.
 */
export type AuthzRequest = IAuthzRequest;

/**
 * Authorization response from OPA's Data API.
 *
 * This is the result of evaluating a Rego policy against the input request.
 *
 * @example Successful allow response
 * ```json
 * { "result": true, "decision_id": "dec-123-abc" }
 * ```
 *
 * @example Deny response
 * ```json
 * { "result": false }
 * ```
 */
export interface IAuthzResponse {
  /**
   * The authorization decision.
   *
   * - `true` = Access allowed
   * - `false` = Access denied
   *
   * This value is the result of the Rego rule specified in `policyPath`.
   */
  readonly result: boolean;

  /**
   * Unique identifier for this decision (for audit trails).
   *
   * Optional. OPA generates this when decision logging is enabled.
   * Useful for correlating authorization decisions with audit logs.
   *
   * @example "dec-123e4567-e89b-12d3-a456-426614174000"
   */
  readonly decision_id?: string;
}

/**
 * @deprecated Use {@link IAuthzResponse} instead. This alias is maintained for backward compatibility.
 */
export type AuthzResponse = IAuthzResponse;

/**
 * Configuration options for the OPA module.
 *
 * These options configure how the OPA client connects to and communicates
 * with the OPA server.
 *
 * @example Default configuration
 * ```typescript
 * const config: OpaModuleOptions = {
 *   url: 'http://localhost:8181',
 *   policyPath: '/v1/data/authz/allow',
 *   timeout: 5000
 * };
 * ```
 *
 * @example Production configuration
 * ```typescript
 * const config: OpaModuleOptions = {
 *   url: 'http://opa.authorization.svc.cluster.local:8181',
 *   policyPath: '/v1/data/enterprise/authz/v2/allow',
 *   timeout: 3000 // Lower timeout for faster failover
 * };
 * ```
 *
 * @see {@link DEFAULT_OPA_CONFIG} for default values
 * @see {@link validateOpaConfig} for configuration validation
 */
export interface IOpaModuleOptions {
  /**
   * Base URL of the OPA server.
   *
   * Should include protocol and port, but NOT the path.
   *
   * @example "http://localhost:8181"
   * @example "http://opa.authorization.svc.cluster.local:8181"
   * @example "https://opa.example.com"
   */
  readonly url: string;

  /**
   * Path to the policy document in OPA.
   *
   * This path is appended to the base URL when making authorization requests.
   * The path should correspond to a Rego rule that returns a boolean.
   *
   * ## Path Structure
   *
   * - Must start with `/`
   * - Usually follows `/v1/data/{package}/{rule}` format
   * - The rule should evaluate to a boolean
   *
   * @example "/v1/data/authz/allow" // Package: authz, Rule: allow
   * @example "/v1/data/enterprise/rbac/authorize"
   * @example "/v1/data/app/v2/permissions/check"
   *
   * @see Rego package structure for mapping to policy paths
   */
  readonly policyPath: string;

  /**
   * Request timeout in milliseconds.
   *
   * How long to wait for OPA to respond before timing out.
   * On timeout, fail-closed behavior denies the request.
   *
   * ## Recommendations
   *
   * - **Development**: 5000ms (generous for debugging)
   * - **Production**: 2000-3000ms (fast failover)
   * - **Maximum**: 30000ms (enforced limit)
   *
   * @example 5000 // 5 seconds
   * @example 2000 // 2 seconds (production recommended)
   */
  readonly timeout: number;
}

/**
 * @deprecated Use {@link IOpaModuleOptions} instead. This alias is maintained for backward compatibility.
 */
export type OpaModuleOptions = IOpaModuleOptions;

/**
 * Async configuration options for dynamic OPA module setup.
 *
 * Use this interface when OPA configuration depends on other services
 * (like ConfigService) or needs to be loaded asynchronously.
 *
 * @example Using ConfigService
 * ```typescript
 * OpaModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     url: config.getOrThrow('OPA_URL'),
 *     policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
 *     timeout: config.get('OPA_TIMEOUT', 5000),
 *   }),
 * })
 * ```
 *
 * @example Using environment helper
 * ```typescript
 * import { opaConfigFromEnv } from '@package/opa';
 *
 * OpaModule.forRootAsync({
 *   useFactory: () => opaConfigFromEnv(process.env),
 * })
 * ```
 *
 * @see {@link IOpaModuleOptions} for the configuration structure
 * @see {@link opaConfigFromEnv} for environment-based configuration
 */
export interface IOpaModuleAsyncOptions {
  /**
   * NestJS modules to import for dependency injection.
   *
   * Import modules that provide services needed by useFactory.
   *
   * @example [ConfigModule]
   * @example [ConfigModule, SecretsModule]
   */
  readonly imports?: Array<unknown>;

  /**
   * Injection tokens for factory dependencies.
   *
   * List services that should be injected into useFactory.
   *
   * @example [ConfigService]
   * @example [ConfigService, SecretsService]
   */
  readonly inject?: Array<unknown>;

  /**
   * Factory function that creates OpaModuleOptions.
   *
   * Receives injected dependencies as arguments in order.
   * Can be sync or async (return Promise<OpaModuleOptions>).
   *
   * @param args - Injected dependencies (from inject array)
   * @returns OPA configuration or Promise resolving to configuration
   *
   * @example Sync factory
   * ```typescript
   * useFactory: (config: ConfigService) => ({
   *   url: config.get('OPA_URL'),
   *   policyPath: '/v1/data/authz/allow',
   *   timeout: 5000,
   * })
   * ```
   *
   * @example Async factory
   * ```typescript
   * useFactory: async (secrets: SecretsService) => {
   *   const opaUrl = await secrets.get('opa-url');
   *   return {
   *     url: opaUrl,
   *     policyPath: '/v1/data/authz/allow',
   *     timeout: 5000,
   *   };
   * }
   * ```
   */
  readonly useFactory: (...args: unknown[]) => Promise<IOpaModuleOptions> | IOpaModuleOptions;
}

/**
 * @deprecated Use {@link IOpaModuleAsyncOptions} instead. This alias is maintained for backward compatibility.
 */
export type OpaModuleAsyncOptions = IOpaModuleAsyncOptions;

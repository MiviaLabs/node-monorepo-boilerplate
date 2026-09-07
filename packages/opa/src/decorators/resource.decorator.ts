/**
 * Resource Decorator
 *
 * Specifies the resource type for OPA authorization. Used in conjunction with
 * the @Action() decorator to provide metadata for authorization decisions.
 *
 * ## Usage
 *
 * ```typescript
 * @Resource('users')                             // Simple form (defaults to tenant scope)
 * @Resource({ type: 'users', scope: 'tenant' }) // Explicit object form
 * @Resource({ type: 'tenants', scope: 'system' }) // System-scoped
 * ```
 *
 * ## Scope Options
 *
 * - `system` - System-level resources (tenants, system settings)
 * - `tenant` - Tenant-scoped resources (users, projects within org)
 * - undefined - Defaults to 'tenant' for organization-scoped resources
 *
 * @module @package/opa
 * @see {@link OpaGuard} for guard implementation
 * @see {@link Action} decorator for action specification
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for storing resource type and scope in route handlers.
 *
 * Used by OpaGuard to extract resource metadata for authorization requests.
 */
export const RESOURCE_KEY = 'opa_resource';

/**
 * Resource decorator options.
 *
 * @property type - Resource type identifier (e.g., 'users', 'organizations')
 * @property scope - Resource scope (system, tenant, or custom)
 */
export interface ResourceOptions {
  type: string;
  scope?: string;
}

/**
 * Decorator factory that creates the @Resource decorator.
 *
 * This allows the decorator to work with NestJS's class decorator pattern.
 *
 * @param resource - Resource type string or ResourceOptions object
 * @returns A class decorator function
 */
function resourceDecoratorFactory(resource: string | ResourceOptions) {
  // If resource is a string, convert to ResourceOptions with default scope
  const metadata: ResourceOptions =
    typeof resource === 'string' ? { type: resource, scope: 'tenant' } : resource;
  const decorator = SetMetadata(RESOURCE_KEY, metadata);

  return ((...args: unknown[]) => {
    (decorator as (...decoratorArgs: unknown[]) => void)(...args);
  }) as ClassDecorator & MethodDecorator;
}

/**
 * Decorator that specifies the resource type for OPA authorization.
 *
 * This decorator marks a controller or handler method with the resource type
 * being accessed, which is used by OPA policies to make authorization decisions.
 *
 * ## Simple Form (String)
 *
 * ```typescript
 * @Resource('users')
 * @Resource('organizations')
 * @Resource('tenants')
 * ```
 *
 * ## Object Form (with type and scope)
 *
 * ```typescript
 * // System-level resource
 * @Resource({ type: 'tenants', scope: 'system' })
 *
 * // Tenant-scoped resource (explicit)
 * @Resource({ type: 'users', scope: 'tenant' })
 * ```
 *
 * ## Controller-Level vs Method-Level
 *
 * ```typescript
 * @Controller('users')
 * @Resource({ type: 'users', scope: 'tenant' })  // Default for all methods
 * export class UsersController {
 *   @Get()
 *   @Action('list')
 *   findAll() { ... }  // Uses 'users' resource with tenant scope
 *
 *   @Resource({ type: 'user_profiles', scope: 'tenant' })  // Override for this method
 *   @Get(':id/profile')
 *   @Action('read')
 *   getProfile() { ... }  // Uses 'user_profiles' resource
 * }
 * ```
 *
 * ## Scope Best Practices
 *
 * - Use `scope: 'system'` for cross-tenant resources (tenants, system settings)
 * - Use `scope: 'tenant'` or omit for organization-scoped resources (users, projects)
 * - Custom scopes for domain-specific isolation (e.g., 'department', 'region')
 *
 * ## Implementation Note
 *
 * The decorator uses NestJS's `SetMetadata` which natively supports both class
 * and method decorator patterns. The factory function returns a decorator that
 * works correctly in both contexts through Nest's metadata reflection system.
 *
 * @param resource - Resource type string or ResourceOptions object
 * @returns Decorator function
 * @example Controller-level resource
 * ```typescript
 * @Controller('organizations')
 * @UseGuards(JwtAuthGuard, OpaGuard)
 * @Resource({ type: 'organization', scope: 'tenant' })
 * export class OrganizationsController {
 *   @Get()
 *   @Action('list')
 *   findAll() { ... }
 * }
 * ```
 * @example Method-level resource with scope
 * ```typescript
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, OpaGuard)
 * export class AdminController {
 *   @Get('tenants')
 *   @Resource({ type: 'tenants', scope: 'system' })
 *   @Action('list')
 *   listAllTenants() { ... }
 * }
 * ```
 */
export const Resource: (resource: string | ResourceOptions) => ClassDecorator & MethodDecorator =
  resourceDecoratorFactory as (
    resource: string | ResourceOptions
  ) => ClassDecorator & MethodDecorator;

/**
 * Action Decorator
 *
 * Specifies the action being performed on a resource for OPA authorization.
 *
 * ## Standard Actions
 *
 * - `create` - Creating a new resource
 * - `read` - Reading a single resource
 * - `list` - Listing multiple resources
 * - `update` - Updating an existing resource
 * - `delete` - Deleting a resource
 *
 * ## Custom Actions
 *
 * Domain-specific actions can be used:
 * - `publish`, `approve`, `transfer`, `archive`, etc.
 *
 * @example Standard CRUD actions
 * ```typescript
 * @Get()
 * @Action('list')
 * findAll() { ... }
 *
 * @Get(':id')
 * @Action('read')
 * findOne() { ... }
 *
 * @Post()
 * @Action('create')
 * create() { ... }
 *
 * @Patch(':id')
 * @Action('update')
 * update() { ... }
 *
 * @Delete(':id')
 * @Action('delete')
 * remove() { ... }
 * ```
 *
 * @example Custom actions
 * ```typescript
 * @Post(':id/publish')
 * @Action('publish')
 * publish() { ... }
 *
 * @Post(':id/approve')
 * @Action('approve')
 * approve() { ... }
 * ```
 */

export const ACTION_KEY = 'opa_action';

export const Action: (action: string) => MethodDecorator = (action: string): MethodDecorator => {
  return SetMetadata(ACTION_KEY, action);
};

// Type exports for TypeScript
export type ResourceDecorator = typeof Resource;
export type ActionDecorator = typeof Action;

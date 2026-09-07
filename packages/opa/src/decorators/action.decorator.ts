/**
 * Action Decorator
 *
 * Marks NestJS routes with the action being performed for OPA authorization.
 * This metadata is read by {@link OpaGuard} and {@link OpaCachedGuard} to construct
 * authorization requests.
 *
 * ## How It Works
 *
 * 1. Decorator stores metadata using NestJS `SetMetadata`
 * 2. Guards use NestJS `Reflector` to read the `ACTION_KEY` metadata
 * 3. The action is included in the OPA authorization request
 *
 * ## Metadata Resolution
 *
 * Guards check metadata in this order (first match wins):
 * 1. Method-level `@Action()` decorator
 * 2. Controller-level `@Action()` decorator (rare use case)
 *
 * @module @package/opa
 * @see {@link Resource} decorator for specifying resource types
 * @see {@link OpaGuard} for how metadata is consumed
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to store and retrieve action names.
 *
 * This key is used internally by:
 * - `@Action()` decorator to store the value
 * - `OpaGuard.getAction()` to retrieve the value via Reflector
 *
 * @example Reading metadata manually
 * ```typescript
 * import { Reflector } from '@nestjs/core';
 * import { ACTION_KEY } from '@package/opa';
 *
 * @Injectable()
 * export class AuditService {
 *   constructor(private reflector: Reflector) {}
 *
 *   getAction(context: ExecutionContext): string {
 *     return this.reflector.getAllAndOverride<string>(ACTION_KEY, [
 *       context.getHandler(),
 *       context.getClass()
 *     ]);
 *   }
 * }
 * ```
 */
export const ACTION_KEY = 'opa_action';

/**
 * Marks a controller or method with an action for OPA authorization.
 *
 * The action identifies what operation is being performed on the resource,
 * allowing OPA policies to enforce fine-grained access control.
 *
 * ## Standard CRUD Actions
 *
 * | Action | HTTP Method | Description |
 * |--------|-------------|-------------|
 * | `create` | POST | Create a new resource |
 * | `read` | GET | Read a single resource |
 * | `list` | GET | List multiple resources |
 * | `update` | PUT/PATCH | Modify an existing resource |
 * | `delete` | DELETE | Remove a resource |
 *
 * ## Domain-Specific Actions
 *
 * Define custom actions for domain operations:
 *
 * | Action | Description |
 * |--------|-------------|
 * | `publish` | Make content publicly visible |
 * | `archive` | Move to archived state |
 * | `approve` | Approve a workflow item |
 * | `reject` | Reject a workflow item |
 * | `transfer` | Transfer ownership |
 * | `export` | Export data |
 * | `import` | Import data |
 * | `invite` | Invite users |
 * | `revoke` | Revoke access |
 *
 * @param action - Action name string (should match Rego policy expectations)
 * @returns MethodDecorator & ClassDecorator that sets metadata
 *
 * @example Standard CRUD operations
 * ```typescript
 * import { Controller, Get, Post, Patch, Delete, UseGuards, Param, Body } from '@nestjs/common';
 * import { OpaGuard, Resource, Action } from '@package/opa';
 *
 * @Controller('documents')
 * @UseGuards(JwtAuthGuard, OpaGuard)
 * @Resource('document')
 * export class DocumentsController {
 *
 *   @Get()
 *   @Action('list')
 *   findAll() { ... }
 *
 *   @Get(':id')
 *   @Action('read')
 *   findOne(@Param('id') id: string) { ... }
 *
 *   @Post()
 *   @Action('create')
 *   create(@Body() dto: CreateDocumentDto) { ... }
 *
 *   @Patch(':id')
 *   @Action('update')
 *   update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) { ... }
 *
 *   @Delete(':id')
 *   @Action('delete')
 *   remove(@Param('id') id: string) { ... }
 * }
 * ```
 *
 * @example Domain-specific actions
 * ```typescript
 * @Controller('documents')
 * @Resource('document')
 * export class DocumentsController {
 *
 *   @Post(':id/publish')
 *   @Action('publish')
 *   publish(@Param('id') id: string) {
 *     // Only users with 'publish' permission can access
 *     return this.documentService.publish(id);
 *   }
 *
 *   @Post(':id/archive')
 *   @Action('archive')
 *   archive(@Param('id') id: string) {
 *     return this.documentService.archive(id);
 *   }
 *
 *   @Post(':id/transfer')
 *   @Action('transfer')
 *   transferOwnership(
 *     @Param('id') id: string,
 *     @Body() dto: TransferOwnershipDto
 *   ) {
 *     // Requires special 'transfer' permission
 *     return this.documentService.transfer(id, dto.newOwnerId);
 *   }
 * }
 * ```
 *
 * @example Corresponding Rego policy
 * ```rego
 * package authz
 *
 * # Allow document owners to publish their documents
 * allow {
 *   input.resource.type == "document"
 *   input.action == "publish"
 *   input.resource.owner_id == input.user.id
 * }
 *
 * # Allow admins to transfer document ownership
 * allow {
 *   input.resource.type == "document"
 *   input.action == "transfer"
 *   input.user.tenant_roles[_] == "tenant_admin"
 * }
 * ```
 */
export const Action = (action: string) => SetMetadata(ACTION_KEY, action);

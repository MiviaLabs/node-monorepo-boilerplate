/**
 * OPA Decorators
 *
 * Declarative decorators for Open Policy Agent (OPA) authorization.
 *
 * ## Decorators
 *
 * - {@link Resource} - Specifies the resource type for authorization (e.g., 'user', 'organization')
 * - {@link Action} - Specifies the action being performed (e.g., 'read', 'create', 'update', 'delete')
 *
 * ## Usage
 *
 * Apply these decorators to controller classes and methods:
 *
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { OpaGuard, Resource, Action } from '@package/opa';
 *
 * @Controller('users')
 * @UseGuards(OpaGuard)
 * @Resource('user') // Resource type
 * export class UsersController {
 *   @Get()
 *   @Action('list') // Action: list users
 *   findAll() { }
 *
 *   @Get(':id')
 *   @Action('read') // Action: read single user
 *   findOne(@Param('id') id: string) { }
 *
 *   @Post()
 *   @Action('create') // Action: create user
 *   create(@Body() dto: CreateUserDto) { }
 * }
 * ```
 *
 * ## Metadata Keys
 *
 * - `RESOURCE_KEY` - Metadata key for Resource decorator
 * - `ACTION_KEY` - Metadata key for Action decorator
 *
 * @packageDocumentation
 */

export { Resource, Action, RESOURCE_KEY, ACTION_KEY } from './resource.decorator';
export type { ResourceDecorator, ActionDecorator, ResourceOptions } from './resource.decorator';

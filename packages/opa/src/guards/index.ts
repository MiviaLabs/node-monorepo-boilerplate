/**
 * OPA Guards
 *
 * NestJS guards for Open Policy Agent (OPA) authorization.
 *
 * ## Guards
 *
 * - {@link OpaGuard} - Standard authorization guard that queries OPA on every request
 * - {@link OpaCachedGuard} - Cached authorization guard with TTL for high-traffic endpoints
 *
 * ## Usage
 *
 * Apply guards to controllers or individual routes:
 *
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { OpaGuard, OpaCachedGuard, Resource, Action } from '@package/opa';
 *
 * @Controller('users')
 * @UseGuards(OpaGuard)
 * @Resource('user')
 * export class UsersController {
 *   @Get(':id')
 *   @Action('read')
 *   findOne(@Param('id') id: string) {
 *     // This endpoint queries OPA on every request
 *   }
 * }
 *
 * @Controller('posts')
 * @UseGuards(OpaCachedGuard) // Uses cache for better performance
 * @Resource('post')
 * export class PostsController {
 *   @Get('popular')
 *   @Action('list')
 *   getPopular() {
 *     // This endpoint uses cached authorization decisions
 *   }
 * }
 * ```
 *
 * ## Guard Comparison
 *
 * | Feature           | OpaGuard        | OpaCachedGuard     |
 * | ----------------- | --------------- | ------------------ |
 * | Authorization     | Per-request     | Cached with TTL    |
 * | Performance       | Standard        | High (cached)      |
 * | Freshness         | Always fresh    | May be stale       |
 * | Use Case          | Most endpoints  | High-traffic       |
 * | Memory Usage      | Low             | Moderate (cache)   |
 *
 * @packageDocumentation
 */

export { OpaGuard } from './opa.guard';
export { OpaCachedGuard } from './opa-cached.guard';

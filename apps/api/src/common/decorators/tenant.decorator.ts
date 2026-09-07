import { createParamDecorator } from '@nestjs/common';

import { ApiException } from '../errors';

import type { TenantContext as TenantContextType } from '../middleware/tenant-context.storage';
import type { ExecutionContext } from '@nestjs/common';

/**
 * Request interface with tenant context
 */
interface RequestWithTenantContext {
  tenantContext?: TenantContextType;
}

/**
 * Decorator to inject tenant context into controller methods
 *
 * @example
 * ```typescript
 * @Post()
 * async create(@TenantContext() tenant: TenantContext, @Body() dto: CreateDto) {
 *   console.log(tenant.tenantId);
 * }
 * ```
 */
export const TenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextType => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();

    // ONLY check request.tenantContext (set by middleware)
    // Do NOT fall back to AsyncLocalStorage as it may contain stale data from previous requests
    if (request.tenantContext) {
      return request.tenantContext;
    }

    // If request.tenantContext is not set, tenant header was missing or invalid
    throw ApiException.missingRequiredHeader('x-tenant-id');
  }
);

/**
 * Decorator to inject tenant ID into controller methods
 *
 * @example
 * ```typescript
 * @Post()
 * async create(@TenantId() tenantId: string, @Body() dto: CreateDto) {
 *   // tenantId is string
 * }
 * ```
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();

  // ONLY check request.tenantContext (set by middleware)
  // Do NOT fall back to AsyncLocalStorage as it may contain stale data from previous requests
  if (request.tenantContext?.tenantId) {
    return request.tenantContext.tenantId;
  }

  // If request.tenantContext is not set, tenant header was missing or invalid
  throw ApiException.missingRequiredHeader('x-tenant-id');
});

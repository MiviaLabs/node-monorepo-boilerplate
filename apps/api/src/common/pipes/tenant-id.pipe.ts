import { Injectable, PipeTransform } from '@nestjs/common';
import { Errors } from '@package/errors';

/**
 * Validation pipe for tenant ID headers
 * Validates that x-tenant-id header contains a valid positive integer
 *
 * @example
 * ```typescript
 * @Post()
 * async create(
 *   @TenantId('x-tenant-id', TenantIdPipe) tenantId: number,
 *   @Body() dto: CreateDto
 * ) {
 *   // tenantId is now a validated number
 * }
 * ```
 */
@Injectable()
export class TenantIdPipe implements PipeTransform<string, number> {
  transform(tenantId: string): number {
    const organizationId = Number.parseInt(tenantId, 10);

    if (Number.isNaN(organizationId)) {
      throw Errors.validationinvalidValueFor002({
        field: 'x-tenant-id',
        expectedType: 'integer'
      });
    }

    return organizationId;
  }
}

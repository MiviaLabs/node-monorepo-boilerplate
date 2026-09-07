import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { GetCurrentTenantQuery } from '../../queries/get-current-tenant.query';
import { TenantService } from '../../services/tenant.service';

/**
 * Get current tenant query handler
 *
 * Handles retrieving the current tenant's settings
 */
@Injectable()
@QueryHandler(GetCurrentTenantQuery)
export class GetCurrentTenantHandler implements IQueryHandler<GetCurrentTenantQuery> {
  private readonly logger = new Logger(GetCurrentTenantHandler.name);

  constructor(private readonly tenantService: TenantService) {}

  async execute(
    query: GetCurrentTenantQuery
  ): Promise<ReturnType<TenantService['getCurrentTenant']>> {
    this.logger.debug(`Fetching current tenant settings for tenant: ${query.tenantId}`);

    // Delegate to the service
    return this.tenantService.getCurrentTenant(
      query.tenantId,
      query.actorId,
      query.requestId,
      query.correlationId,
      query.causationId
    );
  }
}

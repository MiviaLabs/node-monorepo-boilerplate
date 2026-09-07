import { Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { GetMembersQuery } from '../../queries/get-members.query';
import { TenantService } from '../../services/tenant.service';

/**
 * Get members query handler
 *
 * Handles retrieving a paginated list of tenant members
 */
@Injectable()
@QueryHandler(GetMembersQuery)
export class GetMembersHandler implements IQueryHandler<GetMembersQuery> {
  private readonly logger = new Logger(GetMembersHandler.name);

  constructor(private readonly tenantService: TenantService) {}

  async execute(query: GetMembersQuery): Promise<ReturnType<TenantService['getMembers']>> {
    this.logger.debug(
      `Fetching tenant members for tenant: ${query.tenantId}, page: ${query.page}, pageSize: ${query.pageSize}`
    );

    // Delegate to the service
    return this.tenantService.getMembers({
      tenantId: query.tenantId,
      actorId: query.actorId,
      requestId: query.requestId,
      correlationId: query.correlationId,
      causationId: query.causationId,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      role: query.role,
      status: query.status,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    });
  }
}

import { Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { GetGcpTenantQuery } from '../../queries/get-gcp-tenant.query';
import { GcpTenantRepository } from '../../repositories/gcp-tenant.repository';

/**
 * Get GCP Tenant Handler
 *
 * Retrieves the GCP tenant ID for an organization.
 */
@QueryHandler(GetGcpTenantQuery)
export class GetGcpTenantHandler implements IQueryHandler<GetGcpTenantQuery> {
  private readonly logger = new Logger(GetGcpTenantHandler.name);

  constructor(private readonly gcpTenantRepository: GcpTenantRepository) {}

  async execute(query: GetGcpTenantQuery): Promise<{
    organizationId: number;
    gcpTenantId: string | null;
    hasGcpTenant: boolean;
  }> {
    this.logger.debug(`Getting GCP tenant for organization ${query.organizationId}`);

    const organization = await this.gcpTenantRepository.findByIdWithGcpTenant(
      query.tenantId,
      query.organizationId
    );

    if (!organization) {
      throw Errors.useruserWithId001({ userId: String(query.organizationId) });
    }

    if (!organization.gcpTenantId) {
      this.logger.debug(`Organization ${query.organizationId} does not have a GCP tenant`);
      return {
        organizationId: organization.id,
        gcpTenantId: null,
        hasGcpTenant: false
      };
    }

    this.logger.debug(
      `Organization ${query.organizationId} has GCP tenant ${organization.gcpTenantId}`
    );

    return {
      organizationId: organization.id,
      gcpTenantId: organization.gcpTenantId,
      hasGcpTenant: true
    };
  }
}

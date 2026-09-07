import type { IQuery } from '@package/types';

/**
 * Get GCP Tenant Query
 *
 * Retrieves the GCP tenant ID for an organization.
 */
export class GetGcpTenantQuery implements IQuery {
  readonly tenantId: string;
  readonly organizationId: number;
  readonly readonly = true;

  constructor(props: { tenantId: string; organizationId: number }) {
    this.tenantId = props.tenantId;
    this.organizationId = props.organizationId;
  }
}

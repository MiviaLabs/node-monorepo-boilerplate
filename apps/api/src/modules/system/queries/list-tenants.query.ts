import type { IQuery } from '@package/types';

export enum TenantListStatus {
  Active = 'active',
  Suspended = 'suspended',
  All = 'all'
}

/**
 * List tenants query
 *
 * Retrieves a list of all tenants in the system.
 * This is a system-wide operation that requires elevated permissions.
 */
export class ListTenantsQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId?: string;
  readonly status?: TenantListStatus; // Optional status filter
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId?: string;
    status?: TenantListStatus;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    if (props.status !== undefined) {
      this.status = props.status;
    }
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}

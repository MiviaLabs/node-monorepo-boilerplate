import type { IQuery } from '@package/types';

/**
 * Get current tenant query
 *
 * Returns the current tenant's settings within the tenant scope
 */
export class GetCurrentTenantQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

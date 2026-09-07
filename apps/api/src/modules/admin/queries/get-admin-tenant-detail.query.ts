import type { IQuery } from '@package/types';

export class GetAdminTenantDetailQuery implements IQuery {
  readonly readonly = true;
  readonly organizationId: number;
  readonly tenantId: number;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    organizationId: number;
    tenantId: number;
    actorId: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.organizationId = props.organizationId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

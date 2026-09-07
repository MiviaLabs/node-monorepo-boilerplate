import type { IQuery } from '@package/types';

export class GetAdminInboxOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    props: {
      tenantId?: number;
      actorId?: string;
      requestId?: string;
      correlationId?: string;
      causationId?: string;
    } = {}
  ) {
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}

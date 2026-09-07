import type { IQuery } from '@package/types';

type GetAdminOutboxSummaryQueryProps = {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminOutboxSummaryQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminOutboxSummaryQueryProps = {}) {
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

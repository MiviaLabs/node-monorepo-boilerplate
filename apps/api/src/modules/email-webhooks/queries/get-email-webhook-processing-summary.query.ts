import type { IQuery } from '@package/types';

export class GetEmailWebhookProcessingSummaryQuery implements IQuery {
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
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

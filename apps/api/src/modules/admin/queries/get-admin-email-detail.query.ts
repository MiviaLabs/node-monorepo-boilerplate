import type { IQuery } from '@package/types';

type GetAdminEmailDetailQueryProps = {
  emailMessageId: number;
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminEmailDetailQuery implements IQuery {
  readonly readonly = true;
  readonly emailMessageId: number;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminEmailDetailQueryProps) {
    this.emailMessageId = props.emailMessageId;
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

import type { IQuery } from '@package/types';

type GetAdminUserDetailQueryProps = {
  userId: number;
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminUserDetailQuery implements IQuery {
  readonly readonly = true;
  readonly userId: number;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminUserDetailQueryProps) {
    this.userId = props.userId;
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

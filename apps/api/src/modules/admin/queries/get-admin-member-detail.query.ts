import type { IQuery } from '@nestjs/cqrs';

type GetAdminMemberDetailQueryProps = {
  userId: number;
  tenantId: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminMemberDetailQuery implements IQuery {
  readonly userId: number;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminMemberDetailQueryProps) {
    this.userId = props.userId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

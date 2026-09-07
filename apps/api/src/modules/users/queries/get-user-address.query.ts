import type { IQuery } from '@package/types';

export interface GetUserAddressQueryProps {
  readonly tenantId: number;
  readonly userId: number;
  readonly addressId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export class GetUserAddressQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly userId: number;
  readonly addressId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetUserAddressQueryProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.addressId = props.addressId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

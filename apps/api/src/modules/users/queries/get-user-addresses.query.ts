import type { IQuery } from '@package/types';

/**
 * Get user addresses query parameters
 */
export interface GetUserAddressesQueryProps {
  readonly tenantId: number;
  readonly userId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Get user addresses query
 *
 * Returns all addresses for a user within the tenant scope.
 * Results are ordered by isDefault (descending) and updatedAt (descending).
 */
export class GetUserAddressesQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly userId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetUserAddressesQueryProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

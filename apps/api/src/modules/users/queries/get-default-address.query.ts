import type { IQuery } from '@package/types';

/**
 * Get default address query parameters
 */
export interface GetDefaultAddressQueryProps {
  readonly tenantId: number;
  readonly userId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Get default address query
 *
 * Returns the default address for a user within the tenant scope.
 * Returns null if no default address exists.
 */
export class GetDefaultAddressQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly userId: number;
  readonly actorId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetDefaultAddressQueryProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}

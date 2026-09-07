import type { IQuery } from '@package/types';

/**
 * Get user roles query
 *
 * Retrieves roles for a user
 */
export class GetUserRolesQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly userId: number;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    userId: number;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
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

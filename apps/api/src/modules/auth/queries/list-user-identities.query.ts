import type { IQuery } from '@package/types';

/**
 * List user identities query
 *
 * Retrieves all identities for a user
 */
export class ListUserIdentitiesQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly userId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId?: string;
    userId: number;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.userId = props.userId;
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}

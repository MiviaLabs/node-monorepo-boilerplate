import type { IQuery } from '@package/types';

/**
 * Get user by ID query
 *
 * Returns a single user by their ID within the tenant scope
 */
export class GetUserQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly userId: number;

  constructor(props: { tenantId: number; userId: number }) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
  }
}

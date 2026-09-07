import type { IQuery } from '@package/types';

/**
 * List users query parameters
 */
export interface ListUsersQueryProps {
  readonly tenantId: number;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * List users query
 *
 * Returns paginated list of users within the tenant scope
 */
export class ListUsersQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly page: number;
  readonly pageSize: number;

  constructor(props: ListUsersQueryProps) {
    this.tenantId = props.tenantId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
  }
}

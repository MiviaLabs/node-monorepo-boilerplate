import type { IQuery } from '@package/types';

export const enum MemberRoleFilter {
  OWNER = 'tenant_owner',
  ADMIN = 'tenant_admin',
  USER = 'tenant_user',
  VIEWER = 'tenant_viewer'
}

export const enum MemberStatusFilter {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

export const enum MembersSortBy {
  EMAIL = 'email',
  DISPLAY_NAME = 'displayName',
  ROLE = 'role',
  JOINED_AT = 'joinedAt',
  STATUS = 'status'
}

export const enum MembersSortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

/**
 * Get members query
 *
 * Returns a paginated list of tenant members within the tenant scope
 */
export interface GetMembersQueryProps {
  tenantId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  role?: MemberRoleFilter;
  status?: MemberStatusFilter;
  sortBy?: MembersSortBy;
  sortOrder?: MembersSortOrder;
}

export class GetMembersQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly role?: MemberRoleFilter;
  readonly status?: MemberStatusFilter;
  readonly sortBy?: MembersSortBy;
  readonly sortOrder?: MembersSortOrder;

  constructor(props: GetMembersQueryProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = props.search;
    this.role = props.role;
    this.status = props.status;
    this.sortBy = props.sortBy;
    this.sortOrder = props.sortOrder;
  }
}

import type { QueryAdminUsersOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminUsersOverviewQueryProps = QueryAdminUsersOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminUsersOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly userTenantId?: number;
  readonly recordState: NonNullable<QueryAdminUsersOverviewDto['recordState']>;
  readonly identityState: NonNullable<QueryAdminUsersOverviewDto['identityState']>;
  readonly privilege: NonNullable<QueryAdminUsersOverviewDto['privilege']>;
  readonly systemRole?: QueryAdminUsersOverviewDto['systemRole'];
  readonly sortBy: NonNullable<QueryAdminUsersOverviewDto['sortBy']>;
  readonly sortOrder: NonNullable<QueryAdminUsersOverviewDto['sortOrder']>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminUsersOverviewQueryProps = {}) {
    const search = props.search?.trim();

    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = search && search.length > 0 ? search : undefined;
    this.userTenantId = props.userTenantId;
    this.recordState = props.recordState ?? 'active';
    this.identityState = props.identityState ?? 'all';
    this.privilege = props.privilege ?? 'all';
    this.systemRole = props.systemRole;
    this.sortBy = props.sortBy ?? 'displayName';
    this.sortOrder = props.sortOrder ?? 'asc';
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}

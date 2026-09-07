import type { QueryAdminTenantsOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminTenantsOverviewQueryProps = QueryAdminTenantsOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminTenantsOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly recordState: NonNullable<QueryAdminTenantsOverviewDto['recordState']>;
  readonly status?: QueryAdminTenantsOverviewDto['status'];
  readonly onboardingState?: QueryAdminTenantsOverviewDto['onboardingState'];
  readonly sortBy: NonNullable<QueryAdminTenantsOverviewDto['sortBy']>;
  readonly sortOrder: NonNullable<QueryAdminTenantsOverviewDto['sortOrder']>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminTenantsOverviewQueryProps = {}) {
    const search = props.search?.trim();
    const recordState = props.recordState ?? (props.status === 'deleted' ? 'deleted' : 'active');

    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = search && search.length > 0 ? search : undefined;
    this.recordState = recordState;
    this.status = props.status;
    this.onboardingState = props.onboardingState;
    this.sortBy = props.sortBy ?? 'name';
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

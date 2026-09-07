import type { QueryAdminOutboxOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminOutboxOverviewQueryProps = QueryAdminOutboxOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminOutboxOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status: NonNullable<QueryAdminOutboxOverviewDto['status']>;
  readonly deadLetterState: NonNullable<QueryAdminOutboxOverviewDto['deadLetterState']>;
  readonly retryState: NonNullable<QueryAdminOutboxOverviewDto['retryState']>;
  readonly eventType?: string;
  readonly aggregateId?: string;
  readonly requestedTenantId?: string;
  readonly sortBy: NonNullable<QueryAdminOutboxOverviewDto['sortBy']>;
  readonly sortOrder: NonNullable<QueryAdminOutboxOverviewDto['sortOrder']>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminOutboxOverviewQueryProps = {}) {
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = props.search?.trim() || undefined;
    this.status = props.status ?? 'all';
    this.deadLetterState = props.deadLetterState ?? 'all';
    this.retryState = props.retryState ?? 'all';
    this.eventType = props.eventType?.trim() || undefined;
    this.aggregateId = props.aggregateId?.trim() || undefined;
    this.requestedTenantId = props.filterTenantId?.trim() || undefined;
    this.sortBy = props.sortBy ?? 'createdAt';
    this.sortOrder = props.sortOrder ?? 'desc';
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
